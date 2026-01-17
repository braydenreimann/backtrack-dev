# Backtrack MVP Context

- MVP is local-dev only.
- Single Next.js app with host and phone routes.
- Node.js + Socket.IO authoritative server.
- No timers, no persistence, no scaling.
- Spotify Connect is required (no preview playback).
- Seed deck is a static JSON file with:
  - songId (Spotify track ID or URI)
  - title
  - artist
  - year