import { redirect } from 'next/navigation';
import { authConfigured, getChatGPTUser, getClerkAccountState, safeRelativeReturnPath } from '../../../../runtime/auth';
import AuthUI from '../../ui';
import AuthUnavailable from '../../unavailable';

export const dynamic = 'force-dynamic';
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRelativeReturnPath((await searchParams).next ?? '/account');
  if (!authConfigured()) return <AuthUnavailable />;
  const account = await getClerkAccountState();
  if (account.status === 'verified') {
    if (next === '/setup' || await getChatGPTUser()) redirect(next);
    return <AuthUnavailable />;
  }
  if (account.status === 'unverified') redirect(`/auth/verify-email?next=${encodeURIComponent(next)}`);
  if (account.status === 'unavailable') return <AuthUnavailable />;
  return <AuthUI mode="sign-in" next={next} publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!} />;
}
