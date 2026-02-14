# Split-Deploy Environment Contract

## Purpose
Define required runtime environment behavior for Vercel web + Fly realtime split deployment.

## Web Runtime Contract

### Required in deployed web environments
- `NEXT_PUBLIC_SOCKET_URL`
  - Must point to the Fly realtime server origin.
  - Enforced at startup in:
    - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/env/web-env.ts`
    - `/Users/braydenreimann/Programming/repos/bt-mvp/app/layout.tsx`

### Local/dev fallback
- When `NEXT_PUBLIC_SOCKET_URL` is unset, local-like hosts fallback to `http(s)://<hostname>:3001`.
- Implemented in:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/socket.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/env/web-env.ts`

## Server Runtime Contract

### Required in production/deployed server environments
- `CORS_ORIGINS`
  - Comma-separated allowlist of web origins.
  - Enforced at startup in:
    - `/Users/braydenreimann/Programming/repos/bt-mvp/server/src/config/env.ts`

### Optional
- `PORT` (default `3001`)
- `BACKTRACK_DECK_PATH` (deck override path)

## Ownership Boundaries
- Env parsing/validation belongs in dedicated config modules.
- Socket/domain modules consume validated config; they do not parse env directly.
