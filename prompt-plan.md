Task: Add “expand window” overlay gating for desktop-first Backtrack UI (plan → then code)

Context:
Backtrack is intentionally desktop/laptop full-window only. We do NOT want to support narrow browser widths or near-square aspect ratios. When the viewport is too narrow, we should show a blocking overlay telling the user to expand their window (or go full screen). When the viewport meets requirements, the overlay disappears.

Acceptance criteria:
1) The app continuously evaluates viewport size on initial load and on resize/orientation change.
2) Show the overlay when either condition is true:
   - window.innerWidth < 1200
   - (window.innerWidth / window.innerHeight) < 1.4
3) Overlay must:
   - cover the app (blocking interaction)
   - be centered with concise copy:
     Title: “Please expand your window”
     Body: “Backtrack works best in a wide, full-screen window.”
   - optionally include a single “Try again” button that just re-checks (not required if resize listener works reliably)
4) The overlay must be accessible:
   - role="dialog", aria-modal="true"
   - focus is moved to the dialog when it appears; Esc does NOT dismiss (because it is a gating requirement)
5) Implementation should be clean and reusable:
   - Create a small hook/component (e.g., useViewportGate / ViewportGate) that returns `isBlocked` and renders the overlay.
   - No heavy dependencies; use existing UI primitives if we already have them.
6) Ensure no hydration issues in Next.js:
   - Only access `window` in effects or client components.
   - Avoid layout shift if possible.

IMPORTANT PROCESS:
1) First outline your plan in bullet points (files you’ll touch, approach, edge cases).
2) Then implement with minimal, high-quality code changes.

Repo notes:
- This is a Next.js + TypeScript app.
- Prefer placing shared UI in /components and hooks in /lib or /hooks, matching the repo’s conventions.
- If there is already a modal/dialog component, use it; otherwise implement a simple overlay div.

Please use the same styling/component for your overlay as what was used in @app/host/[roomCode]/game/page.tsx when the game is paused.