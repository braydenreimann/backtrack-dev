# Operations and Deployment Notes

## Current Local Workflow

### Web app
- Path: `/Users/braydenreimann/Programming/repos/bt-mvp`
- Commands:
  - `npm run dev`
  - `npm run build`
  - `npm run start`

### Realtime server
- Path: `/Users/braydenreimann/Programming/repos/bt-mvp/server`
- Commands:
  - `npm run dev`
  - `npm run build`
  - `npm run start`

## Environment Variables

### Web (Next.js)
- `NEXT_PUBLIC_SOCKET_URL`
  - Required for deployed environments.
  - Should point to Fly realtime server URL, e.g. `https://rt.joinbacktrack.com`.

### Realtime server
- `PORT`
  - Defaults to `3001`.

## Deployment Model (Confirmed)
- Web app deploy target: Vercel.
- Realtime server deploy target: Fly.io.
- Result: split-origin architecture; explicit Socket URL config and CORS policy are mandatory.

## Closed-Beta Hardening Checklist
1. Replace server CORS wildcard with domain allowlist (`joinbacktrack.com`, preview domains as needed).
2. Validate required env vars at startup (web + server).
3. Keep realtime server as a single authoritative instance for MVP to avoid split in-memory room state.
4. Add health endpoint / readiness signal for server process supervision.
5. Log key lifecycle events (`room.create`, `game.start`, `turn.reveal`, `game.terminate`, `kickPlayer`).

## Testing and Verification
- Root checks:
  - `npm run test`
  - `npm run lint`
  - `npm run build`
- Server check:
  - `cd server && npm run build`

## Current Operational Risks
- In-memory room state means process restart ends all active rooms.
- No host-abandonment GC policy for stale rooms/sessions yet.
- Deck data loading currently depends on repo-relative filesystem assumptions.

## Recommended Next Ops Milestones
1. Add room/session TTL GC policy.
2. Make deck source path/provider explicit for server artifact deployment.
3. Add minimal monitoring/alerting for server uptime and event error rates.
