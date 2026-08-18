-- BoostBac schema for Supabase (Postgres).
-- Run this once against your Supabase project (SQL Editor, or `psql $DATABASE_URL -f schema.sql`).
-- All tables live in the `boostbac` schema (not `public`) to avoid colliding with other
-- apps that may share the same Supabase project. server.py sets search_path per-connection
-- but also fully qualifies every query with `boostbac.` since connection poolers don't
-- reliably preserve session-level SET search_path across pooled connections.

create schema if not exists boostbac;

create table if not exists boostbac.users (
    user_id         text primary key,
    name            text,
    email           text not null unique,
    password_hash   text,
    stream          text default 'science',
    language        text default 'ar',
    daily_goal      integer default 20,
    xp              integer default 0,
    role            text default 'student',
    status          text default 'active',
    auth_provider   text default 'email',
    picture         text,
    exam_date       text,
    created_at      timestamptz default now(),
    approved_at     timestamptz,
    rejected_at     timestamptz
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
    longest_streak       integer default 0,
    last_active_date    text
);

-- Fixed curriculum skeleton for the Duolingo-style learning path. Seeded with a
-- best-effort reconstruction of the real Bac program (verified by the app owner);
-- plain editable rows on purpose so a wrong chapter name/order is a one-line SQL
-- fix, not a code change.
create table if not exists boostbac.path_chapters (
    chapter_id   text primary key,
    stream       text not null,
    subject      text not null,
    name         text not null,
    name_ar      text,
    order_index  integer not null
);
create index if not exists idx_path_chapters_stream_subject on boostbac.path_chapters(stream, subject, order_index);

create table if not exists boostbac.decks (
    deck_id             text primary key,
    user_id             text not null references boostbac.users(user_id) on delete cascade,
    subject             text,
    topic               text,
    deck_name           text,
    language            text,
    created_at          timestamptz default now(),
    saved               boolean default false,
    attachment_base64   text,
    attachment_mime     text,
    chapter_id          text references boostbac.path_chapters(chapter_id) on delete set null
);
create index if not exists idx_decks_user on boostbac.decks(user_id);
create index if not exists idx_decks_chapter on boostbac.decks(chapter_id);

create table if not exists boostbac.cards (
    card_id             text primary key,
    deck_id             text references boostbac.decks(deck_id) on delete cascade,
    user_id             text not null references boostbac.users(user_id) on delete cascade,
    subject             text,
    topic               text,
    question            text,
    answer              text,
    difficulty          text default 'medium',
    ease_factor         double precision default 2.5,
    interval_days        integer default 0,
    repetitions         integer default 0,
    next_review_date    timestamptz not null default now(),
    last_reviewed_at    timestamptz,
    created_at          timestamptz default now(),
    game_data           jsonb
);
create index if not exists idx_cards_user on boostbac.cards(user_id);
create index if not exists idx_cards_deck on boostbac.cards(deck_id);
create index if not exists idx_cards_due on boostbac.cards(user_id, next_review_date);

create table if not exists boostbac.review_logs (
    log_id       text primary key,
    card_id      text,
    user_id      text not null references boostbac.users(user_id) on delete cascade,
    subject      text,
    topic        text,
    rating       text,
    quality      integer,
    correct      boolean,
    reviewed_at  timestamptz default now()
);
create index if not exists idx_review_logs_user on boostbac.review_logs(user_id);
create index if not exists idx_review_logs_reviewed_at on boostbac.review_logs(reviewed_at);

create table if not exists boostbac.exams (
    exam_id          text primary key,
    user_id          text not null references boostbac.users(user_id) on delete cascade,
    topics_covered   text[],
    num_questions    integer,
    created_at       timestamptz default now(),
    score            integer,
    correct          integer,
    total            integer,
    breakdown        jsonb,
    duration_seconds integer,
    taken_at         timestamptz
);
create index if not exists idx_exams_user on boostbac.exams(user_id);

create table if not exists boostbac.resources (
    resource_id         text primary key,
    teacher_id          text not null references boostbac.users(user_id) on delete cascade,
    teacher_name        text,
    type                text,
    subject             text,
    stream              text default 'all',
    title               text,
    description         text default '',
    attachment_base64   text,
    attachment_mime     text,
    has_attachment      boolean default false,
    created_at          timestamptz default now()
);
create index if not exists idx_resources_teacher on boostbac.resources(teacher_id);

create table if not exists boostbac.conversations (
    conversation_id  text primary key,
    participants     text[] not null,
    names            jsonb,
    last_message     text,
    updated_at       timestamptz default now(),
    created_at       timestamptz default now()
);
create index if not exists idx_conversations_participants on boostbac.conversations using gin(participants);

create table if not exists boostbac.messages (
    message_id       text primary key,
    conversation_id  text not null references boostbac.conversations(conversation_id) on delete cascade,
    sender_id        text,
    sender_name      text,
    text             text,
    created_at       timestamptz default now()
);
create index if not exists idx_messages_conversation on boostbac.messages(conversation_id);
