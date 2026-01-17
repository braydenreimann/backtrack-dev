# Backtrack MVP – Vibecoding Prompt Plan

This document contains the **complete, ordered prompt sequence** and **acceptance criteria** for constructing the Backtrack MVP using ChatGPT in a controlled, iterative way.

**Important rules**
- Paste **one prompt at a time** into ChatGPT.
- Do not skip phases.
- Do not allow ChatGPT to generate code before the phase explicitly allows it.
- After each phase, verify acceptance criteria locally before proceeding.

---

## Global Instruction Block (paste once at the start)

### Prompt G0 — Non‑negotiables
```
You are building an MVP for Backtrack.

Hard constraints:
- Stack: Next.js (TypeScript) single web app for host + phone + Node.js (TypeScript) Socket.IO realtime server.
- Local dev only: host laptop + phones on same LAN.
- In-memory room state only. No database. Static seed JSON deck.
- No Backtrack user accounts or auth. Only Spotify OAuth for the host.
- No Stripe, no R2, no telemetry.
- No late joins after game start.
- Host is not a player. Turn order computed at game.start and fixed.
- Active player places by dragging a “mystery card” row among existing timeline cards (drag end sends placement). Song metadata hidden until reveal.
- Player must hold “Lock” for 1 second. On lock: server recomputes correctness, reveals immediately, updates score immediately, then automatically deals the next player’s card.
- Win condition: first player to reach 10 timeline cards. Incorrect placement discards the card.
- Same-year ordering: any ordering within the same year is correct.
- Reconnect rules:
  - Host grace: 5 minutes; expiry closes the room.
  - Active player disconnect pauses the game until reconnect within grace.
  - Non-active disconnect may rejoin within grace; otherwise removed from turn order.
- Kick rules:
  - Host may kick in lobby or mid-game.
  - If active player is kicked, discard their card and advance turn.
  - Kicked players cannot rejoin.
- Spotify integration:
  - Host logs in via Spotify OAuth.
  - Tokens stored in a lightweight local file store.
  - Playback authority is the host’s Spotify account.
  - Auto-pick currently active device.
  - If no active device: show “Open Spotify on any device and press Retry.”
- Playback behavior:
  - As soon as a card is dealt, trigger Spotify playback for that track.
  - Host-only play/pause controls.
  - When next card is dealt, pause the previous track.

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
- Assistant commits to using Spotify **track URIs** (`spotify:track:...`) via the Web API.

---

## Phase 0 — Architecture & Contracts (NO CODE)

### Prompt 0.1 — Architecture proposal
```
Before writing any code:

1. Propose a minimal text-based architecture diagram (host / phone / server / Spotify).
2. Define the room state model: phases, players, timelines, turn order, placement, reconnect timers.
3. Define the full event catalog (client → server and server → client), including who may emit each event.
4. Define the phase/state machine, including DEAL → PLACE → LOCK/REVEAL → NEXT.

Do NOT generate code.
```

Acceptance:
- Clear authority boundaries (server authoritative for correctness and phase).
- Explicit note that phones never receive song metadata before reveal.
- Fixed turn order defined at game.start.
- Reconnect and kick semantics explicitly listed.

---

## Phase 1 — Realtime Server Skeleton

### Prompt 1.1 — Server scaffold
```
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
```

Acceptance:
- Host refresh resumes host role.
- Player refresh resumes silently.
- Kicked players cannot rejoin.
- Room state snapshots include seq.

---

## Phase 2 — Minimal Host & Phone UI (Connectivity Only)

### Prompt 2.1 — Basic UI wiring
```
Implement minimal Next.js pages:

- /host: create room → redirect to /host/[roomCode]
- /play: enter room code + name → redirect to /play/[roomCode]
- /host/[roomCode]: room code + player list + kick buttons
- /play/[roomCode]: joined status + waiting state

Wire Socket.IO join/resume flows.
No gameplay yet.
```

Acceptance:
- Player list updates live on host.
- Kick immediately removes player on all screens.
- Refresh preserves identity.

---

## Phase 3 — Gameplay State Machine (No Spotify)

### Prompt 3.1 — Core gameplay
```
Implement gameplay logic in the server:

- game.start (host-only, lobby-only)
- Compute fixed turn order (host excluded)
- Shared deck (static seed JSON, no repeats)
- DEAL: select next card, enter PLACE
- PLACE: active player submits placement on drag end
- LOCK: active player locks → server recomputes correctness
- Immediate reveal + score update
- Correct: add card to timeline; Incorrect: discard card
- Auto-advance to next turn and DEAL
- Win at 10 timeline cards → end game

Implement disconnect, reconnect, and kick rules exactly as specified.
```

Acceptance:
- Only active player may place/lock.
- Late joins rejected.
- Same-year placements treated as correct.
- Active disconnect pauses game; reconnect resumes.
- Host disconnect grace closes room.

---

## Phase 4 — Placement UX & Timeline Visualization

### Prompt 4.1 — Placement UI
```
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

## Phase 5 — Spotify OAuth & Playback

### Prompt 5.1 — Spotify OAuth
```
Implement Spotify OAuth (Authorization Code flow) for the host:

- Request broad playback scopes
- Store access + refresh tokens in a lightweight local file store
- Reuse tokens across sessions
- Detect active device automatically
- If no device: show “Open Spotify on any device and press Retry”
```

Acceptance:
- Host authenticates once and reuses session.
- No device state is handled gracefully.

---

### Prompt 5.2 — Playback integration
```
Integrate Spotify playback with gameplay:

- On DEAL: trigger Spotify Start/Resume Playback with track URI
- Use uris: ["spotify:track:..."]
- Host-only play/pause controls
- On next DEAL: pause previous playback
- If playback fails: pause game progression and show error state
```

Acceptance:
- Playback starts immediately on deal.
- Metadata remains hidden until reveal.
- Playback errors block progression.

---

## Final MVP Acceptance Script

Run end-to-end:

1. Host creates room and connects Spotify.
2. Players join; host kicks one.
3. Host starts game; no late joins allowed.
4. Deal → music plays → active player places blindly.
5. Drag updates host view.
6. Lock → reveal → score update → next deal.
7. Disconnect/reconnect scenarios behave correctly.
8. First to 10 cards wins immediately.
9. Host creates a new room and plays again without restarting server.

If all steps pass, the MVP is complete.