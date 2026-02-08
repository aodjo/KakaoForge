import * as fs from 'fs';
import * as crypto from 'crypto';
import { Long } from 'bson';
import * as LosslessJSON from 'lossless-json';
import { type AuthFile } from '../types';

export function loadAuthFile(authPath: string): AuthFile {
  if (!fs.existsSync(authPath)) {
    throw new Error(`auth.json not found at ${authPath}. Run createAuthByQR() first.`);
  }
  const raw = fs.readFileSync(authPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid auth.json at ${authPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function sleepMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uniqueStrings(list: any[]) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

export function uniqueNumbers(list: any[]) {
  if (!Array.isArray(list)) return [];
  const nums = list.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  return [...new Set(nums)];
}

export function toLong(value: any) {
  if (Long.isLong(value)) return value;
  if (typeof value === 'string') {
    if (!value) return Long.fromNumber(0);
    return Long.fromString(value);
  }
  if (typeof value === 'bigint') return Long.fromString(value.toString());
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  return Long.fromNumber(Number.isFinite(num) ? num : 0);
}

export function safeNumber(value: any, fallback = 0) {
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

export async function sha1FileHex(filePath: string) {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function isBlankText(value: any) {
  if (value === undefined || value === null) return true;
  return String(value).trim().length === 0;
}

export function truncateChatLogMessage(value: string) {
  if (!value) return value;
  if (value.length <= 500) return value;
  return `${value.slice(0, 500)} ...`;
}

export function stringifyLossless(obj: unknown) {
  return LosslessJSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint' || Long.isLong(value)) {
      return new (LosslessJSON as any).LosslessNumber(value.toString());
    }
    return value;
  });
}

export function previewLossless(obj: unknown, maxLen = 800) {
  let text = '';
  try {
    text = stringifyLossless(obj);
  } catch {
    text = String(obj);
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen)}...`;
  }
  return text;
}

export function formatKstTimestamp(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

export function normalizeIdValue(value: any): number | string {
  if (value === undefined || value === null) return 0;
  if (Long.isLong(value)) {
    const str = value.toString();
    const num = Number(str);
    if (Number.isSafeInteger(num) && num >= 0) return num;
    return str;
  }
  if (typeof value === 'bigint') {
    const str = value.toString();
    const num = Number(str);
    if (Number.isSafeInteger(num) && num >= 0) return num;
    return str;
  }
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const num = Number(trimmed);
    if (Number.isSafeInteger(num) && num >= 0) return num;
    return trimmed;
  }
  return 0;
}

export function toUnixSeconds(value?: number | Date) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(num)) return undefined;
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

export function snapToFiveMinutes(date: Date, mode: 'floor' | 'round' | 'ceil' = 'ceil') {
  const step = 5 * 60 * 1000;
  const ms = date.getTime();
  const remainder = ms % step;
  if (remainder === 0) return new Date(ms);
  let snapped: number;
  if (mode === 'floor') snapped = Math.floor(ms / step) * step;
  else if (mode === 'round') snapped = Math.round(ms / step) * step;
  else snapped = Math.ceil(ms / step) * step;
  return new Date(snapped);
}

export function toDate(value?: number | Date) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(num)) return null;
  return num > 1e12 ? new Date(num) : new Date(num * 1000);
}

export function formatCalendarDate(date: Date) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function resolveTimeZone(fallback = 'Asia/Seoul') {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // ignore
  }
  return fallback;
}

export function pickFirstValue<T>(...values: T[]): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function pickFirstObject(...values: any[]) {
  for (const v of values) {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  }
  return undefined;
}
