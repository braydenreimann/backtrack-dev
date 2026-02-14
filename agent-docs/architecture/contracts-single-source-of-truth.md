# Socket Contracts: Single Source of Truth

## Canonical files
- `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/socket.ts`
- `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/game.ts`

## Ownership
- `lib/contracts/socket.ts` owns:
  - client->server event names,
  - server->client event names,
  - ack envelope types,
  - ack error code enum,
  - socket payload types.
- `lib/contracts/game.ts` owns:
  - shared game-facing entities used by both host/play and server event payloads (`Card`, `RoomSnapshot`, `TurnReveal`, etc.).

No other file should define socket event strings or ack error code literals.

## Import rules
- Browser app files import contracts via `@/lib/contracts/*`.
- Server files import contracts via relative ESM paths with `.js` suffix:
  - `../../lib/contracts/socket.js`
  - `../../lib/contracts/game.js`

## Change workflow
1. Add or modify event constants in `lib/contracts/socket.ts`.
2. Update payload types in `lib/contracts/socket.ts` and `lib/contracts/game.ts`.
3. Update server emit/listener usage.
4. Update host/play listeners and emitters.
5. Update integration tests.
6. Run checks:
  - `npm run check:contracts`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
  - `cd /Users/braydenreimann/Programming/repos/bt-mvp/server && npm run build`
  - or just run `npm run verify`

## Enforcement query
Use this query for quick manual validation:

```bash
rg -n "'room\\.|'game\\.|'turn\\.|'player\\.|'kickPlayer|client:game|code === '[A-Z_]+'" app server/src lib
```

Expected result: only `lib/contracts/socket.ts` plus intentional non-contract socket.io internals (`connection`, `disconnect`, `connect_error`).
