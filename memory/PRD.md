# BoostBac — Product Requirements Document

## Original Problem Statement
Native mobile app "BoostBac": AI-powered, Duolingo-style active-recall & exam-prep platform for Algerian Baccalauréat students. Students photograph/upload notes → Gemini AI extracts concepts and auto-generates Q/A flashcards → SM-2 spaced repetition schedules reviews → gamified daily loop (streaks, XP, daily goal) → weakness heatmap + forgetting-curve analytics → AI mock exams. FR + Arabic UI (Arabic default). Brand: deep navy #0A1420, cyan-teal accent #2DD4E8, paper-airplane mascot.

## Tech / Architecture
- Frontend: Expo React Native (expo-router), reanimated flip cards, react-native-svg charts, react-native-keyboard-controller, expo-camera + expo-image-picker.
- Backend: FastAPI + MongoDB (motor). Bearer session_token auth.
- AI: Gemini 3 Flash (gemini-3-flash-preview) via emergentintegrations + EMERGENT_LLM_KEY, server-side only (OCR + concept extraction + flashcard generation).
- i18n: custom string layer (ar/fr), Arabic default, RTL-aware text alignment.

## User Personas
- Bac student (Math/Science/Tech/Management/Letters/Languages stream) revising under exam pressure, mostly on mobile / variable bandwidth.

## Core Requirements (static)
1. Document scan & AI flashcard generation (camera + gallery).
2. SM-2 spaced repetition engine.
3. Duolingo-style gamification (streak, XP, daily goal ring).
4. Weakness heatmap + forgetting-curve analytics + focus-today.
5. AI mock exams (timed, weighted to weak subjects).
6. FR/Arabic localization (Arabic default).
7. Auth (email/password JWT + Emergent Google) + profile.

## Implemented (2026-06)
- Auth: register/login (email/password), Emergent Google login flow, /auth/me, logout, profile update. [DONE]
- AI: /decks/generate (Gemini vision → structured cards preserving source language), review/edit screen, /decks/save. [DONE]
- SM-2 engine: /review/queue (oldest-due first), /review/submit (ease/interval/reps/next_review), /review/complete. [DONE]
- Gamification: streaks collection, XP per rating + session bonus, daily goal progress ring on Home. [DONE]
- Analytics: /analytics heatmap + 14-day forgetting curve + focus subjects. [DONE]
- Mock exams: /exams/generate (weighted), /exams/submit (score + breakdown), /exams/history. [DONE]
- UI: Welcome, Signup, Login, Home (Duolingo path), Daily Review (3D flip + rating + flying-plane summary), Dashboard, Exams, Profile, Scan. [DONE]
- Tested: 17/17 backend pytest + frontend E2E passed.

## Backlog (prioritized)
- P1: Local push/notification reminders (cards due / streak-at-risk) — requires deployed build.
- P1: Offline cache of today's due cards (works without connectivity, sync on reconnect).
- P2: PDF upload support (expo-document-picker) + multi-page scan.
- P2: Milestone badges (7-day streak, 100 cards mastered) surfaced on Profile.
- P2: Algerian Derja casual tone copy layer.
- P3: Full I18nManager.forceRTL for native layout mirroring.

## Next Tasks
- Wire notification reminders once user deploys/builds.
- Add offline queue caching via storage util.
