import os
import uuid
import json
import base64
import logging
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, EmailStr
import bcrypt
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("boostbac")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

app = FastAPI(title="BoostBac API")
api = APIRouter(prefix="/api")


# --------------------------------------------------------------------------
# Helpers / base models
# --------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def gen_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


# --------------------------------------------------------------------------
# Auth models
# --------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    stream: Optional[str] = "science"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    stream: Optional[str] = None
    language: Optional[str] = None
    daily_goal: Optional[int] = None


def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "name": u.get("name"),
        "email": u.get("email"),
        "stream": u.get("stream", "science"),
        "language": u.get("language", "ar"),
        "daily_goal": u.get("daily_goal", 20),
        "xp": u.get("xp", 0),
        "picture": u.get("picture"),
        "created_at": u.get("created_at"),
    }


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return token


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = sess["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


# --------------------------------------------------------------------------
# SM-2 spaced repetition
# --------------------------------------------------------------------------
def sm2(quality: int, ease: float, interval: int, reps: int):
    """Return (ease, interval_days, reps, next_review_offset_minutes)."""
    if quality < 3:
        reps = 0
        interval = 1
        offset_minutes = 1  # re-appear almost immediately within the session
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        reps += 1
        offset_minutes = interval * 24 * 60
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    if ease < 1.3:
        ease = 1.3
    return round(ease, 3), interval, reps, offset_minutes


RATING_QUALITY = {"again": 0, "hard": 3, "good": 4, "easy": 5}
RATING_XP = {"again": 2, "hard": 5, "good": 8, "easy": 10}


# --------------------------------------------------------------------------
# Auth routes
# --------------------------------------------------------------------------
@api.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    pw_hash = bcrypt.hashpw(inp.password.encode(), bcrypt.gensalt()).decode()
    user_id = gen_id("user_")
    doc = {
        "user_id": user_id,
        "name": inp.name,
        "email": inp.email.lower(),
        "password_hash": pw_hash,
        "stream": inp.stream or "science",
        "language": "ar",
        "daily_goal": 20,
        "xp": 0,
        "auth_provider": "email",
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    await db.streaks.insert_one({
        "user_id": user_id, "current_streak": 0, "longest_streak": 0, "last_active_date": None,
    })
    token = await create_session(user_id)
    return {"session_token": token, "user": public_user(doc)}


@api.post("/auth/login")
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(inp.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(user)}


@api.post("/auth/session")
async def google_session(inp: SessionInput):
    async with httpx.AsyncClient(timeout=20) as hc:
        r = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": inp.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = (data.get("email") or "").lower()
    user = await db.users.find_one({"email": email})
    if not user:
        user_id = gen_id("user_")
        user = {
            "user_id": user_id,
            "name": data.get("name"),
            "email": email,
            "picture": data.get("picture"),
            "stream": "science",
            "language": "ar",
            "daily_goal": 20,
            "xp": 0,
            "auth_provider": "google",
            "created_at": iso(now_utc()),
        }
        await db.users.insert_one(user)
        await db.streaks.insert_one({
            "user_id": user_id, "current_streak": 0, "longest_streak": 0, "last_active_date": None,
        })
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(user)}


@api.get("/auth/me")
async def me(user: CurrentUser):
    streak = await db.streaks.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    result = public_user(user)
    result["current_streak"] = streak.get("current_streak", 0)
    result["longest_streak"] = streak.get("longest_streak", 0)
    return result


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.put("/profile")
async def update_profile(inp: ProfileUpdate, user: CurrentUser):
    updates = {k: v for k, v in inp.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return public_user(fresh)


# --------------------------------------------------------------------------
# AI flashcard generation
# --------------------------------------------------------------------------
class GenerateInput(BaseModel):
    image_base64: str  # base64 of image OR pdf (no data-uri prefix needed)
    mime_type: Optional[str] = "image/jpeg"  # image/jpeg | image/png | application/pdf
    hint: Optional[str] = None  # optional subject hint


GEN_SYSTEM = (
    "You are BoostBac, an expert tutor for Algerian Baccalaureat students. "
    "You receive a photo of a student's course notes, textbook page, or exercises. "
    "Read ALL the text (OCR), understand the concepts, and produce active-recall flashcards. "
    "CRITICAL: Detect the language of the source content and write every question and answer in THAT SAME language "
    "(Arabic, French, or English). Keep answers concise and factual. "
    "Return ONLY valid JSON, no markdown, no commentary."
)

GEN_PROMPT = (
    "Analyze this document image and generate high-quality active-recall flashcards.\n"
    "Return a JSON object with EXACTLY this shape:\n"
    "{\n"
    '  "subject": "<the school subject, e.g. Physics / Mathematics / Philosophy>",\n'
    '  "topic": "<the specific chapter or topic>",\n'
    '  "deck_name": "<Subject — Topic>",\n'
    '  "language": "<ar|fr|en>",\n'
    '  "cards": [\n'
    '    {"question": "...", "answer": "...", "topic": "<sub-topic>", "difficulty": "<easy|medium|hard>"}\n'
    "  ]\n"
    "}\n"
    "Generate between 5 and 12 cards. Each question must test ONE concept. "
    "Avoid yes/no questions. Make them exam-relevant."
)


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text else text
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


async def call_gemini_cards(file_b64: str, mime: str, hint: Optional[str]) -> dict:
    import tempfile
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, FileContentWithMimeType

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=gen_id("gen_"),
        system_message=GEN_SYSTEM,
    ).with_model("gemini", "gemini-3-flash-preview")

    prompt = GEN_PROMPT
    if hint:
        prompt += f"\nThe student says this is about: {hint}"

    tmp_path = None
    try:
        if mime == "application/pdf":
            # Gemini reads PDFs (all pages) via a file path.
            fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64decode(file_b64))
            content = FileContentWithMimeType(file_path=tmp_path, mime_type="application/pdf")
            prompt += "\nThis is a multi-page PDF lesson — cover concepts from ALL pages."
        else:
            content = ImageContent(image_base64=file_b64)
        msg = UserMessage(text=prompt, file_contents=[content])
        resp = await chat.send_message(msg)
        return _extract_json(resp if isinstance(resp, str) else str(resp))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@api.post("/decks/generate")
async def generate_deck(inp: GenerateInput, user: CurrentUser):
    b64 = inp.image_base64
    if "," in b64 and b64.strip().startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        parsed = await call_gemini_cards(b64, inp.mime_type or "image/jpeg", inp.hint)
    except Exception as e:  # noqa
        logger.exception("AI generation failed")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")

    cards = parsed.get("cards") or []
    if not cards:
        raise HTTPException(status_code=422, detail="No cards could be generated from this document.")

    deck_id = gen_id("deck_")
    subject = parsed.get("subject", "General")
    topic = parsed.get("topic", "")
    deck = {
        "deck_id": deck_id,
        "user_id": user["user_id"],
        "subject": subject,
        "topic": topic,
        "deck_name": parsed.get("deck_name") or f"{subject} — {topic}",
        "language": parsed.get("language", "ar"),
        "image_base64": b64[:200000],  # store a trimmed copy as reference
        "created_at": iso(now_utc()),
        "saved": False,
    }
    out_cards = []
    for c in cards:
        out_cards.append({
            "id": gen_id("card_"),
            "question": c.get("question", ""),
            "answer": c.get("answer", ""),
            "topic": c.get("topic", topic),
            "difficulty": c.get("difficulty", "medium"),
        })
    # Return preview (not yet saved) — client edits then calls /decks/save
    return {"deck": deck, "cards": out_cards}


class SaveDeckInput(BaseModel):
    deck: dict
    cards: List[dict]


@api.post("/decks/save")
async def save_deck(inp: SaveDeckInput, user: CurrentUser):
    deck = inp.deck
    deck_id = deck.get("deck_id") or gen_id("deck_")
    deck_doc = {
        "deck_id": deck_id,
        "user_id": user["user_id"],
        "subject": deck.get("subject", "General"),
        "topic": deck.get("topic", ""),
        "deck_name": deck.get("deck_name", "Deck"),
        "language": deck.get("language", "ar"),
        "created_at": iso(now_utc()),
        "saved": True,
    }
    await db.decks.update_one({"deck_id": deck_id}, {"$set": deck_doc}, upsert=True)
    now = now_utc()
    docs = []
    for c in inp.cards:
        docs.append({
            "card_id": gen_id("card_"),
            "deck_id": deck_id,
            "user_id": user["user_id"],
            "subject": deck_doc["subject"],
            "topic": c.get("topic") or deck_doc["topic"],
            "question": c.get("question", ""),
            "answer": c.get("answer", ""),
            "difficulty": c.get("difficulty", "medium"),
            "ease_factor": 2.5,
            "interval": 0,
            "repetitions": 0,
            "next_review_date": iso(now),  # due immediately
            "last_reviewed_at": None,
            "created_at": iso(now),
        })
    if docs:
        await db.cards.insert_many(docs)
    return {"deck_id": deck_id, "cards_saved": len(docs)}


@api.get("/decks")
async def list_decks(user: CurrentUser):
    decks = await db.decks.find({"user_id": user["user_id"], "saved": True}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    now = now_utc()
    for d in decks:
        cards = await db.cards.find({"deck_id": d["deck_id"]}, {"_id": 0}).to_list(1000)
        due = 0
        for c in cards:
            nrd = datetime.fromisoformat(c["next_review_date"])
            if nrd.tzinfo is None:
                nrd = nrd.replace(tzinfo=timezone.utc)
            if nrd <= now:
                due += 1
        d["total_cards"] = len(cards)
        d["due_cards"] = due
        d["mastered_cards"] = sum(1 for c in cards if c.get("repetitions", 0) >= 3)
        out.append(d)
    return out


@api.delete("/decks/{deck_id}")
async def delete_deck(deck_id: str, user: CurrentUser):
    await db.decks.delete_one({"deck_id": deck_id, "user_id": user["user_id"]})
    await db.cards.delete_many({"deck_id": deck_id, "user_id": user["user_id"]})
    return {"ok": True}


# --------------------------------------------------------------------------
# Review queue + submit (SM-2)
# --------------------------------------------------------------------------
@api.get("/review/queue")
async def review_queue(user: CurrentUser, deck_id: Optional[str] = None, limit: int = 50):
    q: dict = {"user_id": user["user_id"]}
    if deck_id:
        q["deck_id"] = deck_id
    cards = await db.cards.find(q, {"_id": 0}).to_list(2000)
    now = now_utc()
    due = []
    for c in cards:
        nrd = datetime.fromisoformat(c["next_review_date"])
        if nrd.tzinfo is None:
            nrd = nrd.replace(tzinfo=timezone.utc)
        if nrd <= now:
            c["_due"] = nrd
            due.append(c)
    due.sort(key=lambda c: c["_due"])  # oldest-due first
    for c in due:
        c.pop("_due", None)
    return {"cards": due[:limit], "total_due": len(due)}


class ReviewSubmit(BaseModel):
    card_id: str
    rating: str  # again | hard | good | easy


async def _touch_streak(user_id: str):
    today = now_utc().date()
    s = await db.streaks.find_one({"user_id": user_id})
    if not s:
        await db.streaks.insert_one({
            "user_id": user_id, "current_streak": 1, "longest_streak": 1, "last_active_date": today.isoformat(),
        })
        return
    last = s.get("last_active_date")
    last_date = datetime.fromisoformat(last).date() if last else None
    cur = s.get("current_streak", 0)
    longest = s.get("longest_streak", 0)
    if last_date == today:
        return  # already counted today
    if last_date == today - timedelta(days=1):
        cur += 1
    else:
        cur = 1
    longest = max(longest, cur)
    await db.streaks.update_one(
        {"user_id": user_id},
        {"$set": {"current_streak": cur, "longest_streak": longest, "last_active_date": today.isoformat()}},
    )


@api.post("/review/submit")
async def review_submit(inp: ReviewSubmit, user: CurrentUser):
    if inp.rating not in RATING_QUALITY:
        raise HTTPException(status_code=400, detail="Invalid rating")
    card = await db.cards.find_one({"card_id": inp.card_id, "user_id": user["user_id"]}, {"_id": 0})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    quality = RATING_QUALITY[inp.rating]
    ease, interval, reps, offset_min = sm2(quality, card.get("ease_factor", 2.5), card.get("interval", 0), card.get("repetitions", 0))
    now = now_utc()
    next_review = now + timedelta(minutes=offset_min)
    await db.cards.update_one(
        {"card_id": inp.card_id},
        {"$set": {
            "ease_factor": ease, "interval": interval, "repetitions": reps,
            "next_review_date": iso(next_review), "last_reviewed_at": iso(now),
        }},
    )
    await db.review_logs.insert_one({
        "log_id": gen_id("log_"),
        "card_id": inp.card_id,
        "user_id": user["user_id"],
        "subject": card.get("subject"),
        "topic": card.get("topic"),
        "rating": inp.rating,
        "quality": quality,
        "correct": quality >= 3,
        "reviewed_at": iso(now),
    })
    xp = RATING_XP[inp.rating]
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": xp}})
    await _touch_streak(user["user_id"])
    return {"xp_earned": xp, "next_review": iso(next_review), "repetitions": reps}


class SessionSummaryInput(BaseModel):
    reviewed: int
    correct: int
    xp_earned: int


@api.post("/review/complete")
async def review_complete(inp: SessionSummaryInput, user: CurrentUser):
    # bonus XP for completing a session
    bonus = 15 if inp.reviewed >= 10 else 5
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": bonus}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    streak = await db.streaks.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    return {
        "bonus_xp": bonus,
        "total_xp": fresh.get("xp", 0),
        "current_streak": streak.get("current_streak", 0),
    }


# --------------------------------------------------------------------------
# Home summary
# --------------------------------------------------------------------------
@api.get("/home")
async def home(user: CurrentUser):
    now = now_utc()
    cards = await db.cards.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
    total_due = 0
    for c in cards:
        nrd = datetime.fromisoformat(c["next_review_date"])
        if nrd.tzinfo is None:
            nrd = nrd.replace(tzinfo=timezone.utc)
        if nrd <= now:
            total_due += 1
    mastered = sum(1 for c in cards if c.get("repetitions", 0) >= 3)
    # cards reviewed today
    today = now.date().isoformat()
    logs_today = await db.review_logs.count_documents({
        "user_id": user["user_id"], "reviewed_at": {"$gte": today},
    })
    streak = await db.streaks.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    decks = await db.decks.find({"user_id": user["user_id"], "saved": True}, {"_id": 0}).sort("created_at", -1).to_list(200)
    deck_out = []
    for d in decks:
        dcards = [c for c in cards if c["deck_id"] == d["deck_id"]]
        due = 0
        for c in dcards:
            nrd = datetime.fromisoformat(c["next_review_date"])
            if nrd.tzinfo is None:
                nrd = nrd.replace(tzinfo=timezone.utc)
            if nrd <= now:
                due += 1
        deck_out.append({
            "deck_id": d["deck_id"], "deck_name": d["deck_name"], "subject": d["subject"],
            "topic": d.get("topic", ""), "total_cards": len(dcards), "due_cards": due,
        })
    return {
        "total_due": total_due,
        "cards_reviewed_today": logs_today,
        "daily_goal": user.get("daily_goal", 20),
        "xp": user.get("xp", 0),
        "current_streak": streak.get("current_streak", 0),
        "longest_streak": streak.get("longest_streak", 0),
        "total_cards": len(cards),
        "mastered_cards": mastered,
        "decks": deck_out,
    }


# --------------------------------------------------------------------------
# Analytics: heatmap + forgetting curve
# --------------------------------------------------------------------------
@api.get("/analytics")
async def analytics(user: CurrentUser):
    logs = await db.review_logs.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(10000)
    cards = await db.cards.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)

    # Per-subject mastery (accuracy)
    subj: dict = {}
    for l in logs:
        s = l.get("subject") or "General"
        subj.setdefault(s, {"total": 0, "correct": 0})
        subj[s]["total"] += 1
        subj[s]["correct"] += 1 if l.get("correct") else 0
    heatmap = []
    for s, v in subj.items():
        acc = (v["correct"] / v["total"]) if v["total"] else 0
        heatmap.append({"subject": s, "accuracy": round(acc, 2), "reviews": v["total"]})
    heatmap.sort(key=lambda x: x["accuracy"])

    # Forgetting curve: retention (accuracy) per day over last 14 days
    curve = []
    today = now_utc().date()
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        day_str = day.isoformat()
        day_logs = [l for l in logs if (l.get("reviewed_at") or "").startswith(day_str)]
        if day_logs:
            ret = sum(1 for l in day_logs if l.get("correct")) / len(day_logs)
        else:
            ret = None
        curve.append({"date": day_str, "label": day.strftime("%d/%m"), "retention": round(ret, 2) if ret is not None else None, "reviews": len(day_logs)})

    # Focus today: 1-2 weakest subjects with enough reviews
    focus = [h for h in heatmap if h["reviews"] >= 1][:2]

    total_reviews = len(logs)
    overall_acc = round(sum(1 for l in logs if l.get("correct")) / total_reviews, 2) if total_reviews else 0.0

    return {
        "heatmap": heatmap,
        "forgetting_curve": curve,
        "focus_subjects": focus,
        "total_reviews": total_reviews,
        "overall_accuracy": overall_acc,
        "total_cards": len(cards),
    }


# --------------------------------------------------------------------------
# Mock exams
# --------------------------------------------------------------------------
class ExamGenInput(BaseModel):
    num_questions: int = 10


@api.post("/exams/generate")
async def generate_exam(inp: ExamGenInput, user: CurrentUser):
    cards = await db.cards.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
    if not cards:
        raise HTTPException(status_code=422, detail="No cards yet. Scan some notes first!")
    logs = await db.review_logs.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(10000)
    # subject accuracy weight
    subj: dict = {}
    for l in logs:
        s = l.get("subject") or "General"
        subj.setdefault(s, {"total": 0, "correct": 0})
        subj[s]["total"] += 1
        subj[s]["correct"] += 1 if l.get("correct") else 0

    def weight(card):
        s = card.get("subject") or "General"
        v = subj.get(s)
        if not v or v["total"] == 0:
            return 1.0
        acc = v["correct"] / v["total"]
        return 1.0 + (1.0 - acc) * 2.0  # weaker subjects weighted higher

    import random
    weighted = [(c, weight(c)) for c in cards]
    n = min(inp.num_questions, len(cards))
    chosen = []
    pool = weighted[:]
    for _ in range(n):
        total_w = sum(w for _, w in pool)
        r = random.uniform(0, total_w)
        acc = 0
        for idx, (c, w) in enumerate(pool):
            acc += w
            if acc >= r:
                chosen.append(c)
                pool.pop(idx)
                break
    exam_id = gen_id("exam_")
    questions = [{
        "card_id": c["card_id"], "question": c["question"], "answer": c["answer"],
        "subject": c.get("subject"), "topic": c.get("topic"),
    } for c in chosen]
    await db.exams.insert_one({
        "exam_id": exam_id, "user_id": user["user_id"],
        "topics_covered": list({c.get("subject") for c in chosen}),
        "num_questions": len(questions), "created_at": iso(now_utc()), "score": None,
    })
    return {"exam_id": exam_id, "questions": questions}


class ExamSubmit(BaseModel):
    exam_id: str
    results: List[dict]  # [{card_id, subject, correct}]
    duration_seconds: int = 0


@api.post("/exams/submit")
async def submit_exam(inp: ExamSubmit, user: CurrentUser):
    total = len(inp.results)
    correct = sum(1 for r in inp.results if r.get("correct"))
    score = round(correct / total * 100) if total else 0
    by_subject: dict = {}
    for r in inp.results:
        s = r.get("subject") or "General"
        by_subject.setdefault(s, {"total": 0, "correct": 0})
        by_subject[s]["total"] += 1
        by_subject[s]["correct"] += 1 if r.get("correct") else 0
    breakdown = [{"subject": s, "total": v["total"], "correct": v["correct"],
                  "accuracy": round(v["correct"] / v["total"], 2)} for s, v in by_subject.items()]
    await db.exams.update_one({"exam_id": inp.exam_id}, {"$set": {
        "score": score, "correct": correct, "total": total,
        "breakdown": breakdown, "duration_seconds": inp.duration_seconds, "taken_at": iso(now_utc()),
    }})
    xp = correct * 5
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": xp}})
    return {"score": score, "correct": correct, "total": total, "breakdown": breakdown, "xp_earned": xp}


@api.get("/exams/history")
async def exam_history(user: CurrentUser):
    exams = await db.exams.find({"user_id": user["user_id"], "score": {"$ne": None}}, {"_id": 0}).sort("taken_at", -1).to_list(50)
    return exams


# --------------------------------------------------------------------------
# Milestone badges
# --------------------------------------------------------------------------
BADGE_DEFS = [
    {"id": "first_deck", "icon": "documents", "metric": "total_cards", "target": 1},
    {"id": "streak_3", "icon": "flame", "metric": "longest_streak", "target": 3},
    {"id": "streak_7", "icon": "flame", "metric": "longest_streak", "target": 7},
    {"id": "streak_30", "icon": "flame", "metric": "longest_streak", "target": 30},
    {"id": "reviews_50", "icon": "repeat", "metric": "total_reviews", "target": 50},
    {"id": "reviews_200", "icon": "repeat", "metric": "total_reviews", "target": 200},
    {"id": "mastered_10", "icon": "ribbon", "metric": "mastered", "target": 10},
    {"id": "mastered_50", "icon": "ribbon", "metric": "mastered", "target": 50},
    {"id": "mastered_100", "icon": "trophy", "metric": "mastered", "target": 100},
    {"id": "xp_500", "icon": "flash", "metric": "xp", "target": 500},
]


@api.get("/badges")
async def badges(user: CurrentUser):
    cards = await db.cards.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
    total_reviews = await db.review_logs.count_documents({"user_id": user["user_id"]})
    streak = await db.streaks.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    metrics = {
        "total_cards": len(cards),
        "mastered": sum(1 for c in cards if c.get("repetitions", 0) >= 3),
        "total_reviews": total_reviews,
        "longest_streak": streak.get("longest_streak", 0),
        "xp": user.get("xp", 0),
    }
    out = []
    for b in BADGE_DEFS:
        val = metrics.get(b["metric"], 0)
        out.append({
            "id": b["id"],
            "icon": b["icon"],
            "target": b["target"],
            "value": val,
            "earned": val >= b["target"],
            "progress": min(1.0, round(val / b["target"], 2)) if b["target"] else 1.0,
        })
    earned_count = sum(1 for b in out if b["earned"])
    return {"badges": out, "earned_count": earned_count, "total": len(out)}


@api.get("/")
async def root():
    return {"message": "BoostBac API", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.cards.create_index("user_id")
    await db.cards.create_index("deck_id")
    await db.review_logs.create_index("user_id")
    logger.info("BoostBac API started")


@app.on_event("shutdown")
async def shutdown():
    client.close()
