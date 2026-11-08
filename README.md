# SHL English Practice

A web app that helps students practise for SHL-style English assessments: the spoken SVAR-style
tasks and the written English section. It is built on the MEAN stack (MongoDB, Express, Angular,
Node.js) and will use free / open-source AI for speech-to-text, grammar checking and feedback.

> This is an independent practice tool. It is not affiliated with SHL, and its scores are practice
> estimates, not official SHL results.

## Status

| Phase | What                                                             | State   |
| ----- | ---------------------------------------------------------------- | ------- |
| 0     | Project setup: monorepo, Express + Angular, Docker, CI           | ✅ Done |
| 1     | Accounts: sign up, log in, stay logged in, profile, reset, admin | ✅ Done |
| 2–9   | Practice modules, voice scoring, mock tests, dashboard, admin    | Planned |

The full roadmap is in [docs/PLAN.md](docs/PLAN.md).

## What works today

- **Sign up** with name, email, college, SHL exam date and consent to voice recording.
- **Log in / log out.** Sessions survive page reloads, and expired access tokens are refreshed
  automatically.
- **Forgot password:** a single-use link valid for 30 minutes. Without SMTP set up, the link is
  printed in the server log.
- **Profile:** edit your details, exam date and listening accent, and change your password (this
  logs out your other devices).
- **Dashboard:** exam countdown, the upcoming practice modules, and tips for the voice test.
- **Admin:** a searchable, paginated list of users.
- A custom **"soft bento pastel"** design: pastel tiles, the Outfit font, Lucide icons, gentle
  animations, and confetti when you sign up.
- Desktop sidebar and phone bottom tab bar; light, dark or follow-the-system theme (remembered).
- Accessibility: every page checked with axe-core in both themes (no violations); full keyboard
  support; motion turned off for users who prefer reduced motion.

## Tech stack

| Part     | Technology                                                                         |
| -------- | ---------------------------------------------------------------------------------- |
| Frontend | Angular 22 (standalone components, signals, zoneless) + Angular CDK                |
| UI       | Own design system (`client/src/styles`, `client/src/app/ui`), Lucide icons, Outfit |
| Backend  | Node.js 22, Express 5, TypeScript, Mongoose 9, Zod                                 |
| Database | MongoDB 8                                                                          |
| Auth     | JWT access token (in memory) + rotating httpOnly refresh-token cookie, bcrypt      |
| Tests    | Vitest + Supertest + mongodb-memory-server (API), Vitest via `ng test` (Angular)   |
| Tooling  | npm workspaces, ESLint, Prettier, Docker, GitHub Actions                           |

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
npm run seed:admin                            # optional: creates the admin from ADMIN_* in server/.env
npm run dev                                   # API on :3000, Angular on http://localhost:4200
```

The Angular dev server proxies `/api` to the API, so cookies work without any CORS setup.

### Scripts (run from the repo root)

| Command              | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Runs API (auto-restart) and Angular dev server         |
| `npm test`           | Runs server and client unit tests                      |
| `npm run lint`       | ESLint + type checks for both apps                     |
| `npm run build`      | Production builds into `server/dist` and `client/dist` |
| `npm run format`     | Formats everything with Prettier                       |
| `npm run seed:admin` | Creates or updates the admin account                   |

Server tests start an in-memory MongoDB automatically. The first run downloads a MongoDB binary; to
use one you already have, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod`.

## Run everything in Docker

```bash
cp .env.example .env      # set JWT_ACCESS_SECRET to a long random string
docker compose up --build
```

Then open http://localhost:3000. In this mode Express serves the built Angular app and the API from
one container (`SERVE_CLIENT=true`).

## Configuration

All server settings are environment variables, checked at startup. They are documented in
[server/.env.example](server/.env.example). The important ones:

| Variable                 | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `MONGO_URI`              | MongoDB connection string                                            |
| `JWT_ACCESS_SECRET`      | Signs access tokens; at least 32 random characters                   |
| `ACCESS_TOKEN_TTL`       | Access token lifetime (default `15m`)                                |
| `REFRESH_TOKEN_TTL_DAYS` | How long a login lasts without activity (default `7`)                |
| `COOKIE_SECURE`          | `true` when served over HTTPS                                        |
| `COOKIE_SAMESITE`        | `lax` (default); `none` if the client and API are on different sites |
| `APP_URL`                | Public app URL, used in password-reset emails                        |
| `SMTP_URL`               | Optional SMTP server for emails, e.g. a free Brevo or Gmail account  |
| `TRUST_PROXY`            | `true` behind a reverse proxy (Render, Railway, nginx)               |

## API (so far)

| Method      | Path                        | Notes                                         |
| ----------- | --------------------------- | --------------------------------------------- |
| GET         | `/api/health`               | API + database status                         |
| POST        | `/api/auth/register`        | Returns `{ user, accessToken }` + sets cookie |
| POST        | `/api/auth/login`           | Same response as register                     |
| POST        | `/api/auth/refresh`         | Uses the refresh cookie; rotates it           |
| POST        | `/api/auth/logout`          | Revokes the refresh token                     |
| GET         | `/api/auth/me`              | Current user (Bearer token)                   |
| POST        | `/api/auth/forgot-password` | Always 200, so emails can't be discovered     |
| POST        | `/api/auth/reset-password`  | Single-use token from the email               |
| POST        | `/api/auth/change-password` | Ends other sessions                           |
| GET / PATCH | `/api/users/me`             | Read / update profile                         |
| GET         | `/api/admin/users`          | Admin only; `?q=&role=&page=&limit=`          |

Errors always look like `{ "error": { "code", "message", "details"? } }`; validation errors include
`details.fields` with a message per field.

## Security notes

- Passwords are hashed with bcrypt, and login returns the same error for a wrong password and an
  unknown email.
- The access token lives only in memory. The refresh token is an httpOnly cookie, stored as a
  SHA-256 hash and rotated on every use. If an old token is reused, every session of that user is
  revoked.
- Rate limits on login, register and password reset; Helmet security headers; CORS allowlist; Zod
  validation on every input.
