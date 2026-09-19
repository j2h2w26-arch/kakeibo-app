# UI design specification — Warm Home refresh

Updated: 2026-09-14

This file is the design source of truth for the current UI. It supersedes the earlier dark violet/cyan direction.

## Product structure

- After login, open on a function chooser. It contains four large choices only: お金, 暮らし, 未来, ポイント.
- 暮らし groups 買い物・在庫 and 家事. 未来 groups Wish and 人生ToDo/人生設計. Keep the chooser simple even as grouped features increase.
- Do not add balances, notifications, campaigns, rankings, or other dashboard widgets to the chooser.
- Inside a function, keep the labeled bottom navigation: 選ぶ, お金, 暮らし, 未来, ポイント.
- Settings stays a utility destination in the header and must include a visible 設定 label.

## Art direction

Use **Warm Home as the base, with a small amount of Fresh Pop interaction**.

- Warm ivory background, white working surfaces, dark readable text.
- Rounded, domestic, calm visual language; playful color is limited to function identity and short interaction feedback.
- Avoid returning to a predominantly black UI, strong neon glow, large blurred shadows, or a dense dashboard.
- Avoid a children’s-game appearance. Financial confirmation and destructive actions remain quiet and explicit.

### Core tokens

| Role | Value |
|---|---|
| background | `#f7f4ee` |
| surface | `#ffffff` |
| text | `#292f2c` |
| muted text | `#626a63` |
| line | `#d8ddd4` |
| primary action | `#a84435` |
| success | `#2f7153` |
| danger | `#a12f3e` |

Function identity:

| Function | Soft surface | Ink/action |
|---|---|---|
| お金 | `#f6dfd2` | `#854b32` |
| 買い物 | `#e2ebd9` | `#466343` |
| やりたい | `#e7e2f2` | `#665084` |
| ポイント | `#f6eac1` | `#775d22` |

## Type, spacing and controls

- Japanese system font stack: Hiragino Sans, Yu Gothic UI, Meiryo, system UI. Do not claim Inter is loaded without shipping it.
- Body/input: 16px. Supporting text: normally 13–14px. Headings: 24–42px by level and viewport.
- Use 4px spacing increments. Main horizontal page padding is 20px on phones and 28px on wider screens.
- Common controls are at least 44px high; primary controls and form inputs are 48px or more.
- Use tabular numerals for amounts. The content hierarchy must not depend on color alone.

## Interaction and motion

- Press feedback: scale to 0.98 for about 100–160ms. Function choices may scale to 0.97.
- View entrance: opacity plus no more than 6px movement, about 180–280ms.
- Purchased check: a single short pop. Toast: a short entrance and automatic dismissal, with text and status icon.
- Never celebrate before persistence succeeds. Avoid confetti for money operations, fake OCR progress, perpetual floating decoration, and forced scroll.
- Respect `prefers-reduced-motion`; animations and transitions become effectively immediate.

## Accessibility

- Target WCAG 2.2 AA contrast: 4.5:1 for normal text and 3:1 for large text. Reference: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- Target a practical 44–48px touch area. WCAG 2.2 AA Success Criterion 2.5.8 has a 24×24 CSS px minimum with exceptions; do not misstate it as a 44px requirement. Reference: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Show keyboard focus using a clearly visible green outline. Inputs have explicit labels. Status must use text/icons in addition to color.
- Password visibility, receipt review, keyboard use, and reduced motion remain required regression checks.

## Receipt OCR

- Keep the three-step explanation, local image preview, privacy disclosure, progress state, and editable candidate review.
- A recognized amount/date is a candidate, not a confirmed record. Save only after the user reviews and submits it.
- Worker/core assets are generated from locked npm dependencies during predev/prebuild and served from `/ocr`. Language data is loaded only when OCR is used and cached by Tesseract.

## Research basis and assets

The selected direction was informed by official public material from Copilot Money, Monarch, Honeydue, Splitwise, AnyList, Bring!, Cozi, TimeTree, Structured, Things, Todoist, Finch, Headspace, Notion Calendar, and YNAB. These references informed hierarchy and interaction patterns; their artwork and screenshots are not copied into the app.

The shipped `AppIcon` drawings are original geometric SVGs. No new icon, font, animation, or image dependency is required by this refresh.

## Validation

Before production release:

1. Run unit tests, lint, and the production build.
2. Verify login and authenticated feature navigation at mobile and desktop widths.
3. Check no horizontal overflow, readable amounts, keyboard focus, reduced motion, and visible error/retry states.
4. Exercise shopping completion, Wish/life task completion, receipt selection/OCR candidate review, toast dismissal, and settings navigation with synthetic data only.
5. Do not write synthetic fixtures to production family records.
