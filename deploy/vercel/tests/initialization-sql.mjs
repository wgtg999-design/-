import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { renderInitializationSql } from '../scripts/initialization-sql.mjs';
import { migrationPlan, ledger, tables, extraTables, assertInitialized } from '../scripts/database-tools.mjs';
import { initializeDatabase } from '../scripts/migrate.mjs';

const sql = await renderInitializationSql();
const plan = await migrationPlan();
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'street-label-initialization-sql-'));
const expectedTables = [...tables, ...extraTables, ledger].sort();
let passed = 0;
async function check(label, test) { await test(); passed++; console.log('PASS ' + label); }
function native(name) { return new DatabaseSync(path.join(directory, name + '.db')); }
function sdk(name) { return createClient({ url: 'file:' + path.join(directory, name + '.db'), intMode: 'number' }); }
function schema(database) {
  return database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row => ({ ...row, sql: row.sql?.replace(/\s+/g, ' ').trim() }));
}
function snapshot(database) {
  const rows = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return { schema: schema(database), rows: Object.fromEntries(rows.map(({ name }) => [name, database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map(row => ({ ...row }))])) };
}

try {
  await check('artifact is deterministic, checked in, and uses original migration statements/checksums', async () => {
    assert.equal(await renderInitializationSql(), sql);
    assert.equal(await fs.readFile(new URL('../templates/public/new-database-only.txt', import.meta.url), 'utf8'), sql);
    assert.equal(plan.length, 4);
    for (const item of plan) {
      assert.ok(sql.includes(item.sha256));
      for (const statement of item.statements) assert.ok(sql.includes(statement));
    }
    assert.doesNotMatch(sql, /\b(?:DROP|DELETE|UPDATE)\b/i);
    assert.doesNotMatch(sql, /(?:libsql:\/\/|sk_(?:test|live)_|pk_(?:test|live)_|@)/);
  });

  await check('native SQLite initializes ten main tables and empty app records', async () => {
    const database = native('native-empty');
    try {
      database.exec(sql);
      assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name), expectedTables);
      for (const name of [...tables, ...extraTables]) assert.equal(database.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n, 0);
      const rows = database.prepare(`SELECT * FROM ${ledger} ORDER BY migration`).all();
      assert.deepEqual(rows.map(row => ({ migration: row.migration, sha256: row.sha256 })), plan.map(item => ({ migration: item.name, sha256: item.sha256 })));
      for (const row of rows) assert.match(row.applied_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.equal(database.isTransaction, false);
    } finally { database.close(); }
  });

  await check('libSQL executeMultiple initialization is accepted by existing migration/import checks', async () => {
    const client = sdk('sdk-empty');
    try {
      await client.executeMultiple(sql);
      await assertInitialized(client);
      assert.deepEqual(await initializeDatabase(client), { initialized: false, migrations: 4 });
      for (const name of [...tables, ...extraTables]) assert.equal((await client.execute(`SELECT count(*) AS n FROM "${name}"`)).rows[0].n, 0);
    } finally { client.close(); }
  });

  await check('generated schema matches the established initializer including indices and constraints', async () => {
    const initialized = sdk('comparison-old');
    try { await initializeDatabase(initialized); } finally { initialized.close(); }
    const old = native('comparison-old'), current = native('comparison-new');
    try {
      current.exec(sql);
      // Whitespace differs only in the explicitly generated metadata ledger.
      assert.deepEqual(schema(current).filter(row => row.name !== ledger), schema(old).filter(row => row.name !== ledger));
      assert.deepEqual(current.prepare(`PRAGMA table_info(${ledger})`).all(), old.prepare(`PRAGMA table_info(${ledger})`).all());
    } finally { old.close(); current.close(); }
  });

  for (const [name, create, insert] of [
    ['foreign', 'CREATE TABLE existing(value TEXT)', "INSERT INTO existing VALUES('KEEP')"],
    ['owner', 'CREATE TABLE store_owner(key TEXT PRIMARY KEY,user_id TEXT NOT NULL)', "INSERT INTO store_owner VALUES('owner','KEEP-OWNER')"],
    ['orders', 'CREATE TABLE shop_orders(id TEXT PRIMARY KEY,total INTEGER)', "INSERT INTO shop_orders VALUES('KEEP-ORDER',129000)"],
    ['empty-table', 'CREATE TABLE existing(value TEXT)', ''],
  ]) {
    await check(`native SQLite refuses ${name} DB before main DDL and rolls back`, async () => {
      const database = native('native-refusal-' + name);
      try {
        database.exec(create + ';' + insert + ';');
        const before = snapshot(database);
        assert.throws(() => database.exec(sql), /NEW_EMPTY_DATABASE_REQUIRED/);
        assert.equal(database.isTransaction, false);
        assert.deepEqual(snapshot(database), before);
        database.exec('BEGIN IMMEDIATE; COMMIT;');
      } finally { database.close(); }
    });
  }

  await check('libSQL refuses existing records and leaves them unchanged', async () => {
    const client = sdk('sdk-refusal');
    try {
      await client.executeMultiple("CREATE TABLE existing(value TEXT); INSERT INTO existing VALUES('KEEP');");
      await assert.rejects(() => client.executeMultiple(sql), /NEW_EMPTY_DATABASE_REQUIRED/);
      assert.equal((await client.execute('SELECT value FROM existing')).rows[0].value, 'KEEP');
      assert.equal((await client.execute("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows[0].n, 1);
      await client.executeMultiple('BEGIN IMMEDIATE; COMMIT;');
    } finally { client.close(); }
  });

  await check('native and SDK repeat runs refuse without overwriting saved app records or ledger', async () => {
    const database = native('native-repeat');
    try {
      database.exec(sql);
      database.exec("INSERT INTO store_owner(key,user_id) VALUES('owner','KEEP');");
      const before = snapshot(database);
      assert.throws(() => database.exec(sql), /NEW_EMPTY_DATABASE_REQUIRED/);
      assert.equal(database.isTransaction, false);
      assert.deepEqual(snapshot(database), before);
    } finally { database.close(); }
    const client = sdk('sdk-repeat');
    try {
      await client.executeMultiple(sql);
      await assert.rejects(() => client.executeMultiple(sql), /NEW_EMPTY_DATABASE_REQUIRED/);
      await assertInitialized(client);
      await client.executeMultiple('BEGIN IMMEDIATE; COMMIT;');
    } finally { client.close(); }
  });

  await check('inventory, order deduplication and upload validation constraints stay enforced', async () => {
    const database = native('constraints');
    try {
      database.exec(sql);
      const inventory = database.prepare('INSERT INTO shop_inventory(sku,product_id,size,stock,max_order) VALUES(?,?,?,?,?)');
      assert.throws(() => inventory.run('a', 'p', 'S', -1, 3), /CHECK/);
      assert.throws(() => inventory.run('a', 'p', 'S', 1, 0), /CHECK/);
      assert.throws(() => inventory.run('a', 'p', 'S', 1, 100), /CHECK/);
      inventory.run('a', 'p', 'S', 1, 3);
      const ticket = database.prepare('INSERT INTO store_upload_tickets(id,user_id,object_key,content_type,byte_length,expires_at,status) VALUES(?,?,?,?,?,?,?)');
      for (const [id,type,size,status] of [['type','image/svg+xml',8,'pending'],['size','image/png',8388609,'pending'],['zero','image/png',0,'pending'],['status','image/png',8,'fake']]) {
        assert.throws(() => ticket.run(id, 'owner', 'object-'+id, type, size, 1, status), /CHECK/);
      }
      ticket.run('good','owner','object-good','image/png',8,1,'pending');
      database.exec("INSERT INTO shop_orders(id,user_id,request_key,items,address,total,shipping_fee,catalog_revision,settings_revision,last_actor,created_at,updated_at) VALUES('order-a','member','same-key','[]','{}',0,0,1,1,'member','now','now');");
      assert.throws(() => database.exec("INSERT INTO shop_orders(id,user_id,request_key,items,address,total,shipping_fee,catalog_revision,settings_revision,last_actor,created_at,updated_at) VALUES('order-b','member','same-key','[]','{}',0,0,1,1,'member','now','now');"), /UNIQUE/);
      assert.equal(database.prepare('SELECT action_token FROM shop_orders').get().action_token, '');
    } finally { database.close(); }
  });

  console.log(`Initialization SQL: ${passed} scenarios passed. Local SQLite and libSQL SDK only; no hosted database or production data touched.`);
} finally { await fs.rm(directory, { recursive: true, force: true }); }
