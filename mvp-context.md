# Backtrack MVP Context (Apple iTunes Search API)

This document defines the **current MVP assumptions and constraints** for Backtrack.  
It supersedes any earlier Spotify-based MVP context.

---

## Core Scope

- MVP is **local-dev only**.
- Single **Next.js (TypeScript)** web app with:
  - **Host routes** (laptop / TV screen)
  - **Phone routes** (players as controllers)
- **Node.js + Socket.IO (TypeScript)** authoritative realtime server.
- All clients on the **same LAN**.
- **In-memory state only**.
- No persistence, no accounts, no scaling, no production concerns.

### Client roles and device constrains (MVP)
- Client roles are **Host** and **Player**
- For the MVP, device constraints are enforced:
  - **Host** must use a desktop or laptop browser.
  - **Players** ust join from phones (mobile browsers)**.
  - Desktop browsers are **not allowed** to join as players.
  - This restriction exists to simplify UX and interaction design for the MVP.

---


## Explicit Non-Goals (MVP)

- No timers beyond basic turn flow (no global countdown enforcement).
- No database.
- No user authentication.
- No payments, telemetry, analytics, or cloud storage.
- No matchmaking or late joins.
- No mobile app build (web only).

---

## Audio & Music Model

- **Spotify is NOT used**.
- **Spotify Connect is NOT required**.
- No OAuth of any kind.

### Playback source
- Music previews are sourced via the **Apple iTunes Search API**.
- Lookup happens **client-side on the host only**:
  ```
  GET https://itunes.apple.com/search
    ?term=<encoded "title artist">
    &entity=song
    &limit=1
  ```

### Playback behavior
- Use `previewUrl` (≈30 seconds) when available.
- Playback uses `HTMLAudioElement` in the **host browser only**.
- Phones **never play audio**.
- Phones **never receive song metadata** for the current card before reveal.
- On each DEAL:
  - Stop/pause any previous preview.
  - Attempt to autoplay the new preview.
- If autoplay is blocked or `previewUrl` is missing:
  - Show a host warning (“Preview unavailable — continue without audio”).
  - Gameplay **continues without blocking**.

---

## Gameplay Model

- Host is **not a player**.
- Turn order is computed once at `game.start` and is fixed.
- No late joins after game start.

### Turn flow
1. DEAL — server selects next card
2. PLACE — active player drags a mystery card into the timeline
3. LOCK — player holds lock for 1 second
4. REVEAL — server validates correctness and **always reveals song metadata**
5. NEXT — auto-advance to next player

### Rules
- On LOCK, **song metadata (title, artist, year) is always revealed**, regardless of correctness.
- Correct placement → card added to timeline.
- Incorrect placement → **song is revealed, then card is discarded**.
- Same-year placements are always considered correct.
- First player to reach **10 timeline cards** wins immediately.

### Visibility contract
- Phones never receive current-card metadata **before REVEAL**.
- Once REVEAL occurs, metadata is broadcast to **all clients**, even on incorrect placement.

### Player device requirement
- Player interactions (placement, locking) are designed exclusively for **phone-sized touch interfaces**.
- The `/play` route must reject non-mobile user agents with a clear message: "Please join from a phone."

---

## Seed Deck Format

- Deck is a **static JSON file** (`cards.json`).
- No external IDs are required.

### Card schema
```json
{
  "title": "Song Title",
  "artist": "Artist Name",
  "year": 1953
}
```

### Notes
- `songId`, Spotify URIs, and Apple IDs are intentionally **not stored**.
- iTunes Search results are resolved **ephemerally per deal**.
- Deck order is shuffled per game.
- No repeats within a single game.

---

## Reconnect & Kick Semantics

### Reconnect
- Host grace period: **5 minutes** (room closes after expiry).
- Active player disconnect:
  - Game pauses until reconnect or grace expiry.
- Non-active player disconnect:
  - May rejoin within grace.
  - Otherwise removed from turn order.

### Kick
- Host may kick players in lobby or mid-game.
- If the active player is kicked:
  - Their card is revealed, then discarded.
  - Turn advances immediately.
- Kicked players cannot rejoin.

---

## Validation Goal of the MVP

This MVP exists to validate:
- The **party-game feel** of Backtrack.
- Whether **30-second preview clips** are sufficient for confident chronological placement.
- Whether host-screen + phones-as-controllers is compelling.
- Core UX, pacing, and social interaction — **not** infrastructure or licensing strategy.

If this document holds true, the MVP is considered correctly scoped.