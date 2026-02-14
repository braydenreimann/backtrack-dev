# Server Runtime Structure

## Purpose
Define the authoritative server module boundaries after Phase 2/3 architecture and observability work.

## Module Map

### Bootstrap
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/server.ts`
- Owns:
  - HTTP/socket server creation,
  - environment contract loading,
  - engine construction,
  - handler registration,
  - start/stop lifecycle.
- Does not own:
  - game rules,
  - room/session state mutation logic,
  - socket event-specific behavior.

### Domain Engine
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/game-engine.ts`
- Owns:
  - composition of domain runtimes into one `GameEngine` interface.
- Does not own:
  - low-level state/timer/lifecycle implementations.

### Domain Internals
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/types.ts`
  - shared domain types and engine public interface.
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/deck.ts`
  - deck source resolution and deck payload validation.
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/core-runtime.ts`
  - authoritative in-memory maps, ack helpers, room/session lifecycle, snapshots, termination index.
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/domain/turn-runtime.ts`
  - turn timer orchestration, placement resolution, reveal progression, end-game transitions.

### Runtime Config
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/config/env.ts`
- Owns:
  - parsing/validation of server runtime env vars (`PORT`, `CORS_ORIGINS`),
  - production-vs-dev CORS allowlist rules.
- Does not own:
  - game-state logic,
  - socket event routing.

- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/config/game-runtime.ts`
- Owns:
  - runtime timing/threshold config for turns/reveal/win conditions,
  - env-driven overrides for integration testing and controlled runtime tuning.
- Does not own:
  - socket handling,
  - room lifecycle orchestration.

### Observability
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/observability/telemetry.ts`
- Owns:
  - structured action and state-transition logging,
  - transition fields (`roomCode`, `seq`, `phase`, `activePlayerId`).
- Does not own:
  - business rule decisions,
  - transport protocol behavior.

### Transport Binding
- `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/transport/register-socket-handlers.ts`
- Owns:
  - `socket.on(...)` registration,
  - payload routing to engine command operations.
- Does not own:
  - state mutation logic,
  - low-level timer/snapshot/transition primitives.

## Contract Boundaries
- Event names, payloads, ack types, and error codes come only from:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/socket.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/game.ts`

## Next Decomposition Targets
1. Split `game-engine.ts` into:
  - Completed in Phase 2 slice 2 (`core-runtime`, `turn-runtime`, `types`, `deck`).
2. Replace direct map access in transport with narrower engine commands (command-style API).
  - Completed in Phase 2 slice 3 (`commands.ts` + dispatch-only transport).
3. Add focused integration tests for kick/timeout/reconnect edge cases.
  - Completed in Phase 3 slice 1 (8 integration scenarios in `server.integration.test.ts`).
4. Extract room/session lifecycle invariants into explicit command/state transition tests.
5. Introduce room/session TTL GC policy with deterministic teardown semantics.
