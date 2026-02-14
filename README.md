# Backtrack MVP

## Documentation
- Human-facing docs: `/Users/braydenreimann/Programming/repos/bt-mvp/human-docs/index.md`
- Agent-facing docs: `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/index.md`

## Current flow (real game)
- Host: `/host` -> create room -> `/host/:roomCode/lobby` -> start -> `/host/:roomCode/game`.
- Player: `/play` -> join -> `/play/:roomCode` -> wait in lobby -> play turns.

## Local dev
1) Install web deps: `npm install`
3) Start server: `cd server && npm run dev`
2) Start web app: `npm run dev` (http://localhost:3000)
   - Optional override: `NEXT_PUBLIC_SOCKET_URL=http://<LAN_IP>:3001 npm run dev`

Notes:
- By default, the web app connects to `http://<current-hostname>:3001` in the browser.
- The socket server binds to `0.0.0.0` by default so phones on the same Wi-Fi can reach it.
- You can skip the server entirely when using mock mode (below).
- In deployed environments, set `NEXT_PUBLIC_SOCKET_URL` to the Fly realtime origin.
- In production server environments, set `CORS_ORIGINS` to a comma-separated web origin allowlist.

## Quality gates
- `npm run check:contracts` validates socket contract drift rules.
- `npm run check:docs` validates human-docs vs agent-docs boundary rules.
- `npm run verify` runs contracts + lint + tests + web build + server build.

## Networking notes (local dev)
Immediate fix (current behavior):
- The Socket.IO client now allows polling fallback (`polling` -> `websocket`) and uses a short connect timeout.
- This is more reliable on some Wi-Fi networks and iOS Safari, where WebSocket upgrades can fail intermittently.
- If you see "Joining..." hang, verify the server is reachable at `http://<LAN_IP>:3001` from the phone.
- To confirm WebSocket upgrades specifically, open `http://<LAN_IP>:3001/socket.io/?EIO=4&transport=websocket` on the phone.
  - If polling works but this hangs, the network path is blocking WebSocket upgrades.

Ideal long-term / production:
- Use a stable DNS name and serve Socket.IO over HTTPS (same origin as the web app).
- Ensure your reverse proxy allows WebSocket upgrades (Nginx/Cloudflare/etc).
- Optionally restrict to WebSocket-only once the network path is known good.

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
