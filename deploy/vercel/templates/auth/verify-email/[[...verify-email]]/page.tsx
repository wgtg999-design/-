import { redirect } from 'next/navigation';
import { authConfigured, getChatGPTUser, getClerkAccountState, safeRelativeReturnPath } from '../../../../runtime/auth';
import { getClerkPublishableKey } from '../../../../runtime/auth-config';
import AuthUI from '../../ui';
import AuthUnavailable from '../../unavailable';
import AccountConnectionPending from '../../connection-pending';

export const dynamic = 'force-dynamic';
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRelativeReturnPath((await searchParams).next ?? '/account');
  if (!authConfigured()) return <AuthUnavailable />;
  const account = await getClerkAccountState();
  if (account.status === 'verified') {
    if (next === '/setup' || await getChatGPTUser()) redirect(next);
    return <AccountConnectionPending next={next} />;
  }
  if (account.status === 'signed-out') redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  if (account.status === 'unavailable') return <AuthUnavailable />;
  return <AuthUI mode="verify-email" next={next} publishableKey={getClerkPublishableKey()!} />;
}
