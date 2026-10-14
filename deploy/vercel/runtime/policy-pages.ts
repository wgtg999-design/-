import { getDatabase } from './database';
import { isTestSite } from './test-site';
import { isTestPolicy, TEST_BUSINESS, TEST_NOTICE, TEST_PRIVACY, TEST_TERMS } from './test-policies';

type PolicyKind = 'terms' | 'privacy';
type PolicyDocument = { text: string; available: boolean; source: 'stored' | 'test-defaults' | 'unavailable' };
const titles = { terms: '이용약관', privacy: '개인정보 안내' } as const;
const noStore = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

function escapeHtml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

function unavailable(text: string): PolicyDocument { return { text, available: false, source: 'unavailable' }; }

export async function getPolicyDocument(kind: PolicyKind): Promise<PolicyDocument> {
  try {
    const row = await getDatabase().prepare('SELECT data FROM shop_settings WHERE key=?').bind('main').first<{ data: string }>();
    if (row) {
      let data: unknown;
      try { data = JSON.parse(row.data); }
      catch { return unavailable('저장된 안내를 확인하지 못했습니다. 현재 회원가입을 개통할 수 없습니다.'); }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const value = (data as Record<string, unknown>)[kind];
        if (!isTestSite() && isTestPolicy(value)) return unavailable('테스트 문서를 실제 운영 안내로 사용할 수 없습니다. 운영 안내를 준비 중입니다.');
        if (typeof value === 'string' && value.trim() && value.length <= 15000) return { text: value, available: true, source: 'stored' };
      }
      // An existing row is authoritative. A deliberately blank or invalid
      // saved policy never acquires fallback consent wording.
      return unavailable('안내를 준비 중입니다. 현재 회원가입을 개통할 수 없습니다.');
    }
  } catch {
    // Display-only public test docs may be read before DB initialization.
    // This does not authenticate anyone or permit registration without DB.
    if (!isTestSite()) return unavailable('안내를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');
  }
  return isTestSite()
    ? { text: kind === 'terms' ? TEST_TERMS : TEST_PRIVACY, available: true, source: 'test-defaults' }
    : unavailable('안내를 준비 중입니다. 현재 회원가입을 개통할 수 없습니다.');
}

export async function policyPage(kind: PolicyKind): Promise<Response> {
  const document = await getPolicyDocument(kind);
  const testMode = isTestSite();
  const title = titles[kind];
  const testNotice = testMode ? `<p class="notice" role="note">${escapeHtml(TEST_NOTICE)}</p>` : '';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}${testMode ? ' · 테스트 전용' : ''}</title><link rel="stylesheet" href="/commerce.css"><style>.policy-page{background:#fafafa;color:#171717}.policy-page header{background:#fff;color:#171717;border-bottom:1px solid #dedede;gap:20px;flex-wrap:wrap}.policy-page main{max-width:900px}.policy-page article{white-space:pre-wrap;font-size:13px;line-height:1.95;overflow-wrap:anywhere;margin:28px 0}.policy-page nav{flex-wrap:wrap}.policy-page .notice{color:#555;margin:24px 0}.policy-page a:focus-visible{outline:2px solid #171717;outline-offset:4px}@media(max-width:650px){.policy-page main{padding:30px 16px 60px}.policy-page header{padding:18px 16px}.policy-page article{font-size:12px}}</style></head><body class="policy-page"><header><a href="/">${testMode ? 'YOUR LABEL · TEST' : 'SHOP'}</a><nav aria-label="안내 메뉴"><a href="/">홈페이지</a><a href="/signup">로그인 / 회원가입</a><a href="/policies/terms">이용약관</a><a href="/policies/privacy">개인정보 안내</a></nav></header><main><p class="eyebrow">${testMode ? 'TEST SITE · 2026-10-14' : 'POLICY'}</p><h1>${title}</h1>${testNotice}<article>${escapeHtml(document.text)}</article><a class="text-link" href="/signup">회원가입 화면으로</a></main></body></html>`;
  return new Response(html, {
    status: document.available ? 200 : 503,
    headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function policyLinks(): Promise<Response> {
  const testMode = isTestSite();
  const [terms, privacy] = await Promise.all([getPolicyDocument('terms'), getPolicyDocument('privacy')]);
  if (!terms.available || !privacy.available) return Response.json({ error: '안내를 준비 중입니다.' }, { status: 503, headers: noStore });
  return Response.json({
    testOnly: testMode,
    source: terms.source === 'test-defaults' || privacy.source === 'test-defaults' ? 'test-defaults' : 'stored',
    business: testMode ? TEST_BUSINESS : null,
    terms: '/policies/terms',
    privacy: '/policies/privacy',
  }, { headers: noStore });
}
