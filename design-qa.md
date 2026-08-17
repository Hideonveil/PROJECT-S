# PROJECT-S Design QA

## Source of truth

- Selected visual target: `/Users/jasonhu/.codex/generated_images/01a004db-dd39-7ac1-baa5-1c9aa3d1078d/exec-412bdad1-ee8b-4261-8bea-f19cbb65be18.png`
- Registration interaction reference: `https://uiverse.io/alexruix/pink-frog-31`
- Primary button interaction reference: `https://uiverse.io/adamgiebl/giant-donkey-36`
- Final implementation capture: `/private/tmp/project-s-redesign-pass3.png`
- Combined same-state comparison: `/private/tmp/project-s-final-comparison.png`
- Registration source/implementation comparison: `/private/tmp/project-s-auth-comparison.png`
- Button source/implementation comparison: `/private/tmp/project-s-button-comparison.png`
- Viewport: 1440 × 1024 CSS px, DPR 1. The 1487 × 1058 reference was normalized to the same viewport before comparison.
- State: signed out, 摇人 page, 王者荣耀 / 排位上分 / 尽快开始 / 语音开黑 selected.

## Visual comparison

- Navigation: dark 184 px left rail, active purple marker, account footer, and top-right auth actions match the selected direction.
- Hierarchy: large 摇人 heading, status line, four numbered filter groups, and the primary action retain the reference proportions.
- Components: selected/unselected cards use one consistent border, radius, typography, and icon system.
- Motion: the primary action uses the reference's heavy outline, offset shadow, hover lift, and pressed return translated into the PROJECT-S purple palette; the warning ticker uses two identical groups for a gapless loop.
- Layout safety: no clipped text, overlapping controls, or content hidden by the 42 px ticker at 1440 × 1024.
- Responsive rules are present for tablet and mobile widths; desktop remains the primary reference state.

## Interaction checks

- Game, mode, time, and voice controls update their selected state.
- Community opens as a separate route and contains `COMING SOON`.
- My redirects a signed-out visitor to the existing login flow.
- Starting a match while signed out redirects to login with a contextual notice.
- Registration and login switch inside the new account page without returning to the legacy screen.
- At a 900 × 600 viewport, the page was scrolled 500 px and the sticky top bar remained at y=0 with `PROJECT-S / 摇人` visible.
- The primary `开始摇人` action is now a fixed viewport object above the ticker. Its screen coordinates remain stable while the document scrolls; only the intentional 6 px idle float changes its vertical position.
- The left rail measures 76 px at rest with labels hidden and expands to 184 px on pointer hover with labels visible; it overlays instead of shifting the main workspace.
- At 900 × 600, the off-screen start dock produces a 68 × 68 floating action. Scrolling the dock back into view restores the 335 × 72 in-flow button; the transition uses a 420 ms FLIP morph.
- The authenticated My renderer now outputs `product-me-workspace` and no longer outputs the legacy `prism-me` structure; friends and recent connections remain present.
- Browser runtime log after navigation checks: no errors.

## Engineering checks

- `git diff --check`: passed.
- TypeScript: passed.
- Vitest: 3 files, 13 tests passed.
- Next.js production build: passed.

## Iteration record

- Pass 1: primary button overlapped the ticker and the lower controls were too tall.
- Pass 2: increased top breathing room and reduced time-control height; browser cache still showed stale data.
- Pass 3: cache-busted reload confirmed five compact time choices, a fully visible primary action, correct default selection, and no visible P0/P1/P2 issues.
- Pass 4: replaced the account, onboarding, and My renderers with the new product shell; adapted both Uiverse references; verified sticky page identity, account switching, and legacy-render removal.
- Pass 5: converted the primary action into a persistent desktop-pet-style floating control with gentle idle motion, paused hover response, and reduced-motion fallback.
- Pass 6: changed the primary action to dock only at its natural position and compact elsewhere; added the auto-collapsing, pointer-expanded navigation rail.

final result: passed
