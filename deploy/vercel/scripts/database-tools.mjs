import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';

export const ledger = 'store_migration_ledger';
export const columns = Object.freeze({
  store_content: ['key','data','revision','updated_at'],
  store_owner: ['key','user_id'],
  shop_customers: ['user_id','email','name','phone','consent_version','created_at'],
  shop_inventory: ['sku','product_id','size','stock','max_order','enabled','revision'],
  shop_settings: ['key','data','revision'],
  shop_orders: ['id','user_id','request_key','items','address','total','shipping_fee','status','payment','request_from','carrier','tracking','refund_ref','restock','restocked','revision','catalog_revision','settings_revision','action_token','last_actor','last_note','created_at','updated_at'],
  shop_events: ['id','order_id','actor','action','note','created_at'],
});
export const tables = Object.keys(columns);
export const extraTables = ['auth_identity_links','store_upload_tickets'];
export const format = 'street-label-d1-export/v1';

export function hostedClient() {
  const raw = process.env.TURSO_DATABASE_URL?.trim();
  let url;
  try { url = new URL(raw ?? ''); } catch { throw new Error('Set TURSO_DATABASE_URL to the new hosted database URL.'); }
  if (!['libsql:','https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a hosted libsql:// or https:// URL without embedded credentials; file databases are forbidden here.');
  }
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) throw new Error('Set TURSO_AUTH_TOKEN in the server environment.');
  return createClient({ url: url.href, authToken, intMode: 'number' });
}

export async function migrationPlan() {
  const source = fileURLToPath(new URL('../../../drizzle/', import.meta.url));
  const child = fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = [
    ...(await fs.readdir(source)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort().map(name => path.join(source,name)),
    ...(await fs.readdir(child)).filter(name => /^\d+_[\w-]+\.sql$/.test(name)).sort().map(name => path.join(child,name)),
  ];
  return Promise.all(files.map(async file => {
    const sql = await fs.readFile(file,'utf8');
    return { name:path.basename(file), sha256:createHash('sha256').update(sql).digest('hex'), statements:sql.split(/-->\s*statement-breakpoint/).map(part => part.trim()).filter(Boolean) };
  }));
}

export async function assertInitialized(client) {
  const plan = await migrationPlan();
  const present = await client.execute({ sql:"SELECT name FROM sqlite_master WHERE type='table' AND name=?", args:[ledger] });
  // Bind parameters on every data-bearing query, including table discovery.
  if (!present.rows.length) throw new Error('Run migrate.mjs --initialize against a new empty database first.');
  const applied = await client.execute(`SELECT migration,sha256 FROM ${ledger} ORDER BY migration`);
  if (applied.rows.length !== plan.length || plan.some(item => !applied.rows.some(row => row.migration === item.name && row.sha256 === item.sha256))) {
    throw new Error('The migration ledger differs from this checkout. Do not reset or overwrite the database.');
  }
  return plan;
}

export async function counts(client, names = [...tables,...extraTables]) {
  const result = await client.batch(names.map(name => ({sql:`SELECT count(*) AS n FROM "${name}"`,args:[]})), 'read');
  return Object.fromEntries(names.map((name,index) => [name, Number(result[index].rows[0].n)]));
}

export function isMain(url) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
}

export function fail(error) {
  // SDK failures can contain service details. Never print credentials/URLs.
  const secrets = ['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','CLERK_SECRET_KEY','CLOUDFLARE_API_TOKEN'].map(key => process.env[key]).filter(Boolean);
  let message = error instanceof Error ? error.message : 'Operation failed.';
  for (const secret of secrets) message = message.split(secret).join('[redacted]');
  message = message.replace(/\b(?:https?|libsql):\/\/[^\s"'<>]+/gi,'[redacted URL]');
  console.error(message);
  process.exitCode = 1;
}
