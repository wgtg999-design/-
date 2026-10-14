#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { columns, tables, format, isMain, fail } from './database-tools.mjs';
import { validateSnapshot } from './import-data.mjs';

const order = {store_content:'key',store_owner:'key',shop_customers:'user_id',shop_inventory:'sku',shop_settings:'key',shop_orders:'id',shop_events:'id'};

export function cloudflareQuery(fetcher=fetch) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const database = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!/^[a-fA-F0-9]{32}$/.test(account ?? '') || !/^[a-fA-F0-9-]{32,36}$/.test(database ?? '') || !token) {
    throw new Error('Set the confirmed CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and read-only CLOUDFLARE_API_TOKEN in the server environment. Never paste them into chat.');
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
  return async (sql,params=[]) => {
    if (typeof sql !== 'string' || !/^SELECT\s/i.test(sql) || /;|--|\/\*/.test(sql)) {
      throw new Error('The D1 export transport accepts a single read-only SELECT only.');
    }
    const response = await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error('Read-only D1 export request failed. Check the confirmed account, database and token permissions.');
    const envelope = await response.json();
    if (!envelope.success || !Array.isArray(envelope.result) || envelope.result.length !== 1 || !envelope.result[0]?.success || !Array.isArray(envelope.result[0].results)) {
      throw new Error('D1 did not return a successful single-query result. No destination data was changed.');
    }
    return envelope.result[0].results;
  };
}

async function checkpoint(query) {
  const counts = {};
  for (const table of tables) {
    const rows = await query(`SELECT count(*) AS n FROM "${table}"`);
    if (!Number.isSafeInteger(rows[0]?.n) || rows[0].n < 0) throw new Error('Invalid D1 table count.');
    counts[table] = rows[0].n;
  }
  const content = await query('SELECT key,revision,updated_at FROM store_content ORDER BY key');
  const settings = await query('SELECT key,revision FROM shop_settings ORDER BY key');
  const inventory = await query('SELECT COALESCE(sum(revision),0) AS revision_sum FROM shop_inventory');
  const orders = await query('SELECT COALESCE(sum(revision),0) AS revision_sum,MAX(updated_at) AS latest_update FROM shop_orders');
  return {counts,content,settings,inventory,orders};
}

export async function exportSnapshot(query) {
  const before = await checkpoint(query);
  const exported = {};
  for (const table of tables) {
    exported[table] = [];
    for (let offset=0;;offset+=100) {
      const fields = columns[table].map(column => '"'+column+'"').join(',');
      const rows = await query(`SELECT ${fields} FROM "${table}" ORDER BY "${order[table]}" LIMIT ? OFFSET ?`,[100,offset]);
      exported[table].push(...rows);
      if (rows.length < 100) break;
    }
    if (exported[table].length !== before.counts[table]) throw new Error('D1 row counts changed during export. Stop writes and repeat; no snapshot was saved.');
  }
  const after = await checkpoint(query);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('D1 changed during export. Stop writes and repeat; no snapshot was saved.');
  const snapshot = {format,exportedAt:new Date().toISOString(),maintenanceConfirmed:true,tables:exported};
  validateSnapshot(snapshot);
  return snapshot;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== '--output' || !args[1] || args[2] !== '--maintenance-confirmed') {
    throw new Error('Usage: node scripts/export-data.mjs --output /outside/repository/shop-backup.json --maintenance-confirmed. Pause ALL customer and admin writes first; this flag is an assertion, not a maintenance switch.');
  }
  const root = fileURLToPath(new URL('../../../',import.meta.url));
  const output = path.resolve(args[1]);
  const relative = path.relative(root,output);
  if (!relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Save private member/order exports outside the Git repository.');
  const parent = await fs.realpath(path.dirname(output));
  const actual = path.join(parent,path.basename(output));
  const actualRelative = path.relative(await fs.realpath(root),actual);
  if (!actualRelative.startsWith('..'+path.sep) && actualRelative !== '..' && !path.isAbsolute(actualRelative)) throw new Error('The destination resolves inside the Git repository.');
  // Refuse an existing destination before spending time reading production.
  try { await fs.access(actual); throw new Error('The export destination already exists. Choose a new backup name.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const snapshot = await exportSnapshot(cloudflareQuery());
  await fs.writeFile(actual,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Read-only D1 export saved outside the repository. Counts: '+JSON.stringify(Object.fromEntries(tables.map(table => [table,snapshot.tables[table].length]))));
  console.log('This is one member/order/catalog snapshot, not an automatic backup or an R2 image copy.');
}

if (isMain(import.meta.url)) main().catch(fail);
