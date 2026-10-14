import { createClient, type Client, type InStatement, type ResultSet } from '@libsql/client';

export type DatabaseResult<T = Record<string, unknown>> = {
  success: true;
  results: T[];
  meta: { changes: number; last_row_id: number | string };
};

type SQLClient = Pick<Client, 'execute' | 'batch'>;

function safeDatabaseError(error: unknown): Error {
  const message = error instanceof Error ? error.message : '';
  const marker = ['OUT_OF_STOCK','PENDING_LIMIT','CATALOG_CHANGED','SHOP_CLOSED'].find(value => new RegExp('(?:^|\\W)'+value+'(?:$|\\W)').test(message));
  // Existing commerce error handling recognizes SQLITE. Do not attach the
  // SDK error as a cause: diagnostics can contain URLs or server details.
  return new Error(marker ?? 'SQLITE database operation failed.');
}

async function execute(client: SQLClient, statement: InStatement): Promise<ResultSet> {
  try { return await client.execute(statement); }
  catch (error) { throw safeDatabaseError(error); }
}

function result<T>(value: ResultSet): DatabaseResult<T> {
  return {
    success: true,
    results: value.rows.map(row => ({ ...row }) as T),
    meta: {
      changes: value.rowsAffected,
      last_row_id: value.lastInsertRowid == null ? 0 : String(value.lastInsertRowid),
    },
  };
}

function boundValue(value: unknown): string | number | bigint | null | Uint8Array {
  if (value === null || typeof value === 'string' || typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('Unsupported database parameter.');
}

export class PreparedStatement {
  constructor(
    private readonly client: SQLClient,
    readonly sql: string,
    readonly args: ReturnType<typeof boundValue>[] = [],
  ) {}

  bind(...values: unknown[]): PreparedStatement {
    return new PreparedStatement(this.client, this.sql, values.map(boundValue));
  }

  statement(): InStatement { return { sql: this.sql, args: this.args }; }

  belongsTo(client: SQLClient): boolean { return this.client === client; }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const rows = (await execute(this.client, this.statement())).rows;
    if (!rows.length) return null;
    const row = { ...rows[0] };
    return (columnName === undefined ? row : row[columnName] ?? null) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>> {
    return result<T>(await execute(this.client, this.statement()));
  }

  async run<T = Record<string, unknown>>(): Promise<DatabaseResult<T>> {
    return result<T>(await execute(this.client, this.statement()));
  }
}

export class DatabaseAdapter {
  constructor(private readonly client: SQLClient) {}

  prepare(sql: string): PreparedStatement {
    if (!sql.trim()) throw new TypeError('An SQL statement is required.');
    return new PreparedStatement(this.client, sql);
  }

  async batch<T = Record<string, unknown>>(statements: PreparedStatement[]): Promise<DatabaseResult<T>[]> {
    if (!statements.length) return [];
    if (statements.some(statement => !statement.belongsTo(this.client))) {
      throw new TypeError('All batched statements must belong to the same database.');
    }
    // libSQL's write batch is one ordered transaction. A failed statement rolls
    // back order creation, inventory changes and the audit event together.
    try {
      const values = await this.client.batch(statements.map(statement => statement.statement()), 'write');
      return values.map(value => result<T>(value));
    } catch (error) { throw safeDatabaseError(error); }
  }
}

export function createDatabase(client: SQLClient): DatabaseAdapter { return new DatabaseAdapter(client); }

export function validateDatabaseUrl(raw: string | undefined): string {
  if (!raw?.trim()) throw new Error('Set TURSO_DATABASE_URL in the server environment.');
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('TURSO_DATABASE_URL must be a hosted libSQL URL.'); }
  if (!['libsql:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash || url.search) {
    throw new Error('TURSO_DATABASE_URL must use libsql:// or https:// without embedded credentials.');
  }
  return url.href;
}

let database: DatabaseAdapter | undefined;

export function getDatabase(): DatabaseAdapter {
  if (!database) {
    const url = validateDatabaseUrl(process.env.TURSO_DATABASE_URL);
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
    if (!authToken) throw new Error('Set TURSO_AUTH_TOKEN in the server environment.');
    database = createDatabase(createClient({ url, authToken, intMode: 'number' }));
  }
  return database;
}
