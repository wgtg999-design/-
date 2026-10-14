#!/usr/bin/env node
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationPlan, ledger, isMain, fail } from './database-tools.mjs';

const output = new URL('../templates/public/new-database-only.txt', import.meta.url);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";

// The generated SQL is public schema metadata only. It contains no service
// URL, credentials, member records, owner identity, policies or stock seed.
export async function renderInitializationSql() {
  const plan = await migrationPlan();
  const lines = [
    '-- Street Label: 새로 만든 완전히 빈 데이터베이스 전용',
    '-- 기존 상품 설정·관리자·회원·주문 데이터가 있는 DB에서는 실행하지 마세요.',
    '-- 이 파일을 전체 복사해 새 Turso DB의 SQL 편집기에 붙여 넣고 한 번 실행합니다.',
    '-- 성공하면 저장 테이블과 변경 이력만 만듭니다. 회원·주문·재고는 만들지 않습니다.',
    '-- NEW_EMPTY_DATABASE_REQUIRED 오류는 기존 테이블이 있다는 뜻입니다.',
    '-- 오류가 나면 실행을 멈추세요. 이 보호 검사를 지우거나 뒤의 SQL만 실행하지 마세요.',
    '',
    'BEGIN IMMEDIATE;',
    '',
    '-- 기존 DB이면 메인 테이블을 만들기 전에 전체 작업을 취소합니다.',
    'CREATE TEMP TABLE IF NOT EXISTS street_label_empty_database_guard (',
    '  existing_table_count INTEGER NOT NULL CHECK (existing_table_count = 0)',
    ');',
    'CREATE TEMP TRIGGER IF NOT EXISTS street_label_empty_database_refusal',
    'BEFORE INSERT ON street_label_empty_database_guard',
    'WHEN NEW.existing_table_count <> 0',
    'BEGIN',
    "  SELECT RAISE(ROLLBACK, 'NEW_EMPTY_DATABASE_REQUIRED');",
    'END;',
    'INSERT INTO street_label_empty_database_guard(existing_table_count)',
    "SELECT count(*) FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';",
    '',
    `CREATE TABLE ${ledger} (`,
    '  migration TEXT PRIMARY KEY NOT NULL,',
    '  sha256 TEXT NOT NULL,',
    '  applied_at TEXT NOT NULL',
    ');',
  ];
  // Keep the migration statements and original-file checksums identical to
  // migrate.mjs so import/link tools accept either initialization path.
  for (const item of plan) {
    lines.push('', `-- ${item.name}: ${item.sha256}`);
    for (const sql of item.statements) lines.push(sql.endsWith(';') ? sql : sql + ';');
    lines.push(
      `INSERT INTO ${ledger}(migration, sha256, applied_at)`,
      `VALUES (${quote(item.name)}, ${quote(item.sha256)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));`,
    );
  }
  lines.push('', 'COMMIT;', '', "SELECT 'INITIALIZATION_COMPLETE' AS result;", '');
  return lines.join('\n');
}

export async function writeInitializationSql() {
  await fs.mkdir(fileURLToPath(new URL('../templates/public/', import.meta.url)), { recursive: true });
  await fs.writeFile(output, await renderInitializationSql(), 'utf8');
}

if (isMain(import.meta.url)) {
  writeInitializationSql().then(() => console.log('Generated public, new-empty-database-only initialization SQL. No database connection was made.')).catch(fail);
}
