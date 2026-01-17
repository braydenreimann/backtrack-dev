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
1. DEAL — server selects next card and starts the turn timer
2. PLACE — active player may drag a mystery card into the timeline
3. LOCK — player may manually lock by holding for 1 second
4. TIMEOUT (implicit) - if timer expires:
  - no placement -> discard
  - placed -> auto-lock
4. REVEAL — server validates correctness and **always reveals song metadata**
5. NEXT — auto-advance to next player

### Turn timer (MVP)
- Each turn has a fixed countdown timer (e.g. 30 seconds for clip + 10 additional seconds to finalize decision)
- The timer starts at DEAL.
- When the timer expires:
  - If the mystery card has **not** been placed into the timeline:
    - The card is **discarded**.
  - If the mystery card **has** been placed into the timeline:
    - The server automatically treats the placement as **LOCK**.
    - Correctness is evaluated and metadata is revealed as normal.
  - Timer expiration triggers the same REVEAL semantics as manual lock.

### Rules
- On LOCK, **song metadata (title, artist, year) is always revealed**, regardless of correctness.
- Correct placement → card added to timeline.
- Incorrect placement → **song is revealed, then card is discarded**.
- Same-year placements are always considered correct.
- First player to reach **10 timeline cards** wins immediately.

### Visibility contract
- Phones never receive current-card metadata **before REVEAL**.
- On incorrect placement, reveal metadata for ~1.5-2.0 seconds, then discard the card.

### Player device requirement
- Player interactions (placement, locking) are designed exclusively for **phone-sized touch interfaces**.
- The `/play` route must reject non-mobile user agents with a clear message: "Please join from a phone."
- The server must also reject non-mobile `room.join` requests as a backstop (even if the UI is bypassed).
- Phone timeline UI is a **vertical line** optimized for touch drag-and-drop.

## Screen & Visibility Model (TV-first)

Backtrack is a **TV-first** party game. The shared host screen is the primary gameplay surface.

### Host screen (TV/laptop)
- Always shows:
  - Room code (until game start)
  - Player list with **names + current card count**
  - Whose turn it is
  - Turn timer
- During a player's turn, the host screen becomes focused on the **active player's timeline**:
  - The active player's timeline is displayed **large and centered**
  - Other players' info remains visible in a smaller "scoreboard" area
- On REVEAL (manual lock or timeout), the host screen reveals full metadata and correctness feedback.

### Phone screens (players)
- Phones are **controllers only**.
- Non-active players:
  - See a minimal waiting screen (e.g., “Watching host screen…” + whose turn + scores optional).
  - Do not see timelines or card details.
- Active player:
  - Sees only the **interaction UI** required to place the mystery card:
    - A vertical list representing their timeline structure and a mystery card row
    - No title/artist/year shown for the current card
  - This UI exists only to support placement + lock; primary viewing remains on host screen.

  ### Broadcasting rule (tentative placements)
- The server does **not** need to broadcast every drag-end placement to all clients.
- The server shall receive placement updates, and the **host screen shall reflect the active player’s tentative placement**.
- Most importantly: the host screen must show the final placement at LOCK/TIMEOUT and the REVEAL result.

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