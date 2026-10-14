#!/usr/bin/env node
import fs from 'node:fs/promises';
import { hostedClient, assertInitialized, isMain, fail } from './database-tools.mjs';

export function validateMappings(input) {
  if (!Array.isArray(input) || !input.length || input.length > 1000) throw new Error('Provide 1–1000 explicit identity mappings.');
  const providers = new Set(), legacy = new Set();
  return input.map(item => {
    if (!item || Object.keys(item).length !== 2 || typeof item.providerUserId !== 'string' || !/^user_[a-zA-Z0-9]+$/.test(item.providerUserId) || typeof item.legacyUserId !== 'string' || item.legacyUserId.length < 1 || item.legacyUserId.length > 200 || /[\x00-\x1f\x7f]/.test(item.legacyUserId)) {
      throw new Error('Each mapping must contain only providerUserId (Clerk user ID) and legacyUserId.');
    }
    if (providers.has(item.providerUserId) || legacy.has(item.legacyUserId)) throw new Error('Duplicate provider or legacy IDs are forbidden.');
    providers.add(item.providerUserId); legacy.add(item.legacyUserId);
    return { providerUserId:item.providerUserId,legacyUserId:item.legacyUserId };
  });
}

export async function verifiedProviderEmail(providerUserId, fetcher=fetch) {
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!secret) throw new Error('Set CLERK_SECRET_KEY in the server environment.');
  const response = await fetcher('https://api.clerk.com/v1/users/'+encodeURIComponent(providerUserId), {
    headers:{Authorization:'Bearer '+secret},signal:AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Clerk user verification failed; no identities were linked.');
  const user = await response.json();
  const email = user.email_addresses?.find(item => item.id === user.primary_email_address_id);
  if (user.id !== providerUserId || !email || email.verification?.status !== 'verified' || typeof email.email_address !== 'string') {
    throw new Error('Each mapped Clerk user must have a verified primary email.');
  }
  return email.email_address.trim().toLowerCase();
}

export async function linkIdentities(client, input, {apply=false, verifyEmail=verifiedProviderEmail}={}) {
  const mappings = validateMappings(input);
  await assertInitialized(client);
  const statements = [];
  for (const item of mappings) {
    const customer = await client.execute({sql:'SELECT email FROM shop_customers WHERE user_id=?',args:[item.legacyUserId]});
    const owner = await client.execute({sql:"SELECT user_id FROM store_owner WHERE key='owner' AND user_id=?",args:[item.legacyUserId]});
    if (!customer.rows.length && !owner.rows.length) throw new Error('A legacy identity does not exist as a member or pinned owner.');
    const email = await verifyEmail(item.providerUserId);
    const memberEmail = customer.rows[0]?.email;
    const ownerEmail = process.env.OWNER_BOOTSTRAP_EMAIL?.trim().toLowerCase();
    if (!(typeof memberEmail === 'string' && memberEmail.trim().toLowerCase() === email) && !(owner.rows.length && ownerEmail && ownerEmail === email)) {
      throw new Error('Verified provider email does not match the explicitly selected legacy member or confirmed owner.');
    }
    const links = await client.execute({sql:'SELECT provider_user_id,legacy_user_id FROM auth_identity_links WHERE provider_user_id=? OR legacy_user_id=?',args:[item.providerUserId,item.legacyUserId]});
    if (links.rows.some(row => row.provider_user_id !== item.providerUserId || row.legacy_user_id !== item.legacyUserId)) {
      throw new Error('An existing identity link cannot be reassigned.');
    }
    // Uniqueness and a NULL constraint fail conflicting concurrent linking.
    // The existence/email check is repeated inside the write transaction.
    statements.push({sql:`INSERT INTO auth_identity_links(provider_user_id,legacy_user_id,verified_at)
      SELECT CASE WHEN EXISTS(SELECT 1 FROM shop_customers WHERE user_id=? AND lower(trim(email))=?)
      OR (?=1 AND EXISTS(SELECT 1 FROM store_owner WHERE key='owner' AND user_id=?)) THEN ? ELSE NULL END,?,?
      ON CONFLICT(provider_user_id) DO UPDATE SET legacy_user_id=CASE WHEN auth_identity_links.legacy_user_id=excluded.legacy_user_id THEN auth_identity_links.legacy_user_id ELSE NULL END`,
      args:[item.legacyUserId,email,owner.rows.length && ownerEmail === email ? 1 : 0,item.legacyUserId,item.providerUserId,item.legacyUserId,new Date().toISOString()]});
  }
  if (apply) await client.batch(statements,'write');
  return { checked:mappings.length,linked:apply ? mappings.length : 0 };
}

async function main() {
  const [mode,file,...rest] = process.argv.slice(2);
  if (!['--plan','--check','--apply'].includes(mode) || !file || rest.length) throw new Error('Usage: node scripts/link-identities.mjs --plan mappings.json | --check mappings.json | --apply mappings.json');
  const mappings = validateMappings(JSON.parse(await fs.readFile(file,'utf8')));
  if (mode === '--plan') {
    console.log(`Validated ${mappings.length} explicit ID pairs. No connection, email verification or database write was performed.`);
    return;
  }
  const client = hostedClient();
  try {
    const result = await linkIdentities(client,mappings,{apply:mode === '--apply'});
    console.log(`Verified ${result.checked} explicit mappings; linked ${result.linked}. Existing links cannot be reassigned.`);
  } finally { client.close(); }
}

if (isMain(import.meta.url)) main().catch(fail);
