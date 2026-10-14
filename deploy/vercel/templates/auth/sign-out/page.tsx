import { authConfigured, safeRelativeReturnPath } from '../../../runtime/auth';
import AuthUnavailable from '../unavailable';
import SignOutUI from './ui';

export const dynamic = 'force-dynamic';
export default async function SignOutPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRelativeReturnPath((await searchParams).next ?? '/');
  if (!authConfigured()) return <AuthUnavailable />;
  return <SignOutUI next={next} />;
}
