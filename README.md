# SHL English Practice

A web app that helps students practise for SHL-style spoken English tests (SVAR-style). Like the real
test, it is **voice based**:

- every question is heard as audio;
- every answer is spoken, recorded and scored for speaking and listening skills.

It is built on the MEAN stack (MongoDB, Express, Angular, Node.js) and uses free / open-source tools
for speech-to-text, grammar checking and question writing.

> This is an independent practice tool. It is not affiliated with SHL, and its scores are practice
> estimates, not official SHL results.

## Status

| Phase | What                                                             | State   |
| ----- | ---------------------------------------------------------------- | ------- |
| 0     | Project setup: monorepo, Express + Angular, Docker, CI           | ✅ Done |
| 1     | Accounts: sign up, log in, stay logged in, profile, reset, admin | ✅ Done |
| 2     | Question bank + AI-assisted question writing with admin review   | ✅ Done |
| 3–5   | Voice practice: audio questions, recorded answers, scoring       | ✅ Done |
| 6     | SHL-style voice test with a skill-by-skill report                | ✅ Done |
| 7–9   | Progress charts, more admin tools, deployment                    | Planned |

The full roadmap is in [docs/PLAN.md](docs/PLAN.md).

## What works today

- **Sign up** with name, email, college, SHL exam date and consent to voice recording.
- **Log in / log out.** Sessions survive page reloads, and expired access tokens are refreshed
  automatically.
- **Forgot password:** a single-use link valid for 30 minutes. Without SMTP set up, the link is
  printed in the server log.
- **Profile:** edit your details, exam date and listening accent, and change your password (this
  logs out your other devices).
- **Microphone check:** allow the mic, see a live level meter, record a 5-second test and play it
  back, and hear a sample question voice.
- **Voice practice** (rounds of 5 or 10, any difficulty), with 9 tasks:

  | Task              | Student hears                            | Student says                |
  | ----------------- | ---------------------------------------- | --------------------------- |
  | Read aloud        | (sentence shown on screen)               | The sentence                |
  | Listen & repeat   | A sentence, once                         | The same sentence           |
  | Listen & complete | A sentence with a soft tone for one word | The missing word            |
  | Listen & correct  | A sentence with one grammar mistake      | The corrected sentence      |
  | Short answers     | A question                               | 1–3 words                   |
  | Sentence builds   | Three jumbled phrases                    | One correct sentence        |
  | Conversations     | A two-voice dialogue, then a question    | A short answer              |
  | Story retelling   | A short story                            | The story in your own words |
  | Topic talk        | A topic with hints (30 s to prepare)     | 1–2 minutes on the topic    |
  - **Questions are spoken** with the browser's built-in voices in the student's accent (Indian,
    American or British, set in Profile). A beep marks when to speak.
  - **Answers are recorded** in the browser and stored, then turned into text by Whisper on the
    server, or by the browser's own speech recognition when Whisper is not set up.
  - **Recording stops automatically** after a short silence on short tasks, or at the time limit.
  - **Instant feedback**:
    - a score out of 100, and your words coloured right / nearly / different / missed / extra;
    - pace (words per minute), long pauses, filler words, time to start and clarity;
    - the model answer, key points covered and tips;
    - "Hear yourself" and "Hear a model answer" buttons.
  - In practice you can hear a question once more; silent answers get a "Record again" offer.

- **Results page:** overall score, an estimated level (CEFR-like band, clearly a practice estimate),
  skill bars (pronunciation, fluency, grammar & accuracy, listening, vocabulary) and every answer
  with its recording.
- **Voice test:** 30 questions in 9 parts, about 18 minutes, like the SHL voice test:
  - each question plays once and recording starts after the beep;
  - there is no going back and no feedback until the end;
  - answers upload in the background;
  - the report adds a score for each part, and past tests are listed.
- **Review my mistakes** rounds; "Report a problem" on any question.
- **Dashboard:** exam countdown, a practice streak and daily goal (counted in voice answers), the
  best test score, and tips for the voice test.
- **Admin › Question bank:**
  - Review AI drafts and flagged questions, and preview every type.
  - **Listen** to a question as students hear it.
  - Edit with the same rules as the seed bank. Spoken types (dialogues, stories, topics) are edited
    as checked JSON.
  - Publish or retire one at a time or in bulk.
- **AI question writer** (optional, works with free LLMs): admins pick a type, topic, difficulty and
  count. It writes written items and the spoken types read aloud, repeat, short answer, sentence
  build and topic talk. Every draft must pass these checks before it reaches the review queue:
  1. format;
  2. duplicates;
  3. a second, blind AI pass must reach the same answer (for types with an answer key);
  4. optionally, a LanguageTool grammar check.

  Nothing reaches students until an admin publishes it.

- **Admin › Users:** a searchable, paginated list of users.
- A custom **"soft bento pastel"** design: pastel tiles, the Outfit font, Lucide icons, gentle
  animations, and confetti when you sign up.
- Desktop sidebar and phone bottom tab bar; light, dark or follow-the-system theme (remembered).
- Accessibility: every page checked with axe-core in both themes (no violations); full keyboard
  support; motion turned off for users who prefer reduced motion.

## Tech stack

| Part     | Technology                                                                          |
| -------- | ----------------------------------------------------------------------------------- |
| Frontend | Angular 22 (standalone components, signals, zoneless) + Angular CDK                 |
| UI       | Own design system (`client/src/styles`, `client/src/app/ui`), Lucide icons, Outfit  |
| Backend  | Node.js 22, Express 5, TypeScript, Mongoose 9, Zod, Multer, GridFS (recordings)     |
| Voice    | Browser speechSynthesis + MediaRecorder; Whisper (OpenAI-compatible) or browser STT |
| Database | MongoDB 8                                                                           |
| Auth     | JWT access token (in memory) + rotating httpOnly refresh-token cookie, bcrypt       |
| Tests    | Vitest + Supertest + mongodb-memory-server (API), Vitest via `ng test` (Angular)    |
| Tooling  | npm workspaces, ESLint, Prettier, Docker, GitHub Actions                            |

## Project layout

```
client/   Angular app (src/app/core = auth/services, ui = design-system components,
          layout = shell, features = pages; src/styles = design tokens and global styles)
server/   Express API (src/modules/<feature>, models, middleware, config) + tests/
docs/     Plan and design notes
```

## Getting started

**You need:** Node.js 22.12 or newer, and MongoDB (Docker is the easiest way to get it).

```bash
npm install                                   # installs server + client (npm workspaces)
docker compose up -d mongo                    # or use your own MongoDB / Atlas
cp server/.env.example server/.env            # then edit values if needed
npm run seed:questions                        # loads the question bank (safe to run again)
npm run seed:admin                            # optional: creates the admin from ADMIN_* in server/.env
npm run dev                                   # API on :3000, Angular on http://localhost:4200
```

The Angular dev server proxies `/api` to the API, so cookies work without any CORS setup.

### Scripts (run from the repo root)

| Command                                                                             | What it does                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                                                                       | Runs API (auto-restart) and Angular dev server         |
| `npm test`                                                                          | Runs server and client unit tests                      |
| `npm run lint`                                                                      | ESLint + type checks for both apps                     |
| `npm run build`                                                                     | Production builds into `server/dist` and `client/dist` |
| `npm run format`                                                                    | Formats everything with Prettier                       |
| `npm run seed:questions`                                                            | Loads `server/seed/questions/*.json` into the database |
| `npm run seed:admin`                                                                | Creates or updates the admin account                   |
| `npm run generate:questions -w server -- --type spot_error --tag tenses --count 10` | Writes AI drafts from the command line                 |

Server tests start an in-memory MongoDB automatically. The first run downloads a MongoDB binary; to
use one you already have, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod`.

## Run everything in Docker

```bash
cp .env.example .env      # set JWT_ACCESS_SECRET to a long random string
docker compose up --build
```

Then open http://localhost:3000. In this mode Express serves the built Angular app and the API from
one container (`SERVE_CLIENT=true`). Load the question bank once with:

```bash
docker compose exec app node dist/scripts/seed-questions.js
```

## Configuration

All server settings are environment variables, checked at startup. They are documented in
[server/.env.example](server/.env.example). The important ones:

| Variable                   | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `MONGO_URI`                | MongoDB connection string                                                         |
| `JWT_ACCESS_SECRET`        | Signs access tokens; at least 32 random characters                                |
| `ACCESS_TOKEN_TTL`         | Access token lifetime (default `15m`)                                             |
| `REFRESH_TOKEN_TTL_DAYS`   | How long a login lasts without activity (default `7`)                             |
| `COOKIE_SECURE`            | `true` when served over HTTPS                                                     |
| `COOKIE_SAMESITE`          | `lax` (default); `none` if the client and API are on different sites              |
| `APP_URL`                  | Public app URL, used in password-reset emails                                     |
| `SMTP_URL`                 | Optional SMTP server for emails, e.g. a free Brevo or Gmail account               |
| `TRUST_PROXY`              | `true` behind a reverse proxy (Render, Railway, nginx)                            |
| `LLM_BASE_URL`             | Optional AI writer: any OpenAI-compatible API (see below)                         |
| `LLM_MODEL`                | Model id for the AI writer                                                        |
| `LLM_API_KEY`              | API key for the AI writer (not needed for a local Ollama)                         |
| `LANGUAGETOOL_URL`         | Optional grammar check for AI drafts and topic talk, e.g. `http://localhost:8010` |
| `STT_BASE_URL`             | Optional Whisper speech-to-text: any OpenAI-compatible API                        |
| `STT_MODEL`                | Whisper model id, e.g. `whisper-large-v3-turbo` on Groq                           |
| `STT_API_KEY`              | API key for speech-to-text (not needed for a local server)                        |
| `RECORDING_RETENTION_DAYS` | Recordings are deleted after this many days (default `60`)                        |

## API (so far)

| Method      | Path                                 | Notes                                                                      |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------- |
| GET         | `/api/health`                        | API + database status                                                      |
| POST        | `/api/auth/register`                 | Returns `{ user, accessToken }` + sets cookie                              |
| POST        | `/api/auth/login`                    | Same response as register                                                  |
| POST        | `/api/auth/refresh`                  | Uses the refresh cookie; rotates it                                        |
| POST        | `/api/auth/logout`                   | Revokes the refresh token                                                  |
| GET         | `/api/auth/me`                       | Current user (Bearer token)                                                |
| POST        | `/api/auth/forgot-password`          | Always 200, so emails can't be discovered                                  |
| POST        | `/api/auth/reset-password`           | Single-use token from the email                                            |
| POST        | `/api/auth/change-password`          | Ends other sessions                                                        |
| GET / PATCH | `/api/users/me`                      | Read / update profile                                                      |
| GET         | `/api/admin/users`                   | Admin only; `?q=&role=&page=&limit=`                                       |
| GET         | `/api/practice/voice/catalog`        | Per task: questions, done, best and average score                          |
| GET         | `/api/practice/voice/config`         | `{ stt: "whisper" \| "browser" }`                                          |
| POST        | `/api/practice/sessions`             | `{ task, count, difficulty? }`, `{ mode: "review" }` or `{ mode: "test" }` |
| GET         | `/api/practice/sessions/:id`         | Resume: prompts to play (never the answers) and results so far             |
| POST        | `/api/practice/sessions/:id/answers` | Multipart: `audio` + `questionId`, `durationMs` (+ browser transcript)     |
| POST        | `/api/practice/sessions/:id/finish`  | Score, band, skills, parts (tests) and every answer                        |
| GET         | `/api/practice/tests`                | Your voice tests with scores                                               |
| GET         | `/api/recordings/:id`                | A stored answer (owner or admin only; supports Range)                      |
| GET         | `/api/users/me/stats?tz=`            | Streak, daily goal, totals (in your time zone)                             |
| POST        | `/api/questions/:id/report`          | Flag a question for review                                                 |
| GET         | `/api/admin/questions`               | Admin: list by status/type/topic + counts                                  |
| GET         | `/api/admin/questions/ai-status`     | Admin: is the AI writer configured?                                        |
| POST        | `/api/admin/questions/generate`      | Admin: AI drafts `{ type, tag, difficulty, count }`                        |
| PUT         | `/api/admin/questions/:id`           | Admin: replace content (validated)                                         |
| POST        | `/api/admin/questions/:id/status`    | Admin: publish / retire / back to draft                                    |
| POST        | `/api/admin/questions/bulk-status`   | Admin: same for many questions                                             |

Errors always look like `{ "error": { "code", "message", "details"? } }`; validation errors include
`details.fields` with a message per field.

## Why a question bank and not live AI questions?

Students only ever see questions from the reviewed bank. Live LLM questions would be:

- **Less reliable:** free models sometimes give a wrong answer key or an ambiguous question.
- **Slower:** a few seconds per question.
- **Quota-hungry:** every student request would use the free tier's limits.
- **Unfair for mock tests:** difficulty would vary from student to student.

The AI is used where it is strongest, as a fast writer of drafts that are checked and approved
before publishing.

### Turning on the AI writer (free)

Set three values in `server/.env` and restart the API:

| Provider                  | `LLM_BASE_URL`                                            | `LLM_API_KEY`             |
| ------------------------- | --------------------------------------------------------- | ------------------------- |
| Groq (free tier)          | `https://api.groq.com/openai/v1`                          | key from the Groq console |
| Google Gemini (free tier) | `https://generativelanguage.googleapis.com/v1beta/openai` | key from Google AI Studio |
| Ollama (your machine)     | `http://localhost:11434/v1`                               | not needed                |

Set `LLM_MODEL` to a model your provider offers (for Ollama, e.g. `llama3.1`). Larger models write
better questions and fail fewer checks. For an extra grammar check, run
`docker compose --profile ai up -d languagetool` and set `LANGUAGETOOL_URL=http://localhost:8010`.

### Turning on Whisper speech-to-text (free)

Without it, answers are transcribed by the browser's own speech recognition (Chrome and Edge only).
Whisper is more accurate, works in every browser, and adds word timings and a clarity score.

| Provider            | `STT_BASE_URL`                   | `STT_MODEL`              | `STT_API_KEY`             |
| ------------------- | -------------------------------- | ------------------------ | ------------------------- |
| Groq (free tier)    | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` | key from the Groq console |
| Self-hosted Whisper | e.g. `http://localhost:8000/v1`  | the server's model name  | not needed                |

Any server with an OpenAI-compatible `/audio/transcriptions` endpoint works, for example
faster-whisper-server or LocalAI.

## How answers are scored

Scores are practice estimates, worked out on the server from the transcript and timing:

- **Accuracy:** a word-by-word comparison with the expected sentence. Numbers, contractions and
  British/American spellings are matched, and near misses count half.
- **Fluency:** speaking rate (110–160 words per minute is best), long pauses (over 1.5 s), filler
  words and how quickly you start.
- **Clarity (Whisper only):** how confidently the speech was recognised.
- **Listening tasks:** whether an accepted answer, the missing word or the correction was said.
- **Open answers:** key points covered (story) or length, vocabulary range and grammar (topic).

## Question bank

Questions live in `server/seed/questions/*.json`: 325 original items. That is 194 spoken items (read
aloud, repeat, short answers, sentence builds, conversations, stories and topics) plus the
fill-in-the-blank and spot-the-error items, which are reused as "Listen & complete" and "Listen &
correct". Each item is checked by the same Zod rules the API uses
(`server/src/modules/questions/question.schemas.ts`), for example:

- exactly one `___` blank;
- spot-the-error corrections may only change the marked part;
- sentence-build phrases must use exactly the words of the sentence, in a jumbled order;
- stories need at least 35 words and 3–6 key points.

The server tests fail if any seed item breaks a rule.

## Security notes

- Passwords are hashed with bcrypt, and login returns the same error for a wrong password and an
  unknown email.
- The access token lives only in memory. The refresh token is an httpOnly cookie, stored as a
  SHA-256 hash and rotated on every use. If an old token is reused, every session of that user is
  revoked.
- Rate limits on login, register and password reset; Helmet security headers; CORS allowlist; Zod
  validation on every input.
- Answer keys (accepted answers, corrections, missing words) are never sent to the browser before
  a question is answered. Answers are checked on the server, and each answer counts only once.
  (The text of a listening question does reach the browser, because the browser speaks it, but it
  is not shown on screen.)
- Recordings need consent at sign-up. Only their owner or an admin can play them, uploads are limited
  to 10 MB of audio, and they are deleted automatically after 60 days.
