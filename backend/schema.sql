-- BoostBac schema for Supabase (Postgres).
-- Run this once against your Supabase project (SQL Editor, or `psql $DATABASE_URL -f schema.sql`).
-- All tables live in the `boostbac` schema (not `public`) to avoid colliding with other
-- apps that may share the same Supabase project. server.py sets search_path per-connection
-- but also fully qualifies every query with `boostbac.` since connection poolers don't
-- reliably preserve session-level SET search_path across pooled connections.
--
-- This schema replaces the old decks/cards/review_logs/exams/resources/conversations/messages
-- model (Duolingo-path era) with the Exercise -> Question -> Attempt -> ReviewItem model from
-- the product gap-analysis: a capture is decomposed into individual questions, each question's
-- first attempt and every later spaced-repetition attempt are logged with real latency +
-- mistake classification, and a ReviewItem (not the raw Question) is what SM-2 schedules and
-- what mistake-classification is allowed to regenerate the shape of.

-- Pre-beta rebuild: replaces the old decks/cards/review_logs/exams/resources/conversations/
-- messages/path_chapters model outright (no production data to migrate). Drop-and-recreate
-- rather than ALTERing table-by-table, since the users table's shape also changed (roles
-- collapsed to student/admin, gamification columns removed, onboarding columns added).
drop schema if exists boostbac cascade;

create schema boostbac;

create table if not exists boostbac.users (
    user_id           text primary key,
    name              text,
    nickname          text,
    email             text not null unique,
    password_hash     text,
    stream            text default 'science',
    role              text default 'student',   -- student | admin
    status            text default 'active',
    auth_provider     text default 'email',
    picture           text,
    onboarded         boolean default false,
    study_time_pref   text,                      -- morning | night | flexible
    goal              text,                      -- remembering | understanding | consistency | confidence
    pain_points       text[],                    -- forget_what_i_study | dont_know_where_to_start | avoid_hard_subjects | repeat_mistakes | no_consistency
    created_at        timestamptz default now()
);

create table if not exists boostbac.user_sessions (
    session_token   text primary key,
    user_id         text not null references boostbac.users(user_id) on delete cascade,
    created_at      timestamptz default now(),
    expires_at      timestamptz not null
);
create index if not exists idx_user_sessions_expires on boostbac.user_sessions(expires_at);

create table if not exists boostbac.streaks (
    user_id             text primary key references boostbac.users(user_id) on delete cascade,
    current_streak      integer default 0,
    longest_streak      integer default 0,
    last_active_date    text
);

-- One captured source document (e.g. one photographed exercise sheet). Kept as shared
-- reference material — every question below stays linked back to it ("this question came
-- from page X") — but every downstream action (attempt, mistake, review) operates on the
-- Question, not the Exercise.
create table if not exists boostbac.exercises (
    exercise_id       text primary key,
    user_id           text not null references boostbac.users(user_id) on delete cascade,
    subject           text,
    stream            text,
    source_image_base64 text,
    source_mime       text,
    status            text default 'processing',  -- processing | ready | failed
    error_message     text,
    captured_at       timestamptz default now()
);
create index if not exists idx_exercises_user on boostbac.exercises(user_id, captured_at desc);

-- A single question, segmented out of an Exercise at capture time. The answer is generated
-- immediately but kept hidden (never returned by the capture response) until the student's
-- own attempt is logged, per the report's "attempt-before-reveal" rule.
create table if not exists boostbac.questions (
    question_id       text primary key,
    exercise_id       text not null references boostbac.exercises(exercise_id) on delete cascade,
    user_id           text not null references boostbac.users(user_id) on delete cascade,
    order_index       integer default 0,
    subject           text,
    skill_tag         text,
    text              text not null,
    shared_context    text,                       -- e.g. a diagram/table/given-values shared with sibling questions
    question_type     text default 'conceptual',  -- objective | math | conceptual | multi_formulation
    mcq_options       jsonb,                       -- present only when question_type = 'objective' and MCQ-shaped
    generated_answer  text,
    answer_confidence text default 'likely',       -- verified | likely | needs_review
    created_at        timestamptz default now()
);
create index if not exists idx_questions_exercise on boostbac.questions(exercise_id, order_index);
create index if not exists idx_questions_user on boostbac.questions(user_id);

-- A ReviewItem is the living, evolving artifact SM-2 schedules — distinct from the Question
-- it originated from. Its item_type/item_content can change every time a mistake reclassifies
-- it (Section 7): a "calculation slip" review item stays the same problem re-isolated on the
-- failed operation, while a "conceptual gap" review item mutates into a concept-probe decoupled
-- from the original numbers entirely.
create table if not exists boostbac.review_items (
    review_item_id     text primary key,
    source_question_id text not null references boostbac.questions(question_id) on delete cascade,
    user_id             text not null references boostbac.users(user_id) on delete cascade,
    subject             text,
    skill_tag           text,
    item_type           text default 'original',  -- original | concept_probe | formula_probe | procedure_probe | calculation_probe | calculator_probe
    item_content        text not null,
    item_options        jsonb,
    correct_answer      text,
    answer_confidence   text default 'likely',
    sm2_ease_factor      double precision default 2.5,
    sm2_interval_days    integer default 0,
    sm2_repetitions      integer default 0,
    sm2_due_at           timestamptz not null default now(),
    last_mistake_reason  text,
    created_at           timestamptz default now(),
    updated_at           timestamptz default now()
);
create index if not exists idx_review_items_user_due on boostbac.review_items(user_id, sm2_due_at);
create index if not exists idx_review_items_source_question on boostbac.review_items(source_question_id);

-- Every attempt — first-pass (attached to a Question, review_item_id null) or spaced-repetition
-- / test (attached to a ReviewItem, question_id null) — logs real correctness + real latency +
-- mistake reason. time_spent_seconds must always be a real client-measured value: the prior
-- codebase hardcoded this to 0 across every SM-2 call, which silently blinded the scheduler to
-- retrieval difficulty (one of SM-2's two required signals, the other being correctness).
create table if not exists boostbac.attempts (
    attempt_id          text primary key,
    user_id             text not null references boostbac.users(user_id) on delete cascade,
    question_id         text references boostbac.questions(question_id) on delete cascade,
    review_item_id      text references boostbac.review_items(review_item_id) on delete cascade,
    context             text not null default 'study',  -- study | review | test
    correct             boolean not null,
    time_spent_seconds  integer not null default 0,
    mistake_reason      text,   -- concept | formula | procedure | calculation | calculator | rushed | unspecified — null if correct
    attempted_at        timestamptz default now(),
    constraint attempts_one_target check (
        (question_id is not null and review_item_id is null) or
        (question_id is null and review_item_id is not null)
    )
);
create index if not exists idx_attempts_user on boostbac.attempts(user_id, attempted_at desc);
create index if not exists idx_attempts_question on boostbac.attempts(question_id);
create index if not exists idx_attempts_review_item on boostbac.attempts(review_item_id);

-- Personalized tests (Quick / Weak Spots / Subject / Mixed) — a generated, gradeable snapshot
-- pulled from the same review_item pool, not a new content type of its own.
create table if not exists boostbac.tests (
    test_id           text primary key,
    user_id           text not null references boostbac.users(user_id) on delete cascade,
    mode              text not null,  -- quick | weak_spots | subject | mixed
    subject           text,
    questions         jsonb not null,  -- [{question_text, options, correct_index, skill_tag, source_review_item_id}]
    score             integer,
    correct           integer,
    total             integer,
    improved_skills   text[],
    weak_skills       text[],
    created_at        timestamptz default now(),
    completed_at      timestamptz
);
create index if not exists idx_tests_user on boostbac.tests(user_id, created_at desc);
