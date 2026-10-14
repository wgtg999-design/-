import { getBucket } from '../../../runtime/storage';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) return new Response('Not found', { status: 404 });
  try {
    const url = await getBucket().presignGet(key);
    if (!url) return new Response('Not found', { status: 404 });
    return new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return new Response('이미지 저장소 연결을 확인해 주세요.', { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
