# UI design notes — 2026-09-14

## Research and selected elements

- W3C contrast guidance: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
  - Aim for 4.5:1 for ordinary text. Brighter secondary text replaces the former dim gray.
- W3C target size: https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
  - Use 44px controls for common touch actions; enlarge labels and separate actions.
- W3C interaction motion: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
  - Brief press/hover feedback; respect prefers-reduced-motion.
- Icon candidate researched: https://lucide.dev/ and https://github.com/lucide-icons/lucide/blob/main/LICENSE
  - Adopt a consistent 24px outline visual language. The shipped AppIcon component contains original geometric SVG drawings, with no copied third-party artwork or added icon dependency.

## Implementation

Preserve the existing dark violet/cyan family identity. Increase navigation labels, descriptions and form text. Give active navigation a highlight and touch controls a short press response. Toasts have a status symbol and dismiss action. Login supports password visibility. Receipt entry has a three-step guide, image preview and collapsible privacy explanation. Object URLs are revoked and stale OCR results are ignored after replacement/close/unmount.

## Validation scope

Check desktop and mobile overflow, keyboard focus, password visibility, expense form, OCR candidate review, navigation, reduced motion, existing unit tests, lint and production build. Browser fixtures must be synthetic and never change production family records.

Verified in headless Edge at 390px and 1280px: no horizontal overflow; password visibility toggle; receipt image preview; real Tesseract Japanese/English worker recognized a synthetic English receipt (500 yen, 2026-09-14); candidate submission to an in-memory handler; reduced-motion CSS; no page errors. This does not replace camera testing on an actual iPhone/Android or authenticated production persistence testing.

OCR worker/core assets are generated from locked npm dependencies during predev/prebuild and served from /ocr. They are excluded from the initial PWA precache to avoid loading the engines for people who have not used OCR. Language data is downloaded on first use and cached by Tesseract.
