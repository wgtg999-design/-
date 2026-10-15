import { authConfigured, getClerkPublishableKey } from './auth-config';
import { isTestSite } from './test-site';

type Dependencies = {
  configured: () => boolean;
  testMode: () => boolean;
  publicKey: () => string | undefined;
  secretKey: () => string | undefined;
  request: typeof fetch;
};
type Metadata = { instanceId: string; environment: 'development' | 'production'; frontendMatchesSecret: boolean };
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };

// These identifiers and the equality result are configuration metadata, not
// credentials or identities. Never query users, sessions, owners or records.
export function createAuthEnvironmentDiagnostic(dependencies: Dependencies) {
  let cached: { value: Metadata; until: number } | null = null;
  let pending: Promise<Metadata> | null = null;
  async function inspect(): Promise<Metadata> {
    const secret = dependencies.secretKey();
    if (!secret) throw Error('Configuration unavailable');
    const read = async (resource: 'instance' | 'domains') => {
      const response = await dependencies.request('https://api.clerk.com/v1/' + resource, {
        method: 'GET', headers: { Authorization: 'Bearer ' + secret }, cache: 'no-store',
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) throw Error('Provider unavailable');
      return response.json();
    };
    const [instance, domains] = await Promise.all([read('instance'), read('domains')]);
    if (!/^ins_[A-Za-z0-9]+$/.test(instance?.id ?? '')
      || !['development', 'production'].includes(instance?.environment_type)) throw Error('Metadata unavailable');
    const domainList = Array.isArray(domains) ? domains : domains?.data;
    if (!Array.isArray(domainList)) throw Error('Metadata unavailable');
    const encoded = dependencies.publicKey()?.replace(/^pk_(?:test|live)_/, '') ?? '';
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
    // The decoded key is only compared with returned public hostnames. It is
    // never used as a fetch destination, preventing an SSRF route.
    const frontendMatchesSecret = domainList.some((domain: { frontend_api_url?: unknown }) => {
      if (typeof domain?.frontend_api_url !== 'string') return false;
      try { return new URL(domain.frontend_api_url).hostname === decoded; } catch { return false; }
    });
    return { instanceId: instance.id, environment: instance.environment_type, frontendMatchesSecret };
  }
  return async function GET() {
    if (!dependencies.testMode() || !dependencies.configured()) {
      return Response.json({ error: '테스트 사이트의 로그인 연결 설정을 먼저 확인해 주세요.' }, { status: 503, headers });
    }
    try {
      if (!cached || cached.until <= Date.now()) {
        pending ??= inspect();
        try { cached = { value: await pending, until: Date.now() + 60000 }; }
        finally { pending = null; }
      }
      return Response.json(cached.value, { headers });
    } catch {
      return Response.json({ error: '로그인 서비스의 연결 환경을 확인하지 못했습니다.' }, { status: 503, headers });
    }
  };
}

export const inspectAuthEnvironment = createAuthEnvironmentDiagnostic({
  configured: authConfigured, testMode: isTestSite,
  publicKey: getClerkPublishableKey, secretKey: () => process.env.CLERK_SECRET_KEY,
  request: (...arguments_) => fetch(...arguments_),
});
