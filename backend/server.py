import os
import uuid
import json
import base64
import logging
import secrets
import random
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

import asyncpg
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, BeforeValidator, EmailStr
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("boostbac")

DATABASE_URL = os.environ["DATABASE_URL"]
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

app = FastAPI(title="BoostBac API")
api = APIRouter(prefix="/api")

pool: asyncpg.Pool = None  # set on startup


async def _init_conn(conn: asyncpg.Connection):
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def gen_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


def row_to_dict(row: Optional[asyncpg.Record]) -> Optional[dict]:
    return dict(row) if row is not None else None


def rows_to_list(rows: List[asyncpg.Record]) -> List[dict]:
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------
# Auth models
# --------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    stream: Optional[str] = "science"
    role: Optional[str] = "student"  # student | teacher


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    stream: Optional[str] = None
    language: Optional[str] = None
    daily_goal: Optional[int] = None
    exam_date: Optional[str] = None  # ISO date, e.g. 2026-06-15


def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "name": u.get("name"),
        "email": u.get("email"),
        "stream": u.get("stream") or "science",
        "language": u.get("language") or "ar",
        "daily_goal": u.get("daily_goal", 20),
        "xp": u.get("xp", 0),
        "picture": u.get("picture"),
        "role": u.get("role") or "student",
        "status": u.get("status") or "active",
        "exam_date": u.get("exam_date"),
        "created_at": u.get("created_at"),
    }


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO user_sessions (session_token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
            token, user_id, now_utc(), now_utc() + timedelta(days=7),
        )
    return token


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    async with pool.acquire() as conn:
        sess = await conn.fetchrow("SELECT * FROM user_sessions WHERE session_token = $1", token)
        if not sess:
            raise HTTPException(status_code=401, detail="Invalid session")
        if sess["expires_at"] < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
        user = await conn.fetchrow("SELECT * FROM users WHERE user_id = $1", sess["user_id"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(user)


CurrentUser = Annotated[dict, Depends(get_current_user)]


def require_role(*roles: str):
    async def dep(user: CurrentUser) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dep


async def approved_teacher(user: CurrentUser) -> dict:
    if user.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Teachers only")
    if user.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Teacher approval required")
    return user


AdminUser = Annotated[dict, Depends(require_role("admin"))]
ApprovedTeacher = Annotated[dict, Depends(approved_teacher)]


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
    role = (inp.role or "student").lower()
    if role not in ("student", "teacher"):
        raise HTTPException(status_code=403, detail="Invalid role")
    email = inp.email.lower()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT 1 FROM users WHERE email = $1", email)
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        pw_hash = bcrypt.hashpw(inp.password.encode(), bcrypt.gensalt()).decode()
        user_id = gen_id("user_")
        status = "pending" if role == "teacher" else "active"
        created_at = now_utc()
        await conn.execute(
            """INSERT INTO users (user_id, name, email, password_hash, stream, language,
                                   daily_goal, xp, role, status, auth_provider, created_at)
               VALUES ($1, $2, $3, $4, $5, 'ar', 20, 0, $6, $7, 'email', $8)""",
            user_id, inp.name, email, pw_hash, inp.stream or "science", role, status, created_at,
        )
        if role == "student":
            await conn.execute(
                "INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date) VALUES ($1, 0, 0, NULL)",
                user_id,
            )
    doc = {
        "user_id": user_id, "name": inp.name, "email": email, "stream": inp.stream or "science",
        "language": "ar", "daily_goal": 20, "xp": 0, "role": role, "status": status,
        "exam_date": None, "created_at": created_at,
    }
    token = await create_session(user_id)
    return {"session_token": token, "user": public_user(doc)}


@api.post("/auth/login")
async def login(inp: LoginInput):
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", inp.email.lower())
    if not user or not user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(inp.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(dict(user))}


@api.get("/auth/me")
async def me(user: CurrentUser):
    async with pool.acquire() as conn:
        streak = await conn.fetchrow("SELECT * FROM streaks WHERE user_id = $1", user["user_id"])
    result = public_user(user)
    result["current_streak"] = streak["current_streak"] if streak else 0
    result["longest_streak"] = streak["longest_streak"] if streak else 0
    return result


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM user_sessions WHERE session_token = $1", token)
    return {"ok": True}


@api.put("/profile")
async def update_profile(inp: ProfileUpdate, user: CurrentUser):
    updates = {k: v for k, v in inp.model_dump().items() if v is not None}
    if updates:
        set_clause = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(updates.keys()))
        async with pool.acquire() as conn:
            await conn.execute(
                f"UPDATE users SET {set_clause} WHERE user_id = $1",
                user["user_id"], *updates.values(),
            )
    async with pool.acquire() as conn:
        fresh = await conn.fetchrow("SELECT * FROM users WHERE user_id = $1", user["user_id"])
    return public_user(dict(fresh))


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
    from google import genai
    from google.genai import types

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured on the server")

    prompt = GEN_PROMPT
    if mime == "application/pdf":
        prompt += "\nThis is a multi-page PDF lesson — cover concepts from ALL pages."
    if hint:
        prompt += f"\nThe student says this is about: {hint}"

    client_gemini = genai.Client(api_key=GEMINI_API_KEY)
    resp = await client_gemini.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Content(role="user", parts=[
                types.Part.from_bytes(data=base64.b64decode(file_b64), mime_type=mime),
                types.Part.from_text(text=prompt),
            ]),
        ],
        config=types.GenerateContentConfig(system_instruction=GEN_SYSTEM),
    )
    return _extract_json(resp.text)


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
        "created_at": now_utc(),
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
    subject = deck.get("subject", "General")
    topic = deck.get("topic", "")
    deck_name = deck.get("deck_name", "Deck")
    language = deck.get("language", "ar")
    now = now_utc()

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO decks (deck_id, user_id, subject, topic, deck_name, language, created_at, saved)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, true)
                   ON CONFLICT (deck_id) DO UPDATE SET
                       user_id = excluded.user_id, subject = excluded.subject, topic = excluded.topic,
                       deck_name = excluded.deck_name, language = excluded.language, saved = true""",
                deck_id, user["user_id"], subject, topic, deck_name, language, now,
            )
            saved = 0
            for c in inp.cards:
                await conn.execute(
                    """INSERT INTO cards (card_id, deck_id, user_id, subject, topic, question, answer,
                                           difficulty, ease_factor, interval_days, repetitions,
                                           next_review_date, last_reviewed_at, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 2.5, 0, 0, $9, NULL, $9)""",
                    gen_id("card_"), deck_id, user["user_id"], subject, c.get("topic") or topic,
                    c.get("question", ""), c.get("answer", ""), c.get("difficulty", "medium"), now,
                )
                saved += 1
    return {"deck_id": deck_id, "cards_saved": saved}


@api.get("/decks")
async def list_decks(user: CurrentUser):
    async with pool.acquire() as conn:
        decks = await conn.fetch(
            "SELECT * FROM decks WHERE user_id = $1 AND saved = true ORDER BY created_at DESC",
            user["user_id"],
        )
        out = []
        for d in decks:
            stats = await conn.fetchrow(
                """SELECT count(*) AS total,
                          count(*) FILTER (WHERE next_review_date <= now()) AS due,
                          count(*) FILTER (WHERE repetitions >= 3) AS mastered
                   FROM cards WHERE deck_id = $1""",
                d["deck_id"],
            )
            row = dict(d)
            row["total_cards"] = stats["total"]
            row["due_cards"] = stats["due"]
            row["mastered_cards"] = stats["mastered"]
            out.append(row)
    return out


@api.delete("/decks/{deck_id}")
async def delete_deck(deck_id: str, user: CurrentUser):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM decks WHERE deck_id = $1 AND user_id = $2", deck_id, user["user_id"])
        await conn.execute("DELETE FROM cards WHERE deck_id = $1 AND user_id = $2", deck_id, user["user_id"])
    return {"ok": True}


# --------------------------------------------------------------------------
# Review queue + submit (SM-2)
# --------------------------------------------------------------------------
@api.get("/review/queue")
async def review_queue(user: CurrentUser, deck_id: Optional[str] = None, limit: int = 50):
    async with pool.acquire() as conn:
        if deck_id:
            due = await conn.fetch(
                """SELECT * FROM cards WHERE user_id = $1 AND deck_id = $2 AND next_review_date <= now()
                   ORDER BY next_review_date ASC""",
                user["user_id"], deck_id,
            )
        else:
            due = await conn.fetch(
                """SELECT * FROM cards WHERE user_id = $1 AND next_review_date <= now()
                   ORDER BY next_review_date ASC""",
                user["user_id"],
            )
    cards = [_card_out(dict(c)) for c in due]
    return {"cards": cards[:limit], "total_due": len(cards)}


def _card_out(c: dict) -> dict:
    c = dict(c)
    c["interval"] = c.pop("interval_days", 0)
    return c


class ReviewSubmit(BaseModel):
    card_id: str
    rating: str  # again | hard | good | easy


async def _touch_streak(conn: asyncpg.Connection, user_id: str):
    today = now_utc().date()
    s = await conn.fetchrow("SELECT * FROM streaks WHERE user_id = $1", user_id)
    if not s:
        await conn.execute(
            "INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date) VALUES ($1, 1, 1, $2)",
            user_id, today.isoformat(),
        )
        return
    last = s["last_active_date"]
    last_date = datetime.fromisoformat(last).date() if last else None
    cur = s["current_streak"] or 0
    longest = s["longest_streak"] or 0
    if last_date == today:
        return  # already counted today
    if last_date == today - timedelta(days=1):
        cur += 1
    else:
        cur = 1
    longest = max(longest, cur)
    await conn.execute(
        "UPDATE streaks SET current_streak = $2, longest_streak = $3, last_active_date = $4 WHERE user_id = $1",
        user_id, cur, longest, today.isoformat(),
    )


@api.post("/review/submit")
async def review_submit(inp: ReviewSubmit, user: CurrentUser):
    if inp.rating not in RATING_QUALITY:
        raise HTTPException(status_code=400, detail="Invalid rating")
    async with pool.acquire() as conn:
        card = await conn.fetchrow(
            "SELECT * FROM cards WHERE card_id = $1 AND user_id = $2", inp.card_id, user["user_id"],
        )
        if not card:
            raise HTTPException(status_code=404, detail="Card not found")
        quality = RATING_QUALITY[inp.rating]
        ease, interval, reps, offset_min = sm2(
            quality, card["ease_factor"] or 2.5, card["interval_days"] or 0, card["repetitions"] or 0,
        )
        now = now_utc()
        next_review = now + timedelta(minutes=offset_min)
        async with conn.transaction():
            await conn.execute(
                """UPDATE cards SET ease_factor = $2, interval_days = $3, repetitions = $4,
                       next_review_date = $5, last_reviewed_at = $6 WHERE card_id = $1""",
                inp.card_id, ease, interval, reps, next_review, now,
            )
            await conn.execute(
                """INSERT INTO review_logs (log_id, card_id, user_id, subject, topic, rating, quality, correct, reviewed_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
                gen_id("log_"), inp.card_id, user["user_id"], card["subject"], card["topic"],
                inp.rating, quality, quality >= 3, now,
            )
            xp = RATING_XP[inp.rating]
            await conn.execute("UPDATE users SET xp = xp + $2 WHERE user_id = $1", user["user_id"], xp)
            await _touch_streak(conn, user["user_id"])
    return {"xp_earned": xp, "next_review": next_review, "repetitions": reps}


class SessionSummaryInput(BaseModel):
    reviewed: int
    correct: int
    xp_earned: int


@api.post("/review/complete")
async def review_complete(inp: SessionSummaryInput, user: CurrentUser):
    bonus = 15 if inp.reviewed >= 10 else 5
    async with pool.acquire() as conn:
        await conn.execute("UPDATE users SET xp = xp + $2 WHERE user_id = $1", user["user_id"], bonus)
        fresh = await conn.fetchrow("SELECT * FROM users WHERE user_id = $1", user["user_id"])
        streak = await conn.fetchrow("SELECT * FROM streaks WHERE user_id = $1", user["user_id"])
    return {
        "bonus_xp": bonus,
        "total_xp": fresh["xp"] if fresh else 0,
        "current_streak": streak["current_streak"] if streak else 0,
    }


# --------------------------------------------------------------------------
# Home summary
# --------------------------------------------------------------------------
@api.get("/home")
async def home(user: CurrentUser):
    now = now_utc()
    async with pool.acquire() as conn:
        agg = await conn.fetchrow(
            """SELECT count(*) AS total, count(*) FILTER (WHERE next_review_date <= now()) AS due,
                      count(*) FILTER (WHERE repetitions >= 3) AS mastered,
                      count(*) FILTER (WHERE repetitions < 3) AS active
               FROM cards WHERE user_id = $1""",
            user["user_id"],
        )
        logs_today = await conn.fetchval(
            "SELECT count(*) FROM review_logs WHERE user_id = $1 AND reviewed_at >= date_trunc('day', now())",
            user["user_id"],
        )
        streak = await conn.fetchrow("SELECT * FROM streaks WHERE user_id = $1", user["user_id"])
        decks = await conn.fetch(
            "SELECT * FROM decks WHERE user_id = $1 AND saved = true ORDER BY created_at DESC",
            user["user_id"],
        )
        deck_out = []
        for d in decks:
            dstats = await conn.fetchrow(
                """SELECT count(*) AS total, count(*) FILTER (WHERE next_review_date <= now()) AS due
                   FROM cards WHERE deck_id = $1""",
                d["deck_id"],
            )
            deck_out.append({
                "deck_id": d["deck_id"], "deck_name": d["deck_name"], "subject": d["subject"],
                "topic": d["topic"] or "",
                "total_cards": dstats["total"], "due_cards": dstats["due"],
            })

    exam_date = user.get("exam_date")
    days_left = None
    pace = None
    if exam_date:
        try:
            ed = datetime.fromisoformat(exam_date).date()
            days_left = (ed - now.date()).days
            active = agg["active"]
            if days_left and days_left > 0:
                pace = max(user.get("daily_goal", 20), -(-active // days_left))  # ceil
        except Exception:
            pass

    return {
        "total_due": agg["due"],
        "cards_reviewed_today": logs_today,
        "daily_goal": user.get("daily_goal", 20),
        "xp": user.get("xp", 0),
        "current_streak": streak["current_streak"] if streak else 0,
        "longest_streak": streak["longest_streak"] if streak else 0,
        "total_cards": agg["total"],
        "mastered_cards": agg["mastered"],
        "exam_date": exam_date,
        "days_to_exam": days_left,
        "suggested_pace": pace,
        "decks": deck_out,
    }


# --------------------------------------------------------------------------
# Analytics: heatmap + forgetting curve
# --------------------------------------------------------------------------
@api.get("/analytics")
async def analytics(user: CurrentUser):
    async with pool.acquire() as conn:
        subj_rows = await conn.fetch(
            """SELECT coalesce(subject, 'General') AS subject, count(*) AS total,
                      count(*) FILTER (WHERE correct) AS correct
               FROM review_logs WHERE user_id = $1 GROUP BY 1""",
            user["user_id"],
        )
        total_cards = await conn.fetchval("SELECT count(*) FROM cards WHERE user_id = $1", user["user_id"])
        total_reviews = await conn.fetchval("SELECT count(*) FROM review_logs WHERE user_id = $1", user["user_id"])
        curve_rows = await conn.fetch(
            """SELECT (reviewed_at AT TIME ZONE 'UTC')::date AS day,
                      count(*) AS reviews, count(*) FILTER (WHERE correct) AS correct
               FROM review_logs
               WHERE user_id = $1 AND reviewed_at >= now() - interval '14 days'
               GROUP BY 1""",
            user["user_id"],
        )

    heatmap = []
    for r in subj_rows:
        acc = (r["correct"] / r["total"]) if r["total"] else 0
        heatmap.append({"subject": r["subject"], "accuracy": round(acc, 2), "reviews": r["total"]})
    heatmap.sort(key=lambda x: x["accuracy"])

    by_day = {r["day"]: r for r in curve_rows}
    curve = []
    today = now_utc().date()
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        r = by_day.get(day)
        if r and r["reviews"]:
            ret = r["correct"] / r["reviews"]
            reviews = r["reviews"]
        else:
            ret = None
            reviews = 0
        curve.append({
            "date": day.isoformat(), "label": day.strftime("%d/%m"),
            "retention": round(ret, 2) if ret is not None else None, "reviews": reviews,
        })

    focus = [h for h in heatmap if h["reviews"] >= 1][:2]
    overall_acc = round(sum(r["correct"] for r in subj_rows) / total_reviews, 2) if total_reviews else 0.0

    return {
        "heatmap": heatmap,
        "forgetting_curve": curve,
        "focus_subjects": focus,
        "total_reviews": total_reviews,
        "overall_accuracy": overall_acc,
        "total_cards": total_cards,
    }


# --------------------------------------------------------------------------
# Mock exams
# --------------------------------------------------------------------------
class ExamGenInput(BaseModel):
    num_questions: int = 10


@api.post("/exams/generate")
async def generate_exam(inp: ExamGenInput, user: CurrentUser):
    async with pool.acquire() as conn:
        cards = await conn.fetch("SELECT * FROM cards WHERE user_id = $1", user["user_id"])
        if not cards:
            raise HTTPException(status_code=422, detail="No cards yet. Scan some notes first!")
        subj_rows = await conn.fetch(
            """SELECT coalesce(subject, 'General') AS subject, count(*) AS total,
                      count(*) FILTER (WHERE correct) AS correct
               FROM review_logs WHERE user_id = $1 GROUP BY 1""",
            user["user_id"],
        )
        subj = {r["subject"]: {"total": r["total"], "correct": r["correct"]} for r in subj_rows}

        def weight(card):
            s = card["subject"] or "General"
            v = subj.get(s)
            if not v or v["total"] == 0:
                return 1.0
            acc = v["correct"] / v["total"]
            return 1.0 + (1.0 - acc) * 2.0  # weaker subjects weighted higher

        weighted = [(c, weight(c)) for c in cards]
        n = min(inp.num_questions, len(cards))
        chosen = []
        pool_ = weighted[:]
        for _ in range(n):
            total_w = sum(w for _, w in pool_)
            r = random.uniform(0, total_w)
            acc = 0
            for idx, (c, w) in enumerate(pool_):
                acc += w
                if acc >= r:
                    chosen.append(c)
                    pool_.pop(idx)
                    break
        exam_id = gen_id("exam_")
        questions = [{
            "card_id": c["card_id"], "question": c["question"], "answer": c["answer"],
            "subject": c["subject"], "topic": c["topic"],
        } for c in chosen]
        topics = list({c["subject"] for c in chosen})
        await conn.execute(
            """INSERT INTO exams (exam_id, user_id, topics_covered, num_questions, created_at, score)
               VALUES ($1, $2, $3, $4, $5, NULL)""",
            exam_id, user["user_id"], topics, len(questions), now_utc(),
        )
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
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE exams SET score = $2, correct = $3, total = $4, breakdown = $5,
                   duration_seconds = $6, taken_at = $7 WHERE exam_id = $1""",
            inp.exam_id, score, correct, total, breakdown, inp.duration_seconds, now_utc(),
        )
        xp = correct * 5
        await conn.execute("UPDATE users SET xp = xp + $2 WHERE user_id = $1", user["user_id"], xp)
    return {"score": score, "correct": correct, "total": total, "breakdown": breakdown, "xp_earned": xp}


@api.get("/exams/history")
async def exam_history(user: CurrentUser):
    async with pool.acquire() as conn:
        exams = await conn.fetch(
            "SELECT * FROM exams WHERE user_id = $1 AND score IS NOT NULL ORDER BY taken_at DESC LIMIT 50",
            user["user_id"],
        )
    return rows_to_list(exams)


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
    async with pool.acquire() as conn:
        agg = await conn.fetchrow(
            """SELECT count(*) AS total, count(*) FILTER (WHERE repetitions >= 3) AS mastered
               FROM cards WHERE user_id = $1""",
            user["user_id"],
        )
        total_reviews = await conn.fetchval("SELECT count(*) FROM review_logs WHERE user_id = $1", user["user_id"])
        streak = await conn.fetchrow("SELECT * FROM streaks WHERE user_id = $1", user["user_id"])
    metrics = {
        "total_cards": agg["total"],
        "mastered": agg["mastered"],
        "total_reviews": total_reviews,
        "longest_streak": streak["longest_streak"] if streak else 0,
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


# --------------------------------------------------------------------------
# Weekly leaderboard (XP earned in the last 7 days)
# --------------------------------------------------------------------------
@api.get("/leaderboard")
async def leaderboard(user: CurrentUser):
    cutoff = now_utc() - timedelta(days=7)
    async with pool.acquire() as conn:
        logs = await conn.fetch(
            "SELECT user_id, rating FROM review_logs WHERE reviewed_at >= $1", cutoff,
        )
        exams = await conn.fetch(
            "SELECT user_id, correct FROM exams WHERE taken_at >= $1 AND score IS NOT NULL", cutoff,
        )
        xp_by_user: dict = {}
        for l in logs:
            xp_by_user[l["user_id"]] = xp_by_user.get(l["user_id"], 0) + RATING_XP.get(l["rating"], 0)
        for e in exams:
            xp_by_user[e["user_id"]] = xp_by_user.get(e["user_id"], 0) + ((e["correct"] or 0) * 5)

        ids = list(xp_by_user.keys())
        umap = {}
        if ids:
            urows = await conn.fetch(
                "SELECT user_id, name, picture FROM users WHERE user_id = ANY($1::text[])", ids,
            )
            umap = {u["user_id"]: u for u in urows}

    rows = []
    for uid, xp in xp_by_user.items():
        u = umap.get(uid, {})
        rows.append({"user_id": uid, "name": (u.get("name") if u else None) or "Student",
                     "picture": u.get("picture") if u else None, "weekly_xp": xp})
    rows.sort(key=lambda r: r["weekly_xp"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
        r["is_me"] = r["user_id"] == user["user_id"]

    me = next((r for r in rows if r["is_me"]), None)
    if me is None:
        me = {"user_id": user["user_id"], "name": user.get("name") or "Student", "picture": user.get("picture"),
              "weekly_xp": 0, "rank": len(rows) + 1, "is_me": True}
    return {"leaderboard": rows[:50], "me": me, "total_players": len(rows)}


# --------------------------------------------------------------------------
# Admin: teacher approval
# --------------------------------------------------------------------------
@api.get("/admin/teachers")
async def admin_teachers(admin: AdminUser, status: Optional[str] = None):
    async with pool.acquire() as conn:
        if status:
            teachers = await conn.fetch(
                "SELECT * FROM users WHERE role = 'teacher' AND status = $1 ORDER BY created_at DESC", status,
            )
        else:
            teachers = await conn.fetch(
                "SELECT * FROM users WHERE role = 'teacher' ORDER BY created_at DESC",
            )
    return [public_user(dict(t)) for t in teachers]


@api.get("/admin/stats")
async def admin_stats(admin: AdminUser):
    async with pool.acquire() as conn:
        pending = await conn.fetchval("SELECT count(*) FROM users WHERE role = 'teacher' AND status = 'pending'")
        teachers = await conn.fetchval("SELECT count(*) FROM users WHERE role = 'teacher' AND status = 'approved'")
        students = await conn.fetchval("SELECT count(*) FROM users WHERE role = 'student'")
        resources = await conn.fetchval("SELECT count(*) FROM resources")
    return {"pending_teachers": pending, "approved_teachers": teachers, "students": students, "resources": resources}


@api.post("/admin/teachers/{teacher_id}/approve")
async def approve_teacher(teacher_id: str, admin: AdminUser):
    async with pool.acquire() as conn:
        r = await conn.execute(
            "UPDATE users SET status = 'approved', approved_at = $2 WHERE user_id = $1 AND role = 'teacher'",
            teacher_id, now_utc(),
        )
    if r == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"status": "approved"}


@api.post("/admin/teachers/{teacher_id}/reject")
async def reject_teacher(teacher_id: str, admin: AdminUser):
    async with pool.acquire() as conn:
        r = await conn.execute(
            "UPDATE users SET status = 'rejected', rejected_at = $2 WHERE user_id = $1 AND role = 'teacher'",
            teacher_id, now_utc(),
        )
    if r == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Teacher not found")
    return {"status": "rejected"}


# --------------------------------------------------------------------------
# Teacher resources (exams / exercises / solutions) + public feed
# --------------------------------------------------------------------------
class ResourceInput(BaseModel):
    type: str  # exam | exercise | solution
    subject: str
    stream: Optional[str] = "all"
    title: str
    description: Optional[str] = ""
    attachment_base64: Optional[str] = None
    attachment_mime: Optional[str] = None  # image/jpeg | image/png | application/pdf


@api.post("/resources")
async def create_resource(inp: ResourceInput, teacher: ApprovedTeacher):
    rid = gen_id("res_")
    created_at = now_utc()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO resources (resource_id, teacher_id, teacher_name, type, subject, stream, title,
                                       description, attachment_base64, attachment_mime, has_attachment, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)""",
            rid, teacher["user_id"], teacher.get("name"), inp.type, inp.subject, inp.stream or "all",
            inp.title, inp.description or "", inp.attachment_base64, inp.attachment_mime,
            bool(inp.attachment_base64), created_at,
        )
    return {
        "resource_id": rid, "teacher_id": teacher["user_id"], "teacher_name": teacher.get("name"),
        "type": inp.type, "subject": inp.subject, "stream": inp.stream or "all", "title": inp.title,
        "description": inp.description or "", "attachment_mime": inp.attachment_mime,
        "has_attachment": bool(inp.attachment_base64), "created_at": created_at,
    }


def _resource_card(r: dict) -> dict:
    return {
        "resource_id": r["resource_id"], "teacher_id": r["teacher_id"], "teacher_name": r.get("teacher_name"),
        "type": r["type"], "subject": r["subject"], "stream": r.get("stream") or "all",
        "title": r["title"], "description": r.get("description") or "",
        "has_attachment": r.get("has_attachment", False), "attachment_mime": r.get("attachment_mime"),
        "created_at": r.get("created_at"),
    }


@api.get("/resources")
async def list_resources(user: CurrentUser, type: Optional[str] = None, subject: Optional[str] = None):
    conds = []
    params = []
    if type:
        params.append(type)
        conds.append(f"type = ${len(params)}")
    if subject:
        params.append(subject)
        conds.append(f"subject = ${len(params)}")
    where = f"WHERE {' AND '.join(conds)}" if conds else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(f"SELECT * FROM resources {where} ORDER BY created_at DESC LIMIT 300", *params)
    return [_resource_card(dict(r)) for r in rows]


@api.get("/resources/mine")
async def my_resources(teacher: ApprovedTeacher):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM resources WHERE teacher_id = $1 ORDER BY created_at DESC LIMIT 300",
            teacher["user_id"],
        )
    return [_resource_card(dict(r)) for r in rows]


@api.get("/resources/{resource_id}")
async def get_resource(resource_id: str, user: CurrentUser):
    async with pool.acquire() as conn:
        r = await conn.fetchrow("SELECT * FROM resources WHERE resource_id = $1", resource_id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return dict(r)  # includes attachment_base64 for viewing


@api.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, teacher: ApprovedTeacher):
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM resources WHERE resource_id = $1 AND teacher_id = $2", resource_id, teacher["user_id"],
        )
    return {"ok": True}


@api.get("/teachers")
async def list_teachers(user: CurrentUser):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM users WHERE role = 'teacher' AND status = 'approved'")
        out = []
        for t in rows:
            count = await conn.fetchval("SELECT count(*) FROM resources WHERE teacher_id = $1", t["user_id"])
            out.append({"user_id": t["user_id"], "name": t["name"], "picture": t["picture"],
                        "subject": t["stream"], "resources": count})
    return out


# --------------------------------------------------------------------------
# 1:1 chat (student <-> teacher), polling based
# --------------------------------------------------------------------------
class StartChatInput(BaseModel):
    other_user_id: str


def _conv_id(a: str, b: str) -> str:
    return "conv_" + "_".join(sorted([a, b]))


@api.post("/chat/start")
async def start_chat(inp: StartChatInput, user: CurrentUser):
    async with pool.acquire() as conn:
        other = await conn.fetchrow("SELECT * FROM users WHERE user_id = $1", inp.other_user_id)
        if not other:
            raise HTTPException(status_code=404, detail="User not found")
        cid = _conv_id(user["user_id"], other["user_id"])
        existing = await conn.fetchrow("SELECT 1 FROM conversations WHERE conversation_id = $1", cid)
        if not existing:
            now = now_utc()
            names = {user["user_id"]: user.get("name"), other["user_id"]: other["name"]}
            await conn.execute(
                """INSERT INTO conversations (conversation_id, participants, names, last_message, updated_at, created_at)
                   VALUES ($1, $2, $3, NULL, $4, $4)""",
                cid, [user["user_id"], other["user_id"]], names, now,
            )
    return {"conversation_id": cid, "other": {"user_id": other["user_id"], "name": other["name"]}}


@api.get("/chat/conversations")
async def list_conversations(user: CurrentUser):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM conversations WHERE $1 = ANY(participants) ORDER BY updated_at DESC",
            user["user_id"],
        )
    out = []
    for c in rows:
        other_id = next((p for p in c["participants"] if p != user["user_id"]), None)
        names = c["names"] or {}
        out.append({
            "conversation_id": c["conversation_id"],
            "other_id": other_id,
            "other_name": names.get(other_id) or "User",
            "last_message": c["last_message"],
            "updated_at": c["updated_at"],
        })
    return out


class MessageInput(BaseModel):
    text: str


@api.get("/chat/{conversation_id}/messages")
async def get_messages(conversation_id: str, user: CurrentUser):
    async with pool.acquire() as conn:
        conv = await conn.fetchrow("SELECT * FROM conversations WHERE conversation_id = $1", conversation_id)
        if not conv or user["user_id"] not in conv["participants"]:
            raise HTTPException(status_code=403, detail="Not allowed")
        msgs = await conn.fetch(
            "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC", conversation_id,
        )
    other_id = next((p for p in conv["participants"] if p != user["user_id"]), None)
    names = conv["names"] or {}
    return {"messages": rows_to_list(msgs), "other_name": names.get(other_id) or "User"}


@api.post("/chat/{conversation_id}/messages")
async def send_message(conversation_id: str, inp: MessageInput, user: CurrentUser):
    async with pool.acquire() as conn:
        conv = await conn.fetchrow("SELECT * FROM conversations WHERE conversation_id = $1", conversation_id)
        if not conv or user["user_id"] not in conv["participants"]:
            raise HTTPException(status_code=403, detail="Not allowed")
        msg_id = gen_id("msg_")
        now = now_utc()
        await conn.execute(
            """INSERT INTO messages (message_id, conversation_id, sender_id, sender_name, text, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            msg_id, conversation_id, user["user_id"], user.get("name"), inp.text, now,
        )
        await conn.execute(
            "UPDATE conversations SET last_message = $2, updated_at = $3 WHERE conversation_id = $1",
            conversation_id, inp.text[:120], now,
        )
    return {
        "message_id": msg_id, "conversation_id": conversation_id, "sender_id": user["user_id"],
        "sender_name": user.get("name"), "text": inp.text, "created_at": now,
    }


@api.get("/")
async def root():
    return {"message": "BoostBac API", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,  # auth is via Bearer token, not cookies — safe to pair with "*"
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, init=_init_conn, statement_cache_size=0)
    # idempotent admin seed
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_pw:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT 1 FROM users WHERE email = $1", admin_email)
            if not existing:
                await conn.execute(
                    """INSERT INTO users (user_id, name, email, password_hash, role, status, auth_provider, created_at)
                       VALUES ($1, 'Admin', $2, $3, 'admin', 'active', 'email', $4)""",
                    gen_id("user_"), admin_email,
                    bcrypt.hashpw(admin_pw.encode(), bcrypt.gensalt()).decode(), now_utc(),
                )
                logger.info("Seeded admin account")
    logger.info("BoostBac API started")


@app.on_event("shutdown")
async def shutdown():
    if pool:
        await pool.close()
