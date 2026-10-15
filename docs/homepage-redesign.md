# Main storefront redesign

Source is `legacy/store.html`, `public/app.js`, `public/style.css`, `public/admin.js`, `public/homepage-admin.js`, `legacy/admin.html`, and `lib/content.ts`. Vercel's generated app/public/lib are rebuilt by `deploy/vercel/scripts/prepare.mjs`; never edit generated output.

Optional `content.homepage` extends existing JSON content; no SQL migration or production data writes are required. Existing content still validates. The existing admin content API, authorization, origin guard, persistence and revision collision checks remain authoritative.

- Banners rotate at 4000ms with 400ms fades; hover/focus, visibility, manual pause and reduced motion stop rotation. Selecting a pagination button pauses until resumed. Each banner supports an internal href and optional mobile image; paired metadata follows reorder/removal. `/?product=jacket` opens the existing product dialog; `/?category=OUTER#shop` selects the category.
- Each independent rail selects at most ten unique registered IDs in supplied order. Hidden products remain excluded by the public API. Desktop cards occupy thirds, mobile halves; zero gap and one-pixel dividers. Mouse drag and native touch scrolling are supported, plus focused rail arrow keys. QUICK ADD opens the existing option dialog and its stock-limited cart path; mobile keeps the control visible.
- Editorial campaign is hidden until a confirmed desktop image is supplied; optional mobile image falls back to desktop. Images preserve intrinsic aspect ratio and have no shopping overlays. No unrelated photograph is selected automatically.
- Journal has three editable category/image/mobile-image entries; empty images are omitted, leaving functional category links. Supply approved OUTER / T-SHIRT / PANTS images to finish visual content.
- About/community remain accessible from the menu via dialogs rather than extra homepage sections.

## Validation

`node tests/homepage-redesign.cjs` uses isolated synthetic content, stock, upload responses and save/reload; no live data. It covers schema bounds/legacy compatibility, four-second rotation/hover pause/banner target, desktop thirds, ten-item limits, mouse drag/independent scroll, real options/cart, category URLs, admin upload/save/reload/reordering, responsive campaign fixtures, mobile halves and emulated touch swipe, no horizontal overflow or page errors. Campaign photos used by tests are layout fixtures only, not production campaign content.

Existing administrator-security, order-state, SQL commerce, photo-content, Vercel authentication, upload and commerce integration checks also run separately. Real owner session, real R2 upload and deployed provider behavior still require live verification; mocked tests do not establish those outcomes.

## Remaining content

The final confirmed black-and-white campaign file was not identified in the repository. Obtain it from the operator; never replace it with existing sample photos. Three journal category images and optional mobile variants also require approved uploads. Real uploads require the existing R2 connection to be configured. Current code does not enable card payments or automated refunds.
