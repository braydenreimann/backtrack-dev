# Backtrack MVP Codebase Review (2026-02-13)

## Findings (Ordered by Severity)

### 1. [P1] Kicking players during active games leaves turn state inconsistent
`kickPlayer` removes a player from `room.players` but does not remove them from `room.turnOrder` or normalize `activePlayerIndex`. Snapshot serialization then uses `room.turnOrder[room.activePlayerIndex]` directly, so clients can receive an `activePlayerId` that no longer exists.

Impact: host/controller state can drift from authoritative turn progression, especially if the kicked user was active.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:1155`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:1184`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:352`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:873`

### 2. [P1] Controller optimistic placement updates are not reconciled on server rejection
The controller sets local `placementIndex` before ack returns for `turn.place` and `turn.remove`. If the server rejects due to a race (phase changed, timeout, pause), UI state can stay incorrect until another event arrives.

Impact: user sees local state that did not persist server-side, increasing reveal/action failures and confusion.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx:460`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx:469`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx:476`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx:485`

### 3. [P1] Rooms can persist indefinitely after host disconnects (no lifecycle GC)
On disconnect, host state is marked `connected=false`, but no expiration/cleanup policy removes abandoned rooms/sessions.

Impact: long-running process memory growth, stale resume tokens, and eventual room-code allocation pressure.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:142`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:1268`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:1280`

### 4. [P2] Socket contract drift between client and server
The codebase has duplicated event declarations and inconsistent naming patterns (`kickPlayer`, `turn.reveal`, `client:game.pause`, etc.), with many string literals spread across pages/server. There are also unreachable client branches for a `KICKED` ack code not emitted by server handlers.

Impact: API drift risk, brittle refactors, and harder auditing of backward compatibility.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/lib/game-types.ts:46`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:115`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:1155`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/lobby/page.tsx:200`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx:387`

### 5. [P2] Runtime coupling to monorepo path for deck loading
The server loads deck data via `resolve(__dirname, '../../cards.json')`, coupling runtime layout to repository structure.

Impact: brittle packaging/deployment when server is built/deployed as an isolated artifact.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:124`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:125`

### 6. [P2] Open CORS policy on realtime server
Socket server currently allows `origin: '*'`.

Impact: unnecessary exposure for closed-beta environments and weak default security posture.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:150`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts:152`

### 7. [P3] Testing breadth is still narrow relative to game-state complexity
Only two test files exist: storage helpers and a small integration harness (2 socket tests).

Impact: high regression risk across room lifecycle, pause/resume timing, reconnect, and kick/leave edge cases.

Evidence:
- `/Users/braydenreimann/Programming/repos/bt-mvp/lib/storage.test.ts:1`
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.integration.test.ts:111`

## Current State Summary

The project is functional and already has a strong MVP baseline: host/play flows are implemented, server authority is respected in core turn resolution, and local-session resume/kick/termination behaviors are present. The UI surface has been split into smaller presentational components in several places (especially host game rendering). The new server integration harness is a meaningful improvement and validates key socket flow behavior.

The main limitation is architectural concentration and contract duplication. Authoritative logic lives in one large server module, while client pages duplicate socket lifecycle/error/session patterns. This increases bug-fix cost and makes behavior harder to reason about under reconnect/timing races.

## Confirmed Product/Deployment Decisions

1. Kicking players after game start is intentional MVP behavior.
2. Single-player starts (`players.length >= 1`) remain intentional.
3. Target deployment is split hosting: web app on Vercel and realtime server on Fly.io.

## High-Level Weaknesses

1. **State-machine clarity**: room/turn lifecycle behavior is implicit across many handlers instead of being centralized in a narrow transition API.
2. **Public API discipline**: socket event names/payloads are partially typed, partially string-literal, and not validated through one shared contract boundary.
3. **Operational robustness**: no abandoned-room GC policy, permissive CORS defaults, and no clear environment validation for runtime invariants.
4. **Client resilience**: optimistic UI updates and repeated socket logic across pages create race-condition windows and inconsistent recovery behavior.
5. **Test strategy coverage**: current tests are good seeds, but they do not yet defend critical lifecycle paths (pause/resume, reconnect during reveal, host disconnect, kick during active turn, timeout races).

## Proposed Structural and Robustness Improvements

### Phase 1 (High ROI, low-to-moderate change risk)
1. **Normalize turn membership on player removal**
- When a player is kicked/removed, update `turnOrder`, re-clamp `activePlayerIndex`, and emit an immediate consistent snapshot.
- Explicitly support in-game kicks in every phase path (`PLACE`, `REVEAL`, paused state), including deterministic handling when the active player is removed.

2. **Controller ack reconciliation**
- Keep optimistic feel, but roll back local placement state on negative ack.
- Add deterministic fallback when `turn.reveal` ack succeeds but reveal event is delayed/lost.

3. **Contract hardening pass**
- Define a single source of truth for event names and ack error codes in `lib/`.
- Remove unreachable client branches (`KICKED` ack handling) or implement matching server behavior.

4. **Security baseline for beta**
- Replace `origin: '*'` with configurable allowlist (`CORS_ORIGINS`).

### Phase 2 (Architecture cleanup)
1. **Server decomposition**
- Extract pure game engine functions (turn transitions, placement validation, player rotation) from transport layer.
- Keep socket handler thin: parse/validate payload -> call engine -> emit events.

2. **Shared client socket/session hooks**
- Consolidate resume/disconnect/termination handling used in host lobby/game and play lobby/game.
- Reduce duplicated state-machine logic in pages.

3. **Deck loading abstraction**
- Move deck source into explicit config/service (path/env/provider), not relative source-tree assumptions, so Fly server artifacts are deployable without monorepo path coupling.

4. **Split-deploy configuration contract**
- Treat `NEXT_PUBLIC_SOCKET_URL` as required in deployed web environments and point it to the Fly realtime domain.
- Add startup-time env validation for required server/web variables.

### Phase 3 (Confidence and observability)
1. **Expand socket integration suite**
- Add tests for reconnect mid-turn, timeout auto-lock, pause/resume timer continuity, kick while active, host disconnect/resume, room termination propagation.

2. **Introduce lightweight state transition telemetry**
- Structured logs for phase changes and action outcomes (`roomCode`, `seq`, `phase`, `activePlayerId`).

3. **Add CI quality gates**
- Enforce `test + lint + build (web + server)` in one pipeline.

## Best-Practice Alignment Gaps vs Similar Realtime Codebases

- Missing strict event-schema validation (commonly done with Zod/Valibot at socket boundaries).
- Missing explicit domain-state module separate from networking transport.
- Missing lifecycle cleanup policy (idle room/session TTL).
- Limited integration-test matrix for timing-sensitive realtime state changes.

## Clarification Impact on Plan

1. The top server priority is no longer deciding whether active-game kick should exist; it is making active-game kick behavior fully deterministic and test-covered.
2. `players.length >= 1` is now a deliberate rule, so no player-count policy change is recommended in this plan.
3. Fly + Vercel split deployment makes standalone server packaging and explicit cross-origin configuration mandatory, not optional hardening.
