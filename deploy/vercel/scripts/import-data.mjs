#!/usr/bin/env node
import fs from 'node:fs/promises';
import { hostedClient, columns, tables, extraTables, format, assertInitialized, isMain, fail } from './database-tools.mjs';

const numeric = new Set(['revision','consent_version','stock','max_order','enabled','total','shipping_fee','restock','restocked','catalog_revision','settings_revision']);
const states = new Set(['received','preparing','shipped','delivered','cancelled','cancel_requested','return_requested','return_approved','returned']);
const payments = new Set(['awaiting_payment','confirmed','refund_pending','refunded']);

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== format || !snapshot.tables || typeof snapshot.tables !== 'object' || Array.isArray(snapshot.tables)) {
    throw new Error('Use a street-label-d1-export/v1 structured JSON export. SQL files are never executed by this importer.');
  }
  if (Object.keys(snapshot.tables).length !== tables.length || Object.keys(snapshot.tables).some(name => !Object.hasOwn(columns,name))) {
    throw new Error('The snapshot must contain exactly the seven allowlisted shop tables.');
  }
  const data = {};
  for (const table of tables) {
    const rows = snapshot.tables[table];
    if (!Array.isArray(rows)) throw new Error('Every exported table must be an array.');
    data[table] = rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== columns[table].length || Object.keys(row).some(key => !columns[table].includes(key))) {
        throw new Error('An exported row has missing or unexpected columns.');
      }
      for (const column of columns[table]) {
        const integer = numeric.has(column) || (table === 'shop_events' && column === 'id');
        if (integer ? !Number.isSafeInteger(row[column]) : typeof row[column] !== 'string') {
          throw new Error('An exported value has an unsupported type.');
        }
      }
      if (Object.hasOwn(row,'revision') && row.revision < 0) throw new Error('Negative revisions cannot be imported.');
      if (table === 'shop_inventory' && (row.stock < 0 || row.max_order < 1 || row.max_order > 99 || ![0,1].includes(row.enabled))) throw new Error('Invalid inventory values.');
      if (table === 'shop_orders' && (!states.has(row.status) || !payments.has(row.payment) || row.total < 0 || row.shipping_fee < 0 || ![0,1].includes(row.restock) || ![0,1].includes(row.restocked))) throw new Error('Invalid order state.');
      if (['store_content','shop_settings','shop_orders'].includes(table)) {
        for (const key of table === 'shop_orders' ? ['items','address'] : ['data']) {
          let decoded;
          try { decoded = JSON.parse(row[key]); } catch { throw new Error('Invalid serialized shop JSON.'); }
          if (!decoded || typeof decoded !== 'object' || (key === 'items' ? !Array.isArray(decoded) : Array.isArray(decoded))) throw new Error('Invalid serialized shop JSON shape.');
        }
      }
      return Object.fromEntries(columns[table].map(column => [column,row[column]]));
    });
  }
  for (const table of ['store_content','shop_settings','store_owner']) {
    const key = table === 'store_owner' ? 'owner' : 'main';
    if (data[table].length > 1 || data[table].some(row => row.key !== key)) throw new Error('Unexpected singleton shop row.');
  }
  const customers = new Set(data.shop_customers.map(row => row.user_id));
  const orders = new Set(data.shop_orders.map(row => row.id));
  if (data.shop_orders.some(row => !customers.has(row.user_id)) || data.shop_events.some(row => !orders.has(row.order_id))) {
    throw new Error('The export contains orphan orders or audit events. Do not import an incomplete snapshot.');
  }
  return data;
}

export async function importSnapshot(client, snapshot) {
  const data = validateSnapshot(snapshot);
  await assertInitialized(client);
  const transaction = await client.transaction('write');
  try {
    // Check emptiness while holding the same write transaction as the insert.
    // Existing data and identity links are never overwritten or deleted.
    for (const name of [...tables,...extraTables]) {
      const result = await transaction.execute(`SELECT count(*) AS n FROM "${name}"`);
      if (Number(result.rows[0].n) !== 0) throw new Error('Import requires an initialized database with zero shop rows, identity links and upload tickets. No overwrite is allowed.');
    }
    for (const table of tables) {
      const fields = columns[table];
      const sql = `INSERT INTO "${table}"(${fields.map(field => '"'+field+'"').join(',')}) VALUES(${fields.map(() => '?').join(',')})`;
      for (let start=0; start<data[table].length; start+=100) {
        await transaction.batch(data[table].slice(start,start+100).map(row => ({sql,args:fields.map(field => row[field])})));
      }
      const result = await transaction.execute(`SELECT count(*) AS n FROM "${table}"`);
      if (Number(result.rows[0].n) !== data[table].length) throw new Error('Imported row count differs; the transaction will roll back.');
    }
    await transaction.commit();
    return Object.fromEntries(tables.map(table => [table,data[table].length]));
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  } finally { transaction.close(); }
}

async function main() {
  const [mode,file,...rest] = process.argv.slice(2);
  if (!['--plan','--apply'].includes(mode) || !file || rest.length) throw new Error('Usage: node scripts/import-data.mjs --plan snapshot.json | --apply snapshot.json');
  const stat = await fs.stat(file);
  if (stat.size > 256*1024*1024) throw new Error('This importer is limited to 256MB snapshots. Plan a staged verified migration for larger databases.');
  const snapshot = JSON.parse(await fs.readFile(file,'utf8'));
  const data = validateSnapshot(snapshot);
  if (mode === '--plan') {
    console.log('Validated snapshot counts: '+JSON.stringify(Object.fromEntries(tables.map(table => [table,data[table].length]))));
    console.log('No connection or database write was performed. Applying requires a new initialized empty database.');
    return;
  }
  const client = hostedClient();
  try { console.log('Committed import counts: '+JSON.stringify(await importSnapshot(client,snapshot))); }
  finally { client.close(); }
}

if (isMain(import.meta.url)) main().catch(fail);
