import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDatabase } from './database';
import { authConfigured } from './auth-config';
export { authConfigured, isTrustedOrigin } from './auth-config';

// These export names are retained only so the original commerce code can be
// generated unchanged. The Vercel identity provider is Clerk, never Sites.
export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
export type ClerkAccountState =
  | { status: 'unavailable' | 'signed-out' | 'unverified'; user: null }
  | { status: 'verified'; user: { providerUserId: string; email: string; fullName: string | null } };

/** Require the managed cookie session AND a verified primary email. */
export async function getClerkAccountState(): Promise<ClerkAccountState> {
  if (!authConfigured()) return { status: 'unavailable', user: null };
  try {
    const session = await auth();
    if (!session.userId) return { status: 'signed-out', user: null };
    const user = await currentUser();
    if (!user || user.id !== session.userId) return { status: 'unverified', user: null };
    const primary = user.emailAddresses.find(address => address.id === user.primaryEmailAddressId);
    if (!primary || primary.verification?.status !== 'verified' || !primary.emailAddress?.trim()) {
      return { status: 'unverified', user: null };
    }
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || null;
    return {
      status: 'verified',
      user: { providerUserId: user.id, email: primary.emailAddress.trim(), fullName },
    };
  } catch {
    // Missing/invalid credentials, invalid session tokens, and unavailable
    // provider services all fail closed. Never trust client oai-* headers.
    return { status: 'unavailable', user: null };
  }
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const account = await getClerkAccountState();
  if (account.status !== 'verified') return null;
  try {
    const link = await getDatabase().prepare(
      'SELECT legacy_user_id, verified_at FROM auth_identity_links WHERE provider_user_id = ?',
    ).bind(account.user.providerUserId).first<{ legacy_user_id: string; verified_at: string }>();
    if (link && (!link.legacy_user_id || !Number.isFinite(Date.parse(link.verified_at)))) return null;
    return {
      userId: link?.legacy_user_id ?? `clerk:${account.user.providerUserId}`,
      displayName: account.user.fullName ?? account.user.email,
      email: account.user.email,
      fullName: account.user.fullName,
    };
  } catch {
    // A missing migration/DB must not produce an unlinked identity that could
    // bootstrap a replacement owner or detach an existing member's orders.
    return null;
  }
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  return `/auth/sign-in?next=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  return `/auth/sign-out?next=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

/** Only internal return paths are accepted, including after Clerk callbacks. */
export function safeRelativeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return '/';
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://store.invalid');
    if (url.origin !== 'https://store.invalid') return '/';
    let pathname = url.pathname;
    for (let iteration = 0; iteration < 4; iteration++) {
      const decoded = decodeURIComponent(pathname);
      if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith('//')) return '/';
      const normalized = new URL(decoded, 'https://store.invalid').pathname.toLowerCase();
      if (normalized === '/auth' || normalized.startsWith('/auth/') || [
        '/signin-with-chatgpt', '/signout-with-chatgpt', '/callback',
      ].some(path => normalized === path || normalized.startsWith(path + '/'))) return '/';
      if (decoded === pathname) return `${url.pathname}${url.search}${url.hash}`;
      pathname = decoded;
    }
  } catch { return '/'; }
  return '/';
}
