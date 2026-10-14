import { shopGet, shopPost } from '../../../lib/commerce';
import { publicShop } from '../../../runtime/test-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const view = new URL(request.url).searchParams.get('view');
  if (view === 'settings' || view === 'stock') return publicShop(view);
  // Profiles, orders, and every mutation retain the verified identity and
  // original database/origin checks. There are no demo users or orders.
  return shopGet(request);
}
export const POST = shopPost;
