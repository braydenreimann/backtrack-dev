# Backtrack Controller UI Specification (Model B+)

## 0. Purpose and constraints
- Phone acts as a **controller**, not the primary destination.
- The **host screen** is the definitive timeline and updates in real time as the active player interacts.
- The active player places **one mystery card per turn** into their personal timeline (up to 10 cards) within a **40‑second timer**.
- Controller UI must be **fast, low‑friction, one‑handed**, and robust on mobile browsers.

---

## 1. Layout and regions

### 1.1 Screen regions (top → bottom)
1. **Header**
   - Left: Backtrack wordmark.
   - Center: timer pill (e.g., `38s`).
2. **Timeline area (interactive)**
   - Horizontally scrollable strip containing timeline cards plus an end placeholder.
   - Vertical scroll locked while interacting with this strip.
3. **Hand / Active card area**
   - Centered **mystery card**, visually larger than timeline cards when unplaced.
4. **Action area**
   - Displays **Reveal** button only after mystery card placement.
   - Reveal sits in the **lower third** of the screen when present.

---

## 2. Timeline presentation

### 2.1 Timeline card appearance (controller)
- Default (phones): **year only** displayed on timeline cards.
- Larger screens (tablet / laptop controllers): may show **full metadata** (year, title, artist) when space allows.

### 2.2 Color system
- Controller card colors **match host timeline colors** for parity and reduced cognitive translation.
- Use a cohesive palette; colors are identity cues, not gameplay signals.

### 2.3 Timeline scroll behavior
- Timeline is **horizontally scrollable** with momentum.
- Vertical scroll is locked while finger is within the timeline region.
- Supports 1–10 cards plus one placeholder (max 11 items).

---

## 3. Placement model (core interaction)

### 3.1 Primary rule
- **Tap a timeline card to place the mystery card immediately before it.**

### 3.2 End‑of‑timeline placement (edge case)
- A **placeholder card** is always rendered after the last timeline card.
- Tapping the placeholder places the mystery card **at the end** of the timeline.

**Placeholder requirements**
- Same size as timeline cards.
- Neutral / greyed styling (e.g., low‑contrast fill or dashed outline).
- Behaves like a normal card target (tappable).

### 3.3 Placement feedback
- Mystery card animates into position with a quick snap/slide.
- Timeline auto‑scrolls as needed to keep the placed card visible.
- Host screen receives placement events immediately.

---

## 4. Repositioning model (explicit removal required)

### 4.1 Rule
- After placement, the mystery card **cannot be directly moved**.
- To reposition:
  1. **Tap the placed card to remove it**.
  2. Tap a new target card (or placeholder) to place again.

### 4.2 Remove behavior
- Removing the card returns it to the hand (large mystery card state).
- Host screen receives a removal event immediately.

### 4.3 Visual affordances
- The placed card should have a subtle **“this is yours”** affordance (border, glow, or badge).
- When Reveal is visible, removal remains possible but visually secondary.

---

## 5. Reveal model (two‑step ritual)

### 5.1 Reveal button visibility and placement
- **Reveal is hidden** until the mystery card is placed.
- After placement, Reveal appears:
  - Centered horizontally
  - In the **lower third** of the screen
  - As the primary CTA

### 5.2 Reveal action
- One‑tap **Reveal** triggers:
  - Flip/reveal animation on controller and host (synchronized)
  - Audio playback sequence per host rules (preview or full track)
  - Lock‑in of placement for scoring

### 5.3 Timer behavior
- Timer runs continuously.
- At 0 seconds:
  - If placed but unrevealed → **auto‑reveal**
  - If unplaced → **auto‑place at end (placeholder) + auto‑reveal** (recommended for MVP)

---

## 6. Copy and onboarding

### 6.1 Helper text strategy
- Helper text is **temporary onboarding scaffolding**.
- Contextual display:
  - Pre‑placement: “Tap where your card belongs in the timeline.”
  - Post‑placement: “Tap your card to remove it.”
- Permanently hide helper text for a player after their **first successful Reveal** (or after 1–2 turns).

### 6.2 Copy guidelines
- Prefer timeline‑grounded language over system language.
- Keep copy minimal; omit entirely in steady‑state play.

---

## 7. Events sent to host (real‑time observability)

The controller emits events immediately:
- `PLACEMENT_PREVIEW` (card ID or placeholder index)
- `PLACEMENT_REMOVED`
- `REVEAL_TRIGGERED`
- `AUTO_REVEAL_TRIGGERED`

Placement and removal are treated as **preview state** until reveal.

---

## 8. Accessibility and robustness

### 8.1 Tap targets
- Timeline cards and placeholder meet minimum comfortable tap size (~44px).
- No reliance on hidden hit zones or gap tapping.

### 8.2 Error prevention
- No double‑tap or long‑press gestures for core actions.
- No confirmation dialogs for Reveal.

### 8.3 Performance
- Placement and scroll animations must feel instant.
- Use transforms for animations to avoid layout thrash.

---

## 9. State model (summary)

**S0 — Unplaced**
- Mystery card in hand (large)
- Timeline targets active
- Reveal hidden

**S1 — Placed (unrevealed)**
- Mystery card in timeline (marked as yours)
- Reveal visible
- Card removable

**S2 — Revealed**
- Reveal animation and result
- Controller transitions to waiting/next‑turn state

---

## 10. Recommended additions

1. **End placeholder always visible**
   - Keeps the “end” concept consistent.
2. **Auto‑scroll on placement**
   - Ensures placed card remains in view.
3. **Clear ownership marker**
   - Makes removal discoverable without text.
4. **Tablet/laptop controller variant**
   - Same mechanics, richer metadata when space allows.
5. **Timer urgency treatment**
   - Subtle visual emphasis in final ~5 seconds.

