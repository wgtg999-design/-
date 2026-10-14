import { policyPage } from '../../../runtime/policy-pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return policyPage('terms'); }
