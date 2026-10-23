# Architecture

## Monorepo

npm workspaces with one lockfile:

| Package                            | Purpose                                                               |
| ---------------------------------- | --------------------------------------------------------------------- |
| `packages/shared` (`@dbfc/shared`) | Game rules and contracts — imported as TypeScript source by both apps |
| `apps/web` (`@dbfc/web`)           | React single-page app + Phaser game                                   |
| `apps/server` (`@dbfc/server`)     | Fastify API, Socket.IO races, Drizzle/PostgreSQL                      |

## The simulation (`packages/shared/src/sim`)

`ChaseSimulation` advances in fixed 1/60 s ticks. Each tick it applies queued inputs, updates abilities and timers, integrates speed and vertical motion (variable-height jump, coyote time, jump buffer, slide, fast fall, rescue flap out of pits), resolves collisions against the active obstacles, collects pickups, moves the fireball (rubber band, cornered flare, fatigue) and checks the outcome. It emits one-shot events (`jump`, `hit`, `collect`, `burn`, …) that the renderer turns into sound and particles.

Determinism rules: integer RNG (sfc32 seeded via splitmix32), no transcendental `Math` functions, all randomness drawn at course-generation time, and inputs applied only at tick boundaries. `replayRun(config, inputs)` reproduces a run exactly; tests compare live and replayed results field by field and check that client sessions replay identically.

`generateCourse` builds the whole trail up front from weighted, hand-designed patterns (single hazards and combos), with spacing measured in seconds of travel at the expected speed, optional slopes between patterns, orb arcs that trace natural jumps, shield/boost pickups placed away from hazards, and a rare scale on a high route. The `Autopilot` clones the simulation to test candidate input plans (one-step, then two-step for combos); it powers the attract mode, the fairness tests, balance tooling and end-to-end tests.

## Web client (`apps/web`)

- `GameSession` owns a run: the simulation, a fixed-step accumulator (or real-time lock for races), the input recorder, pause, tutorial freezes with forgiving minimum holds, race progress and ghosts. It is framework-agnostic and unit-tested without Phaser.
- Phaser scenes: `ForestScene` (parallax, terrain chunks, obstacles, pickups, dragon rig, fireball, effects, camera) and `HudScene`. All textures are drawn procedurally with Canvas 2D at the device's render scale and cached across game instances.
- React renders the website, overlays (pause, tutorial prompts, results, race lobby/results) and on-screen touch controls; the game reports events through `GameSession` listeners.
- `lib/api.ts` (typed fetch with CSRF), `lib/auth.tsx` (session context, offline detection, guest bootstrap, settings sync), `lib/settings.ts` (validated, persisted preferences), `lib/offline.ts` (device-local progress using the shared rules), `lib/socket.ts` (Socket.IO client and clock sync).

## Server (`apps/server`)

- `app.ts` assembles Fastify: cookies, helmet (CSP), CORS for split deployments, rate limiting (Redis-backed when available), the error envelope, session/CSRF hooks, routes, static hosting of the built client with SPA fallback, and the Socket.IO server.
- `services/` hold the business logic (runs and rewards, leaderboards, teams, collection, profiles, sessions); routes stay thin and validate with the shared zod schemas.
- `realtime/` contains the race service, the room store (memory or Redis) and the socket wiring.
- `db/` contains the Drizzle schema, the database factory (PostgreSQL pool or PGlite), migrations and the seed workflow.

## Data model

`users` · `sessions` (HMAC of token) · `email_tokens` · `runs` (tickets and verified results) · `progress` (per difficulty × forest) · `user_stats` · `achievements` · `user_skins` · `user_settings` · `leaderboard_entries` (best per player per period and difficulty) · `teams` · `team_members` (one team per user) · `team_invites` · `team_leaderboard_entries` · `race_results`.

## Request flow: a ranked solo run

1. `POST /api/runs` → ticket (seed, abilities).
2. The browser plays the seeded course; every input is recorded with its tick.
3. `POST /api/runs/:id/complete` with the input log → the server locks the ticket row, validates and replays the log, checks wall-clock plausibility, and in one transaction stores the result, progress, stats, achievements, XP/crystals and leaderboard entries.
4. The client shows the verified result, rewards and rank.
