# Street Label — storefront and owner CMS

Vinext / Cloudflare Workers. D1 holds the catalog and pinned owner identity; R2 holds uploaded product and campaign images. The original storefront layout is preserved.

## Use
Open the storefront with the owning ChatGPT account. Click **관리자 모드** in the header or footer, or visit `/admin`. Edit brand text, campaign images, journal image and product details. Add/hide/remove/reorder products. Click **변경사항 저장**, then refresh the storefront. Uploads support JPG, PNG and WebP, at most 8MB each. Hero images: 1–5; products: up to 100. New products start hidden.

## Authorization
Hosted ChatGPT sign-in is owned by Sites. `OWNER_BOOTSTRAP_EMAIL` is a secret runtime value populated from the confirmed Sites owner record; never exposed to clients. Only that verified identity can initialize the singleton owner record. All subsequent admin checks compare the durable site-scoped user ID. Every admin page/API checks server-side ownership. Mutations also require an exact same-origin Origin header. Private Sites access remains unchanged. No passwords or client-side secret credentials are used.

## Persistence and validation
D1 `store_content` contains the validated catalog and revision; saves use a revision conditional update to reject stale writes. Hidden products are omitted from the storefront API. Images are uploaded to R2 with random object keys and served with fixed image MIME types and nosniff. Image upload bodies are bounded; SVG/HTML and external image URL schemes are rejected. Storefront and editor escape text before HTML interpolation. Cart remains browser-local; authenticated checkout creates durable D1 orders.

## Source
- `legacy/store.html`, `public/style.css`, `public/app.js`: storefront.
- `legacy/admin.html`, `public/admin.css`, `public/admin.js`: editor.
- `app/admin/route.ts`, `app/api/admin/*`: owner-protected endpoints.
- `lib/admin.ts`: owner identity and request checks.
- `lib/content.ts`: schema and initial sample catalog.
- `db/schema.ts`, `drizzle/`: database schema/migration.

Use the Sites build and publication helpers. Generated output is in `dist/`; source belongs in `public/`, `app/`, `legacy/` and `lib/`. Do not edit generated `dist/`.

## Verification
`node tests/admin-security.cjs` checks missing/foreign identity rejection, initial owner eligibility and pinned ID, same-origin restriction, persistent content save, stale-write conflict and content/image validation. JS syntax and production build pass. Supported browser QA is unavailable in this environment; live visual/upload interaction testing has not been performed.

## Initial images
Original AI-generated concept assets in `public/assets/` (not actual stock): campaign.png, campaign-v2.png, products.png. Product contact sheet is displayed using CSS quadrant positions; uploaded photos use a normal full-image view. Replace with actual product photographs before sales. Card payments and automatic bank/refund transfers are not connected. Order and stock management are described below.


## Commerce release
- `/account`: ChatGPT-linked customer registration/profile, shipping checkout, own order history and cancel/return requests. This is not standalone email/password registration.
- `/admin/orders`: operator settings, per-size inventory and per-order quantity limits, paginated order management, manual bank receipt confirmation, carrier/tracking entry, cancellation, returns and manual refund-completion records.
- `/api/shop`: customer operations and public settings/stock. Order identity comes from Sites, never client user IDs.
- `/api/admin/commerce`: owner-only management. All mutations require same-origin and server validation.
- `lib/order-state.ts`: state transitions; `lib/commerce.ts`: APIs.
- `drizzle/0001_simple_harpoon.sql`: additive tables and uniqueness, plus `0002_bizarre_sersi.sql` operation-token column. Never modify after deployment. `lib/order-sql.ts` creates parameterized transaction plans. New orders atomically check stock, catalog/settings revision, membership and pending-order count; then deduct stock and audit in one D1 batch transaction. Cancellation restores once. Returns restore only after physical receipt and resale approval. Stale stock edits reject by revision.
- Client prices are not trusted. Server snapshots product/price/address into immutable order details. Idempotency keys prevent duplicate orders; at most 3 awaiting-payment orders per customer. Per-option max purchase count applies per order, not lifetime per customer.
- Full-order cancellations/refunds only. No partial refunds, courier API, automatic transfers, customer email/SMS or automatic unpaid-order expiry. Operators cancel overdue unpaid orders manually. Refund completion is a record after the operator confirms the actual external transfer, not a money transfer.
- No live customers, orders or inventory were seeded. Initial stock is zero and selling disabled; initial order acceptance is off. Configure operator account information, shipping fee, customer support, terms/privacy and returns text, then set actual option stock and enable order acceptance.
- Existing owner-private Site audience is preserved. External customer access requires a separate requested audience change.

### Commerce validation
`node tests/order-state.cjs`, `python tests/commerce-sql.py`, and `node tests/commerce-api.cjs` cover state transitions, real SQLite migration and atomic transaction execution, last-unit concurrent ordering, transaction rollback, exactly-once stock restoration, server price validation, quantity limits, idempotency, cross-customer privacy and mutation denial, manual payment/cancellation/refund lifecycle. Uses isolated synthetic data only. Production build passes. Real browser and production end-to-end payment/upload/checkout testing remains unperformed because the supported browser QA tool is unavailable.

Deployment compatibility: failed initial commerce migration was verified unapplied (only original store tables existed). Removed unsupported migration trigger statements and moved atomic order/stock/audit changes to D1 batch transactions. Unique per-operation tokens ensure failed/stale state changes cannot restore inventory or append audit events. No applied migration was edited.
