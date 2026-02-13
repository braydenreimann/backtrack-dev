# Socket Contract Reference

## Purpose
This document captures the current Socket.IO API surface as implemented.

## Ack Envelope
All ack callbacks use:
- Success: `{ ok: true, ...data }`
- Error: `{ ok: false, code: string, message: string }`

## Client -> Server Events

### Session and room
- `room.create` (host)
  - Payload: `{}`
  - Ack success: `{ roomCode, hostSessionToken }`
- `room.join` (player)
  - Payload: `{ roomCode, name }`
  - Ack success: `{ playerId, playerSessionToken }`
- `host.resume`
  - Payload: `{ hostSessionToken }`
  - Ack success: `{ roomCode }`
- `player.resume`
  - Payload: `{ playerSessionToken }`
  - Ack success: `{ roomCode, playerId }`
- `room.leave` (player)
  - Payload: `{}`
- `room.delete` (host)
  - Payload: `{}`

### Game control
- `game.start` (host)
  - Payload: `{}`
- `game.terminate` (host)
  - Payload: `{ reason?: string }`
- `client:game.pause` (host)
  - Payload: `{ roomCode }`
- `client:game.resume` (host)
  - Payload: `{ roomCode }`

### Turn intents
- `turn.place` (active player)
  - Payload: `{ placementIndex }`
- `turn.remove` (active player)
  - Payload: `{}`
- `turn.reveal` (active player)
  - Payload: `{}`
- `turn.lock` (alias of reveal path)
  - Payload: `{}`

### Player moderation
- `kickPlayer` (host)
  - Payload: `{ playerId }`

## Server -> Client Events

### Room/session state
- `room.snapshot`
  - Includes: `{ code, seq, phase, activePlayerId, turnNumber, turnExpiresAt, isPaused, pausedTurnRemainingMs, host, players }`
- `room.closed`
  - Payload: `{ reason }`
- `game.terminated`
  - Payload: `{ roomCode, reason, terminatedAt }`

### Game lifecycle
- `game.started`
  - Payload: `{ turnOrder, activePlayerId, turnNumber, timelines }`
- `game.ended`
  - Payload: `{ winnerId?, reason }`

### Turn lifecycle
- `turn.dealt`
  - Payload: `{ activePlayerId, turnNumber, expiresAt }`
- `turn.dealt.host`
  - Payload: `{ activePlayerId, turnNumber, card, timelines }`
- `turn.dealt.player`
  - Payload: `{ activePlayerId, turnNumber, timeline }`
- `turn.placed`
  - Payload: `{ playerId, placementIndex }`
- `turn.removed`
  - Payload: `{ playerId }`
- `turn.reveal`
  - Payload: `{ playerId, card, correct, placementIndex, timeline, scores, reason }`

### Moderation
- `player.kicked`
  - Payload: `{ playerId }`

## Server Error Codes (Current)
- `ALREADY_PAUSED`
- `FORBIDDEN`
- `GAME_PAUSED`
- `INVALID_PAYLOAD`
- `INVALID_PHASE`
- `INVALID_PLACEMENT`
- `NON_MOBILE_DEVICE`
- `NOT_ACTIVE_PLAYER`
- `NOT_ENOUGH_PLAYERS`
- `NOT_IN_ROOM`
- `NOT_PAUSED`
- `NO_PLACEMENT`
- `PLAYER_NOT_FOUND`
- `ROOM_CODE_EXHAUSTED`
- `ROOM_LOCKED`
- `ROOM_MISMATCH`
- `ROOM_NOT_FOUND`
- `ROOM_TERMINATED`
- `SESSION_NOT_FOUND`
- `TOKEN_REQUIRED`

## Contract Notes
- Current naming is mixed (`client:*` exists, but `kickPlayer`, `turn.reveal`, `game.start` are legacy-style names).
- Clients currently handle a `KICKED` ack path on resume, but server does not emit `code: 'KICKED'` today.
- Treat this document as implementation truth until a normalized contract module is introduced.
