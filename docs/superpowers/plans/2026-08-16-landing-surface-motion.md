# Landing Surface Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three public-home surfaces occupy the same perceived screen area, share one reliable reveal animation, and provide consistent entry hover feedback.

**Architecture:** Keep the existing landing markup and action handlers. Centralize motion values in landing CSS custom properties, use a shared transform-and-opacity keyframe so polygon vertex counts cannot cancel animation, and retain one final geometry per surface direction.

**Tech Stack:** Vanilla JavaScript, CSS, Playwright, Vitest, TypeScript type checking.

## Global Constraints

- Each expanded surface must cover about 60% of the viewport, with no more than about 5% perceived difference.
- Reveal duration is 560ms with one shared easing curve.
- Match runs upper-left to lower-right, community runs left to right, and mine runs lower-left to upper-right.
- Background blur remains active and the ribbon animation continues.
- Reduced-motion users see the final state without transition.
- Do not change filter behavior, community content, profile data, backend, authentication, or deployment.

---

### Task 1: Lock motion and geometry behavior with browser tests

**Files:**
- Modify: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: `.landing-block--match`, `.landing-block--community`, `.landing-block--mine` and their three surface selectors.
- Produces: regression checks for open-state animation names, final geometry, and entry hover transforms.

- [ ] **Step 1: Write the failing geometry and animation test**

Add a test that opens each entry, reads computed styles, and checks the shared animation name plus normalized bounds:

```ts
test("landing surfaces share motion and perceived scale", async ({ page }) => {
  await page.goto("/index.html");
  for (const entry of ["match", "community", "mine"] as const) {
    await page.locator(`.landing-block--${entry}`).click();
    const surface = page.locator(`.landing-${entry}-surface`);
    await expect(surface).toHaveCSS("animation-name", "landing-surface-reveal");
    await page.locator(`[data-action="close-landing-${entry}"]`).click();
  }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec playwright test tests/e2e/mvp-closure.spec.ts --grep "landing surfaces share motion"
```

Expected: FAIL because the existing surfaces use different transitions and mine has no running animation.

- [ ] **Step 3: Add a failing hover test for community and mine**

```ts
test("community and mine entries respond to hover", async ({ page }) => {
  await page.goto("/index.html");
  for (const selector of [".landing-block--community", ".landing-block--mine"]) {
    const entry = page.locator(selector);
    const before = await entry.evaluate((el) => getComputedStyle(el).transform);
    await entry.hover();
    await page.waitForTimeout(180);
    const after = await entry.evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);
  }
});
```

- [ ] **Step 4: Run both focused tests and verify they fail**

Run:

```bash
pnpm exec playwright test tests/e2e/mvp-closure.spec.ts --grep "landing surfaces share motion|respond to hover"
```

Expected: FAIL before CSS is unified.

### Task 2: Unify final geometry, reveal animation, and hover feedback

**Files:**
- Modify: `public/styles/pages.css`
- Test: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: the existing `is-match-open`, `is-community-open`, and `is-mine-open` page classes.
- Produces: `--landing-surface-duration`, `--landing-surface-ease`, and `landing-surface-reveal` shared by all three surfaces.

- [ ] **Step 1: Define the shared motion tokens and keyframe**

Add to `.landing` and the surface open states:

```css
.landing {
  --landing-surface-duration: 560ms;
  --landing-surface-ease: cubic-bezier(0.22, 0.84, 0.2, 1);
}

@keyframes landing-surface-reveal {
  from { opacity: 0.24; transform: scale(0.2); }
  to { opacity: 1; transform: scale(1); }
}

.landing.is-match-open .landing-match-surface,
.landing.is-community-open .landing-community-surface,
.landing.is-mine-open .landing-mine-surface {
  animation: landing-surface-reveal var(--landing-surface-duration) var(--landing-surface-ease) both;
}
```

- [ ] **Step 2: Normalize the three final geometries**

Use a 60% visual target:

```css
.landing.is-match-open .landing-match-surface {
  clip-path: polygon(0 0, 60% 0, 100% 100%, 40% 100%);
}

.landing-community-surface {
  top: 20vh;
  height: 60vh;
}

.landing.is-mine-open .landing-mine-surface {
  clip-path: polygon(0 64%, 64% 0, 100% 0, 100% 36%, 36% 100%, 0 100%);
}
```

Set transform origins to `left top`, `left center`, and `left bottom` respectively. Remove the old per-surface clip-path/scale transitions so they do not compete with the keyframe.

- [ ] **Step 3: Give all three entry blocks one hover behavior**

```css
.landing-block--match,
.landing-block--community,
.landing-block--mine {
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.landing-block--community:hover,
.landing-block--mine:hover {
  transform: translate(-4px, -4px);
}
```

Keep the match lavender shadow, use the dark surface color for community, and use lavender for mine. Add an equivalent `:focus-visible` outline.

- [ ] **Step 4: Respect reduced motion**

Inside the existing reduced-motion query, set `animation: none` on all three surface open states while keeping final geometry visible.

- [ ] **Step 5: Run focused tests and verify they pass**

Run:

```bash
pnpm exec playwright test tests/e2e/mvp-closure.spec.ts --grep "landing surfaces share motion|respond to hover"
```

Expected: PASS.

### Task 3: Visual and regression verification

**Files:**
- Verify: `public/styles/pages.css`
- Verify: `public/js/pages/landing.js`
- Verify: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: completed motion CSS and current landing interactions.
- Produces: verified live preview and passing project checks.

- [ ] **Step 1: Demonstrate all three surfaces in the right-side browser**

Reload the page, open each entry separately, and capture the settled state. Confirm the three surfaces have comparable visual weight and their content is not clipped.

- [ ] **Step 2: Verify community and mine hover states visually**

Hover each entry and confirm the 4px lift and hard shadow are visible without layout shift.

- [ ] **Step 3: Run the homepage regression tests**

Run:

```bash
pnpm exec playwright test tests/e2e/mvp-closure.spec.ts --grep "public home|community expands|mine expands|landing surfaces"
```

Expected: all selected tests PASS.

- [ ] **Step 4: Run type and unit checks**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: TypeScript exits successfully and all Vitest tests PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add public/styles/pages.css tests/e2e/mvp-closure.spec.ts
git commit -m "feat: unify landing surface motion"
```
