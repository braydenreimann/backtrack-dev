# Backtrack MVP

## Current flow (real game)
- Host: `/host` -> create room -> `/host/:roomCode/lobby` -> start -> `/host/:roomCode/game`.
- Player: `/play` -> join -> `/play/:roomCode` -> wait in lobby -> play turns.

## Local dev
1) Install web deps: `npm install`
2) Start web app: `npm run dev` (http://localhost:3000)
3) Start server (for real game flow): `cd server && npm install && npm run dev`

Notes:
- The web app connects to `http://localhost:3001` by default via `NEXT_PUBLIC_SOCKET_URL`.
- You can skip the server entirely when using mock mode (below).

## Manual UI testing (mock mode)
Mock mode bypasses sockets and phone checks and renders using fixtures.

Examples:
- Host lobby: `http://localhost:3000/host/ABC123/lobby?mock=1`
- Host game: `http://localhost:3000/host/ABC123/game?mock=1`
- Play room: `http://localhost:3000/play/ABC123?mock=1`
- UI index (all mock links): `http://localhost:3000/ui`

State variants (use `state` query param):
- Host lobby: `state=empty`, `state=error`
- Host game: `state=waiting`, `state=reveal`, `state=full`
- Play room: `state=watch`, `state=reveal`

Example with variant:
`http://localhost:3000/host/ABC123/game?mock=1&state=reveal`

## Editing / extending test data
Mock data lives in `lib/fixtures.ts`.

Quick tweaks:
- Change base players in `basePlayers`.
- Update timelines in `timelineA`, `timelineB`, `timelineC`.
- Adjust active turn data in `getMockHostGameState` or `getMockPlayRoomState`.

Add a new UI state:
1) Add a new `if` branch in the relevant getter (`getMockHostLobbyState`, `getMockHostGameState`, `getMockPlayRoomState`).
2) Return a new mock state shape.
3) Visit the page with `?mock=1&state=<your-state>`.

Notes:
- `state` is normalized to lowercase and trimmed.
- The room code comes from the URL; change it in the path to test different codes.
- Mock player name/id come from `localStorage` if present; clear `bt:playerName` / `bt:playerId` in DevTools if you want to reset them.
