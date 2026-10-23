# Dragon Ball: Forest Chase

A browser game where your dragon races through an enchanted forest to catch a runaway fireball before it reaches the Ember Shrine. Leap fallen logs, slide under low branches, burn through thorns with Fire Dash, beat your wings for a second jump, and chase the flame across three hand-tuned forests — solo, on today's shared trail, or live against up to five friends.

> **Trademark notice.** "Dragon Ball" is a trademark of its respective owners. This is an original fan-made project that is **not affiliated with or endorsed by them**. It uses **no franchise characters, artwork, logos or music** — every sprite is drawn procedurally in code, all sound is synthesised at runtime, and the logo and lettering are original.

![Emerald Woodland gameplay](docs/screenshots/gameplay-emerald.jpg)

| Misty Pine Forest                                     | Moonlit Grove                                           |
| ----------------------------------------------------- | ------------------------------------------------------- |
| ![Misty Pine](docs/screenshots/gameplay-mistpine.jpg) | ![Moonlit Grove](docs/screenshots/gameplay-moonlit.jpg) |

| Home                               | Lobby                                |
| ---------------------------------- | ------------------------------------ |
| ![Home](docs/screenshots/home.jpg) | ![Lobby](docs/screenshots/lobby.jpg) |

| Live race (lobby, ghosts, results) | Team management                    |
| ---------------------------------- | ---------------------------------- |
| ![Race](docs/screenshots/race.jpg) | ![Team](docs/screenshots/team.jpg) |

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Database: migrations and seed](#database-migrations-and-seed)
- [Testing](#testing)
- [Architecture](#architecture)
- [Fairness and anti-cheat](#fairness-and-anti-cheat)
- [Real-time races](#real-time-races)
- [API and WebSocket reference](#api-and-websocket-reference)
- [Scaling](#scaling)
- [Deployment](#deployment)
- [Security](#security)
- [Accessibility](#accessibility)
- [Known limitations](#known-limitations)
- [Version choices](#version-choices)
- [License](#license)

## Features

**Gameplay**

- Auto-running dragon with variable-height jump, slide (and mid-air fast fall), coyote time and jump buffering for forgiving controls.
- Three abilities with cooldown indicators: **Fire Dash** (orb-powered burst that burns thorn bushes), **Forest Leap** (a second wing-beat in mid-air) and **Dragon Shield** (absorbs one hit; unlocked by your first catch).
- Eleven hazards with readable silhouettes: fallen logs, rocks, ancient trunks, low branches, thorn bushes, tangled roots, mud, broken bridges over ravines, rolling boulders, swinging vine-logs and wisp snares. Moving and timed hazards get an edge-of-screen warning.
- Collectibles: ember orbs (charge Fire Dash, build Flow), forest crystals (currency), shield and tailwind pickups, and one rare **Ancient Dragon Scale** per trail hidden on a high route.
- **Flow**: clean clears make the dragon faster; collisions reset it. The fireball rubber-bands when you fall far behind, flares when cornered and tires over time, so a clean run always converges.
- Three difficulties — **Forest Explorer** (Easy), **Wildwood Chase** (Medium, the balanced target) and **Dragon's Trial** (Hard) — and three forests, unlocked by catching the fireball.
- An interactive tutorial that freezes time at each lesson; results with score breakdown, time, distance, pickups, obstacles, XP, crystals and achievements; retry, next challenge, lobby and share.
- **Today's Trail**: a daily shared seed with its own leaderboard.

**World and presentation**

- Procedural art throughout: a rigged dragon (six skins), five-layer parallax forests with fog, light rays, ambient particles (pollen, mist motes, fireflies), terrain chunks with ravines and broken bridges, and a time-of-day shift as the chase goes on.
- WebAudio-synthesised sound effects and an adaptive, biome-flavoured music loop.
- Minimal HUD: hearts, chase track to the shrine, ability states with text (never colour alone), Flow meter and hazard warnings.

**Platform**

- Website: Home (with a self-playing attract chase), Lobby, Gameplay, Results, Profile, Public profiles, Team management, Leaderboards, Collection, Settings and Auth (sign in, register, guest upgrade, password reset, email verification).
- **Solo works without the server**: if the API is unreachable the game falls back to offline, unranked play with progress stored on the device.
- Accounts: cookie sessions, Argon2id, guest play with in-place upgrade (progress kept), session list and revocation, sign out everywhere, email verification and password reset, account deletion.
- Teams: unique names and tags, invite codes and links with expiry and use limits, owner/captain/member roles, transfer, remove, leave, disband, team stats and internal rankings.
- Leaderboards: global (all-time), weekly, daily and team standings, paginated, server-verified only, no private data.
- **Live races** over WebSockets: lobby, ready check, synchronised countdown, translucent ghosts of the other racers, disconnect/reconnect, verified finishes, placements and team points.

## Quick start

Requirements: **Node.js 22.12+** (see `.nvmrc`) and npm 10. Nothing else is needed for local development — the server uses an embedded PostgreSQL ([PGlite](https://pglite.dev)) by default.

```bash
git clone https://github.com/Jallah-lj/Dragon-Ball.git
cd Dragon-Ball
npm ci
npm run db:seed        # optional: demo players, a team and verified leaderboard runs
npm run dev            # API on :3001, web app on http://localhost:5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/socket.io` to the API, so the browser only ever talks to one origin.

The seed prints the demo account password (or uses `SEED_PASSWORD`). Demo users: `ashwing`, `mossclaw`, `barktail`, `emberlynn`, `fernstride`.

**With PostgreSQL and Redis** (closer to production):

```bash
docker compose up -d postgres redis
cp .env.example .env
# in .env:
#   DATABASE_URL=postgres://dbfc:dbfc_dev_password@localhost:5432/dbfc
#   REDIS_URL=redis://localhost:6379
npm run db:migrate && npm run db:seed
npm run dev
```

**Production build, single process:**

```bash
npm run build          # web → apps/web/dist, server → apps/server/dist
SESSION_SECRET=$(openssl rand -hex 32) npm start   # serves the API, WebSockets and the web app on :3001
```

## Scripts

| Command                                                       | What it does                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                                                 | API (tsx watch) + web (Vite) together                                      |
| `npm run build`                                               | Production build of the web client and the server bundle (esbuild)         |
| `npm start`                                                   | Run the built server (serves `apps/web/dist` too)                          |
| `npm test`                                                    | All Vitest projects (shared, web, server)                                  |
| `npm run test:unit`                                           | Shared rules + fairness sweep + web unit tests                             |
| `npm run test:integration`                                    | Server integration tests (PGlite by default; see [Testing](#testing))      |
| `npm run build:e2e && npm run test:e2e`                       | Playwright end-to-end tests against the production bundle                  |
| `npm run lint` / `npm run typecheck` / `npm run format:check` | ESLint, TypeScript, Prettier                                               |
| `npm run db:generate`                                         | Generate a SQL migration from `apps/server/src/db/schema.ts` (drizzle-kit) |
| `npm run db:migrate`                                          | Apply migrations to `DATABASE_URL`                                         |
| `npm run db:seed`                                             | Idempotent demo data (scores come from real, verified runs)                |
| `npm run balance -- --seeds 30 [--mistakes 0.25] [--no-dash]` | Balance/fairness report from autopilot playthroughs                        |

## Configuration

All settings are environment variables; `.env.example` documents every one. The server loads the nearest `.env` (working directory, then repository root). Important ones:

| Variable                  | Default                   | Notes                                                                                                    |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | `pglite://./.data/pglite` | `postgres://…` (pg pool), `pglite://<dir>` or `pglite://memory`                                          |
| `REDIS_URL`               | _(empty)_                 | Enables the Socket.IO Redis adapter, Redis race-room store and shared rate limits                        |
| `PUBLIC_URL`              | `http://localhost:5173`   | Used for email links, allowed origins and secure cookies (`https://` ⇒ `Secure`)                         |
| `CORS_ORIGINS`            | _(empty)_                 | Extra origins allowed to call the API (only for split deployments)                                       |
| `SESSION_SECRET`          | dev placeholder           | **Required in production.** Keys the HMAC of stored session/email tokens; rotating it signs everyone out |
| `SESSION_TTL_DAYS`        | `30`                      | Session lifetime                                                                                         |
| `SMTP_HOST` … `MAIL_FROM` | _(empty)_                 | Without SMTP, verification/reset emails are written to the server log                                    |
| `RUN_MIN_WALLCLOCK_RATIO` | `0.9`                     | Anti-cheat: minimum real time per simulated time                                                         |
| `RACE_MIN_PLAYERS`        | `2`                       | Racers required to start                                                                                 |
| `TRUST_PROXY`             | `false`                   | Set behind a reverse proxy so client IPs and protocol are correct                                        |
| `FRAME_ANCESTORS`         | `'self'`                  | CSP `frame-ancestors`; widen only if the app must be embedded                                            |
| `COOKIE_SAMESITE`         | `lax`                     | Use `none` (forces `Secure`) only when the app runs inside a cross-site iframe                           |
| `STATIC_DIR`              | auto                      | Built web client; defaults to `apps/web/dist` when present                                               |

The web client only reads `VITE_API_URL` (leave empty when the API is same-origin).

## Database: migrations and seed

- Schema: `apps/server/src/db/schema.ts` (Drizzle ORM, PostgreSQL dialect). Fifteen normalised tables with foreign keys, cascading deletes, case-insensitive unique indexes (`lower(username)`, `lower(email)`, `lower(team name)`) and ranking indexes for leaderboards.
- Migrations: SQL files in `apps/server/drizzle/`, generated with `npm run db:generate` and applied with `npm run db:migrate` (or automatically at start-up when `AUTO_MIGRATE=true`). The same migrations run on PostgreSQL and PGlite.
- Multi-step writes (run completion, rewards, team joins, purchases, race results) run inside transactions with row locks (`SELECT … FOR UPDATE`) where capacity or balances are involved.
- Seed: `npm run db:seed` creates five demo players who each play a ladder of runs through the **same verification path as real players** (the autopilot plays the deterministic simulation and the input log is replayed by the server), plus a demo team with an invite code. Re-running is a no-op.

## Testing

| Suite                           | Tool                                       | What it covers                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared (`packages/shared/test`) | Vitest                                     | RNG determinism, course invariants, physics (jump arcs, coyote time, buffering, slide, dash-burn, shield, pits, mud, roots), outcomes and scoring, replay equality and tamper detection, input-log validation, **autopilot fairness sweep** (every generated course must be cleared without damage), tutorial feasibility, progression, achievements, schemas |
| Web (`apps/web/test`)           | Vitest + Testing Library (jsdom)           | `GameSession` fixed-step clock, pause, tutorial freezes, race menu, **client-recorded inputs replay to the identical server result**, settings sanitising and rebinding, offline progress, API error mapping, components                                                                                                                                      |
| Server (`apps/server/test`)     | Vitest + Fastify inject + socket.io-client | Auth (CSRF/Origin, sessions, guest upgrade, recovery, deletion), runs and anti-cheat, leaderboards and privacy, teams (full/expired/revoked/unauthorised), collection, settings, rate limiting, static serving, **live races over real WebSockets**                                                                                                           |
| End-to-end (`tests/e2e`)        | Playwright                                 | Home and accessibility basics, a full verified guest chase, pause, keyboard input, tutorial, offline fallback, account + team + invite flow with two browsers, a two-player live race, mobile touch controls                                                                                                                                                  |

**CI.** The GitHub Actions pipeline is in [`ci/github-actions.yml`](ci/github-actions.yml) — move it to `.github/workflows/ci.yml` to enable it (see [ci/README.md](ci/README.md)). It runs the format check, ESLint, typecheck, unit tests, build, integration tests on PGlite and on PostgreSQL 16 + Redis 7, migrations + seed, and the Playwright suite.

Integration tests use an in-memory PGlite database by default. Run them against real services with:

```bash
TEST_PG_URL=postgres://postgres:postgres@localhost:5432/postgres \
TEST_REDIS_URL=redis://localhost:6379/1 npm run test:integration
```

Each test file then gets its own freshly created PostgreSQL database, and the race suite runs a second time with the Redis room store and adapter. CI does both.

End-to-end tests run the production server bundle with an in-memory database and the test build of the client (`vite build --mode e2e`, which exposes an autopilot/time-scale hook used to finish runs quickly on CPU-rendered CI browsers; the hook does not exist in normal builds). `PLAYWRIGHT_CHROMIUM_PATH` lets you use a custom Chromium.

## Architecture

```
packages/shared   @dbfc/shared — the single source of game rules
  sim/            deterministic simulation, course generator, autopilot, replay
  meta/           progression, achievements, cosmetics
  api/            zod request schemas + response DTO types
  realtime/       Socket.IO event contracts
apps/web          @dbfc/web — React 19 + React Router 7 + Phaser 3.90 (Vite 8)
  game/           GameSession (clock, inputs, tutorial, races), Phaser scenes, procedural art, audio
  pages/          website screens; lib/ (API client, auth, settings, offline store, socket)
apps/server       @dbfc/server — Fastify 5 + Drizzle ORM + Socket.IO
  routes/ services/ plugins/ realtime/ db/ (schema, migrations, seed)
```

- **One rulebook.** The physics, course generation, scoring, unlocks and achievements live only in `@dbfc/shared`. The browser runs the simulation to play, the server replays it to verify, the autopilot clones it to look ahead. The server bundles the shared TypeScript with esbuild; the web client imports it through Vite.
- **Deterministic simulation.** A fixed 60 Hz tick, an sfc32 integer RNG seeded per run, and only `+ − × ÷`, `floor` and `sqrt` (no `sin`/`exp`, which can differ between engines). Rendering interpolates between ticks, so it is smooth at any refresh rate.
- **Rendering.** Phaser scenes read the simulation state; textures are drawn once with Canvas 2D at the device's resolution and cached across games. The HUD is a separate scene; menus and overlays are React.
- **Server.** Fastify with typed zod validation, a uniform error envelope (`{ error: { code, message, details } }`), cookie sessions, rate limits and helmet security headers. Drizzle talks to PostgreSQL via `pg`, or to PGlite for zero-setup development and tests.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · game numbers: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## Fairness and anti-cheat

**Fair courses.** Courses are built from hand-designed obstacle patterns whose spacing is expressed in _seconds of travel at the expected speed_, so reaction windows scale with speed. Wide hazards are sized for a slow-case speed, obstacles sit on flat ground, rolling boulders get a reserved lane, and periodic hazards always have one response that works at every phase (you can always slide under a swinging log and jump a wisp snare). A look-ahead autopilot plays hundreds of seeds per difficulty and forest in the test suite and must catch the fireball without taking damage; `npm run balance` reports catch times and harms for perfect and sloppy play.

**Scores are never trusted.**

1. Starting a run issues a **single-use ticket** (`runs` row with a server-chosen seed, difficulty, forest and abilities). Locked difficulties/forests are refused server-side.
2. The client records every input as `(tick, code)` and submits only that log (plus its claimed result).
3. The server validates the log (shape, ordering, size limits), **replays it through the shared simulation** and uses only the replayed result for XP, crystals, unlocks, achievements and leaderboards. A claim that differs is flagged (`mismatch`) and ignored.
4. A run must take at least `RUN_MIN_WALLCLOCK_RATIO` × its simulated time in real time; tickets expire after two hours and are consumed even when verification fails.
5. Guests are verified but never ranked; leaderboard queries exclude guests and expose display data only.

Replaying a long Hard run costs a few milliseconds of CPU.

## Real-time races

- Up to **6 dragons**, 6-character room codes, open or team-only visibility, ready check, host start.
- On start the server picks a seed, a start time 3.5 s in the future and a deadline, and issues a run ticket per racer. Clients synchronise clocks NTP-style (`clock:ping`) and run the shared simulation locked to the server's start time, so everyone races the same trail at the same moment.
- Progress is sent at 10 Hz as volatile messages, batched by the server and rendered as translucent **ghost dragons** with live standings.
- Finishing submits the input log over the socket; the server replays it (same anti-cheat as solo), ranks catches first by time, then score, and awards placement points **10/7/5/3/2/1** to each racer's team (weekly and all-time).
- **Disconnects:** in the lobby a player has a 20 s grace period; mid-race the local simulation keeps running, the client re-joins automatically, and a pending finish is resubmitted. Racers who never finish by the deadline are marked DNF. Full, started, expired, unknown and team-restricted rooms return explicit errors; idle lobbies close after 30 minutes. Revoking a session disconnects its sockets.

## API and WebSocket reference

All endpoints are under `/api`, accept and return JSON, and use cookie sessions. State-changing requests require the `x-csrf-token` header matching the `dbfc_csrf` cookie (obtain it from `GET /api/auth/csrf` or `GET /api/auth/me`). Errors use `{ "error": { "code", "message", "details?" } }`.

| Area         | Endpoints                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health       | `GET /health`, `GET /config`, `GET /daily`                                                                                                                                                                                                                                                                                                                                  |
| Auth         | `GET /auth/csrf`, `GET /auth/me`, `POST /auth/register`, `POST /auth/login`, `POST /auth/guest`, `POST /auth/upgrade`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/password`, `POST /auth/forgot`, `POST /auth/reset`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `DELETE /auth/account` |
| Profile      | `GET /profile`, `PATCH /profile`, `GET /progress`, `GET /users/:id`, `GET /settings`, `PUT /settings`                                                                                                                                                                                                                                                                       |
| Runs         | `POST /runs`, `POST /runs/:id/complete`, `GET /runs/recent`                                                                                                                                                                                                                                                                                                                 |
| Leaderboards | `GET /leaderboards?difficulty&period=daily\|weekly\|all&page`, `GET /leaderboards/teams?period&page`                                                                                                                                                                                                                                                                        |
| Teams        | `POST /teams`, `GET /teams/mine`, `GET /teams/:id`, `PATCH /teams/:id`, `DELETE /teams/:id`, `POST /teams/:id/invites`, `DELETE /teams/:id/invites/:code`, `GET /invites/:code`, `POST /invites/:code/accept`, `PATCH /teams/:id/members/:userId`, `DELETE /teams/:id/members/:userId`, `POST /teams/:id/leave`                                                             |
| Collection   | `GET /collection`, `POST /collection/skins/:id/purchase`, `POST /collection/skins/:id/equip`                                                                                                                                                                                                                                                                                |

Socket.IO (path `/socket.io`, authenticated by the session cookie): client → server `clock:ping`, `race:list`, `race:create`, `race:join`, `race:leave`, `race:ready`, `race:start`, `race:progress`, `race:finish`; server → client `race:state`, `race:countdown`, `race:progress`, `race:finished`, `race:results`, `race:closed`, `session:revoked`.

Full request/response details and examples: **[docs/API.md](docs/API.md)**. The TypeScript contracts are in `packages/shared/src/api` and `packages/shared/src/realtime`.

## Scaling

- **Stateless HTTP.** Sessions, runs and leaderboards live in PostgreSQL, so API instances can be added behind a load balancer. Set `TRUST_PROXY=true` behind it.
- **WebSockets across instances.** With `REDIS_URL`, Socket.IO uses the Redis adapter for broadcasts, race rooms live in Redis (optimistic `WATCH/MULTI` mutations; every instance runs the housekeeping sweep, and finalisation is idempotent because the phase transition is atomic), and rate-limit counters are shared. Sticky sessions are recommended for the HTTP long-polling fallback (the client prefers WebSockets).
- **Hot paths.** Leaderboard reads are served by composite indexes on `(period_key, difficulty, score desc, ticks, achieved_at)`; weekly/daily boards are separate keys, so old periods never slow current ones. Run verification is CPU-bound (milliseconds per run); at high volume move it to a worker pool or queue — it is a pure function of `(ticket, inputs)`.
- **Database.** Use a connection pooler (PgBouncer) for many instances; `PG_POOL_MAX` sets the per-instance pool size. Old `runs` rows can be archived; leaderboard rows keep only each player's best result per period.

## Deployment

**Docker Compose** (PostgreSQL 16 + Redis 7 + app):

```bash
export SESSION_SECRET=$(openssl rand -hex 32)
docker compose up --build -d
docker compose run --rm app node apps/server/dist/seed.js    # optional demo data
```

Then open <http://localhost:3001>. The image (`Dockerfile`) is a multi-stage Node 22 build that runs as the unprivileged `node` user with a health check on `/api/health`.

**Any Node host:** `npm ci && npm run build`, then `node apps/server/dist/index.js` with `DATABASE_URL` (PostgreSQL), `SESSION_SECRET`, `PUBLIC_URL` (your https origin) and optionally `REDIS_URL` and SMTP settings. Terminate TLS at a reverse proxy, forward WebSocket upgrades for `/socket.io`, and set `TRUST_PROXY=true`. Migrations run at start-up (`AUTO_MIGRATE=true`) or explicitly with `node apps/server/dist/migrate.js`.

**External credentials:** only SMTP (optional) needs third-party credentials; without it, emails are logged. Never commit `.env` — `.env.example` contains placeholders only.

## Security

- Sessions: 256-bit random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` on https); only an HMAC of the token is stored. Sessions rotate on login/upgrade (no fixation) and can be listed and revoked individually or all at once.
- Passwords: Argon2id (19 MiB, t=2, p=1) with a constant-time dummy check for unknown accounts; generic login errors; reset flows never reveal whether an email exists.
- CSRF: Origin/Referer verification on every state-changing request, plus a double-submit token whenever the request is authenticated by the session cookie; WebSocket handshakes verify Origin too (no cross-site WebSocket hijacking).
- Cookie-less fallback: when a browser refuses cookies (for example third-party cookie blocking while the app is embedded in another site's frame), the client switches to **token mode** for that tab — the server returns the session token only to requests that ask for it (`x-auth-mode: token`), and the client sends it as `Authorization: Bearer …` (and in the Socket.IO handshake). Header tokens cannot be attached by other sites, so no CSRF cookie is needed; normal browsing keeps HttpOnly cookies.
- Input validation with shared zod schemas; display names and team names are normalised (control, zero-width and bidi characters stripped). React escapes all output.
- Rate limits on every route (stricter on auth, tickets, invites) and per-socket event budgets.
- Helmet security headers with a strict Content-Security-Policy (`script-src 'self'`), HSTS, frame protection.
- Authorisation is checked server-side for every team action; leaderboards and public profiles never include emails or account details.

## Accessibility

- Full keyboard support: skip link, visible focus rings, arrow-key tabs, focus-trapped dialogs that restore focus, rebindable game keys, gamepad support.
- Status is never colour-only: abilities show text states ("Ready", "2.4s", "Locked"), hazards have distinct shapes and warnings, locked content shows a lock icon and the unlock requirement.
- Reduced motion (system, on, off) disables camera shake, flashes, flicker and parallax drift; separate screen-shake toggle; higher-contrast text and larger text options.
- Screen-reader announcements for hits, shields and catches; labelled forms with inline errors; semantic tables with captions.
- Touch: large on-screen buttons (handedness option), optional swipe gestures, no page scrolling while playing, and a rotate-to-landscape hint on narrow portrait screens.

## Known limitations

- **Live races in production have not been verified on a deployed multi-instance backend.** They are covered by integration tests over real WebSockets (memory and Redis stores) and by a two-browser end-to-end test against a single local instance.
- The Docker image and Compose stack could not be built in the sandbox this project was developed in (no Docker daemon). The same server bundle, migrations and seed were verified directly against PostgreSQL 18 and Redis 6.2; CI exercises PostgreSQL 16 and Redis 7.
- Refreshing the page mid-race rejoins the room, but inputs made before the refresh are lost, so that run is likely to stumble.
- Offline runs are stored on the device and cannot be verified, so they never sync to an account or leaderboard.
- One real-time mode (synchronised races) is implemented; there is no in-game chat.
- Very old devices without WebGL fall back to Phaser's Canvas renderer, which is noticeably slower.

## Version choices

| Package                             | Version          | Why                                                                                                    |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Node.js                             | 22 LTS           | `process.loadEnvFile`, stable fetch/WebSocket tooling                                                  |
| TypeScript                          | 6.0              | Latest release supported by typescript-eslint                                                          |
| React / React Router                | 19.3 / 7.18      | Current stable; Router in declarative mode                                                             |
| Vite / @vitejs/plugin-react         | 8.3 / 6.1        | Current stable pair                                                                                    |
| Phaser                              | 3.90.0 (pinned)  | Mature Phaser 3 line with ESM build                                                                    |
| Fastify                             | 5.12             | Fast, schema-friendly, first-class plugin ecosystem                                                    |
| Drizzle ORM / drizzle-kit           | 0.45 / 0.31      | Migration-based, pure TypeScript (Prisma's engine downloads were unavailable in the build environment) |
| PostgreSQL driver / PGlite          | pg 8.23 / 0.5    | Production pool / zero-setup embedded Postgres for dev and tests                                       |
| Socket.IO / Redis adapter / ioredis | 4.8 / 8.3 / 5.11 | Rooms, acks, reconnection; horizontal scaling                                                          |
| argon2                              | 0.45             | Argon2id hashing                                                                                       |
| zod                                 | 4.6              | Shared validation between client and server                                                            |
| Vitest / Playwright                 | 5.0 / 1.64       | Unit/integration and browser tests                                                                     |

## License

MIT — see [LICENSE](LICENSE). The trademark notice above applies to the name "Dragon Ball".
