# Client Session Lifecycle Structure

## Purpose
Define the shared client-side lifecycle boundary for room session recovery and termination handling.

## Shared Modules

### Role Session Helpers
- `/Users/braydenreimann/Programming/repos/bt-mvp/lib/realtime/session-role.ts`
- Owns:
  - role-based session token access (`host` vs `player`),
  - role-based room-code access,
  - role-based session cleanup (`clearSessionForRole`, `clearRoomSessionForRole`).
- Does not own:
  - socket listener registration,
  - UI state management.

### Termination Hook
- `/Users/braydenreimann/Programming/repos/bt-mvp/lib/realtime/useRoomTermination.ts`
- Owns:
  - room-termination marker consumption,
  - marker persistence on runtime termination events,
  - delayed redirect timing after termination,
  - unified `terminatedRef` guard.
- Does not own:
  - per-page UI teardown details,
  - transport event wiring.

## Page Integration Targets
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/host/[roomCode]/lobby/page.tsx`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/host/[roomCode]/game/page.tsx`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/lobby/page.tsx`
- `/Users/braydenreimann/Programming/repos/bt-mvp/app/play/[roomCode]/game/page.tsx`

Each page now:
1. Delegates session/token/room lookups to `session-role.ts`.
2. Delegates termination marker + redirect lifecycle to `useRoomTermination`.
3. Keeps only page-specific UI teardown and socket event behavior local.

## Follow-Up Targets
1. Extract shared resume-ack outcome handlers (`SESSION_NOT_FOUND`, `ROOM_NOT_FOUND`, `ROOM_TERMINATED`, `KICKED`) into client-side domain helpers.
2. Consolidate repeated socket event subscription scaffolding in host/play pages into role-scoped hooks.
