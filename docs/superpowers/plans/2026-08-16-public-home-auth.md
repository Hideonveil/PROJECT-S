# Public Home + Auth Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a public PROJECT-S homepage before authentication, with login, registration, and `摇人` entry points.

**Architecture:** Add one presentation-only landing page module and let the existing hash router render it for signed-out visitors. Reuse the current auth page and state rather than creating new account logic.

**Tech Stack:** Vanilla ES modules, hash routing, CSS, Playwright, Next.js static hosting.

## Global Constraints

- Do not change APIs, Supabase, matching, onboarding, or deployment configuration.
- Preserve the existing authenticated home.
- Use the existing auth form for login and registration.

---

### Task 1: Public landing route and auth actions

**Files:**
- Create: `public/js/pages/landing.js`
- Modify: `public/js/app.js`
- Modify: `public/styles/pages.css`
- Test: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Produces: `landingPage(): string`
- Consumes: existing `state.authenticated`, `state.authMode`, `navigate()` and delegated `data-action` handling.

- [ ] **Step 1: Write a failing browser test**

Add a test that opens `/index.html`, confirms the public homepage is visible and confirms `注册` opens the existing register form.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec playwright test tests/e2e/mvp-closure.spec.ts --grep "first-time visitors"`

Expected: FAIL because signed-out visitors are redirected to `#/auth` and no public landing page exists.

- [ ] **Step 3: Implement the minimal public landing page**

Create `landingPage()`, allow signed-out users to remain on `home`, and add delegated actions for login, registration, and `摇人`.

- [ ] **Step 4: Add scoped landing styles**

Add only `.landing-*` rules so existing product screens are unaffected.

- [ ] **Step 5: Run the focused test and full verification**

Run the focused Playwright test, then `pnpm verify`.

- [ ] **Step 6: Start the local preview**

Run `pnpm dev` and open the public homepage in the in-app browser for user review.
