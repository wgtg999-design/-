# Storefront refinement — 2026-10-16

## Rollback baseline

Before changes, clean commit acc066682808b61ab35ccb329b0a338c3fda42c6 was saved on origin/backup/before-visual-refresh-20261016. A Git bundle is also retained in /workspace/outputs/street-label-before-visual-refresh-20261016.bundle. docs/appearance-before-refinement.json records only the previous public homepage configuration, not private records or a full database backup.

If an administrator has saved the new appearance to the database, first restore only heroImages, journalImage and homepage settings from the appearance snapshot through the current authenticated, revision-checked editor, before deploying older schema code. Then restore code by reverting the refinement commit on main and redeploying; do not force reset shared history. Preserve products, membership, orders, images and stock. Code rollback and database recovery are separate operations. No automatic backups are asserted.

## Design and catalogue

A new generated single campaign photograph replaces the untouched legacy default hero pair. The carousel still supports multiple administrator-uploaded banners, 4-second rotation and pause. The default now uses one calm composition. Existing explicit custom photos, mobile banners, links and campaign disabling remain authoritative. A narrowly scoped idempotent preset supplies the same current hero in server HTML, browser and admin, preventing an old-image flash. No production database writes or migrations are needed to render the preset; a later explicit admin save persists settings normally.

The home rail curates existing published garments (black outerwear, knitwear, indigo/washed-black bottoms) only when the previous default ten-ID selection was unchanged. Custom ordering is preserved. No imaginary supplier, stock, sizes, sales or reviews are created. Actual catalogue photography, prices and SKU inventory remain unchanged. The new tee wearing photograph is illustrative category editorial only and does not replace the SKU's product/model photos. New image provenance is recorded in adjacent docs JSON files.

Catalogue header uses readable dark text on white. Product information stays visible, quick-add becomes a quiet text control, card hearts and numeric badges are removed. Matching card and detail photo-view buttons provide explicit base/model selection. Manual choices override hover and persist within the current page across filtering/sorting. Detail galleries also support directional mouse drag and touch swipe; card horizontal drag still browses the product rail. Missing model images revert to base photo and disable that choice. Existing wishlist records/text controls remain compatible.

All new media has content-hashed responsive WebP derivatives and immutable delivery caching. Original and earlier assets remain available for rollback. No authentication, server authorization, payment or order/inventory logic changes are intended.

Visual inspection also caught undersized landscape delivery on tall phones. Hero selection and initial responsive sizes now account for object-fit cover height, and a full-native-width WebP candidate is retained. Adaptive ink sampling respects the actual image crop and sidebar footprint.

## Validation evidence

The isolated Chromium/SQLite browser suite covers card buttons (pointer/keyboard/touch), manual choice priority, detail horizontal drag/swipe and vertical cancellation, failed-model fallback, no hearts or numeric badges, cart quantities/reload, category/search/sorting, owner-only save/upload/preview and stale-version protection, default/current hero SSR parity, custom settings preservation and repeat application, three/four/two-column layouts and zero gaps. New cover-aware delivery is checked against decoded bitmap dimensions at mobile DPR 1 and 3, capped at the native original resolution. Default desktop automatic menu ink is white against the new dark left wall.

Additional executed checks: tests/admin-security.cjs, tests/catalog-import.cjs, tests/model-photo-content.cjs, tests/commerce-api.cjs; Next production build (including TypeScript). Tests use loopback and isolated fixture data. Real Clerk owner/customer login and real production order submission are not repeated by this task. Production deployment and read-only asset/HTML verification are separate final checks.
