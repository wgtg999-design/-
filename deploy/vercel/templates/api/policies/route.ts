import { policyLinks } from '../../../runtime/policy-pages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() { return policyLinks(); }
