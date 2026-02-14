# Decision Log

## 2026-02-13 - Contract-First Socket API Boundary

### Decision
Established `lib/contracts/` as the only source of truth for:
- socket event names,
- ack envelope types,
- ack error codes,
- shared socket payload types.

Removed the transitional compatibility layer (`lib/game-types.ts`) after all runtime imports were migrated.

### Why
- Prevents client/server contract drift.
- Reduces duplicated type declarations across app/server/test files.
- Makes API change impact auditable and mechanical.

### Enforcement
- Added `npm run check:contracts` with script:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/scripts/check-contract-drift.mjs`
- Added `npm run verify` to run contracts + lint + test + builds.

### Consequences
- Contract edits now require coordinated updates across server/client/tests.
- Teams and agents get a clear API boundary and migration workflow.
- Legacy imports (`@/lib/game-types`) are now a hard failure in the drift check.

## 2026-02-13 - Documentation Audience Isolation

### Decision
Split documentation into explicit audience roots:
- Human-facing docs: `/Users/braydenreimann/Programming/repos/bt-mvp/human-docs/**` and `README.md`
- Agent-facing docs: `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/**`, `AGENTS.md`, and `GEMINI.md`

Deprecated `/docs/**` as a documentation root.

### Why
- Keeps product-owner reading surface small and predictable.
- Prevents mixed-audience documents from drifting in tone and intent.
- Lets agent docs optimize for execution detail without human readability constraints.

### Enforcement
- Added `npm run check:docs` with script:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/scripts/check-doc-boundary.mjs`
- Added `check:docs` to `npm run verify`.

### Consequences
- New docs must declare audience by path, not by title.
- Any markdown/html file outside approved roots fails the docs check.
- Human-facing documentation reviews can focus on `human-docs/**` and `README.md` only.

## 2026-02-13 - Phase 2 Server Module Decomposition

### Decision
Split server runtime responsibilities into explicit modules:
- bootstrap: `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts`
- domain engine: `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/game-engine.ts`
- transport binding: `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/transport/register-socket-handlers.ts`

### Why
- Reduces single-file architectural concentration.
- Creates a direct seam between socket wiring and authoritative room/turn logic.
- Makes future extraction of state repositories and turn/lifecycle sub-engines tractable.

### Consequences
- Server bootstrap is now minimal and lifecycle-focused.
- Socket handlers are readable as transport entrypoints.
- Domain engine remains large; next step is internal domain split by responsibility.

## 2026-02-13 - Phase 2 Slice 2: Domain Internal Split

### Decision
Decomposed server domain implementation into focused modules:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/types.ts`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/deck.ts`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/core-runtime.ts`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/turn-runtime.ts`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/game-engine.ts` (now composition-only)

### Why
- Isolates room/session lifecycle from turn progression mechanics.
- Reduces coupling inside a single monolithic engine file.
- Creates clear seams for the next command-style transport API refactor.

### Consequences
- Runtime behavior remains unchanged with passing integration tests.
- Future refactors can target `core-runtime` and `turn-runtime` independently.
- `game-engine.ts` is now a stable assembly layer instead of implementation sink.

## 2026-02-13 - Phase 2 Slice 3: Command-Style Transport Boundary

### Decision
Introduced explicit command handlers in domain runtime and made transport purely dispatch:
- Added command API in `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/commands.ts`.
- Extended engine interface in `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/types.ts`.
- Rewired `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/transport/register-socket-handlers.ts` to call `engine.command*` methods only.

### Why
- Eliminates transport-layer authority over room/session state.
- Makes socket entrypoints easy to audit as API routing code.
- Creates a stable seam for command-level validation and testing.

### Consequences
- Domain owns all mutation and lifecycle paths for socket actions.
- Transport no longer reaches into internal maps (`rooms`, `socketIndex`, session stores).
- Future command tests can bypass socket wiring and exercise authoritative behavior directly.

## 2026-02-13 - Phase 2 Slice 4: Deploy-Safe Deck Source Resolution

### Decision
Replaced repo-relative deck loading with a deploy-safe resolver in:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/deck.ts`

Deck path resolution now:
1. Uses `BACKTRACK_DECK_PATH` when provided.
2. Otherwise discovers server root (`bt-mvp-server`) and loads `/data/cards.json` from that root.
3. Validates deck file shape before exposing `baseDeck`.

### Why
- `npm --prefix server start` runs compiled output under `dist`, where old relative path resolution pointed at a non-existent file.
- Explicit path override is required for portable runtime artifacts and future deck providers.

### Consequences
- Source and compiled server runtimes resolve deck data consistently.
- Startup fails fast with actionable errors for invalid deck payloads.
- Server deployment can point to alternate deck files without code changes.

## 2026-02-13 - Phase 2 Slice 5: Shared Client Session/Termination Lifecycle

### Decision
Extracted shared client-side lifecycle primitives and migrated all room pages:
- Added role session helper module:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/realtime/session-role.ts`
- Added termination lifecycle hook:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/realtime/useRoomTermination.ts`
- Integrated into:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/app/host/[roomCode]/lobby/page.tsx`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/app/host/[roomCode]/game/page.tsx`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/lobby/page.tsx`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx`

### Why
- Resume/termination/session cleanup logic was duplicated across host/play and lobby/game routes.
- Duplicate lifecycle code increased risk of behavior drift and inconsistent reconnect handling.

### Consequences
- Room pages now share one termination marker + redirect policy.
- Role-based session clear/read semantics are centralized and consistent.
- Route files keep page-specific UI transitions while lifecycle behavior is reusable and auditable.

## 2026-02-13 - Phase 2 Slice 6: Split-Deploy Env Contract + Startup Validation

### Decision
Implemented explicit web/server runtime env contracts for split deployment:
- Web:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/env/web-env.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/socket.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/app/layout.tsx`
- Server:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/config/env.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts`

Enforced behavior:
1. `NEXT_PUBLIC_SOCKET_URL` is required for deployed web environments (Vercel startup check).
2. Production/public-host fallback without `NEXT_PUBLIC_SOCKET_URL` fails fast client-side.
3. `CORS_ORIGINS` is required for production/deployed server environments.
4. Server CORS no longer uses wildcard origin.

### Why
- Split hosting (Vercel web + Fly realtime) requires explicit cross-origin configuration.
- Missing env values previously failed late and silently with brittle defaults.

### Consequences
- Deployment failures now surface at startup with actionable errors.
- Local dev remains flexible (localhost/LAN fallback behavior preserved).
- Phase 2 architecture cleanup goals are fully completed.

## 2026-02-13 - Phase 3 Slice 1: Realtime Integration Matrix Expansion

### Decision
Expanded socket integration coverage to include critical lifecycle and timing paths in:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.integration.test.ts`

Added scenarios:
1. player reconnect mid-turn,
2. host disconnect/resume mid-turn,
3. timeout auto-lock,
4. pause/resume timer continuity,
5. kick while active turn is in progress,
6. game termination propagation with terminated-session resume behavior.

### Why
- Existing integration coverage was too narrow for realtime race conditions and lifecycle regressions.

### Consequences
- Regressions in reconnect/timer/kick/termination paths now fail fast in CI.
- Test runtime remains deterministic via env-driven turn/reveal duration overrides.

## 2026-02-13 - Phase 3 Slice 2: Structured Transition Telemetry

### Decision
Added structured telemetry for authoritative runtime transitions and command outcomes:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/observability/telemetry.ts`
- wired through:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/core-runtime.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/commands.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/turn-runtime.ts`

Telemetry includes:
- action logs,
- state transition logs with `roomCode`, `seq`, `phase`, `activePlayerId`.

### Why
- Operational debugging required explicit transition-level visibility, not ad-hoc logs.

### Consequences
- Runtime state progression is observable and machine-parseable.
- Telemetry can be toggled via `BACKTRACK_TELEMETRY`.

## 2026-02-13 - Phase 3 Slice 3: CI Gate Hardening

### Decision
Hardened CI verification workflow:
- `/Users/braydenreimann/Programming/repos/bt-mvp/.github/workflows/ci.yml`

Changes:
1. verify job now runs on Node 20 and Node 22,
2. added workflow-level concurrency cancellation,
3. added `workflow_dispatch` for manual verification runs.

### Why
- Single-runtime CI was insufficient for dependency/runtime compatibility confidence.
- Duplicate in-flight runs wasted CI time and obscured latest status.

### Consequences
- Cross-runtime regressions surface earlier.
- CI signal is cleaner and more deterministic.

## 2026-02-13 - Phase 3 Completion Status

### Decision
Marked all planned Phase 3 slices as complete:
1. integration matrix expansion,
2. transition telemetry,
3. CI quality gate maturity.

### Consequences
- Current strategic focus can move to Phase 4 goals (room/session GC, runtime health endpoints, and continued feature delivery).
