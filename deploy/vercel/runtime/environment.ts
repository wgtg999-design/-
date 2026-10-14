import { getDatabase } from './database';
import { getBucket } from './storage';

// Server-only adapters. These never interpret browser-supplied login headers.
export const env = {
  get DB() { return getDatabase(); },
  get BUCKET() { return getBucket(); },
  get OWNER_BOOTSTRAP_EMAIL() { return process.env.OWNER_BOOTSTRAP_EMAIL; }
};
