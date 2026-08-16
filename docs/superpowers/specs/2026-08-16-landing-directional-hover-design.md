# Landing Directional Hover Design

## Scope

Only refine the signed-out public homepage. Do not change routes, data, authentication, matching behavior, expanded-surface geometry, or the main ribbon position.

## Directional Preview

The three primary entry tiles share one hover language: a flat color layer wipes across the tile in the same direction that its expanded surface opens. The motion uses no drop shadow, no glow, no scale jump, and no geometric icon.

- `摇人`: wipe from upper-left toward lower-right.
- `社区`: wipe horizontally from left toward right.
- `我的`: wipe from lower-left toward upper-right.

All three use the same duration and easing. Text remains readable throughout and moves only a few pixels in the wipe direction. Keyboard focus receives the same visual state. Reduced-motion users receive the final color state without the traveling animation.

## Decoration Removal

- Remove the match tile arrow and upper-right outlined square.
- Remove the community diamond and mine triangle.
- Keep the inset structural hairline inside each tile.
- Remove the faint purple diagonal stripe from the expanded match surface, including the visual matching screen.
- Remove the faint purple diagonal stripe from the expanded mine surface.
- Keep the dot-grid texture on both expanded surfaces.

## Ribbon Copy

The main moving ribbon alternates the Chinese and English phrases:

`总有人想一起 / NEVER PLAY ALONE`

The two duplicated track segments remain textually identical so the loop stays seamless. Decorative diamond separators are replaced by plain typographic slashes.

## Contact Tile

`联系我们` does not receive the directional wipe. Reduce it from the current 360 × 124 maximum footprint to approximately 300 × 104, reduce its padding and type proportionally, and remove its hover shadow. Keep a small upward movement as a conventional link response.

## Verification

- Hover and keyboard-focus checks for all three primary tiles.
- Confirm the three wipe directions match their expanded surfaces.
- Confirm no arrow, diamond, triangle, outlined square, or purple diagonal expanded-surface stripe remains.
- Confirm the ribbon loop includes both phrases without a visible jump.
- Confirm contact remains legible and does not overlap the ribbon at supported viewport sizes.
