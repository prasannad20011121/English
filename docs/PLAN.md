# Plan: SHL English Practice Web App (MEAN stack, free AI)

## Context

Campus placement drives use SHL English tests. The voice part (SHL SVAR) and the written part
include tasks such as reading aloud, repeating sentences, fill in the blanks, spotting the error, and
speaking on a topic for 1–2 minutes. Students need a place to practise these under real exam
conditions and get instant feedback before the exam.

The repo `prasannad20011121/English` is empty (no commits yet), so this is a new project built on the
MEAN stack (MongoDB, Express, Angular, Node.js). The user asked for **free** AI/LLM services. The user
was unsure about roles, so we use the simple default: **Student + Admin**. A Trainer/batch role is an
optional later phase.

**Status:** Phases 0–1 and Phase 2a (question bank + written practice) are built. See the phase
table in section 13 and the README for how to run them. Questions come from a reviewed bank, not
live LLM generation: the LLM only helps admins write drafts that are checked before publishing
(Phase 2b). The remaining phases are built one by one.

> Note: SHL formats differ by employer, and public sources disagree on the exact sections. All test
> structure (sections, counts, timers) is therefore **data-driven (admin-configurable templates)**,
> not hard-coded. All questions are original content; no real SHL items are copied.

---

## 1. Test sections the app will simulate

| #   | Section                                                | What the student does                                                                             | Answer mode                            | Scoring                                                                            |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Read Aloud                                             | Sentence or passage shown; read it aloud                                                          | Voice                                  | Accuracy (word error rate vs text), pronunciation clarity, fluency (speed, pauses) |
| 2   | Listen & Repeat                                        | Hear a sentence once (text hidden); repeat it                                                     | Voice                                  | Accuracy vs the sentence, fluency                                                  |
| 3   | Short Answer                                           | Hear a question ("What do we use to cut paper?"); answer in 1–3 words                             | Voice                                  | Matches an accepted-answers list (fuzzy match)                                     |
| 4   | Sentence Builds                                        | Hear 3 jumbled phrases; speak them as one correct sentence                                        | Voice                                  | Word order + accuracy vs the target sentence                                       |
| 5   | Conversation                                           | Hear a short dialogue, then a question; answer by voice                                           | Voice                                  | Accepted-answers match                                                             |
| 6   | Story Retelling / Passage Reconstruction               | Hear or read a short story; retell it in your own words                                           | Voice (or typed)                       | Key ideas covered + grammar + fluency (LLM + rules)                                |
| 7   | Topic Talk (free speech)                               | Topic shown, 30 s to prepare, speak for 1–2 min                                                   | Voice                                  | Fluency, grammar, vocabulary, coherence, relevance (LLM + rules)                   |
| 8   | Fill in the Blanks                                     | Sentence with a gap (articles, prepositions, tenses, vocab)                                       | MCQ / typed / **spoken**               | Exact or accepted-answer match + explanation                                       |
| 9   | Spot the Error                                         | Sentence split into parts A/B/C/D/"No error"; pick the wrong part; optionally give the correction | MCQ + optional typed/spoken correction | Correct part + correction check                                                    |
| 10  | Sentence Completion / Synonyms / Reading comprehension | Standard written items                                                                            | MCQ                                    | Exact match                                                                        |
| 11  | Dictation (optional)                                   | Hear a sentence; type it                                                                          | Typed                                  | Word error rate                                                                    |

Every question has an `answerMode` (`voice | mcq | text`), so fill-in-the-blanks can also be answered by
speaking, as some voice tests require.

## 2. Features

**Student**

- Sign up / log in, with a profile (college, target exam date).
- **Mic check** page: permission prompt, live level meter, a 5-second test recording with playback.
- **Practice mode** (per section): untimed or timed, instant feedback after each item, retry, model
  answer played with TTS, explanation for grammar items, filters for difficulty and grammar tag.
- **Mock test mode** (SHL-like): full timed test from a template; each audio plays **once**; recording
  starts automatically after a beep; no going back; fixed prep and answer windows; fullscreen; warning
  on tab switch; results shown at the end.
- **Result report**: overall score (0–100) plus a rough CEFR band (A1–C2) and a breakdown by skill
  (Pronunciation, Fluency, Grammar, Vocabulary, Listening). Per item: recording playback, transcript
  with word colours (green = correct, red = unclear, grey = missed, orange = extra), WPM, pause count,
  filler words ("um", "uh", "like"), grammar corrections, improved version of the answer. Downloadable
  as PDF.
- **Dashboard**: score trend charts, weakest sections and grammar tags, practice streak, "practise
  next" suggestions, attempt history.

**Admin**

- Question bank CRUD with filters, preview, and `draft/published` status.
- Bulk import (CSV/JSON) and export.
- **AI question generator** (free LLM): makes draft fill-in-blank, spot-the-error and topic items that
  an admin must review before publishing.
- Generate prompt audio (TTS) for listening items.
- Mock test template builder (sections, item counts, timers, instructions).
- Student list and usage/score analytics.

**Optional later:** Trainer role with batches, assigned tests and batch reports; leaderboard; PWA
offline practice for text items.

## 3. Tech stack (all free / open source)

| Layer                          | Choice                                                                                                                                                                                                                                                                                               | Why                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Frontend                       | **Angular** (latest, standalone components + signals), Angular Material, ngx-echarts (or ng2-charts)                                                                                                                                                                                                 | MEAN "A"; Material gives ready-made accessible UI                                              |
| Audio in browser               | MediaRecorder API (webm/opus; mp4/aac on Safari), Web Audio `AnalyserNode` (level meter, silence detection), `speechSynthesis` (TTS fallback)                                                                                                                                                        | Built-in and free                                                                              |
| Backend                        | **Node.js LTS + Express 5 + TypeScript**, Mongoose, Zod (validation), Multer (uploads), `fluent-ffmpeg` + ffmpeg (convert to 16 kHz mono WAV)                                                                                                                                                        | MEAN "E/N"                                                                                     |
| Database                       | **MongoDB** (Atlas M0 free tier in prod, Docker locally); **GridFS** for audio files                                                                                                                                                                                                                 | MEAN "M"; GridFS avoids a separate storage service                                             |
| Background jobs                | **Agenda** (MongoDB-backed job queue) + **Socket.IO** to push "evaluation ready"                                                                                                                                                                                                                     | No Redis needed; stack stays pure MEAN                                                         |
| Speech-to-text                 | **Whisper** through one OpenAI-compatible adapter (`STT_BASE_URL`, `STT_MODEL`): (a) **Groq free tier** Whisper API to start (no GPU needed), or (b) **self-hosted faster-whisper** Docker container (unlimited, private). Browser **Web Speech API** only for optional live captions in Chrome/Edge | Free; gives word timestamps + per-word confidence (used for pronunciation clarity)             |
| Grammar check                  | **LanguageTool** (self-hosted Docker, open source)                                                                                                                                                                                                                                                   | Free, deterministic grammar/spelling errors on transcripts; works when the LLM is rate-limited |
| LLM feedback                   | One OpenAI-compatible adapter (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`) using the `openai` npm SDK. Options: **Groq free tier** (Llama models), **Google Gemini free tier** (OpenAI-compatible endpoint), or **Ollama** locally (Llama / Qwen / Gemma, fully free and private)                    | Switch provider by changing env vars only                                                      |
| TTS for prompt audio           | **Piper TTS** (open source) to pre-generate audio into GridFS from a seed/admin script; browser `speechSynthesis` as fallback                                                                                                                                                                        | Free, consistent voices (US/UK/Indian English)                                                 |
| Optional pronunciation upgrade | Azure Speech free tier (F0, ~5 audio hrs/month) Pronunciation Assessment as an extra adapter                                                                                                                                                                                                         | Phoneme-level scores if ever needed                                                            |
| Auth                           | JWT access token + refresh token in an httpOnly cookie, bcrypt                                                                                                                                                                                                                                       | Standard                                                                                       |
| Testing                        | Jest/Vitest + Supertest + mongodb-memory-server (API); Angular's default test runner; Playwright (E2E, fake microphone)                                                                                                                                                                              | Free                                                                                           |

Groq can provide both Whisper and the LLM under **one free API key**. That is the easiest start;
self-host (faster-whisper + Ollama + LanguageTool on a college/home machine) for unlimited free
use. Free tiers have rate limits that can change, so check them during Phase 3 and keep the
rule-based fallback.

## 4. Architecture

```
Angular SPA ──HTTPS/REST──► Express API ──► MongoDB (users, questions, sessions, responses, GridFS audio)
     ▲                         │
     │ Socket.IO               ├─► Agenda job "evaluate-response"
     └── "evaluation:done" ◄───┤      ├─ ffmpeg → 16 kHz WAV
                               │      ├─ STT adapter (Whisper: Groq / faster-whisper)
                               │      ├─ Scoring engine (WER, fluency, answer match)
                               │      ├─ LanguageTool (grammar)
                               │      └─ LLM adapter (Groq / Gemini / Ollama) → JSON rubric
                               └─► TTS script (Piper) → GridFS prompt audio
```

## 5. Voice answer pipeline

1. **Client state machine** for each voice item: `PROMPT (show text / play audio once) → PREP countdown
→ BEEP → RECORDING (countdown, live level meter, auto-stop after the time limit or ~3 s of silence
for short items) → UPLOADING → FEEDBACK (practice) | NEXT (mock)`.
2. `RecorderService` returns `{ blob, mimeType, durationMs, latencyMs }`, where latency is the time
   from the beep to the first speech, found with the AnalyserNode.
3. `POST /api/sessions/:id/responses` (multipart, max 5 MB, audio/* whitelist). The server saves the
   file to GridFS, creates a `Response {status: 'pending'}`, queues an Agenda job, and returns `202`
   with the responseId.
4. The job converts the audio with ffmpeg → STT (`verbose_json` with word timestamps) → the evaluator
   for that question type → saves scores and feedback → emits `evaluation:done` on Socket.IO (the
   client also polls `GET /api/responses/:id` as a fallback).
5. Failures: up to 3 retries with backoff; if the LLM fails, keep the rule-based scores and mark
   `feedbackPartial: true`.

## 6. Scoring rules (`server/src/services/evaluation/`)

- **Text normalisation** (`normalize.ts`): lowercase, strip punctuation, expand contractions,
  numbers → words.
- **Accuracy** (`wer.ts`): word-level Levenshtein alignment → WER; `accuracy = max(0, 1 − WER) × 100`.
  The alignment also gives the word colours shown in the report.
- **Pronunciation clarity**: mean Whisper word probability, weighted, for words aligned to the
  reference (proxy score); words below a threshold are marked "unclear".
- **Fluency** (`fluency.ts`): WPM (target 110–160), pauses > 0.5 s and > 1.5 s from word timestamps,
  filler-word count, speaking-time ratio, response latency → 0–100.
- **Short answer / conversation**: normalised fuzzy match (Levenshtein ≤ 1–2 and lemma match) against
  `acceptedAnswers[]`.
- **Sentence builds**: accuracy vs the target sentence, with a penalty for wrong phrase order.
- **Story retelling**: share of `keyPoints[]` covered (LLM check, with keyword-overlap fallback) +
  grammar + fluency.
- **Topic talk**: fluency (rules) 30% + LLM rubric 70% (grammar, vocabulary range, coherence,
  relevance, each 0–5), plus the LanguageTool error list. Penalty if speech is shorter than 45 s or
  off-topic.
- **LLM call** (`llm-grader.ts`): fixed system prompt + rubric, temperature 0, output forced to JSON and
  validated with Zod: `{ scores{}, strengths[], errors[{original, correction, explanation}],
improvedAnswer, tips[] }`. The transcript is sent as data, never as instructions.
- **MCQ / fill-blank / spot-error**: exact match; the optional correction is checked with WER vs
  `correctedSentence`.
- **Overall score**: weighted per skill → 0–100 → rough CEFR band. The report says clearly that this is
  a practice estimate, not an official SHL score.

## 7. Data model (Mongoose, `server/src/models/`)

- **User**: name, email (unique), passwordHash, role (`student|admin`), college, targetExamDate,
  consentAudioAt, settings (TTS accent), timestamps.
- **Question**: type (enum of the 11 types), answerMode, difficulty (1–3), tags[] (e.g. `articles`,
  `tenses`, `subject-verb-agreement`, `prepositions`), promptText, promptAudioFileId, ttsText,
  options[], correctAnswer, acceptedAnswers[], segments[] + errorIndex + correctedSentence (spot the
  error), phrases[] (sentence builds), keyPoints[] (retelling), prepTimeSec, answerTimeSec,
  explanation, sampleAnswer, status (`draft|published`), source (`manual|ai|import`), stats
  {attempts, avgScore}. Indexes: `{type, status, difficulty}`, `tags`.
- **TestTemplate**: name, description, sections[{type, count, difficultyMix, prepTimeSec,
  answerTimeSec, instructions}], totalTimeMin, randomize, active.
- **TestSession**: userId, mode (`practice|mock`), templateId, status
  (`in_progress|submitted|evaluated|abandoned`), items[{questionId, responseId}], currentIndex,
  startedAt, submittedAt, summary {overall, pronunciation, fluency, grammar, vocabulary, listening,
  band}, flags {tabSwitches}.
- **Response**: sessionId, userId, questionId, answer {option | text | audioFileId}, durationMs,
  latencyMs, transcript, words[{w, start, end, prob}], evaluation {status, scores{}, feedback{},
  provider, model, error}, timestamps. Index `{userId, createdAt}`.
- **UserStats** (updated after each evaluation): totals, streak, lastPracticeAt, rolling average per
  skill, per tag and per section.
- Audio recordings in GridFS have a **TTL/cleanup job** (default: delete after 60 days).

Answer fields (`correctAnswer`, `acceptedAnswers`, `errorIndex`, …) are **never sent** to the client
before the answer is submitted; DTO mappers strip them.

## 8. REST API (`/api`)

- **Auth** (built): `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`,
  `GET /auth/me`, `POST /auth/forgot-password`, `/auth/reset-password`, `/auth/change-password`.
  **Users** (built): `GET|PATCH /users/me`. **Admin** (built): `GET /admin/users`.
- **Practice**: `GET /practice/sections` (counts and progress per type); `POST /practice/sessions`
  `{type, count, difficulty?, tags?}`.
- **Mock**: `GET /tests/templates`, `POST /tests/:templateId/start`.
- **Session runtime**: `GET /sessions/:id/current`, `POST /sessions/:id/responses` (multipart or JSON),
  `POST /sessions/:id/submit`, `GET /sessions/:id/report`, `GET /sessions/:id/report.pdf`.
- **Responses and audio**: `GET /responses/:id`, `GET /audio/:fileId` (streamed, checks owner/admin),
  `GET /questions/:id/audio`.
- **Me**: `GET /me/stats`, `GET /me/history?type=&page=`, `GET /me/recommendations`,
  `DELETE /me/recordings`.
- **Admin**: CRUD `/admin/questions`, `POST /admin/questions/import`, `GET /admin/questions/export`,
  `POST /admin/questions/generate`, `POST /admin/questions/:id/tts`, CRUD `/admin/templates`,
  `GET /admin/students`, `GET /admin/analytics`.

## 9. Angular frontend (`client/src/app/`)

```
core/      auth.service, token interceptor, error interceptor, auth & role guards, api/*.service, socket.service
shared/    countdown-timer, mic-level-meter, audio-player, recorder-button, score-gauge,
           transcript-diff, feedback-card, skill-radar-chart
features/
  auth/        login, register, forgot-password
  dashboard/   overview, trends chart, weak-areas, streak, recommendations
  mic-check/
  practice/    practice-home + one player component per type
               (read-aloud, listen-repeat, short-answer, sentence-build, conversation,
                story-retell, topic-talk, fill-blank, spot-error, mcq)
  mock-test/   template-list, instructions, test-runner (section stepper), result-report
  history/     attempt-list, attempt-detail
  admin/       question-list, question-editor, import, ai-generate, template-builder, students, analytics
```

Key client services: `RecorderService`, `AudioLevelService`, `TtsService`, `LiveCaptionService`
(Web Speech API, optional), and `TestRunnerStore` (signals-based state machine shared by practice and
mock players). Layout is responsive and mobile-first, because many students practise on phones.

## 10. Repository layout

```
English/
  client/                Angular app
  server/
    src/ config/ models/ routes/ controllers/ middleware/ (auth, role, upload, validate, error)
         services/ speech/ (stt.adapter.ts, groq|whisper-local providers)
                   llm/ (llm.adapter.ts, prompts/)
                   grammar/ (languagetool.client.ts)
                   evaluation/ (normalize, wer, fluency, answer-match, evaluators/<type>.ts, overall.ts)
                   storage/ (gridfs.ts)  tts/ (piper.ts)
         jobs/ (agenda.ts, evaluate-response.job.ts, cleanup-audio.job.ts)
         sockets/  utils/  app.ts  server.ts
    seed/ (questions/*.json, templates/*.json, seed.ts)
    tests/
  docs/PLAN.md
  docker-compose.yml     mongo, server, client, languagetool, (optional) faster-whisper, ollama
  .env.example  .github/workflows/ci.yml  README.md
```

## 11. Content (question bank)

Seed with original items (target for v1): 40 read-aloud, 40 repeat, 30 short-answer, 30 sentence
builds, 15 conversations, 15 stories, 50 topic-talk topics (personal / opinion / situation /
describe), 150 fill-in-blanks, 150 spot-the-error, 50 mixed MCQ. Three difficulty levels, each tagged
by grammar topic. Build it with the admin AI generator, then human review, then publish. Prompt audio
is generated with Piper in 2–3 accents. Two or three ready-made mock templates (for example "SVAR-style
Spoken 15 min", "Written English 20 min", "Full Mock").

## 12. Security & privacy

- Consent to voice recording at signup; recordings deleted automatically after 60 days; "delete my
  recordings" button; audio is served only to its owner or an admin.
- Helmet, CORS allowlist, rate limits (login, uploads, LLM calls), a daily AI-evaluation quota per
  user to stay inside free tiers, Zod validation, file type/size checks, and API keys only on the
  server (`.env`, never in Angular).
- Answers are hidden from the client until submission; scoring happens only on the server.

## 13. Phases (build order)

| Phase                   | Scope                                                                                                                                                  | Done when                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| ✅ 0. Setup             | Monorepo, Angular + Express TS scaffolds, ESLint/Prettier, docker-compose (Mongo, LanguageTool), `.env.example`, GitHub Actions CI (lint, test, build) | `docker compose up` runs both apps; CI green                       |
| ✅ 1. Auth              | User model, JWT + rotating refresh token, guards, login/register/forgot/reset UI, profile, admin user list                                             | Register → login → protected dashboard                             |
| 2. Text modules         | Question model, seed data, practice for fill-blank, spot-error and MCQ with instant feedback and explanations                                          | Student completes a 10-item practice and sees score + explanations |
| 3. Audio infrastructure | Mic check, RecorderService, upload + GridFS, ffmpeg, STT adapter (Groq / faster-whisper), Agenda job, Socket.IO, polling fallback                      | Recorded clip → transcript appears in the UI                       |
| 4. Voice modules        | Read aloud, listen & repeat, short answer, sentence builds, conversation; WER/fluency/answer-match scoring; transcript-diff UI; Piper TTS prompt audio | Each voice type gives a score and coloured feedback                |
| 5. Free speech          | Topic talk + story retelling; LanguageTool + LLM rubric adapter; improved-answer and tips UI                                                           | A 1–2 min talk returns a rubric score and corrections              |
| 6. Mock test engine     | Templates, strict timed runner (play once, auto-record, no back, fullscreen, tab-switch flag), submit, report + PDF                                    | A full mock runs end-to-end and produces a skill-wise report       |
| 7. Dashboard            | UserStats updates, trend/radar charts, weak areas, recommendations, streaks, history                                                                   | Dashboard reflects new attempts                                    |
| 8. Admin                | Question CRUD, import/export, AI generator with review, TTS button, template builder, analytics                                                        | Admin can create and publish items and templates                   |
| 9. Hardening & deploy   | Tests, security pass, quotas, audio cleanup job, deploy                                                                                                | Live URL works on Chrome, Edge, Firefox, Safari and Android Chrome |
| 10. Optional            | Trainer role + batches, leaderboard, PWA                                                                                                               | —                                                                  |

## 14. Free deployment

Angular → Netlify / Vercel / Cloudflare Pages. Express API → Render or Railway free tier (or the same
VM). MongoDB → Atlas M0. Free hosts cannot run Whisper or LanguageTool well, so in production use the
Groq free tier for STT + LLM and the public LanguageTool API (limited), or run everything with
docker-compose on one small VM or college server for unlimited use.

## 15. Risks and mitigations

- **Free-tier limits or changes** → one adapter behind env vars, a per-user daily quota, rule-based
  fallback scores, and self-hosting as plan B.
- **Whisper "auto-corrects" accents, which hides pronunciation errors** → use word probabilities +
  WER vs the reference text; optional Azure F0 adapter later.
- **Browser differences** (Safari records mp4, Firefox has no Web Speech API) → server-side STT is the
  primary path; ffmpeg normalises every format.
- **SHL format uncertainty** → templates are configurable, and section types are added as data.

## Verification

- **Unit**: `normalize`, `wer` (known WER cases), `fluency` (synthetic word timings), `answer-match`,
  and each evaluator with mocked STT/LLM; Zod-validated LLM JSON parsing, including malformed output.
- **API**: Supertest + mongodb-memory-server for auth, the practice flow, an upload → job → evaluated
  response (STT/LLM mocked), and checks that answer fields are hidden and audio access is restricted.
- **E2E**: Playwright on Chromium with `--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=tests/fixtures/read-aloud.wav`
  to record a known sentence and assert that the transcript, score and report render. A full mock-test
  run is included.
- **Manual**: `docker compose up`, register, mic check, one item of every type, one full mock, PDF
  report, admin import + AI generate + publish, and test on a phone.
- **For this step**: confirm `docs/PLAN.md` and `README.md` are committed and pushed to
  `ccr-ff5ad429-7xi33l`.
