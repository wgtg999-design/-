import siteMode from '../site-mode.json';
import { isTestPolicy, TEST_PRIVACY, TEST_TERMS } from './test-policies';

export interface ShopSettings {
  accepting: boolean;
  shippingFee: number;
  bankInfo: string;
  support: string;
  terms: string;
  privacy: string;
  returnGuide: string;
}

// An environment override always wins. Unknown or empty overrides do not
// grant test registration defaults. Never infer test mode from hostname,
// Clerk test keys, NODE_ENV, or a browser-supplied value.
export function isTestSite(): boolean {
  const mode = process.env.STORE_SITE_MODE;
  return (mode === undefined ? siteMode.mode : mode) === 'test';
}

export function getDefaultShopSettings(): ShopSettings {
  return {
    accepting: false,
    shippingFee: 0,
    bankInfo: '',
    support: '',
    terms: isTestSite() ? TEST_TERMS : '',
    privacy: isTestSite() ? TEST_PRIVACY : '',
    returnGuide: '',
  };
}

// Apply mode constraints to a response without modifying the stored row.
// Saved test fixtures must not silently enable registration after LIVE mode
// is selected, even if an administrator previously saved those defaults.
export function normalizeShopSettingsForMode(settings: ShopSettings): ShopSettings {
  if (isTestSite()) return { ...settings, accepting: false };
  return {
    ...settings,
    terms: isTestPolicy(settings.terms) ? '' : settings.terms,
    privacy: isTestPolicy(settings.privacy) ? '' : settings.privacy,
    accepting: (isTestPolicy(settings.terms) || isTestPolicy(settings.privacy)) ? false : settings.accepting,
  };
}
