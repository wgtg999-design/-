import { defaults } from '../lib/content';
import { readStore } from '../lib/store';
import { settings, stocks, sku } from '../lib/commerce';
import { getDatabase } from './database';
import { getDefaultShopSettings, isTestSite, type ShopSettings } from './test-site';

type Store = Awaited<ReturnType<typeof readStore>>;
type Inventory = Awaited<ReturnType<typeof stocks>>;
type DatabaseProbe = {
  prepare(sql: string): { first<T>(): Promise<T | null> };
};
type Dependencies = {
  testMode: () => boolean;
  environment: () => Record<string, string | undefined>;
  database: () => DatabaseProbe;
  readStore: () => Promise<Store>;
  readSettings: () => Promise<{ settings: ShopSettings; revision: number }>;
  readStocks: () => Promise<Inventory>;
  defaultSettings: () => ShopSettings;
};
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const urlNames = ['TURSO_DATABASE_URL', 'TURSO_URL'];
const tokenNames = ['TURSO_AUTH_TOKEN', 'TURSO_TOKEN', 'TURSO_DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_TOKEN'];
const errorMessage = '상품 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';

function visibleStore(store: Store): Store {
  return { ...store, content: { ...store.content, products: store.content.products.filter(product => product.visible) } };
}

// Only the public catalogue and settings can show an explicitly labelled
// prototype. This helper never initializes a schema, seeds rows, checks an
// owner, creates a member, or supplies stock. Configured failures and any
// pre-existing user table always close the fallback.
export function createTestCatalogGateway(dependencies: Dependencies) {
  async function sampleSource(): Promise<'test-unconfigured-database' | 'test-empty-database' | null> {
    if (!dependencies.testMode()) return null;
    const environment = dependencies.environment();
    const hasUrl = urlNames.some(name => !!environment[name]?.trim());
    const hasToken = tokenNames.some(name => !!environment[name]?.trim());
    if (!hasUrl && !hasToken) return 'test-unconfigured-database';
    if (!hasUrl || !hasToken) return null;
    try {
      const row = await dependencies.database().prepare(
        "SELECT COUNT(*) AS userTables FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*'",
      ).first<{ userTables: number }>();
      return row?.userTables === 0 ? 'test-empty-database' : null;
    } catch {
      return null;
    }
  }

  function unavailable() {
    return Response.json({ error: errorMessage }, { status: 503, headers });
  }

  async function content(): Promise<Response> {
    try {
      return Response.json(visibleStore(await dependencies.readStore()), { headers });
    } catch {
      const source = await sampleSource();
      return source ? Response.json({
        ...visibleStore({ content: defaults, revision: 0, updatedAt: null }), testOnly: true, source,
      }, { headers }) : unavailable();
    }
  }

  async function publicShop(view: 'settings' | 'stock'): Promise<Response> {
    try {
      if (view === 'settings') return Response.json(await dependencies.readSettings(), { headers });
      const store = await dependencies.readStore();
      const visible = new Set(store.content.products.filter(product => product.visible).flatMap(
        product => product.sizes.map(size => sku(product.id, size)),
      ));
      const inventory = (await dependencies.readStocks()).filter(row => visible.has(String(row.sku))).map(row => ({
        sku: row.sku, stock: row.stock, maxOrder: row.max_order, enabled: !!row.enabled,
      }));
      return Response.json({ inventory }, { headers });
    } catch {
      const source = await sampleSource();
      if (!source) return unavailable();
      const data = view === 'settings'
        ? { settings: dependencies.defaultSettings(), revision: 0 }
        : { inventory: [] };
      return Response.json({ ...data, testOnly: true, source }, { headers });
    }
  }

  return { content, publicShop };
}

const gateway = createTestCatalogGateway({
  testMode: isTestSite,
  environment: () => process.env,
  database: getDatabase,
  readStore,
  readSettings: settings,
  readStocks: stocks,
  defaultSettings: getDefaultShopSettings,
});
export const publicContent = gateway.content;
export const publicShop = gateway.publicShop;
