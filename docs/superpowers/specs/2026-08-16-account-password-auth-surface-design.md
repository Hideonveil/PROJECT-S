# Account Password Auth Surface Design

## Scope

Only revise the visual-only signed-out landing authentication surface. Do not move the main ribbon, change the panel clip path, call authentication APIs, create accounts, save form values, or change the subsequent player-identity surface.

## Authentication Fields

- Keep the `登录 / 注册` mode switch.
- Remove the phone, email, WeChat, and QQ method switch and all associated visual panels.
- Login mode shows `账号` and `密码`.
- Register mode shows `账号`, `密码`, and `确认密码`.
- Register continues to the existing visual player-identity surface.
- Keep an explicit preview note stating that the form does not create an account yet.

## Ribbon-Safe Layout

- Keep the ribbon in its current position, motion, layer, and sharp visual state.
- Move the authentication content farther right and slightly lower.
- Limit the content to a narrow right-side safety column so the heading, description, fields, and buttons never cross beneath the ribbon.
- Align the kicker, mode switch, copy, fields, and actions to the same left edge inside that safety column.
- Preserve scrolling when the viewport height is short.

## Responsive and Accessibility

- At narrow widths, reduce heading size and maintain a minimum readable input width without moving content under the ribbon.
- Use explicit labels and correct `autocomplete` values for username, current password, new password, and password confirmation.
- No social-login controls remain in the accessibility tree.

## Verification

- Login shows two fields and register shows three fields.
- Phone, email, WeChat, QQ, verification code, and email-address fields are absent.
- Registration still opens the player-identity surface.
- Ribbon transform, filter, and animation state remain unchanged while the panel is open.
- At desktop and narrow test widths, the content bounding box does not intersect the ribbon’s visible center line.
