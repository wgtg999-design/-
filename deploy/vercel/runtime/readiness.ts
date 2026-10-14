import { getDatabase, validateDatabaseUrl } from './database';
import { authConfigured as authSettingsPresent, getAuthConfigurationStatus } from './auth-config';
import { contentSchema } from '../lib/content';
import { isTestSite } from './test-site';
import { isTestPolicy } from './test-policies';

const schemaQueries = [
  'SELECT key,data,revision,updated_at FROM store_content WHERE 0',
  'SELECT key,user_id FROM store_owner WHERE 0',
  'SELECT user_id,email,name,phone,consent_version,created_at FROM shop_customers WHERE 0',
  'SELECT sku,product_id,size,stock,max_order,enabled,revision FROM shop_inventory WHERE 0',
  'SELECT key,data,revision FROM shop_settings WHERE 0',
  'SELECT id,user_id,request_key,items,address,total,shipping_fee,status,payment,request_from,carrier,tracking,refund_ref,restock,restocked,revision,catalog_revision,settings_revision,last_actor,last_note,created_at,updated_at,action_token FROM shop_orders WHERE 0',
  'SELECT id,order_id,actor,action,note,created_at FROM shop_events WHERE 0',
  'SELECT provider_user_id,legacy_user_id,verified_at FROM auth_identity_links WHERE 0',
  'SELECT id,user_id,object_key,content_type,byte_length,expires_at,status,final_key FROM store_upload_tickets WHERE 0'
];

/** Public diagnostics: only coarse status, never keys, identities or records. */
export async function getReadiness() {
  const testMode = isTestSite();
  const result = {
    databaseConfigured: false, databaseConnected: false, schemaReady: false,
    catalog: 'unavailable' as 'unavailable' | 'initial-sample' | 'stored',
    legalReady: false, ownerRegistered: false,
    ownerBootstrapConfigured: !!process.env.OWNER_BOOTSTRAP_EMAIL?.trim(),
    authConfigured: authSettingsPresent(), authConfiguration: getAuthConfigurationStatus(),
    imageConfigured: false, uploadConfigured: false,
    testMode, testPoliciesAvailable: testMode,
  };
  result.imageConfigured = /^[a-f0-9]{32}$/.test(process.env.R2_ACCOUNT_ID ?? '')
    && !!process.env.R2_ACCESS_KEY_ID?.trim() && !!process.env.R2_SECRET_ACCESS_KEY?.trim()
    && !!process.env.R2_BUCKET_NAME?.trim();
  result.uploadConfigured = result.imageConfigured && Buffer.byteLength(process.env.UPLOAD_SIGNING_SECRET ?? '', 'utf8') >= 32;
  try {
    validateDatabaseUrl(process.env.TURSO_DATABASE_URL?.trim() || process.env.TURSO_URL?.trim());
    result.databaseConfigured = !!(process.env.TURSO_AUTH_TOKEN?.trim() || process.env.TURSO_TOKEN?.trim()
      || process.env.TURSO_DATABASE_AUTH_TOKEN?.trim() || process.env.TURSO_DATABASE_TOKEN?.trim());
  } catch { /* A configuration value must never be returned in an error. */ }
  if (!result.databaseConfigured) return result;
  try {
    const db = getDatabase();
    await db.prepare('SELECT 1 AS connected').first();
    result.databaseConnected = true;
    const checks = await Promise.allSettled(schemaQueries.map(sql => db.prepare(sql).all()));
    result.schemaReady = checks.every(check => check.status === 'fulfilled');
    if (!result.schemaReady) return result;
    const [catalog,settings,owner] = await Promise.allSettled([
      db.prepare('SELECT data FROM store_content WHERE key=?').bind('main').first<{data:string}>(),
      db.prepare('SELECT data FROM shop_settings WHERE key=?').bind('main').first<{data:string}>(),
      db.prepare('SELECT 1 AS registered FROM store_owner WHERE key=?').bind('owner').first()
    ]);
    if (catalog.status === 'fulfilled') {
      try {
        if (catalog.value) { contentSchema.parse(JSON.parse(catalog.value.data)); result.catalog = 'stored'; }
        else result.catalog = 'initial-sample';
      } catch { /* Invalid saved content must not mask other independent checks. */ }
    }
    if (settings.status === 'fulfilled' && settings.value) {
      result.testPoliciesAvailable = false;
      try {
        const value = JSON.parse(settings.value.data);
        result.legalReady = typeof value?.terms === 'string' && !!value.terms.trim()
          && typeof value?.privacy === 'string' && !!value.privacy.trim()
          && (testMode || !(isTestPolicy(value.terms) || isTestPolicy(value.privacy)));
      } catch { /* No private policy contents or parse details are exposed. */ }
    }
    result.ownerRegistered = owner.status === 'fulfilled' && !!owner.value;
  } catch { /* Suppress SDK details, JSON contents and all credential values. */ }
  return result;
}
