import os
import uuid
import json
import base64
import logging
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

import asyncpg
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
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
    await conn.execute("SET search_path TO boostbac, public")


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


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class OnboardingInput(BaseModel):
    nickname: Optional[str] = None
    stream: str
    study_time_pref: str  # morning | night | flexible
    pain_points: List[str] = []
    goal: str  # remembering | understanding | consistency | confidence


def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "name": u.get("name"),
        "nickname": u.get("nickname"),
        "email": u.get("email"),
        "stream": u.get("stream") or "science",
        "role": u.get("role") or "student",
        "status": u.get("status") or "active",
        "onboarded": bool(u.get("onboarded")),
        "study_time_pref": u.get("study_time_pref"),
        "goal": u.get("goal"),
        "pain_points": u.get("pain_points") or [],
        "created_at": u.get("created_at"),
    }


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO boostbac.user_sessions (session_token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
            token, user_id, now_utc(), now_utc() + timedelta(days=30),
        )
    return token


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    async with pool.acquire() as conn:
        sess = await conn.fetchrow("SELECT * FROM boostbac.user_sessions WHERE session_token = $1", token)
        if not sess:
            raise HTTPException(status_code=401, detail="Invalid session")
        if sess["expires_at"] < now_utc():
            raise HTTPException(status_code=401, detail="Session expired")
        user = await conn.fetchrow("SELECT * FROM boostbac.users WHERE user_id = $1", sess["user_id"])
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


AdminUser = Annotated[dict, Depends(require_role("admin"))]


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


def derive_quality(correct: bool, time_spent_seconds: int) -> int:
    """SM-2 needs actual correctness + real retrieval latency, not a self-reported vibe
    (gap-analysis report, Section 6.1/6.2). This maps (correct, time_spent_seconds) onto the
    same 0-5 quality scale SM-2 expects. Thresholds are a deliberate MVP heuristic, not a
    validated timing model — refining them doesn't require a schema or API change."""
    if not correct:
        return 0
    if time_spent_seconds <= 20:
        return 5
    if time_spent_seconds <= 60:
        return 4
    return 3


VALID_MISTAKE_REASONS = {"concept", "formula", "procedure", "calculation", "calculator", "rushed", "unspecified"}
REGENERATING_MISTAKES = {"concept", "formula", "procedure", "calculation", "calculator"}
MISTAKE_ITEM_TYPE = {
    "concept": "concept_probe",
    "formula": "formula_probe",
    "procedure": "procedure_probe",
    "calculation": "calculation_probe",
    "calculator": "calculator_probe",
}


async def _touch_streak(conn: asyncpg.Connection, user_id: str):
    today = now_utc().date()
    s = await conn.fetchrow("SELECT * FROM boostbac.streaks WHERE user_id = $1", user_id)
    if not s:
        await conn.execute(
            "INSERT INTO boostbac.streaks (user_id, current_streak, longest_streak, last_active_date) VALUES ($1, 1, 1, $2)",
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
        "UPDATE boostbac.streaks SET current_streak = $2, longest_streak = $3, last_active_date = $4 WHERE user_id = $1",
        user_id, cur, longest, today.isoformat(),
    )


# --------------------------------------------------------------------------
# Auth routes
# --------------------------------------------------------------------------
@api.post("/auth/register")
async def register(inp: RegisterInput):
    email = inp.email.lower()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow("SELECT 1 FROM boostbac.users WHERE email = $1", email)
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        pw_hash = bcrypt.hashpw(inp.password.encode(), bcrypt.gensalt()).decode()
        user_id = gen_id("user_")
        created_at = now_utc()
        await conn.execute(
            """INSERT INTO boostbac.users (user_id, name, email, password_hash, role, status, auth_provider, created_at)
               VALUES ($1, $2, $3, $4, 'student', 'active', 'email', $5)""",
            user_id, inp.name, email, pw_hash, created_at,
        )
        await conn.execute(
            "INSERT INTO boostbac.streaks (user_id, current_streak, longest_streak, last_active_date) VALUES ($1, 0, 0, NULL)",
            user_id,
        )
    doc = {
        "user_id": user_id, "name": inp.name, "email": email, "stream": "science", "role": "student",
        "status": "active", "onboarded": False, "created_at": created_at,
    }
    token = await create_session(user_id)
    return {"session_token": token, "user": public_user(doc)}


@api.post("/auth/login")
async def login(inp: LoginInput):
    async with pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM boostbac.users WHERE email = $1", inp.email.lower())
    if not user or not user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(inp.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(dict(user))}


@api.get("/auth/me")
async def me(user: CurrentUser):
    async with pool.acquire() as conn:
        streak = await conn.fetchrow("SELECT * FROM boostbac.streaks WHERE user_id = $1", user["user_id"])
    result = public_user(user)
    result["current_streak"] = streak["current_streak"] if streak else 0
    result["longest_streak"] = streak["longest_streak"] if streak else 0
    return result


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM boostbac.user_sessions WHERE session_token = $1", token)
    return {"ok": True}


@api.post("/onboarding")
async def complete_onboarding(inp: OnboardingInput, user: CurrentUser):
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE boostbac.users SET nickname = $2, stream = $3, study_time_pref = $4,
                   pain_points = $5, goal = $6, onboarded = true WHERE user_id = $1""",
            user["user_id"], inp.nickname, inp.stream, inp.study_time_pref, inp.pain_points, inp.goal,
        )
        fresh = await conn.fetchrow("SELECT * FROM boostbac.users WHERE user_id = $1", user["user_id"])
    return public_user(dict(fresh))


# --------------------------------------------------------------------------
# Gemini helpers (shared JSON parsing / model fallback / image plumbing)
# --------------------------------------------------------------------------
class ImagePart(BaseModel):
    data: str  # base64 (no data-uri prefix needed)
    mime_type: Optional[str] = "image/jpeg"


_JSON_VALID_ESCAPES = set('"\\/bfnrtu')


def _sanitize_json_escapes(text: str) -> str:
    # Model sometimes emits raw LaTeX-style backslashes (e.g. "\cdot", "U\_n")
    # inside strings without escaping them for JSON. Scan left-to-right and
    # double any backslash not part of a valid JSON escape pair, advancing by
    # 2 chars on valid pairs so runs of backslashes stay correctly aligned.
    out = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == "\\" and i + 1 < n:
            nxt = text[i + 1]
            if nxt in _JSON_VALID_ESCAPES:
                out.append(c)
                out.append(nxt)
                i += 2
                continue
            out.append("\\\\")
            i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


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
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(_sanitize_json_escapes(text))


def _strip_data_uri(b64: str) -> str:
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


# Tried in order. Each model has its OWN free-tier daily quota, so if the
# primary is exhausted (429) or pulled (404), we fall back to the next one
# rather than failing the whole request.
GEN_MODEL_FALLBACKS = ["gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"]


async def _call_gemini_text(system: str, contents_text: str, image_pages: Optional[List[tuple]] = None) -> dict:
    from google import genai
    from google.genai import types
    from google.genai.errors import APIError

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured on the server")

    client_gemini = genai.Client(api_key=GEMINI_API_KEY)
    parts = []
    if image_pages:
        parts.extend(types.Part.from_bytes(data=data, mime_type=mime) for data, mime in image_pages)
    parts.append(types.Part.from_text(text=contents_text))
    contents = [types.Content(role="user", parts=parts)]
    config = types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json")

    last_error: Optional[Exception] = None
    for i, model in enumerate(GEN_MODEL_FALLBACKS):
        try:
            resp = await client_gemini.aio.models.generate_content(model=model, contents=contents, config=config)
            return _extract_json(resp.text)
        except APIError as e:
            last_error = e
            retryable = e.code in (429, 404, 503)
            has_next = i + 1 < len(GEN_MODEL_FALLBACKS)
            if retryable and has_next:
                logger.warning(f"Gemini model {model} failed ({e.code}), falling back to next model")
                continue
            raise
    raise last_error  # pragma: no cover — loop always returns or raises above


# --------------------------------------------------------------------------
# Capture -> segmentation pipeline (report Section 3)
# --------------------------------------------------------------------------
SEGMENT_SYSTEM = (
    "You are BoostBac, an expert tutor for Algerian Baccalaureat students. "
    "You receive one or more photos of a student's EXERCISE SHEET, possibly a numbered series of "
    "exercises/questions, possibly spanning multiple pages/photos. Read ALL the text (OCR), including "
    "diagrams, tables, or figures described in words. If part of the source is blurry, cropped, or "
    "illegible, transcribe your best honest reading rather than inventing content — never fabricate a "
    "question that isn't actually present.\n"
    "CRITICAL: keep every question's 'text' and 'generated_answer' in the ORIGINAL language of the "
    "source material (Arabic, French, or English — Algerian Bac science/math sheets are frequently in "
    "French; keep them in French). However 'subject' and 'skill_tag' must ALWAYS be short Algerian "
    "Arabic/Darja curriculum terms (e.g. رياضيات، فيزياء، علوم طبيعية، فلسفة، لغة عربية، لغة فرنسية، "
    "انجليزية، تاريخ وجغرافيا، تربية إسلامية، تسيير واقتصاد) regardless of the source language — the app's "
    "own interface is Darja-only and these two fields are shown as UI labels, not quoted content.\n"
    "Return ONLY valid JSON, no markdown, no commentary."
)

SEGMENT_PROMPT = (
    "Analyze this exercise sheet and DECOMPOSE it into its individual questions — do not summarize the "
    "whole sheet into one item. A numbered exercise with sub-parts a), b), c) that each require a "
    "separate answer should become separate questions; a sub-part that only makes sense chained to "
    "another (e.g. 'using your result from a)') may stay combined — use your judgment.\n"
    "For each question produce:\n"
    "- 'text': the question exactly as posed, faithfully transcribed (numbering/notation preserved).\n"
    "- 'shared_context': info from the parent exercise this question needs but doesn't restate itself "
    "(a diagram description, a shared dataset, values given once for the whole exercise) — empty string "
    "if none.\n"
    "- 'subject': short Arabic/Darja subject name (see system instructions).\n"
    "- 'skill_tag': a short, CONSISTENT Arabic label for the specific skill this question tests (e.g. "
    "'الاشتقاق', 'حساب المثلثات', 'التوازن الكيميائي') — reuse the exact same string across questions "
    "testing the same skill so progress can be tracked per skill.\n"
    "- 'question_type': one of 'objective' (single correct answer: MCQ/true-false/exact numeric answer), "
    "'math' (a computation/derivation with one correct numeric or symbolic result), 'conceptual' (a "
    "short-answer explanation with one clear best answer), or 'multi_formulation' (essay-style, several "
    "valid ways to answer — e.g. literature/philosophy analysis).\n"
    "- 'generated_answer': the full correct answer/worked solution. If a solution is already visible in "
    "the source, transcribe it. If not, SOLVE it yourself with the key steps shown. ACCURACY IS "
    "CRITICAL: re-derive it step by step and double-check every sign/computation before writing it, "
    "since the student only sees this after committing to their own attempt — a wrong answer is worse "
    "than no answer. Insert real newline characters ('\\n') between steps so it reads as short "
    "paragraphs, never one dense block.\n"
    "- 'answer_confidence': 'verified' for objective/math questions with one unambiguous correct answer "
    "you're fully confident in, 'likely' for conceptual questions where your answer is a solid model "
    "answer but not the only valid phrasing, 'needs_review' for multi_formulation questions or anything "
    "you're not fully certain of.\n"
    "Return a JSON object with EXACTLY this shape:\n"
    '{"questions": [{"text": "...", "shared_context": "...", "subject": "...", "skill_tag": "...", '
    '"question_type": "objective|math|conceptual|multi_formulation", "generated_answer": "...", '
    '"answer_confidence": "verified|likely|needs_review"}]}'
)

MAX_CAPTURE_PAGES = 8


class CaptureInput(BaseModel):
    images: List[ImagePart]
    hint: Optional[str] = None


@api.post("/exercises")
async def capture_exercise(inp: CaptureInput, user: CurrentUser):
    if not inp.images:
        raise HTTPException(status_code=400, detail="No image provided")
    if len(inp.images) > MAX_CAPTURE_PAGES:
        raise HTTPException(status_code=400, detail=f"Too many pages (max {MAX_CAPTURE_PAGES})")
    pages = [(base64.b64decode(_strip_data_uri(p.data)), p.mime_type or "image/jpeg") for p in inp.images]

    exercise_id = gen_id("ex_")
    now = now_utc()
    prompt = SEGMENT_PROMPT
    if len(pages) > 1:
        prompt += (
            f"\nYou were given {len(pages)} photos, in order — consecutive pages of the SAME exercise "
            "sheet. Treat them as one continuous document."
        )
    if inp.hint:
        prompt += f"\nThe student says this is about: {inp.hint}"

    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO boostbac.exercises (exercise_id, user_id, source_image_base64, source_mime, status, captured_at)
               VALUES ($1, $2, $3, $4, 'processing', $5)""",
            exercise_id, user["user_id"], inp.images[0].data, inp.images[0].mime_type or "image/jpeg", now,
        )

    try:
        parsed = await _call_gemini_text(SEGMENT_SYSTEM, prompt, pages)
        questions = parsed.get("questions") or []
        if not questions:
            raise ValueError("No questions could be extracted from this document.")
    except Exception as e:  # noqa
        logger.exception("Segmentation failed")
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE boostbac.exercises SET status = 'failed', error_message = $2 WHERE exercise_id = $1",
                exercise_id, str(e),
            )
        raise HTTPException(status_code=502, detail=f"AI processing failed: {e}")

    subject = questions[0].get("subject") or "General"
    out_questions = []
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE boostbac.exercises SET status = 'ready', subject = $2, stream = $3 WHERE exercise_id = $1",
                exercise_id, subject, user.get("stream"),
            )
            for i, q in enumerate(questions):
                qid = gen_id("q_")
                await conn.execute(
                    """INSERT INTO boostbac.questions (question_id, exercise_id, user_id, order_index, subject,
                                               skill_tag, text, shared_context, question_type,
                                               generated_answer, answer_confidence, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)""",
                    qid, exercise_id, user["user_id"], i, q.get("subject") or subject,
                    q.get("skill_tag") or "عام", q.get("text") or "", q.get("shared_context") or "",
                    q.get("question_type") or "conceptual", q.get("generated_answer") or "",
                    q.get("answer_confidence") or "likely", now,
                )
                out_questions.append({
                    "question_id": qid, "order_index": i, "subject": q.get("subject") or subject,
                    "skill_tag": q.get("skill_tag") or "عام", "text": q.get("text") or "",
                    "shared_context": q.get("shared_context") or "", "question_type": q.get("question_type") or "conceptual",
                })
    return {"exercise_id": exercise_id, "status": "ready", "subject": subject, "questions": out_questions}


@api.get("/exercises")
async def list_exercises(user: CurrentUser, subject: Optional[str] = None):
    async with pool.acquire() as conn:
        if subject:
            rows = await conn.fetch(
                """SELECT * FROM boostbac.exercises WHERE user_id = $1 AND status = 'ready' AND subject = $2
                   ORDER BY captured_at DESC""",
                user["user_id"], subject,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM boostbac.exercises WHERE user_id = $1 AND status = 'ready' ORDER BY captured_at DESC",
                user["user_id"],
            )
        out = []
        for ex in rows:
            stats = await conn.fetchrow(
                """SELECT count(*) AS total,
                          count(*) FILTER (WHERE EXISTS (
                              SELECT 1 FROM boostbac.attempts a WHERE a.question_id = q.question_id
                          )) AS attempted
                   FROM boostbac.questions q WHERE q.exercise_id = $1""",
                ex["exercise_id"],
            )
            out.append({
                "exercise_id": ex["exercise_id"], "subject": ex["subject"], "captured_at": ex["captured_at"],
                "total_questions": stats["total"], "attempted_questions": stats["attempted"],
            })
    return out


@api.get("/exercises/{exercise_id}/image")
async def get_exercise_image(exercise_id: str, user: CurrentUser):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT source_image_base64, source_mime FROM boostbac.exercises WHERE exercise_id = $1 AND user_id = $2",
            exercise_id, user["user_id"],
        )
    if not row or not row["source_image_base64"]:
        raise HTTPException(status_code=404, detail="No image for this exercise")
    return {"source_image_base64": row["source_image_base64"], "source_mime": row["source_mime"]}


@api.get("/exercises/{exercise_id}/questions")
async def get_exercise_questions(exercise_id: str, user: CurrentUser):
    async with pool.acquire() as conn:
        ex = await conn.fetchrow(
            "SELECT * FROM boostbac.exercises WHERE exercise_id = $1 AND user_id = $2", exercise_id, user["user_id"],
        )
        if not ex:
            raise HTTPException(status_code=404, detail="Exercise not found")
        rows = await conn.fetch(
            "SELECT * FROM boostbac.questions WHERE exercise_id = $1 ORDER BY order_index ASC", exercise_id,
        )
        out = []
        for q in rows:
            attempted = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM boostbac.attempts WHERE question_id = $1)", q["question_id"],
            )
            out.append({
                "question_id": q["question_id"], "order_index": q["order_index"], "subject": q["subject"],
                "skill_tag": q["skill_tag"], "text": q["text"], "shared_context": q["shared_context"],
                "question_type": q["question_type"], "attempted": bool(attempted),
            })
    return {"exercise_id": exercise_id, "subject": ex["subject"], "questions": out}


# --------------------------------------------------------------------------
# Study attempt flow: question-only -> explicit reveal -> self-report (Section 4)
# --------------------------------------------------------------------------
class RevealInput(BaseModel):
    time_spent_seconds: int = 0


@api.post("/questions/{question_id}/reveal")
async def reveal_question(question_id: str, inp: RevealInput, user: CurrentUser):
    async with pool.acquire() as conn:
        q = await conn.fetchrow(
            "SELECT * FROM boostbac.questions WHERE question_id = $1 AND user_id = $2", question_id, user["user_id"],
        )
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"answer": q["generated_answer"], "confidence": q["answer_confidence"]}


class AttemptInput(BaseModel):
    time_spent_seconds: int = 0
    correct: bool
    mistake_reason: Optional[str] = None


async def _get_or_create_review_item(conn: asyncpg.Connection, question: dict) -> dict:
    existing = await conn.fetchrow(
        "SELECT * FROM boostbac.review_items WHERE source_question_id = $1", question["question_id"],
    )
    if existing:
        return dict(existing)
    ri_id = gen_id("ri_")
    now = now_utc()
    await conn.execute(
        """INSERT INTO boostbac.review_items (review_item_id, source_question_id, user_id, subject, skill_tag,
                                       item_type, item_content, correct_answer, answer_confidence,
                                       sm2_due_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'original', $6, $7, $8, $9, $9, $9)""",
        ri_id, question["question_id"], question["user_id"], question["subject"], question["skill_tag"],
        question["text"], question["generated_answer"], question["answer_confidence"], now,
    )
    return await conn.fetchrow("SELECT * FROM boostbac.review_items WHERE review_item_id = $1", ri_id)


async def _regenerate_item(review_item: dict, mistake_reason: str) -> Optional[dict]:
    """Regenerate a review item's shape after a classified mistake (report Section 7).
    Returns None for non-regenerating reasons (rushed/unspecified) — those just get a shorter
    SM-2 interval via quality=0, the item content itself stays unchanged."""
    if mistake_reason not in REGENERATING_MISTAKES:
        return None
    instruction = {
        "concept": "The student didn't understand the underlying CONCEPT. Write a new question that "
                   "tests the same concept, decoupled from the original numbers/scenario — ask them to "
                   "explain or apply the concept itself, not redo the same computation.",
        "formula": "The student forgot which FORMULA/RULE applies here. Write a new question that tests "
                   "formula identification/recall for this situation, not the full computation.",
        "procedure": "The student used the wrong METHOD or the wrong step order. Write a new question "
                     "that tests correct sequencing of the method (e.g. 'what is the correct next "
                     "step'), not the raw arithmetic.",
        "calculation": "The student made an arithmetic/calculation slip. Write a new question that "
                       "isolates and re-asks JUST the specific operation likely to have failed, "
                       "stripped of surrounding context.",
        "calculator": "The student misused their calculator. Write a new question that walks through "
                      "the correct calculator operation/keystrokes for this type of problem, testing "
                      "tool usage rather than the underlying math.",
    }[mistake_reason]
    system = (
        "You are BoostBac, regenerating a study item after a student got it wrong. Core rule: do NOT "
        "just repeat the failed question — address the weakness behind it. Keep the same language as "
        "the input. Return ONLY valid JSON, no markdown."
    )
    prompt = (
        f"Original question: {review_item['item_content']}\n"
        f"Original correct answer: {review_item['correct_answer']}\n"
        f"{instruction}\n"
        'Return exactly: {"item_content": "<new question text>", "correct_answer": "<new correct answer, '
        'with brief reasoning if helpful>"}'
    )
    try:
        result = await _call_gemini_text(system, prompt)
        if not result.get("item_content") or not result.get("correct_answer"):
            return None
        return result
    except Exception:
        logger.exception("Review item regeneration failed — keeping item unchanged")
        return None


async def _apply_attempt_to_review_item(conn: asyncpg.Connection, review_item: dict, correct: bool,
                                          time_spent_seconds: int, mistake_reason: Optional[str]):
    quality = derive_quality(correct, time_spent_seconds)
    ease, interval, reps, offset_min = sm2(
        quality, review_item["sm2_ease_factor"] or 2.5, review_item["sm2_interval_days"] or 0,
        review_item["sm2_repetitions"] or 0,
    )
    due_at = now_utc() + timedelta(minutes=offset_min)
    regenerated = None
    if not correct and mistake_reason:
        regenerated = await _regenerate_item(review_item, mistake_reason)
    if regenerated:
        await conn.execute(
            """UPDATE boostbac.review_items SET item_type = $2, item_content = $3, correct_answer = $4,
                   sm2_ease_factor = $5, sm2_interval_days = $6, sm2_repetitions = $7, sm2_due_at = $8,
                   last_mistake_reason = $9, updated_at = $10 WHERE review_item_id = $1""",
            review_item["review_item_id"], MISTAKE_ITEM_TYPE[mistake_reason], regenerated["item_content"],
            regenerated["correct_answer"], ease, interval, reps, due_at, mistake_reason, now_utc(),
        )
    else:
        await conn.execute(
            """UPDATE boostbac.review_items SET sm2_ease_factor = $2, sm2_interval_days = $3, sm2_repetitions = $4,
                   sm2_due_at = $5, last_mistake_reason = $6, updated_at = $7 WHERE review_item_id = $1""",
            review_item["review_item_id"], ease, interval, reps, due_at, mistake_reason, now_utc(),
        )


@api.post("/questions/{question_id}/attempt")
async def attempt_question(question_id: str, inp: AttemptInput, user: CurrentUser):
    if inp.mistake_reason and inp.mistake_reason not in VALID_MISTAKE_REASONS:
        raise HTTPException(status_code=400, detail="Invalid mistake_reason")
    mistake_reason = inp.mistake_reason if not inp.correct else None
    if not inp.correct and mistake_reason is None:
        mistake_reason = "unspecified"  # student closed the prompt — still worth scheduling, just unclassified
    async with pool.acquire() as conn:
        q = await conn.fetchrow(
            "SELECT * FROM boostbac.questions WHERE question_id = $1 AND user_id = $2", question_id, user["user_id"],
        )
        if not q:
            raise HTTPException(status_code=404, detail="Question not found")
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO boostbac.attempts (attempt_id, user_id, question_id, context, correct,
                                          time_spent_seconds, mistake_reason, attempted_at)
                   VALUES ($1, $2, $3, 'study', $4, $5, $6, $7)""",
                gen_id("att_"), user["user_id"], question_id, inp.correct, inp.time_spent_seconds,
                mistake_reason, now_utc(),
            )
            review_item = await _get_or_create_review_item(conn, dict(q))
            await _apply_attempt_to_review_item(conn, review_item, inp.correct, inp.time_spent_seconds, mistake_reason)
            await _touch_streak(conn, user["user_id"])
    return {"ok": True}


# --------------------------------------------------------------------------
# Review flow (SM-2 due queue, launched only from Home — report Section 13)
# --------------------------------------------------------------------------
@api.get("/review/queue")
async def review_queue(user: CurrentUser, limit: int = 20):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT * FROM boostbac.review_items WHERE user_id = $1 AND sm2_due_at <= now()
               ORDER BY (last_mistake_reason IS NOT NULL) DESC, sm2_ease_factor ASC, sm2_due_at ASC
               LIMIT $2""",
            user["user_id"], limit,
        )
        total_due = await conn.fetchval(
            "SELECT count(*) FROM boostbac.review_items WHERE user_id = $1 AND sm2_due_at <= now()", user["user_id"],
        )
    items = [{
        "review_item_id": r["review_item_id"], "subject": r["subject"], "skill_tag": r["skill_tag"],
        "item_type": r["item_type"], "item_content": r["item_content"],
    } for r in rows]
    return {"items": items, "total_due": total_due}


@api.post("/review-items/{review_item_id}/reveal")
async def reveal_review_item(review_item_id: str, inp: RevealInput, user: CurrentUser):
    async with pool.acquire() as conn:
        ri = await conn.fetchrow(
            "SELECT * FROM boostbac.review_items WHERE review_item_id = $1 AND user_id = $2", review_item_id, user["user_id"],
        )
    if not ri:
        raise HTTPException(status_code=404, detail="Review item not found")
    return {"answer": ri["correct_answer"], "confidence": ri["answer_confidence"]}


@api.post("/review-items/{review_item_id}/attempt")
async def attempt_review_item(review_item_id: str, inp: AttemptInput, user: CurrentUser):
    if inp.mistake_reason and inp.mistake_reason not in VALID_MISTAKE_REASONS:
        raise HTTPException(status_code=400, detail="Invalid mistake_reason")
    mistake_reason = inp.mistake_reason if not inp.correct else None
    if not inp.correct and mistake_reason is None:
        mistake_reason = "unspecified"
    async with pool.acquire() as conn:
        ri = await conn.fetchrow(
            "SELECT * FROM boostbac.review_items WHERE review_item_id = $1 AND user_id = $2", review_item_id, user["user_id"],
        )
        if not ri:
            raise HTTPException(status_code=404, detail="Review item not found")
        async with conn.transaction():
            await conn.execute(
                """INSERT INTO boostbac.attempts (attempt_id, user_id, review_item_id, context, correct,
                                          time_spent_seconds, mistake_reason, attempted_at)
                   VALUES ($1, $2, $3, 'review', $4, $5, $6, $7)""",
                gen_id("att_"), user["user_id"], review_item_id, inp.correct, inp.time_spent_seconds,
                mistake_reason, now_utc(),
            )
            await _apply_attempt_to_review_item(conn, dict(ri), inp.correct, inp.time_spent_seconds, mistake_reason)
            await _touch_streak(conn, user["user_id"])
    return {"correct": inp.correct}


# --------------------------------------------------------------------------
# Home summary (report Section 11 — "what's due now", not an analytics dashboard)
# --------------------------------------------------------------------------
@api.get("/home")
async def home(user: CurrentUser):
    async with pool.acquire() as conn:
        due = await conn.fetchval(
            "SELECT count(*) FROM boostbac.review_items WHERE user_id = $1 AND sm2_due_at <= now()", user["user_id"],
        )
        has_exercises = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM boostbac.exercises WHERE user_id = $1 AND status = 'ready')", user["user_id"],
        )
        subj_rows = await conn.fetch(
            """SELECT q.subject AS subject, count(DISTINCT q.question_id) AS total,
                      count(DISTINCT a.question_id) FILTER (WHERE a.correct) AS correct
               FROM boostbac.questions q
               LEFT JOIN boostbac.attempts a ON a.question_id = q.question_id
               WHERE q.user_id = $1
               GROUP BY q.subject ORDER BY total DESC LIMIT 5""",
            user["user_id"],
        )
        streak = await conn.fetchrow("SELECT * FROM boostbac.streaks WHERE user_id = $1", user["user_id"])
    subjects = [{"subject": r["subject"], "correct": r["correct"] or 0, "total": r["total"]} for r in subj_rows]
    return {
        "total_due": due,
        "has_exercises": bool(has_exercises),
        "zero_data": not bool(has_exercises),
        "subjects": subjects,
        "current_streak": streak["current_streak"] if streak else 0,
    }


# --------------------------------------------------------------------------
# Progress / "You" (report Section 14 — every section independently gated on
# its own data sufficiency, never a fabricated percentage)
# --------------------------------------------------------------------------
@api.get("/progress")
async def progress(user: CurrentUser):
    async with pool.acquire() as conn:
        total_attempts = await conn.fetchval("SELECT count(*) FROM boostbac.attempts WHERE user_id = $1", user["user_id"])
        streak = await conn.fetchrow("SELECT * FROM boostbac.streaks WHERE user_id = $1", user["user_id"])

        if not total_attempts:
            return {
                "zero_data": True, "current_streak": streak["current_streak"] if streak else 0,
                "weekly_highlight": None, "subject_pulse": [], "recurring_mistakes": [],
            }

        # weekly highlight: subject with the most this-week attempts and a clear majority-correct trend
        week_rows = await conn.fetch(
            """SELECT q.subject AS subject, count(*) AS total, count(*) FILTER (WHERE a.correct) AS correct
               FROM boostbac.attempts a JOIN boostbac.questions q ON q.question_id = a.question_id
               WHERE a.user_id = $1 AND a.attempted_at >= now() - interval '7 days'
               GROUP BY q.subject ORDER BY total DESC LIMIT 1""",
            user["user_id"],
        )
        weekly_highlight = None
        if week_rows and week_rows[0]["total"] >= 5:
            r = week_rows[0]
            weekly_highlight = {
                "subject": r["subject"], "correct": r["correct"], "total": r["total"],
                "accuracy": round(r["correct"] / r["total"], 2),
            }

        # subject pulse: last 5 attempts per subject, correct/incorrect dots
        subj_names = await conn.fetch(
            "SELECT DISTINCT q.subject AS subject FROM boostbac.questions q WHERE q.user_id = $1", user["user_id"],
        )
        subject_pulse = []
        for s in subj_names:
            last5 = await conn.fetch(
                """SELECT a.correct FROM boostbac.attempts a JOIN boostbac.questions q ON q.question_id = a.question_id
                   WHERE q.subject = $1 AND a.user_id = $2 ORDER BY a.attempted_at DESC LIMIT 5""",
                s["subject"], user["user_id"],
            )
            if last5:
                subject_pulse.append({"subject": s["subject"], "dots": [bool(r["correct"]) for r in reversed(last5)]})

        # recurring mistakes: mistake_reason repeated >= 2x on the same skill_tag
        mistake_rows = await conn.fetch(
            """SELECT q.skill_tag AS skill_tag, a.mistake_reason AS mistake_reason, count(*) AS n
               FROM boostbac.attempts a JOIN boostbac.questions q ON q.question_id = a.question_id
               WHERE a.user_id = $1 AND a.correct = false AND a.mistake_reason IS NOT NULL
                     AND a.mistake_reason != 'unspecified'
               GROUP BY q.skill_tag, a.mistake_reason HAVING count(*) >= 2
               ORDER BY n DESC LIMIT 3""",
            user["user_id"],
        )
        recurring_mistakes = [{"skill_tag": r["skill_tag"], "mistake_reason": r["mistake_reason"], "count": r["n"]} for r in mistake_rows]

    return {
        "zero_data": False,
        "current_streak": streak["current_streak"] if streak else 0,
        "weekly_highlight": weekly_highlight,
        "subject_pulse": subject_pulse,
        "recurring_mistakes": recurring_mistakes,
    }


# --------------------------------------------------------------------------
# Library — browsable history of past captures (report Section 2)
# --------------------------------------------------------------------------
@api.get("/library")
async def library(user: CurrentUser, subject: Optional[str] = None):
    return await list_exercises(user, subject)


# --------------------------------------------------------------------------
# Personalized test generation (report Section 15) — gated by data
# sufficiency per mode, explained rather than silently disabled.
# --------------------------------------------------------------------------
SUBJECT_TEST_MIN_QUESTIONS = 5
WEAK_SPOT_MIN_ATTEMPTS = 3
WEAK_SPOT_MAX_ACCURACY = 0.6
MIXED_TEST_MIN_SUBJECTS = 2


async def _qualifying_subjects(conn: asyncpg.Connection, user_id: str) -> List[dict]:
    rows = await conn.fetch(
        """SELECT q.subject AS subject, count(DISTINCT a.question_id) AS attempted
           FROM boostbac.questions q JOIN boostbac.attempts a ON a.question_id = q.question_id
           WHERE q.user_id = $1 GROUP BY q.subject HAVING count(DISTINCT a.question_id) >= $2""",
        user_id, SUBJECT_TEST_MIN_QUESTIONS,
    )
    return [{"subject": r["subject"], "count": r["attempted"]} for r in rows]


async def _weak_skill_tags(conn: asyncpg.Connection, user_id: str) -> List[str]:
    rows = await conn.fetch(
        """SELECT q.skill_tag AS skill_tag, count(*) AS total, count(*) FILTER (WHERE a.correct) AS correct
           FROM boostbac.attempts a JOIN boostbac.questions q ON q.question_id = a.question_id
           WHERE a.user_id = $1 GROUP BY q.skill_tag HAVING count(*) >= $2""",
        user_id, WEAK_SPOT_MIN_ATTEMPTS,
    )
    return [r["skill_tag"] for r in rows if (r["correct"] / r["total"]) < WEAK_SPOT_MAX_ACCURACY]


@api.get("/tests/availability")
async def tests_availability(user: CurrentUser):
    async with pool.acquire() as conn:
        any_items = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM boostbac.review_items WHERE user_id = $1)", user["user_id"])
        subjects = await _qualifying_subjects(conn, user["user_id"])
        weak_tags = await _weak_skill_tags(conn, user["user_id"])
    return {
        "quick": {"unlocked": bool(any_items)},
        "subject": {"unlocked": len(subjects) > 0, "subjects": subjects},
        "weak_spots": {"unlocked": len(weak_tags) > 0},
        "mixed": {"unlocked": len(subjects) >= MIXED_TEST_MIN_SUBJECTS},
    }


TESTGEN_SYSTEM = (
    "You are BoostBac. You receive a numbered list of study items (a question and its correct answer, "
    "already verified). For EACH item, produce a multiple-choice version: one correct option matching "
    "the given answer in substance, and three plausible-but-wrong distractor options in the same "
    "language/format as the correct one. Keep the question text close to the original, shortened only "
    "if needed for MCQ framing. Return ONLY valid JSON, no markdown."
)


def _testgen_prompt(items: List[dict]) -> str:
    lines = [f"{i}. Question: {it['content']}\n   Correct answer: {it['answer']}" for i, it in enumerate(items)]
    return (
        "Produce one MCQ per numbered item below, in the SAME order:\n" + "\n".join(lines) +
        '\nReturn exactly: {"items": [{"question_text": "...", "options": ["...", "...", "...", "..."], '
        '"correct_index": 0}, ...]} — one entry per input item, same order, correct_index is 0-based.'
    )


class TestCreateInput(BaseModel):
    mode: str  # quick | weak_spots | subject | mixed
    subject: Optional[str] = None


MODE_SIZE = {"quick": 10, "subject": 10, "weak_spots": 8, "mixed": 12}


@api.post("/tests")
async def create_test(inp: TestCreateInput, user: CurrentUser):
    if inp.mode not in MODE_SIZE:
        raise HTTPException(status_code=400, detail="Invalid mode")
    size = MODE_SIZE[inp.mode]
    async with pool.acquire() as conn:
        if inp.mode == "quick":
            rows = await conn.fetch(
                "SELECT * FROM boostbac.review_items WHERE user_id = $1 ORDER BY sm2_due_at ASC LIMIT $2",
                user["user_id"], size,
            )
        elif inp.mode == "subject":
            if not inp.subject:
                raise HTTPException(status_code=400, detail="subject is required for subject mode")
            subjects = await _qualifying_subjects(conn, user["user_id"])
            if inp.subject not in [s["subject"] for s in subjects]:
                raise HTTPException(status_code=422, detail="Not enough data yet for this subject")
            rows = await conn.fetch(
                "SELECT * FROM boostbac.review_items WHERE user_id = $1 AND subject = $2 ORDER BY sm2_due_at ASC LIMIT $3",
                user["user_id"], inp.subject, size,
            )
        elif inp.mode == "weak_spots":
            weak_tags = await _weak_skill_tags(conn, user["user_id"])
            if not weak_tags:
                raise HTTPException(status_code=422, detail="Not enough data yet to identify weak spots")
            rows = await conn.fetch(
                "SELECT * FROM boostbac.review_items WHERE user_id = $1 AND skill_tag = ANY($2::text[]) ORDER BY sm2_due_at ASC LIMIT $3",
                user["user_id"], weak_tags, size,
            )
        else:  # mixed
            subjects = await _qualifying_subjects(conn, user["user_id"])
            if len(subjects) < MIXED_TEST_MIN_SUBJECTS:
                raise HTTPException(status_code=422, detail="Not enough spread across subjects yet")
            rows = await conn.fetch(
                "SELECT * FROM boostbac.review_items WHERE user_id = $1 ORDER BY random() LIMIT $2",
                user["user_id"], size,
            )
        if not rows:
            raise HTTPException(status_code=422, detail="Not enough data yet for this test mode")

        pool_items = [{"content": r["item_content"], "answer": r["correct_answer"], "skill_tag": r["skill_tag"]} for r in rows]
        try:
            gen = await _call_gemini_text(TESTGEN_SYSTEM, _testgen_prompt(pool_items))
            mcqs = gen.get("items") or []
        except Exception as e:
            logger.exception("Test MCQ generation failed")
            raise HTTPException(status_code=502, detail=f"AI processing failed: {e}")
        if len(mcqs) != len(pool_items):
            raise HTTPException(status_code=502, detail="AI returned a mismatched number of test questions")

        stored_questions = []
        client_questions = []
        for idx, (src, mcq) in enumerate(zip(pool_items, mcqs)):
            stored_questions.append({
                "index": idx, "question_text": mcq.get("question_text") or src["content"],
                "options": mcq.get("options") or [], "correct_index": mcq.get("correct_index", 0),
                "skill_tag": src["skill_tag"],
            })
            client_questions.append({
                "index": idx, "question_text": mcq.get("question_text") or src["content"],
                "options": mcq.get("options") or [], "skill_tag": src["skill_tag"],
            })

        test_id = gen_id("test_")
        await conn.execute(
            """INSERT INTO boostbac.tests (test_id, user_id, mode, subject, questions, created_at)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            test_id, user["user_id"], inp.mode, inp.subject, stored_questions, now_utc(),
        )
    return {"test_id": test_id, "mode": inp.mode, "questions": client_questions}


class TestSubmitInput(BaseModel):
    answers: List[dict]  # [{index, selected_index}]


@api.post("/tests/{test_id}/submit")
async def submit_test(test_id: str, inp: TestSubmitInput, user: CurrentUser):
    async with pool.acquire() as conn:
        test = await conn.fetchrow("SELECT * FROM boostbac.tests WHERE test_id = $1 AND user_id = $2", test_id, user["user_id"])
        if not test:
            raise HTTPException(status_code=404, detail="Test not found")
        questions = test["questions"]
        by_index = {a["index"]: a.get("selected_index") for a in inp.answers}
        correct = 0
        improved, weak = set(), set()
        for q in questions:
            selected = by_index.get(q["index"])
            is_correct = selected == q["correct_index"]
            if is_correct:
                correct += 1
                improved.add(q["skill_tag"])
            else:
                weak.add(q["skill_tag"])
        total = len(questions)
        score = round(correct / total * 100) if total else 0
        improved_skills = sorted(improved - weak)
        weak_skills = sorted(weak)
        await conn.execute(
            """UPDATE boostbac.tests SET score = $2, correct = $3, total = $4, improved_skills = $5,
                   weak_skills = $6, completed_at = $7 WHERE test_id = $1""",
            test_id, score, correct, total, improved_skills, weak_skills, now_utc(),
        )
        await _touch_streak(conn, user["user_id"])
    return {"score": score, "correct": correct, "total": total, "improved_skills": improved_skills, "weak_skills": weak_skills}


# --------------------------------------------------------------------------
# Admin (student-facing stats only — the teacher-approval workflow from the
# previous community/resources era was removed along with those features)
# --------------------------------------------------------------------------
@api.get("/admin/stats")
async def admin_stats(admin: AdminUser):
    async with pool.acquire() as conn:
        students = await conn.fetchval("SELECT count(*) FROM boostbac.users WHERE role = 'student'")
        exercises_captured = await conn.fetchval("SELECT count(*) FROM boostbac.exercises WHERE status = 'ready'")
        questions_answered = await conn.fetchval("SELECT count(*) FROM boostbac.attempts")
        tests_taken = await conn.fetchval("SELECT count(*) FROM boostbac.tests WHERE completed_at IS NOT NULL")
    return {
        "students": students, "exercises_captured": exercises_captured,
        "questions_answered": questions_answered, "tests_taken": tests_taken,
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
    # Supabase's session pooler caps total concurrent clients project-wide (15 on
    # the free tier) — asyncpg's default pool (min_size=10, max_size=10) alone
    # can exhaust that, especially with more than one deployment/instance
    # connecting at once. Keep this small; a hobby-scale app doesn't need 10
    # idle connections reserved per instance.
    pool = await asyncpg.create_pool(DATABASE_URL, init=_init_conn, statement_cache_size=0, min_size=1, max_size=4)
    # idempotent admin seed
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_pw = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_pw:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow("SELECT 1 FROM boostbac.users WHERE email = $1", admin_email)
            if not existing:
                await conn.execute(
                    """INSERT INTO boostbac.users (user_id, name, email, password_hash, role, status, onboarded, auth_provider, created_at)
                       VALUES ($1, 'Admin', $2, $3, 'admin', 'active', true, 'email', $4)""",
                    gen_id("user_"), admin_email,
                    bcrypt.hashpw(admin_pw.encode(), bcrypt.gensalt()).decode(), now_utc(),
                )
                logger.info("Seeded admin account")
    logger.info("BoostBac API started")


@app.on_event("shutdown")
async def shutdown():
    if pool:
        await pool.close()
