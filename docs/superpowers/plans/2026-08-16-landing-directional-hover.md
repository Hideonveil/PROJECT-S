# Landing Directional Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace geometric tile decoration and shadow hovers with three direction-matched color wipes, update the ribbon copy, remove expanded-surface purple stripes, and reduce the contact tile.

**Architecture:** Keep the current landing markup and interaction handlers. Use each `.landing-block` pseudo-element as a flat wipe plane with per-tile direction variables, keep content above that plane, and preserve the existing expanded-surface clip paths and dot textures.

**Tech Stack:** Vanilla HTML templates, CSS pseudo-elements/transforms, Playwright, TypeScript, Vitest.

## Global Constraints

- Do not change routes, data, authentication, matching behavior, expanded-surface geometry, or the main ribbon position.
- `摇人` wipes upper-left to lower-right; `社区` wipes left to right; `我的` wipes lower-left to upper-right.
- Use no hover shadow, glow, scale jump, or geometric icon on the three entry tiles.
- Keep the inset structural hairline and dot-grid textures.
- Ribbon copy must contain `总有人想一起 / NEVER PLAY ALONE` in two identical loop segments.
- `联系我们` has no directional wipe and is approximately 300 × 104 at desktop maximum.

---

### Task 1: Lock the landing visual contract

**Files:**
- Modify: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: public landing DOM from `landingPage(state)`.
- Produces: a browser-level contract for copy, removed decoration, hover motion, and contact sizing.

- [ ] **Step 1: Add a failing Playwright test**

Add a test that loads `/index.html` and asserts:

```ts
await expect(page.getByText("NEVER PLAY ALONE", { exact: true }).first()).toBeVisible();
await expect(page.locator(".landing-block-arrow, .landing-block-mark")).toHaveCount(0);

for (const selector of [".landing-block--match", ".landing-block--community", ".landing-block--mine"]) {
  const tile = page.locator(selector);
  const before = await tile.evaluate((element) => getComputedStyle(element, "::after").transform);
  await tile.hover();
  const after = await tile.evaluate((element) => getComputedStyle(element, "::after").transform);
  expect(after).not.toBe(before);
  await expect(tile).toHaveCSS("box-shadow", "none");
}

const contact = await page.locator(".landing-contact").boundingBox();
expect(contact?.width).toBeLessThanOrEqual(302);
expect(contact?.height).toBeLessThanOrEqual(106);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
E2E_BASE_URL=http://127.0.0.1:3000 node node_modules/@playwright/test/cli.js test tests/e2e/mvp-closure.spec.ts -g "directional previews"
```

Expected: FAIL because the English phrase is absent, the icons remain, community/mine lack wipe transforms, and contact is larger than 300 × 104.

### Task 2: Implement and verify the visual refinement

**Files:**
- Modify: `public/js/pages/landing.js`
- Modify: `public/styles/pages.css`
- Test: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: existing `.landing-block`, `.landing-ribbon-track`, `.landing-match-surface`, `.landing-mine-surface`, and `.landing-contact` selectors.
- Produces: per-tile pseudo-element wipe animations and the revised static landing markup.

- [ ] **Step 1: Remove geometric markup and revise ribbon copy**

Delete `.landing-block-arrow` and `.landing-block-mark` spans. Replace both ribbon segments with identical alternating phrases separated by typographic `/` characters:

```html
<div class="landing-ribbon-segment"><span>总有人想一起</span><i>/</i><span>NEVER PLAY ALONE</span><i>/</i></div>
```

Repeat enough phrase pairs in each segment to cover the track without a gap.

- [ ] **Step 2: Replace tile decoration with directional wipe planes**

Use `.landing-block::after` as the wipe plane, assign a per-tile rotation/origin and background, and reveal it on `:hover` and `:focus-visible`. Keep `.landing-block::before` as the inset hairline. Put all tile text at `z-index: 2`, and remove the old match shadow and square pseudo-element.

- [ ] **Step 3: Remove only the expanded-surface purple stripes**

In `.landing-match-surface::after` and `.landing-mine-surface::after`, delete the diagonal linear-gradient layer and leave the radial dot-grid layer unchanged.

- [ ] **Step 4: Reduce and quiet the contact tile**

Set desktop maximum width to `300px`, minimum height to `104px`, and reduce padding and type proportionally. Replace the shadow hover with `transform: translateY(-3px)` only.

- [ ] **Step 5: Respect reduced motion**

Disable wipe and text transitions within `@media (prefers-reduced-motion: reduce)` while preserving the final hover color state.

- [ ] **Step 6: Run verification**

Run the focused Playwright test, then the full non-mutating E2E file, TypeScript check, Vitest, and `git diff --check`. Expected: focused PASS, 10+ non-mutating E2E tests PASS with the real-user test skipped, 13 unit tests PASS, and no type or whitespace errors.

- [ ] **Step 7: Demonstrate in the right-side browser**

Reload the existing local page, hover each tile, inspect the revised ribbon and smaller contact tile, open match and mine to confirm the purple stripes are gone, then leave the homepage visible for review.
