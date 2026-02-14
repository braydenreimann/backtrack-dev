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
- `CORS_ORIGINS`
  - Required in production/deployed server environments.
  - Comma-separated origin allowlist, e.g. `https://joinbacktrack.com,https://bt-mvp.vercel.app`.
- `BACKTRACK_DECK_PATH`
  - Optional override for deck file location.
  - If unset, server loads `/server/data/cards.json` relative to the server package root.
- `BACKTRACK_TELEMETRY`
  - Optional runtime telemetry toggle.
  - `1` enables structured transition logs, `0` disables.

### Advanced runtime tuning (optional)
- `BACKTRACK_TURN_DURATION_MS`
  - Override turn timer duration (primarily useful for integration testing).
- `BACKTRACK_REVEAL_DURATION_MS`
  - Override reveal phase duration (primarily useful for integration testing).
- `BACKTRACK_WIN_CARD_COUNT`
  - Override win threshold card count.

## Deployment Model (Confirmed)
- Web app deploy target: Vercel.
- Realtime server deploy target: Fly.io.
- Result: split-origin architecture; explicit Socket URL config and CORS policy are mandatory.
- Web startup validation enforces `NEXT_PUBLIC_SOCKET_URL` on Vercel deploys.
- Server startup validation enforces `CORS_ORIGINS` on production/Fly deploys.

## Closed-Beta Hardening Checklist
1. Keep `CORS_ORIGINS` aligned with active Vercel domains and production hostnames.
2. Keep `NEXT_PUBLIC_SOCKET_URL` pointed at the Fly realtime origin.
3. Keep realtime server as a single authoritative instance for MVP to avoid split in-memory room state.
4. Add health endpoint / readiness signal for server process supervision.
5. Route structured telemetry logs into monitoring/alerting pipeline.

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

## Recommended Next Ops Milestones
1. Add room/session TTL GC policy.
2. Add health endpoint and readiness/liveness checks for server runtime.
3. Add minimal monitoring/alerting for server uptime and event error rates.
