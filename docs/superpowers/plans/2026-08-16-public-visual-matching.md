# Public Visual Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public match filter surface into a full-screen visual matching state that shows live counts, the selected need summary, a rotating controller, and an exit action.

**Architecture:** Keep the user on the public landing page and reuse the existing match surface. Read selected filter buttons at submission time into DOM text, toggle a landing visual-state class, and animate the existing four-point polygon to a full-screen four-point polygon without API or store mutations.

**Tech Stack:** Vanilla JavaScript templates, CSS clip-path and keyframe animation, existing icon renderer, Playwright, Vitest, TypeScript.

## Global Constraints

- Do not navigate to `#/auth` or `#/matching` from the public visual flow.
- Do not call matching APIs or mutate `state.need`.
- Read counts from `state.match.pool` and `state.match.playing`; display zero honestly.
- Preserve all five selected groups: game, mode, time, team size, and voice.
- Expand both diagonal edges to full screen using a four-point polygon transition.
- Provide a visible exit action that restores the public homepage.
- Disable controller rotation for reduced-motion users.

---

### Task 1: Add failing visual-matching browser tests

**Files:**
- Modify: `tests/e2e/mvp-closure.spec.ts`

- [ ] Add a test that opens shake, changes at least two filter choices, submits, and asserts the URL is not an auth or matching route.
- [ ] Assert `[data-landing-visual-match]` is visible with pool, playing, and all selected summary values.
- [ ] Assert the landing root has `is-visual-matching` and the surface has the full-screen clip path.
- [ ] Assert “退出匹配” removes the state and restores the landing menu.
- [ ] Run the focused test and confirm it fails because submission still navigates to auth.

### Task 2: Add matching-state markup and DOM-only behavior

**Files:**
- Modify: `public/js/pages/landing.js`
- Modify: `public/js/app.js`
- Test: `tests/e2e/mvp-closure.spec.ts`

- [ ] Render a hidden visual-matching block inside the existing match surface.
- [ ] Render the existing gamepad icon, live pool count, live playing count, five summary slots, and exit button.
- [ ] Replace `landing-match-submit` navigation with selection collection and `is-visual-matching` state activation.
- [ ] Add `exit-landing-visual-match` to remove the matching state, close the match layer, and restore homepage visibility.
- [ ] Run the focused test and confirm DOM behavior passes.

### Task 3: Build the full-screen expansion and loop animation

**Files:**
- Modify: `public/styles/pages.css`
- Test: `tests/e2e/mvp-closure.spec.ts`

- [ ] Fade and letter-space the filter typography out before hiding pointer events.
- [ ] Transition the match surface from its four-point diagonal polygon to `polygon(0 0, 100% 0, 100% 100%, 0 100%)`.
- [ ] Fade the matching content in after the surface begins expanding.
- [ ] Add a continuous controller rotation keyframe and keep the exit control outside the rotating element.
- [ ] Position counts and selected-summary content near the bottom with responsive wrapping.
- [ ] Disable transitions and controller rotation inside the reduced-motion query.

### Task 4: Demonstrate and verify

**Files:**
- Verify: `public/js/pages/landing.js`
- Verify: `public/js/app.js`
- Verify: `public/styles/pages.css`
- Verify: `tests/e2e/mvp-closure.spec.ts`

- [ ] Play the filter-to-full-screen sequence in the right-side browser.
- [ ] Show the rotating controller, live counts, and selected summary.
- [ ] Use exit matching and confirm the complete homepage returns.
- [ ] Run all non-mutating Playwright tests, `pnpm typecheck`, and `pnpm test`.
