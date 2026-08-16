# Ribbon Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual-only login, registration, and player-identity flow that uses the moving ribbon as a permanently sharp divider.

**Architecture:** Keep the user on `#/home` and render both flow panels inside the public landing page. Drive the visual states with delegated actions and landing-page classes, place a full-screen blur layer below the ribbon, and keep all selections in DOM state without API or storage writes.

**Tech Stack:** Vanilla JavaScript templates, CSS animations and clip paths, Playwright, Vitest, TypeScript type checking.

## Global Constraints

- Do not navigate away from the public homepage when login or registration opens.
- The homepage blurs while the ribbon remains sharp and continues its existing animation.
- The ribbon keeps its original homepage position and transform throughout every flow state.
- The right panel enters horizontally from the right and the identity panel enters horizontally from the left; neither surface scales or moves vertically.
- Registration continuation switches to a left-side identity panel containing avatar, gender, age, device, and game-type choices.
- Phone, email, WeChat, and QQ are visual-only in this phase.
- Do not call auth APIs, write user data, modify Supabase, or deploy.
- Reduced-motion users see final states without animation.

---

### Task 1: Add failing browser coverage for the visual flow

**Files:**
- Modify: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: header login/register actions and the public landing route.
- Produces: required selectors `[data-landing-auth-flow]`, `[data-landing-auth-panel]`, `[data-landing-identity-panel]`, and `[data-landing-ribbon]`.

- [ ] Add a test that clicks login, asserts the hash remains `#/home`, and checks the right panel is visible.
- [ ] Assert the panel exposes 手机号、邮箱、微信、QQ and that the ribbon retains `filter: none` with a running animation.
- [ ] Add a registration test that clicks “继续创建玩家身份” and checks the left panel exposes 头像、性别、年龄、设备、爱好游戏类型.
- [ ] Run the two focused Playwright tests and verify they fail because the flow layer does not exist.

### Task 2: Add landing markup and visual-only actions

**Files:**
- Modify: `public/js/pages/landing.js`
- Modify: `public/js/app.js`
- Test: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: existing delegated `data-action` click handling.
- Produces: `open-public-auth`, `switch-landing-auth-mode`, `switch-landing-auth-method`, `continue-landing-profile`, `select-landing-profile-option`, `complete-landing-profile`, and `close-landing-auth-flow` visual actions.

- [ ] Add the flow layer with blur backdrop, right authentication panel, and left identity panel.
- [ ] Render phone/email method controls plus WeChat and QQ visual buttons.
- [ ] Render identity choices using existing avatar rendering and button patterns.
- [ ] Change `open-public-auth` so it opens the landing flow rather than navigating to `#/auth`.
- [ ] Implement DOM-only mode, method, and selection changes with ARIA state updates.
- [ ] Implement close and completion actions without API calls or persisted state.

### Task 3: Build ribbon-separated geometry and motion

**Files:**
- Modify: `public/styles/pages.css`
- Test: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: `.is-auth-flow-open` and `.is-identity-open` landing classes.
- Produces: right-panel slide-down animation, left-panel expansion animation, sharp ribbon layering, and responsive final layouts.

- [ ] Add a blur layer below both panels and below the ribbon.
- [ ] Raise the real ribbon above the flow layer without duplicating it or pausing its track.
- [ ] Clip the right panel along the ribbon with `polygon(70% 0, 100% 0, 100% 100%, 35% 100%)`.
- [ ] Clip the left identity panel to the complementary area with `polygon(0 0, 70% 0, 35% 100%, 0 100%)`.
- [ ] Add the 560ms right slide and 560ms left reveal, including sequenced transition and reduced-motion handling.
- [ ] Add narrow-screen rules that keep inputs and completion controls visible.

### Task 4: Verify the complete visual sequence

**Files:**
- Verify: `public/js/pages/landing.js`
- Verify: `public/js/app.js`
- Verify: `public/styles/pages.css`
- Verify: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: completed flow implementation.
- Produces: a live right-side demonstration and passing regression checks.

- [ ] Reload the right-side browser and demonstrate registration opening from the header.
- [ ] Switch through phone, email, WeChat, and QQ visual states.
- [ ] Continue to the left identity panel and visually confirm the ribbon remains sharp and moving.
- [ ] Run the focused auth-flow Playwright tests.
- [ ] Run existing public-home Playwright regression tests, `pnpm typecheck`, and `pnpm test`.
