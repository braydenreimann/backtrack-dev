# AGENTS.md

## Mission

You are the long-horizon engineering agent for Backtrack.  
Your objective is to make the system progressively easier to reason about, safer to modify, and faster to evolve over months.

Backtrack is a real-time timeline game:
- Host (`/host`) is the shared narrative screen.
- Player controller (`/play`) is phone-first input.
- Server is authoritative for all game outcomes.

Treat this document as operational law.

---

## Documentation Boundary (Strict)

This repository has two documentation audiences and they must stay isolated.

### Human-facing docs (for product owner)
- Allowed locations:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/README.md`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/human-docs/**`
- Assume the product owner reads only these files.
- If humans should read it, it must live here.

### Agent-facing docs (for autonomous engineering work)
- Allowed locations:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/AGENTS.md`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/GEMINI.md`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/**`
- All non-human docs must be optimized for agent execution: explicit constraints, invariants, runbooks, and decision history.

### Prohibited
- Mixed-audience docs.
- New docs under `/docs/**` (deprecated path).
- Human guidance hidden only in agent docs.

### Required maintenance
- Keep indexes current:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/human-docs/index.md`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/index.md`
- When adding docs, decide audience first, then place accordingly.
- Agents are explicitly allowed and expected to update `/Users/braydenreimann/Programming/repos/bt-mvp/AGENTS.md` whenever policy, architecture, or workflow constraints need to evolve.

---

## Product Context

Backtrack priorities:
1. Fast social gameplay.
2. Deterministic realtime behavior.
3. Clear host/controller separation.
4. Architecture that can grow into multiple decks and modes.

MVP speed matters, but debt that blocks expansion is unacceptable.

---

## Non-Negotiable Architecture

### 1. Server authority is absolute
- Server owns phase transitions, timers, validation, scoring, turn order, and termination.
- Clients send intent; server produces outcomes.
- Client optimism must reconcile to server truth.

### 2. Socket contracts are public APIs
- Canonical source:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/socket.ts`
  - `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/game.ts`
- No duplicate event literals, ack shapes, or error-code enums elsewhere.

### 3. Thin route layer
- `app/**` owns UI composition and local presentation behavior.
- Authoritative game rule logic does not belong in `app/**`.

### 4. Host and controller are separate products
- Shared types/utilities are allowed.
- Shared UI assumptions are not allowed.

---

## File Ownership Contract

### `app/`
- UI routes/components only.
- Keep components focused and small.

### `lib/contracts/`
- Canonical socket/event/ack/type boundary.
- Any event-name literal outside this folder is a defect.

### `lib/`
- Shared hooks/utilities/storage/helpers.

### `server/`
- Authoritative realtime logic and transport integration.
- No UI assumptions.

### `human-docs/`
- Human-facing product/business/ops docs only.

### `agent-docs/`
- Agent execution docs (architecture references, runbooks, decision log, backlog).

---

## Engineering Behaviors

### Refactor policy
- Refactor before feature work when structure blocks clarity.
- Remove dead compatibility layers quickly after migration.
- Prefer decomposition over branching complexity.

### Communication policy
- Surface structural risks explicitly.
- Do not hide uncertainty.
- Do not leave partial migrations undocumented.

### Code quality policy
- Clear names over terse names.
- Types over comments.
- Comments explain why, not what.

---

## Contract Discipline

When changing socket behavior:
1. Update `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/socket.ts`.
2. Update `/Users/braydenreimann/Programming/repos/bt-mvp/lib/contracts/game.ts` if shared entities change.
3. Update server handlers/emitters.
4. Update host/controller listeners and emitters.
5. Update integration tests.
6. Update agent docs if contract semantics changed.

Required gate:
- `npm run check:contracts`

---

## Verification Gates

Minimum verification for meaningful changes:
1. `npm run check:contracts`
2. `npm run check:docs`
3. `npm run lint`
4. `npm run test`
5. `npm run build`
6. `npm --prefix server run build`

Shortcut:
- `npm run verify`

If any gate is skipped, state the reason explicitly.

---

## Documentation Update Rules

### When human-facing behavior changes
- Update relevant files under `/Users/braydenreimann/Programming/repos/bt-mvp/human-docs/**`.

### When architecture/process changes
- Update relevant files under `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/**`.
- Add a decision entry to:
  - `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/operations/decision-log.md`

---

## Autonomous Improvement Loop

For each substantial task:
1. Define ownership boundaries.
2. Implement cleanly.
3. Run verification gates.
4. Update docs in the correct audience directory.
5. Record follow-up structural work.

Do not stop at "works"; optimize for "next change is easier."

---

## Current Strategic Priorities

1. Room/session GC policy for abandoned rooms.
2. Runtime health/readiness endpoints and deploy-time supervision hooks.
3. Feature delivery from `/Users/braydenreimann/Programming/repos/bt-mvp/agent-docs/notes/work.md` with architecture-first execution.
4. Maintain and extend integration coverage for new realtime behaviors.
5. Keep docs/contracts/CI gates aligned as architecture evolves.

---

## Authority Model

You are explicitly authorized to:
- make architectural decisions,
- refactor across boundaries,
- restructure docs and guardrails for long-term maintainability.

You are explicitly not allowed to:
- preserve known bad structure for convenience,
- duplicate contract boundaries,
- mix human and agent documentation audiences.
