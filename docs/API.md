# API reference

Base path `/api`. JSON in, JSON out. Authentication is a session cookie (`dbfc_sid`, HttpOnly). The TypeScript request schemas live in `packages/shared/src/api/schemas.ts` and the response types in `packages/shared/src/api/types.ts`.

## Conventions

- **CSRF.** Requests whose `Origin`/`Referer` is not the site itself or a configured `CORS_ORIGINS` entry are rejected. Every `POST`, `PUT`, `PATCH` and `DELETE` sent with the session cookie must also carry `x-csrf-token` equal to the `dbfc_csrf` cookie — call `GET /api/auth/csrf` (or `GET /api/auth/me`) first to receive it.
- **Cookie-less clients.** Send `x-auth-mode: token` with `register`, `login`, `guest` or `upgrade` and the response includes `sessionToken`; then authenticate with `Authorization: Bearer <sessionToken>` (Socket.IO: `auth: { token }`). Header-token requests need no CSRF token. The web client uses this only when the browser blocks cookies (e.g. inside an embedded frame).
- **Errors.** `{ "error": { "code": "TEAM_FULL", "message": "Ironbark is full (8 members).", "details": { … } } }`. Validation errors use code `VALIDATION` with `details.fieldErrors` (`{ field: [message] }`). Codes: `BAD_REQUEST, VALIDATION, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, CSRF, GUEST_NOT_ALLOWED, TEAM_FULL, INVITE_EXPIRED, INVITE_INVALID, ALREADY_IN_TEAM, NOT_IN_TEAM, OWNER_MUST_TRANSFER, RUN_EXPIRED, RUN_ALREADY_SUBMITTED, RUN_INVALID, RUN_LOCKED, INSUFFICIENT_CRYSTALS, EMAIL_NOT_CONFIGURED, RACE_NOT_FOUND, RACE_FULL, RACE_STARTED, RACE_EXPIRED, INTERNAL, SERVICE_UNAVAILABLE`.
- **Rate limits.** 300 requests/minute per IP overall, stricter on sensitive routes (noted below). Exceeding a limit returns `429 RATE_LIMITED`.
- **Who can call.** _Public_ = no session needed. _Session_ = guest or account. _Account_ = registered (non-guest) players only.

## Health and configuration (public)

| Method | Path      | Response                                                                   |
| ------ | --------- | -------------------------------------------------------------------------- |
| GET    | `/health` | `{ ok, db, redis, version, uptimeSeconds, features }` (503 when unhealthy) |
| GET    | `/config` | `{ emailEnabled, raceMinPlayers, raceMaxPlayers }`                         |
| GET    | `/daily`  | `{ dayKey, difficulty, stage }` for today's shared trail                   |

## Auth

| Method | Path                        | Access            | Body → response                                                                              |
| ------ | --------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/auth/csrf`                | public            | → `{ csrfToken }`                                                                            |
| GET    | `/auth/me`                  | public            | → `AuthResponseDTO` `{ user, csrfToken }`, or `401`                                          |
| POST   | `/auth/register`            | public, 10/10 min | `{ username, password, email?, displayName? }` → `201 AuthResponseDTO`                       |
| POST   | `/auth/login`               | public, 10/min    | `{ username (or email), password }` → `AuthResponseDTO`                                      |
| POST   | `/auth/guest`               | public, 30/h      | `{ displayName? }` → `201 AuthResponseDTO` (returns the current user if already signed in)   |
| POST   | `/auth/upgrade`             | guest session     | same body as register → keeps the same user id and all progress                              |
| POST   | `/auth/logout`              | public            | → `204`                                                                                      |
| POST   | `/auth/logout-all`          | session           | → `204`; revokes every session and disconnects sockets                                       |
| GET    | `/auth/sessions`            | session           | → `{ sessions: [{ id, current, createdAt, lastSeenAt, userAgent }] }`                        |
| DELETE | `/auth/sessions/:id`        | session           | → `204`                                                                                      |
| POST   | `/auth/password`            | account           | `{ currentPassword, newPassword }` → `204`; other sessions are revoked                       |
| POST   | `/auth/forgot`              | public, 5/15 min  | `{ email }` → `{ ok: true, emailEnabled }` (same response whether or not the account exists) |
| POST   | `/auth/reset`               | public            | `{ token, password }` → `204`; all sessions revoked                                          |
| POST   | `/auth/verify-email`        | public            | `{ token }` → `204`                                                                          |
| POST   | `/auth/resend-verification` | account           | → `{ ok, emailEnabled }`                                                                     |
| DELETE | `/auth/account`             | session           | `{ confirm: "DELETE", password? }` → `204`; deletes all of the player's data                 |

`AuthResponseDTO`: `{ user: SessionUserDTO, csrfToken, sessionToken? }` (`sessionToken` only for `x-auth-mode: token` requests).

`SessionUserDTO`: `{ id, username, displayName, isGuest, email, emailVerified, avatar, selectedSkin, xp, level, crystals, createdAt, team: { id, name, tag, role } | null }`.

## Profile, progress and settings

| Method    | Path         | Access  | Notes                                                                                                                      |
| --------- | ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET       | `/profile`   | session | `ProfileDTO`: user, progress (records, unlocks, lifetime stats), achievements, recent runs, best scores                    |
| PATCH     | `/profile`   | session | `{ displayName?, avatar?, email? }` — avatar must be an owned skin; changing email requires an account and re-verification |
| GET       | `/progress`  | session | `{ records, unlocks, stats }`                                                                                              |
| GET       | `/users/:id` | public  | `PublicProfileDTO` (display name, avatar, level, team, achievements, best scores, catches, races) — guests are not public  |
| GET / PUT | `/settings`  | session | `{ settings }` — client preferences (≤ 8 KB) synced across devices                                                         |

## Runs (server-authoritative)

```http
POST /api/runs
{ "mode": "solo", "difficulty": "medium", "stage": "mistpine" }
```

`201` → `RunTicketDTO`:

```json
{
  "runId": "…",
  "seed": 1938416721,
  "mode": "solo",
  "difficulty": "medium",
  "stage": "mistpine",
  "abilities": { "dash": true, "leap": true, "shield": true },
  "ranked": true,
  "expiresAt": "…"
}
```

- `mode: "daily"` ignores the requested difficulty/forest and uses today's shared seed.
- Locked difficulties or forests return `403 RUN_LOCKED`. 40 tickets/minute.

```http
POST /api/runs/:id/complete
{ "inputs": [0, 1, 18, 2, 140, 3, 176, 4], "claimed": { "score": 7420, "ticks": 5321, "outcome": "caught" } }
```

`inputs` is a flat list of `[tick, code]` pairs (codes: 1 JumpDown, 2 JumpUp, 3 SlideDown, 4 SlideUp, 5 Dash, 6 Shield), ticks non-decreasing, at most 24 000 events. The server replays the inputs and returns `RunCompletionDTO`:

```json
{
  "result": {
    "outcome": "caught",
    "score": 7420,
    "ticks": 5321,
    "seconds": 88.683,
    "distance": 1012,
    "…": "…"
  },
  "ranked": true,
  "mismatch": false,
  "xpGained": 341,
  "crystalsGained": 38,
  "newAchievements": ["wildwood-runner"],
  "personalBest": true,
  "rank": { "weekly": 4, "allTime": 19 },
  "level": 6,
  "leveledUp": false,
  "unlocks": {
    "difficulties": ["easy", "medium", "hard"],
    "stages": ["emerald", "mistpine", "moonlit"],
    "abilities": { "dash": true, "leap": true, "shield": true }
  }
}
```

Failure modes: `404` (not your run), `409 RUN_ALREADY_SUBMITTED`, `410 RUN_EXPIRED`, `422 RUN_INVALID` (malformed log or faster than real time; the ticket is consumed).

`GET /runs/recent` → `{ runs: RecentRunDTO[] }`.

## Leaderboards (public)

`GET /leaderboards?difficulty=medium&period=weekly&page=1` → `LeaderboardPageDTO`:

```json
{
  "difficulty": "medium",
  "period": "weekly",
  "periodKey": "2026-W43",
  "page": 1,
  "pageSize": 20,
  "total": 132,
  "entries": [
    {
      "rank": 1,
      "userId": "…",
      "displayName": "Ashwing",
      "avatar": "emberscale",
      "level": 7,
      "team": { "tag": "EMBR", "name": "Ember Wardens" },
      "score": 9120,
      "ticks": 4380,
      "stage": "emerald",
      "achievedAt": "…"
    }
  ],
  "you": null
}
```

`period` is `daily` (today's trail), `weekly` (ISO week, UTC) or `all`. Ranking: score ↓, ticks ↑, time achieved ↑. Only verified, ranked (account) runs appear; each player keeps their best entry per period.

`GET /leaderboards/teams?period=weekly&page=1` → `{ entries: [{ rank, teamId, name, tag, memberCount, points, races, wins }], … }`.

## Teams

| Method | Path                         | Access                             | Notes                                                                                                         |
| ------ | ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/teams`                     | account                            | `{ name, tag, description? }` → `201 TeamDTO`; unique case-insensitive name and tag (`409` with field errors) |
| GET    | `/teams/mine`                | session                            | `{ team: TeamDTO \| null }`                                                                                   |
| GET    | `/teams/:id`                 | public                             | `TeamDTO` (invites only for owner/captains)                                                                   |
| PATCH  | `/teams/:id`                 | owner/captain                      | `{ name?, description?, maxMembers? }` (size: owner only, ≥ current members)                                  |
| DELETE | `/teams/:id`                 | owner                              | disband                                                                                                       |
| POST   | `/teams/:id/invites`         | owner/captain                      | `{ expiresInHours (1–168), maxUses (1–50) }` → invite `{ code, expiresAt, maxUses, uses, … }`                 |
| DELETE | `/teams/:id/invites/:code`   | owner/captain                      | revoke                                                                                                        |
| GET    | `/invites/:code`             | public                             | `InvitePreviewDTO` with `status`: `valid`, `expired`, `exhausted`, `revoked` or `full`                        |
| POST   | `/invites/:code/accept`      | account                            | → `TeamDTO`; errors `TEAM_FULL`, `INVITE_EXPIRED`, `INVITE_INVALID`, `ALREADY_IN_TEAM`                        |
| PATCH  | `/teams/:id/members/:userId` | owner                              | `{ role: "captain" \| "member" \| "owner" }` — `owner` transfers ownership                                    |
| DELETE | `/teams/:id/members/:userId` | owner; captains may remove members | remove                                                                                                        |
| POST   | `/teams/:id/leave`           | member                             | `{ disbanded }`; owners must transfer first unless alone (`OWNER_MUST_TRANSFER`)                              |

## Collection

| Method | Path                             | Access  | Notes                                                                 |
| ------ | -------------------------------- | ------- | --------------------------------------------------------------------- |
| GET    | `/collection`                    | session | crystals, skins (owned, equipped, price or requirement), achievements |
| POST   | `/collection/skins/:id/purchase` | session | atomic crystal purchase; `INSUFFICIENT_CRYSTALS`                      |
| POST   | `/collection/skins/:id/equip`    | session | `{ avatar?: boolean }`; must own the skin                             |

## WebSocket (Socket.IO) — live races

Connect to path `/socket.io` with credentials; the handshake is authenticated by the session cookie and its `Origin` must be the site. All requests use acknowledgements returning `{ ok: true, … }` or `{ ok: false, error: { code, message } }`.

| Client → server | Payload                                                 | Ack                                              |
| --------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `clock:ping`    | `clientTime`                                            | `serverTime` (ms)                                |
| `race:list`     | —                                                       | `{ rooms: RaceRoomSummaryDTO[] }` (open lobbies) |
| `race:create`   | `{ difficulty, stage, visibility: "open" \| "team" }`   | `{ room }`                                       |
| `race:join`     | `{ code }` — also used to re-join after a reconnect     | `{ room }`                                       |
| `race:leave`    | —                                                       | `{}` (mid-race leaving forfeits)                 |
| `race:ready`    | `{ ready }`                                             | `{}`                                             |
| `race:start`    | — (host; everyone ready, ≥ `minPlayers`)                | `{}`                                             |
| `race:progress` | `{ tick, x, y, gap, hearts, flags }` (volatile, ~10 Hz) | —                                                |
| `race:finish`   | `{ inputs, claimed }`                                   | `{ result }` (verified)                          |

| Server → client   | Payload                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `race:state`      | `RaceRoomDTO` — phase (`lobby`, `countdown`, `racing`, `results`), players (ready, connected, finished, placement, abilities), seed/startAt once started |
| `race:countdown`  | `{ code, seed, startAt, serverNow }`                                                                                                                     |
| `race:progress`   | batched `[{ userId, tick, x, y, gap, hearts, flags }]`                                                                                                   |
| `race:finished`   | a racer's verified standing                                                                                                                              |
| `race:results`    | `{ code, standings: [{ placement, outcome, score, ticks, dnf, points, … }] }`                                                                            |
| `race:closed`     | `{ code, reason: "expired" \| "empty" \| "server" }`                                                                                                     |
| `session:revoked` | the session was revoked; the socket is then disconnected                                                                                                 |
