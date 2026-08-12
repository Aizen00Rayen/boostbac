-- BoostBac schema for Supabase (Postgres).
-- Run this once against your Supabase project (SQL Editor, or `psql $DATABASE_URL -f schema.sql`).

create table if not exists users (
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

create table if not exists user_sessions (
    session_token   text primary key,
    user_id         text not null references users(user_id) on delete cascade,
    created_at      timestamptz default now(),
    expires_at      timestamptz not null
);
create index if not exists idx_user_sessions_expires on user_sessions(expires_at);

create table if not exists streaks (
    user_id             text primary key references users(user_id) on delete cascade,
    current_streak      integer default 0,
    longest_streak       integer default 0,
    last_active_date    text
);

create table if not exists decks (
    deck_id     text primary key,
    user_id     text not null references users(user_id) on delete cascade,
    subject     text,
    topic       text,
    deck_name   text,
    language    text,
    created_at  timestamptz default now(),
    saved       boolean default false
);
create index if not exists idx_decks_user on decks(user_id);

create table if not exists cards (
    card_id             text primary key,
    deck_id             text references decks(deck_id) on delete cascade,
    user_id             text not null references users(user_id) on delete cascade,
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
    created_at          timestamptz default now()
);
create index if not exists idx_cards_user on cards(user_id);
create index if not exists idx_cards_deck on cards(deck_id);
create index if not exists idx_cards_due on cards(user_id, next_review_date);

create table if not exists review_logs (
    log_id       text primary key,
    card_id      text,
    user_id      text not null references users(user_id) on delete cascade,
    subject      text,
    topic        text,
    rating       text,
    quality      integer,
    correct      boolean,
    reviewed_at  timestamptz default now()
);
create index if not exists idx_review_logs_user on review_logs(user_id);
create index if not exists idx_review_logs_reviewed_at on review_logs(reviewed_at);

create table if not exists exams (
    exam_id          text primary key,
    user_id          text not null references users(user_id) on delete cascade,
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
create index if not exists idx_exams_user on exams(user_id);

create table if not exists resources (
    resource_id         text primary key,
    teacher_id          text not null references users(user_id) on delete cascade,
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
create index if not exists idx_resources_teacher on resources(teacher_id);

create table if not exists conversations (
    conversation_id  text primary key,
    participants     text[] not null,
    names            jsonb,
    last_message     text,
    updated_at       timestamptz default now(),
    created_at       timestamptz default now()
);
create index if not exists idx_conversations_participants on conversations using gin(participants);

create table if not exists messages (
    message_id       text primary key,
    conversation_id  text not null references conversations(conversation_id) on delete cascade,
    sender_id        text,
    sender_name      text,
    text             text,
    created_at       timestamptz default now()
);
create index if not exists idx_messages_conversation on messages(conversation_id);
