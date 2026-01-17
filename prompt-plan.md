# Backtrack MVP – Vibecoding Prompt Plan (Apple iTunes Search API Edition)

This document contains the **complete, ordered prompt sequence** and **acceptance criteria** for constructing the Backtrack MVP using ChatGPT in a controlled, iterative way.

**Important rules**
- Paste **one prompt at a time** into ChatGPT.
- Do not skip phases.
- Do not allow ChatGPT to generate code before the phase explicitly allows it.
- After each phase, verify acceptance criteria locally before proceeding.

---

## Global Instruction Block (paste once at the start)

### Prompt G0 — Non-negotiables
```txt
You are building an MVP for Backtrack.

Hard constraints:
- Stack: Next.js (TypeScript) single web app for host + phone + Node.js (TypeScript) Socket.IO realtime server.
- Local dev only: host laptop + phones on same LAN.
- In-memory room state only. No database. Static seed JSON deck.
- No Backtrack user accounts or auth.
- No Stripe, no R2, no telemetry.
- No late joins after game start.
- Host is not a player. Turn order computed at game.start and fixed.
- Active player places by dragging a “mystery card” row among existing timeline cards (drag end sends placement). Song metadata hidden until reveal.
- Player must hold “Lock” for 1 second. On lock: server recomputes correctness, **always reveals song metadata**, updates score immediately, then automatically deals the next player’s card.
- Win condition: first player to reach 10 timeline cards.
- Same-year ordering: any ordering within the same year is correct.

Client device constraints (MVP):
- The Host role is desktop/laptop only.
- The Player role is phone-only (mobile browsers).
- Desktop browsers must be prevented from joining as players.
- If a non-mobile device attempts to access /play:
  - Block the join
  - Display a clear message: "Please join from a phone."

Reveal rules:
- Song metadata (title, artist, year) is **always revealed on LOCK**, regardless of correctness.
- Incorrect placement reveals the song, then discards the card.

Reconnect rules:
- Host grace: 5 minutes; expiry closes the room.
- Active player disconnect pauses the game until reconnect within grace.
- Non-active disconnect may rejoin within grace; otherwise removed from turn order.

Kick rules:
- Host may kick in lobby or mid-game.
- If active player is kicked, reveal then discard their card and advance turn.
- Kicked players cannot rejoin.

Audio + metadata source (Apple iTunes Search API):
- Do NOT integrate Spotify in any way.
- On DEAL: the host client requests an iTunes Search API lookup:
  GET https://itunes.apple.com/search?term=<encoded "title artist">&entity=song&limit=1
- Use previewUrl for playback (HTMLAudioElement in the host browser only).
- Phones do NOT play audio.
- Phones do NOT receive title/artist/year for the current card until REVEAL.
- Host-only play/pause controls (optional for MVP; at minimum auto-play on deal).
- On next DEAL: stop/pause previous playback before starting the new preview.
- If previewUrl is missing or playback fails:
  - Do NOT block game progression.
  - Display a clear host UI warning and proceed.

Process rules:
- Do NOT write code until explicitly instructed.
- First propose architecture, state, events, and phase machine.
- After each coding phase, output:
  (1) how to run
  (2) what to click
  (3) what to verify
```

Acceptance:
- Assistant acknowledges constraints.
- Assistant commits to iTunes Search API lookup + host-browser playback.
- Assistant commits that metadata is always revealed on lock.

---

## Phase 0 — Architecture & Contracts (NO CODE)

### Prompt 0.1 — Architecture proposal
```txt
Before writing any code:

1. Propose a minimal text-based architecture diagram (host / phone / server / iTunes Search API).
2. Define the room state model: phases, players, timelines, turn order, placement, reconnect timers.
3. Define the full event catalog (client → server and server → client), including who may emit each event.
4. Define the phase/state machine, including DEAL → PLACE → LOCK/REVEAL → NEXT.
5. Explicitly describe REVEAL semantics for both correct and incorrect placements.

Do NOT generate code.
```

Acceptance:
- Clear authority boundaries.
- Explicit note that phones never receive song metadata before REVEAL.
- Explicit note that metadata is revealed even on incorrect placement.
- Fixed turn order defined at game.start.

---

## Phase 1 — Realtime Server Skeleton

### Prompt 1.1 — Server scaffold
```txt
Implement the Socket.IO server (TypeScript) with:

- room.create (host) → returns roomCode + hostSessionToken
- room.join (player) → returns playerId + playerSessionToken (lobby only)
- host.resume / player.resume using stored session tokens (silent rejoin)
- room state snapshot emission on join/resume
- kickPlayer (host-only)
- leave handling
- deterministic 6-character alphanumeric room codes
- in-memory room map
- mutation sequence counter (seq)
- Socket.IO acks: { ok: true } or { ok: false, code, message }

Do NOT implement gameplay yet.
Do NOT implement iTunes lookup yet.
```

Acceptance:
- Host refresh resumes host role.
- Player refresh resumes silently.
- Kicked players cannot rejoin.
- Room state snapshots include seq.

---

## Phase 2 — Minimal Host & Phone UI (Connectivity Only)

### Prompt 2.1 — Basic UI wiring
```txt
Implement minimal Next.js pages:

- /host: create room → redirect to /host/[roomCode]
- /play: enter room code + name → redirect to /play/[roomCode]
- /host/[roomCode]: room code + player list + kick buttons
- /play/[roomCode]: joined status + waiting state

Wire Socket.IO join/resume flows.
No gameplay yet.
No audio yet.
```

Acceptance:
- Player list updates live on host.
- Kick immediately removes player on all screens.
- Refresh preserves identity.
- Desktop browsers cannot join via /play.
- Non-mobile devices attemping to join as players see a clear rejection message.
- Mobile browsers can join successfully as players.

---

## Phase 3 — Gameplay State Machine

### Prompt 3.1 — Core gameplay
```txt
Implement gameplay logic in the server:

- game.start (host-only, lobby-only)
- Compute fixed turn order (host excluded)
- Shared deck (static seed JSON, no repeats)
- DEAL → PLACE → LOCK → REVEAL → NEXT
- On LOCK:
  - Server validates correctness
  - Server **always emits a REVEAL event with full metadata**
  - Apply success or failure outcome
- Correct: add card to timeline
- Incorrect: discard card after reveal
- Auto-advance to next turn
- Win at 10 timeline cards → end game
```

Acceptance:
- Metadata is revealed on both success and failure.
- Incorrect cards are visible briefly before discard.
- Phones never receive metadata pre-reveal.

---

## Phase 4 — Placement UX & Timeline Visualization

### Prompt 4.1 — Placement UI
```txt
Implement phone placement UI:

- Show existing timeline rows (revealed cards show Year · Title · Artist)
- Add one “mystery card” row (no metadata)
- Drag-and-drop reordering
- On drag end, send placement to server
- 1-second hold-to-lock button with progress fill
- Non-active players see waiting state

Implement host timeline visualization:

- Always render timeline in ascending chronological order
- During PLACE, reflect tentative placement after drag end
- On reveal, show correctness feedback and updated scores
```

Acceptance:
- Phones never see metadata pre-reveal.
- Tentative placement appears live on host.
- Lock requires uninterrupted 1-second hold.
- Reveal updates scores immediately.

---

## Phase 5 — iTunes Search API Lookup + Host Playback

### Prompt 5.1 — iTunes lookup + playback integration
```txt
Integrate iTunes Search API playback with gameplay (host-only):

- When the server enters DEAL and emits the “dealt” event:
  - The host client performs an iTunes Search API lookup using:
    query = `${title} ${artist}`
    GET https://itunes.apple.com/search?term=<encoded>&entity=song&limit=1
  - If a result exists and has previewUrl:
    - Set host Audio().src = previewUrl
    - Attempt autoplay
    - If autoplay blocked, show a “Tap to Play Preview” button on host
  - If no previewUrl or lookup fails:
    - Show “Preview unavailable — continue without audio”
    - Do NOT block the turn

Playback behavior:
- Host-only playback (phones never play audio).
- On each new DEAL:
  - Pause/stop the previous preview before starting the next.
- Optional (nice-to-have):
  - Host play/pause button that only affects host playback.

Implementation constraint:
- Do NOT call iTunes Search API from the server. Host client only.
- Do NOT persist previewUrl beyond the current deal (ephemeral is fine).
```

Acceptance:
- Playback starts (or offers tap-to-play) immediately on deal when previewUrl exists.
- Metadata remains hidden until reveal (phones and non-host views).
- Missing previewUrl does not block gameplay.
- On next deal, previous audio stops.

---

## Final MVP Acceptance Script

Run end-to-end:

1. Host creates room.
2. Players join; host kicks one.
3. Host starts game; no late joins allowed.
4. Deal → host attempts iTunes preview playback → active player places blindly.
5. Drag updates host view.
6. Lock → reveal → score update → next deal.
7. Disconnect/reconnect scenarios behave correctly.
8. First to 10 cards wins immediately.
9. Host creates a new room and plays again without restarting server.

If all steps pass, the MVP is complete.