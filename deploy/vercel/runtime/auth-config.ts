/** Server-only environment configuration; never derive trust from Host headers. */
function configuredOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const secure = url.protocol === 'https:';
    const localDevelopment = process.env.NODE_ENV !== 'production' && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return secure || localDevelopment ? url.origin : null;
  } catch { return null; }
}

export function trustedOrigins(): string[] {
  const canonical = configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (!canonical) return [];
  const origins = [canonical];
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
      && /^[a-zA-Z0-9.-]+$/.test(process.env.VERCEL_URL)) {
    const preview = configuredOrigin(`https://${process.env.VERCEL_URL}`);
    if (preview && !origins.includes(preview)) origins.push(preview);
  }
  return origins;
}

export function isTrustedOrigin(origin: string | null): boolean {
  return origin !== null && trustedOrigins().includes(origin);
}

export function authConfigured(): boolean {
  return trustedOrigins().length > 0
    && /^pk_(?:test|live)_\S+$/.test(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '')
    && /^sk_(?:test|live)_\S+$/.test(process.env.CLERK_SECRET_KEY ?? '');
}
