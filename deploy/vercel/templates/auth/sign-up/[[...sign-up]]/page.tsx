import { redirect } from 'next/navigation';
import { authConfigured, getChatGPTUser, getClerkAccountState, safeRelativeReturnPath } from '../../../../runtime/auth';
import { getClerkPublishableKey } from '../../../../runtime/auth-config';
import AuthUI from '../../ui';
import AuthUnavailable from '../../unavailable';
import AccountConnectionPending from '../../connection-pending';

export const dynamic = 'force-dynamic';
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRelativeReturnPath((await searchParams).next ?? '/signup');
  if (!authConfigured()) return <AuthUnavailable />;
  const account = await getClerkAccountState();
  if (account.status === 'verified') {
    if (next === '/setup' || await getChatGPTUser()) redirect(next);
    return <AccountConnectionPending next={next} />;
  }
  if (account.status === 'unverified') redirect(`/auth/verify-email?next=${encodeURIComponent(next)}`);
  if (account.status === 'unavailable') return <AuthUnavailable />;
  return <AuthUI mode="sign-up" next={next} publishableKey={getClerkPublishableKey()!} />;
}
