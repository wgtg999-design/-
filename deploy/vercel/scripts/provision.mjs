#!/usr/bin/env node
import fs from 'node:fs/promises';
import { hostedClient, columns, tables, extraTables, isMain } from './database-tools.mjs';
import { initializeDatabase } from './migrate.mjs';

const siteMode = JSON.parse(await fs.readFile(new URL('../site-mode.json', import.meta.url), 'utf8'));
const targetOrigin = 'https://street-label-shop.vercel.app';
const extraColumns = {
  auth_identity_links: ['provider_user_id', 'legacy_user_id', 'verified_at'],
  store_upload_tickets: ['id', 'user_id', 'object_key', 'content_type', 'byte_length', 'expires_at', 'status', 'final_key'],
};
const problem = stage => new Error('Deployment preparation failed at ' + stage + '. Existing records were not overwritten.');

function eligible(environment) {
  if (environment.VERCEL !== '1' || environment.VERCEL_ENV !== 'production') return false;
  if ((environment.STORE_SITE_MODE === undefined ? siteMode.mode : environment.STORE_SITE_MODE) !== 'test') return false;
  try {
    const url = new URL(environment.NEXT_PUBLIC_SITE_URL);
    return url.origin === targetOrigin && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

async function schemaCheck(client) {
  for (const [table, fields] of Object.entries({ ...columns, ...extraColumns })) {
    await client.execute(`SELECT ${fields.join(',')} FROM ${table} WHERE 0`);
  }
}

async function findVerifiedOwner(environment, fetcher, now) {
  const ownerEmail = environment.OWNER_BOOTSTRAP_EMAIL.trim().toLowerCase();
  // Exact email filtering is supported by the Clerk Backend API. The maximum
  // of two detects ambiguity; primary-email equality is rechecked below.
  const url = new URL('https://api.clerk.com/v1/users');
  url.searchParams.set('email_address', ownerEmail);
  url.searchParams.set('limit', '2');
  let payload;
  try {
    const response = await fetcher(url.href, {
      method: 'GET', headers: { Authorization: 'Bearer ' + environment.CLERK_SECRET_KEY },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw problem('owner verification');
    payload = await response.json();
  } catch { throw problem('owner verification'); }
  const users = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(users)) throw problem('owner verification');
  if (!Array.isArray(payload) && payload.total_count !== users.length) throw problem('owner verification');
  if (users.length !== 1) return null;
  const user = users[0];
  const primary = Array.isArray(user?.email_addresses)
    ? user.email_addresses.find(email => email.id === user.primary_email_address_id) : null;
  if (!/^user_[A-Za-z0-9]+$/.test(user?.id ?? '')
    || typeof primary?.email_address !== 'string'
    || primary.email_address.trim().toLowerCase() !== ownerEmail
    || primary.verification?.status !== 'verified'
    || user.banned !== false || user.locked !== false
    || !Number.isFinite(user.last_sign_in_at) || user.last_sign_in_at <= 0 || user.last_sign_in_at > now()) return null;
  return user.id;
}

async function pinOwner(client, environment, fetcher, now) {
  const pinned = await client.execute({ sql: 'SELECT user_id FROM store_owner WHERE key=?', args: ['owner'] });
  if (pinned.rows.length) return 'existing';
  // Never bootstrap into an imported/occupied database merely because its
  // migration hashes happen to match. This operation is for the empty shop
  // the representative explicitly authorized, never for identity migration.
  for (const table of [...tables, ...extraTables]) {
    if (table === 'store_owner') continue;
    const result = await client.execute(`SELECT 1 AS occupied FROM ${table} LIMIT 1`);
    if (result.rows.length) throw problem('empty shop verification');
  }
  const providerUserId = await findVerifiedOwner(environment, fetcher, now);
  if (!providerUserId) return 'pending-verification';
  const userId = 'clerk:' + providerUserId;
  // Repeat emptiness inside the owner write itself. Concurrent app writes
  // cannot silently bootstrap an owner into a now-occupied legacy database.
  const empty = [...tables, ...extraTables].filter(table => table !== 'store_owner')
    .map(table => `NOT EXISTS(SELECT 1 FROM ${table})`).join(' AND ');
  await client.execute({
    sql: `INSERT OR IGNORE INTO store_owner(key,user_id) SELECT ?,? WHERE ${empty}`,
    args: ['owner', userId],
  });
  const after = await client.execute({ sql: 'SELECT user_id FROM store_owner WHERE key=?', args: ['owner'] });
  if (!after.rows.length) throw problem('owner registration');
  // A concurrent verified administrator always keeps the ID already pinned.
  return after.rows[0].user_id === userId ? 'registered' : 'existing';
}

/** Trusted deployment task only. No HTTP route, browser token, or new user.
 * The Vercel production build already has securely stored service credentials.
 * Local builds, previews, other domains and live shops perform no operations.
 */
export async function provisionDeployment({ environment = process.env, clientFactory = hostedClient, fetcher = fetch, now = () => Date.now() } = {}) {
  if (!eligible(environment)) return { status: 'skipped', reason: 'outside-authorized-test-deployment' };
  const publicKey = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === undefined
    ? environment.NEXT_PUBLIC_CLERK_PUBLISHABLE : environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const publicMode = /^pk_(test|live)_[A-Za-z0-9+/_=-]+$/.exec(publicKey ?? '');
  const secretMode = /^sk_(test|live)_[A-Za-z0-9+/_=-]+$/.exec(environment.CLERK_SECRET_KEY ?? '');
  if (!environment.OWNER_BOOTSTRAP_EMAIL?.trim() || !publicMode || !secretMode || publicMode[1] !== secretMode[1]) {
    throw problem('server configuration');
  }
  let client;
  try {
    try { client = clientFactory(); }
    catch { throw problem('server connection'); }
    let database;
    try {
      database = await initializeDatabase(client);
      await schemaCheck(client);
    } catch { throw problem('database schema'); }
    let owner;
    try { owner = await pinOwner(client, environment, fetcher, now); }
    catch { throw problem('owner registration'); }
    return { status: 'ready', database: database.initialized ? 'initialized' : 'existing', owner };
  } finally { client?.close(); }
}

if (isMain(import.meta.url)) {
  provisionDeployment().then(result => {
    // Fixed statuses only. No URL, email, user ID, secret, response body or
    // SDK diagnostics may enter the Vercel build log.
    console.log(result.status === 'skipped' ? 'Deployment preparation: skipped outside the authorized test deployment.'
      : `Deployment preparation: database ${result.database}; owner ${result.owner}.`);
  }).catch(() => {
    console.error('Deployment preparation failed. Existing records were not overwritten.');
    process.exitCode = 1;
  });
}
