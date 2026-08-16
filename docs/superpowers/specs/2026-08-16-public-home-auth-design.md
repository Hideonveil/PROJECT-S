# PROJECT-S Public Home + Auth Entry Design

## Goal

First-time visitors see a public PROJECT-S homepage instead of being forced directly to the auth form.

## Scope

- Keep the existing authenticated product home and matching flow unchanged.
- Add a public landing view at the existing `home` route.
- Show explicit `登录` and `注册` actions.
- Label the landing page's primary product action `摇人`.
- Route all three actions into the existing auth page; `注册` opens register mode, while `登录` and `摇人` open login mode.
- Do not change APIs, Supabase, matching, onboarding, or deployment configuration.

## Visitor Flow

1. A signed-out visitor opens `/index.html` and sees the public homepage.
2. `登录` opens the existing auth page in login mode.
3. `注册` opens the existing auth page in register mode.
4. `摇人` opens the existing auth page in login mode because matching still requires an account.
5. A returning authenticated player continues to the existing product home.

## Visual Direction

Use the user's approved block layout:

- `摇人` is the largest tile in the upper-left area.
- `社区` and `我的` are smaller stacked tiles beneath it.
- A diagonal animated ribbon crosses the middle and repeats `总有人想一起`, with a restrained caution-tape rhythm.
- `联系我们` sits in the lower-right.
- `登录` and `注册` remain in the upper-right.

Keep the composition graphic and architectural: strong outlines, flat surfaces, restrained prism color, and no photographic background.

## Acceptance Criteria

- A clean browser session no longer lands on `#/auth` automatically.
- The public homepage visibly contains `登录`, `注册`, and `摇人`.
- Each entry opens the correct existing auth mode.
- Existing authenticated routing remains unchanged.
