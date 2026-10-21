// Separate, additive feature schema. Only the authenticated owner initializes
// these tables; the existing commerce migration ledger/data are untouched.
export const tryOnSchema = [
 `CREATE TABLE IF NOT EXISTS store_tryon_settings (key TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)`,
 `CREATE TABLE IF NOT EXISTS store_tryon_jobs (id TEXT PRIMARY KEY, day TEXT NOT NULL, subject TEXT, request_key TEXT, provider_id TEXT, status TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_poll INTEGER NOT NULL DEFAULT 0, credits INTEGER, UNIQUE(subject,request_key))`,
 `CREATE UNIQUE INDEX IF NOT EXISTS store_tryon_request ON store_tryon_jobs(request_key) WHERE request_key IS NOT NULL`,
 `CREATE TABLE IF NOT EXISTS store_tryon_throttle (key TEXT PRIMARY KEY, window INTEGER NOT NULL, n INTEGER NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS store_tryon_day ON store_tryon_jobs(day,subject)`,
 `CREATE TABLE IF NOT EXISTS store_tryon_daily (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL, completed INTEGER NOT NULL, failed INTEGER NOT NULL, unknown INTEGER NOT NULL, credits REAL NOT NULL)`
];
export const POLICY_VERSION = 'fashn-base64-2026-10-21';
export const JOB_TTL = 10 * 60 * 1000;
export const CREDIT_MICRO_USD = 75000;
export const defaultTryOnSettings = { enabled: false, allowGuests: false, perUserDaily: 3, guestDaily: 1, dailyLimit: 20, dailyBudgetCents: 150 };
export type TryOnSettings = typeof defaultTryOnSettings;
export const privateHeaders = {
 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow'
};
