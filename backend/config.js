import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STORAGE = path.resolve(process.env.STORAGE_DIR || path.join(ROOT, 'storage'));
export const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
export const PRODUCTION = process.env.NODE_ENV === 'production';
export const PRICE_PAISE = 4900;
export const PERIOD_DAYS = 30; // Published policy: each purchase/trial lasts 30 days, no automatic debit.
if (PRODUCTION && !ORIGIN.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS');
