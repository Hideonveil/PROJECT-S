# Community Status and Account Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-interactive community coming-soon label and replace the public landing auth method mockups with a ribbon-safe account/password form.

**Architecture:** Keep both features inside the existing `landingPage(state)` template and landing CSS. Preserve all current click handlers and visual-only behavior; the registration button still opens the existing identity surface and no auth API is called.

**Tech Stack:** Vanilla JavaScript templates, CSS, Playwright, TypeScript, Vitest.

## Global Constraints

- Do not move the main ribbon or change community opening geometry.
- Do not call auth APIs, create accounts, or save form values.
- Community status is plain visible text: `COMING SOON`.
- Login shows account and password; register shows account, password, and password confirmation.
- Remove phone, email, WeChat, QQ, verification-code, and social-login controls.
- Keep registration’s existing transition to the player-identity surface.

---

### Task 1: Community status label

**Files:**
- Modify: `tests/e2e/mvp-closure.spec.ts`
- Modify: `public/js/pages/landing.js`
- Modify: `public/styles/pages.css`

**Interfaces:**
- Consumes: `[data-landing-community]` and `.landing-community-surface`.
- Produces: `.landing-community-status` visible only inside the existing community surface.

- [ ] **Step 1: Add a failing assertion**

Extend the community E2E test:

```ts
await expect(page.locator("[data-landing-community]").getByText("COMING SOON", { exact: true })).toBeVisible();
```

- [ ] **Step 2: Run the focused community test**

Run the Playwright test filtered by `community expands`. Expected: FAIL because the label is absent.

- [ ] **Step 3: Add the label and style its hierarchy**

Wrap the existing title and status in `.landing-community-copy`:

```html
<div class="landing-community-copy">
  <strong>社区</strong>
  <span class="landing-community-status">COMING SOON</span>
</div>
```

Keep `社区` at the existing display size. Position the status at the title group’s lower-right, using the mono font, `11px`, `0.22em` tracking, and subdued ink; stack it below on narrow screens.

- [ ] **Step 4: Re-run the focused test**

Expected: PASS, with the close control and opening class unchanged.

### Task 2: Ribbon-safe account/password auth surface

**Files:**
- Modify: `tests/e2e/mvp-closure.spec.ts`
- Modify: `public/js/pages/landing.js`
- Modify: `public/styles/pages.css`

**Interfaces:**
- Consumes: `data-landing-auth-mode`, `switch-landing-auth-mode`, and `continue-landing-profile`.
- Produces: `.landing-auth-fields--account`, `.landing-auth-confirm`, and a right-side `.landing-auth-content` safety column.

- [ ] **Step 1: Add failing login/register field assertions**

In the landing auth E2E test, assert login has visible labels `账号` and `密码`, and that no phone/email/social method tabs exist. Switch to registration and assert `确认密码` is visible, then continue to player identity.

```ts
await expect(panel.getByLabel("账号", { exact: true })).toBeVisible();
await expect(panel.getByLabel("密码", { exact: true })).toBeVisible();
await expect(panel.getByText("手机号", { exact: true })).toHaveCount(0);
await panel.getByRole("tab", { name: "注册", exact: true }).click();
await expect(panel.getByLabel("确认密码", { exact: true })).toBeVisible();
```

- [ ] **Step 2: Run the focused auth tests**

Expected: FAIL because method tabs and phone/email fields remain, and no account confirmation field exists.

- [ ] **Step 3: Replace method markup with account fields**

Remove `.landing-auth-methods`, phone, email, WeChat, and QQ blocks. Add labeled inputs with IDs and autocomplete values:

```html
<div class="landing-auth-fields landing-auth-fields--account">
  <label for="landing-auth-account">账号</label>
  <input id="landing-auth-account" autocomplete="username" />
  <label for="landing-auth-password">密码</label>
  <input id="landing-auth-password" type="password" autocomplete="current-password" />
  <div class="landing-auth-confirm">
    <label for="landing-auth-password-confirm">确认密码</label>
    <input id="landing-auth-password-confirm" type="password" autocomplete="new-password" />
  </div>
</div>
```

Show `.landing-auth-confirm` only in register mode and change the preview note to `视觉预览 · 当前不会创建账号`.

- [ ] **Step 4: Move content into the ribbon-safe column**

Set `.landing-auth-content` to a maximum width of `340px`, reduce the right inset, lower its top edge, and remove the current right-only alignment on kicker and mode switch. Add narrow-width rules that reduce heading size without placing content beneath the ribbon.

- [ ] **Step 5: Re-run focused auth tests**

Expected: PASS. Also verify the existing ribbon transform and running animation assertions still pass.

### Task 3: Complete verification and visual handoff

**Files:**
- Verify: `public/js/pages/landing.js`
- Verify: `public/styles/pages.css`
- Verify: `tests/e2e/mvp-closure.spec.ts`

**Interfaces:**
- Consumes: the two completed UI changes.
- Produces: a verified right-side visual review state.

- [ ] **Step 1: Run all checks**

Run full non-mutating Playwright, TypeScript, Vitest, and `git diff --check`. Expected: all non-mutating browser tests pass, the real-user mutation test remains skipped, 13 unit tests pass, and there are no type or whitespace failures.

- [ ] **Step 2: Show both states in the right-side browser**

Open community and capture `社区 / COMING SOON`; close it, open registration, and leave the account/password/confirmation form visible with the ribbon unobstructed.
