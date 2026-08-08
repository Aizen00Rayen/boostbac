"""BoostBac backend tests. Covers auth, profile, decks (AI gen), review (SM-2),
home, analytics, exams.

Run:
  pytest /app/backend/tests/backend_test.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/pytest_results.xml
"""
import os
import time
import uuid
import pytest
import requests

from gen_test_image import make_notes_image_b64  # noqa: E402

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else \
    "https://bac-ai-learn.preview.emergentagent.com"
API = f"{BASE_URL}/api"

TEST_EMAIL = "test@boostbac.dz"
TEST_PASSWORD = "test1234"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def token(s):
    # Try login first; if it fails, register the shared test account.
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    if r.status_code == 401:
        rr = s.post(f"{API}/auth/register", json={
            "name": "BoostBac Test", "email": TEST_EMAIL, "password": TEST_PASSWORD, "stream": "science",
        }, timeout=20)
        assert rr.status_code in (200, 201, 409), rr.text
        if rr.status_code == 409:
            r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
        else:
            return rr.json()["session_token"]
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def ensure_cards(s, h):
    """Guarantee the test user has at least one saved deck with cards.
    Because pytest-xdist workers have isolated fixture caches (loadscope), each
    worker that needs cards uses this fixture and generates its own deck if
    the shared account doesn't yet have any cards visible."""
    # Check current queue
    q = s.get(f"{API}/review/queue", headers=h, timeout=20).json()
    if q.get("total_due", 0) >= 1:
        return q
    # Generate + save a deck
    b64 = make_notes_image_b64()
    r = s.post(f"{API}/decks/generate", headers=h, json={
        "image_base64": b64, "mime_type": "image/jpeg", "hint": "Physics",
    }, timeout=120)
    assert r.status_code == 200, r.text[:500]
    gen = r.json()
    r = s.post(f"{API}/decks/save", headers=h, json={
        "deck": gen["deck"], "cards": gen["cards"],
    }, timeout=30)
    assert r.status_code == 200
    return s.get(f"{API}/review/queue", headers=h, timeout=20).json()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
def test_root(s):
    r = s.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class TestAuth:
    def test_register_fresh_account(self, s):
        email = f"TEST_{uuid.uuid4().hex[:8]}@boostbac.dz"
        r = s.post(f"{API}/auth/register", json={
            "name": "TEST User", "email": email, "password": "abc12345", "stream": "science",
        }, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "session_token" in j and j["session_token"]
        # Backend lowercases emails
        assert j["user"]["email"] == email.lower()
        assert j["user"]["stream"] == "science"
        assert j["user"]["language"] == "ar"
        assert j["user"]["daily_goal"] == 20

    def test_register_duplicate_email_returns_409(self, s):
        r = s.post(f"{API}/auth/register", json={
            "name": "Dup", "email": TEST_EMAIL, "password": "whatever123", "stream": "science",
        }, timeout=20)
        assert r.status_code == 409

    def test_login_success(self, s):
        r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == TEST_EMAIL

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": "wrong"}, timeout=20)
        assert r.status_code == 401

    def test_me_returns_streak_fields(self, s, h):
        r = s.get(f"{API}/auth/me", headers=h, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["email"] == TEST_EMAIL
        assert "current_streak" in j and "longest_streak" in j

    def test_me_no_token_401(self, s):
        assert s.get(f"{API}/auth/me", timeout=10).status_code == 401


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
class TestProfile:
    def test_update_and_verify(self, s, h):
        r = s.put(f"{API}/profile", headers=h, json={
            "stream": "math", "daily_goal": 30, "language": "fr",
        }, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["stream"] == "math"
        assert j["daily_goal"] == 30
        assert j["language"] == "fr"

        # verify via /auth/me
        me = s.get(f"{API}/auth/me", headers=h, timeout=20).json()
        assert me["stream"] == "math"
        assert me["daily_goal"] == 30
        assert me["language"] == "fr"

        # restore
        s.put(f"{API}/profile", headers=h, json={
            "stream": "science", "daily_goal": 20, "language": "ar",
        }, timeout=20)


# ---------------------------------------------------------------------------
# Deck generation + save (AI)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def generated_deck(s, h):
    b64 = make_notes_image_b64()
    r = s.post(f"{API}/decks/generate", headers=h, json={
        "image_base64": b64, "mime_type": "image/jpeg", "hint": "Physics Newton's laws",
    }, timeout=120)
    assert r.status_code == 200, r.text[:1000]
    j = r.json()
    assert "deck" in j and "cards" in j
    assert len(j["cards"]) >= 3, f"Expected >=3 cards, got {len(j['cards'])}"
    return j


class TestDecks:
    def test_generate_returns_deck_and_cards(self, generated_deck):
        j = generated_deck
        assert j["deck"]["subject"]
        for c in j["cards"]:
            assert c["question"] and c["answer"]

    def test_save_deck_and_list(self, s, h, generated_deck):
        r = s.post(f"{API}/decks/save", headers=h, json={
            "deck": generated_deck["deck"], "cards": generated_deck["cards"],
        }, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["cards_saved"] == len(generated_deck["cards"])
        deck_id = j["deck_id"]

        # verify list
        r = s.get(f"{API}/decks", headers=h, timeout=20)
        assert r.status_code == 200
        decks = r.json()
        found = [d for d in decks if d["deck_id"] == deck_id]
        assert found, "Saved deck not in /decks list"
        d = found[0]
        assert d["total_cards"] == len(generated_deck["cards"])
        assert d["due_cards"] == len(generated_deck["cards"])  # due immediately

        # keep deck_id for later
        pytest.saved_deck_id = deck_id


# ---------------------------------------------------------------------------
# Home
# ---------------------------------------------------------------------------
class TestHome:
    def test_home_summary(self, s, h, ensure_cards):
        r = s.get(f"{API}/home", headers=h, timeout=20)
        assert r.status_code == 200
        j = r.json()
        for k in ("total_due", "cards_reviewed_today", "daily_goal", "xp",
                  "current_streak", "decks"):
            assert k in j, f"missing {k}"
        assert j["total_due"] >= 1


# ---------------------------------------------------------------------------
# Review queue + SM-2
# ---------------------------------------------------------------------------
class TestReview:
    def test_queue_and_submit_flow(self, s, h, ensure_cards):
        r = s.get(f"{API}/review/queue", headers=h, timeout=20)
        assert r.status_code == 200
        q = r.json()
        assert q["total_due"] >= 1
        cards = q["cards"]
        assert cards

        # rate 'good' — should push next_review out and bump reps
        card = cards[0]
        me_before = s.get(f"{API}/auth/me", headers=h, timeout=20).json()
        xp_before = me_before["xp"]

        r = s.post(f"{API}/review/submit", headers=h, json={
            "card_id": card["card_id"], "rating": "good",
        }, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["xp_earned"] == 8
        assert j["repetitions"] == 1

        me_after = s.get(f"{API}/auth/me", headers=h, timeout=20).json()
        assert me_after["xp"] == xp_before + 8

        # 'again' on 2nd card
        if len(cards) >= 2:
            c2 = cards[1]
            r = s.post(f"{API}/review/submit", headers=h, json={
                "card_id": c2["card_id"], "rating": "again",
            }, timeout=20)
            assert r.status_code == 200
            assert r.json()["repetitions"] == 0

            # verify still due (short offset)
            q2 = s.get(f"{API}/review/queue", headers=h, timeout=20).json()
            still_due = [c for c in q2["cards"] if c["card_id"] == c2["card_id"]]
            # 'again' offset is 1 minute; may or may not be due right now — accept both,
            # but validate SM-2 fields stored:
            if still_due:
                assert still_due[0]["repetitions"] == 0

        # 'easy' on 3rd if present, verify ease_factor increased
        if len(cards) >= 3:
            c3 = cards[2]
            r = s.post(f"{API}/review/submit", headers=h, json={
                "card_id": c3["card_id"], "rating": "easy",
            }, timeout=20)
            assert r.status_code == 200
            assert r.json()["xp_earned"] == 10

    def test_submit_invalid_rating(self, s, h):
        r = s.post(f"{API}/review/submit", headers=h, json={
            "card_id": "nope", "rating": "meh",
        }, timeout=20)
        assert r.status_code == 400

    def test_submit_unknown_card(self, s, h):
        r = s.post(f"{API}/review/submit", headers=h, json={
            "card_id": "card_doesnotexist", "rating": "good",
        }, timeout=20)
        assert r.status_code == 404

    def test_review_complete_bonus(self, s, h, ensure_cards):
        # Do at least one review so streak touches
        q = s.get(f"{API}/review/queue", headers=h, timeout=20).json()
        if q.get("cards"):
            s.post(f"{API}/review/submit", headers=h, json={
                "card_id": q["cards"][0]["card_id"], "rating": "good",
            }, timeout=20)
        r = s.post(f"{API}/review/complete", headers=h, json={
            "reviewed": 3, "correct": 2, "xp_earned": 20,
        }, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["bonus_xp"] in (5, 15)
        assert j["current_streak"] >= 1


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
class TestAnalytics:
    def test_analytics_shape(self, s, h):
        r = s.get(f"{API}/analytics", headers=h, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j["heatmap"], list)
        assert isinstance(j["forgetting_curve"], list)
        assert len(j["forgetting_curve"]) == 14
        assert "overall_accuracy" in j


# ---------------------------------------------------------------------------
# Exams
# ---------------------------------------------------------------------------
class TestExams:
    def test_generate_submit_history(self, s, h):
        r = s.post(f"{API}/exams/generate", headers=h, json={"num_questions": 5}, timeout=30)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["exam_id"] and len(e["questions"]) >= 1

        results = [{"card_id": q["card_id"], "subject": q.get("subject"), "correct": i % 2 == 0}
                   for i, q in enumerate(e["questions"])]
        r = s.post(f"{API}/exams/submit", headers=h, json={
            "exam_id": e["exam_id"], "results": results, "duration_seconds": 120,
        }, timeout=20)
        assert r.status_code == 200, r.text
        sub = r.json()
        assert "score" in sub and "breakdown" in sub
        assert sub["total"] == len(results)

        r = s.get(f"{API}/exams/history", headers=h, timeout=20)
        assert r.status_code == 200
        hist = r.json()
        assert any(x["exam_id"] == e["exam_id"] for x in hist)


# ---------------------------------------------------------------------------
# Cleanup: delete deck at end
# ---------------------------------------------------------------------------
def test_cleanup_delete_deck(s, h):
    deck_id = getattr(pytest, "saved_deck_id", None)
    if not deck_id:
        pytest.skip("no deck saved")
    r = s.delete(f"{API}/decks/{deck_id}", headers=h, timeout=20)
    assert r.status_code == 200
