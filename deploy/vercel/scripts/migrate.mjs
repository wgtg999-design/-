#!/usr/bin/env node
import { hostedClient, migrationPlan, ledger, tables, extraTables, isMain, fail } from './database-tools.mjs';

export async function initializeDatabase(client) {
  const plan = await migrationPlan();
  const existing = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  const names = existing.rows.map(row => String(row.name));
  if (names.includes(ledger)) {
    const applied = await client.execute(`SELECT migration,sha256 FROM ${ledger} ORDER BY migration`);
    if (applied.rows.length === plan.length && plan.every(item => applied.rows.some(row => row.migration === item.name && row.sha256 === item.sha256))) {
      return { initialized:false, migrations:plan.length };
    }
    throw new Error('Existing migration history differs. No reset, replay or automatic upgrade is permitted by this initializer.');
  }
  if (names.length) throw new Error('Initialization requires a new empty database. Existing tables were found; no changes were made.');
  const now = new Date().toISOString();
  const statements = [{sql:`CREATE TABLE ${ledger}(migration TEXT PRIMARY KEY NOT NULL,sha256 TEXT NOT NULL,applied_at TEXT NOT NULL)`,args:[]}];
  for (const item of plan) {
    statements.push(...item.statements.map(sql => ({sql,args:[]})));
    statements.push({sql:`INSERT INTO ${ledger}(migration,sha256,applied_at) VALUES(?,?,?)`,args:[item.name,item.sha256,now]});
  }
  await client.batch(statements,'write');
  return { initialized:true,migrations:plan.length };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--plan','--check','--initialize'].includes(args[0])) {
    throw new Error('Usage: node scripts/migrate.mjs --plan | --check | --initialize');
  }
  const plan = await migrationPlan();
  if (args[0] === '--plan') {
    console.log('New database only. Additive migrations: '+plan.map(item => item.name).join(', '));
    console.log('Tables: '+[...tables,...extraTables].join(', '));
    console.log('No connection or database write was performed.');
    return;
  }
  const client = hostedClient();
  try {
    if (args[0] === '--check') {
      const rows = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      console.log(rows.rows.length ? 'Database contains tables. Use the ledger check before import; existing legacy tables must never be initialized in place.' : 'Database is empty and eligible for --initialize.');
      return;
    }
    const result = await initializeDatabase(client);
    console.log(result.initialized ? `Initialized a new database with ${result.migrations} migrations. No shop records were seeded.` : 'This exact migration set is already initialized; no changes made.');
  } finally { client.close(); }
}

if (isMain(import.meta.url)) main().catch(fail);
