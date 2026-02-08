import { type MentionInput, type SpoilerInput } from '../types';
import { safeNumber, normalizeIdValue } from './helpers';

export const MENTION_MARK_START = '\u0002';
export const MENTION_MARK_MID = '\u0003';
export const MENTION_MARK_END = '\u0004';
export const SPOILER_MARK_START = '\u0005';
export const SPOILER_MARK_END = '\u0006';
export const MESSAGE_SENDER_CACHE_LIMIT = 200;

export function buildMentionMarker(userId: number | string, name: string) {
  const safeName = String(name || '')
    .split(MENTION_MARK_START).join('')
    .split(MENTION_MARK_MID).join('')
    .split(MENTION_MARK_END).join('');
  return `${MENTION_MARK_START}${userId}${MENTION_MARK_MID}${safeName}${MENTION_MARK_END}`;
}

export function buildSpoilerMarker(text: string) {
  const safeText = String(text || '')
    .split(SPOILER_MARK_START).join('')
    .split(SPOILER_MARK_END).join('');
  return `${SPOILER_MARK_START}${safeText}${SPOILER_MARK_END}`;
}

export function extractMarkedMentions(text: string): { text: string; mentions: MentionInput[] } {
  if (!text || !text.includes(MENTION_MARK_START)) {
    return { text, mentions: [] };
  }

  let out = '';
  const mentions: MentionInput[] = [];
  let mentionIndex = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(MENTION_MARK_START, cursor);
    if (start === -1) {
      out += text.slice(cursor);
      break;
    }

    out += text.slice(cursor, start);
    const mid = text.indexOf(MENTION_MARK_MID, start + 1);
    const end = text.indexOf(MENTION_MARK_END, mid + 1);
    if (mid === -1 || end === -1) {
      out += text.slice(start, start + 1);
      cursor = start + 1;
      continue;
    }

    const userId = text.slice(start + 1, mid);
    const name = text.slice(mid + 1, end);
    const mentionText = `@${name}`;
    mentionIndex += 1;
    const len = name.length || String(userId).length;
    mentions.push({ userId, at: [mentionIndex], len });
    out += mentionText;
    cursor = end + 1;
  }

  return { text: out, mentions };
}

export function extractMarkedSpoilers(text: string): { text: string; spoilers: SpoilerInput[] } {
  if (!text || !text.includes(SPOILER_MARK_START)) {
    return { text, spoilers: [] };
  }

  let out = '';
  const spoilers: SpoilerInput[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(SPOILER_MARK_START, cursor);
    if (start === -1) {
      out += text.slice(cursor);
      break;
    }

    out += text.slice(cursor, start);
    const end = text.indexOf(SPOILER_MARK_END, start + 1);
    if (end === -1) {
      out += text.slice(start, start + 1);
      cursor = start + 1;
      continue;
    }

    const spoilerText = text.slice(start + 1, end);
    const loc = out.length;
    const len = spoilerText.length;
    if (len > 0) {
      spoilers.push({ loc, len });
    }
    out += spoilerText;
    cursor = end + 1;
  }

  return { text: out, spoilers };
}

export function findAllIndices(text: string, token: string) {
  if (!token) return [];
  const indices: number[] = [];
  let start = 0;
  while (start <= text.length) {
    const idx = text.indexOf(token, start);
    if (idx === -1) break;
    indices.push(idx);
    start = idx + token.length;
  }
  return indices;
}

export function normalizeMentionInputs(text: string, mentions?: MentionInput[]) {
  if (!Array.isArray(mentions) || mentions.length === 0) return [];
  const result: Array<{ user_id: number | string; at: number[]; len: number }> = [];

  const occurrenceBuckets = new Map<number, number[]>();
  const occurrenceMeta: Array<{ idx: number; inputIndex: number }> = [];
  const mentionTokens: string[] = [];
  for (let i = 0; i < mentions.length; i += 1) {
    const input = mentions[i];
    const rawAt = (input as any)?.at;
    const hasAt =
      Array.isArray(rawAt)
        ? rawAt.some((v) => safeNumber(v, -1) >= 0)
        : typeof rawAt === 'number' && safeNumber(rawAt, -1) >= 0;
    if (hasAt) continue;

    const mentionText =
      (input as any)?.text ??
      (input as any)?.name ??
      (input as any)?.nickname ??
      (input as any)?.nickName ??
      '';
    if (!mentionText || !text) continue;
    const trimmed = String(mentionText);
    const token = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
    mentionTokens[i] = token;
    const hits = findAllIndices(text, token);
    for (const idx of hits) {
      occurrenceMeta.push({ idx, inputIndex: i });
    }
  }

  if (occurrenceMeta.length > 0) {
    occurrenceMeta.sort((a, b) => a.idx - b.idx);
    let ordinal = 0;
    for (const entry of occurrenceMeta) {
      ordinal += 1;
      const list = occurrenceBuckets.get(entry.inputIndex) || [];
      list.push(ordinal);
      occurrenceBuckets.set(entry.inputIndex, list);
    }
  }

  for (let inputIndex = 0; inputIndex < mentions.length; inputIndex += 1) {
    const input = mentions[inputIndex];
    if (!input) continue;
    const userId = normalizeIdValue(
      (input as any).userId ?? (input as any).user_id ?? (input as any).id ?? 0
    );
    if (!userId) continue;

    const rawAt = (input as any).at;
    let atList = Array.isArray(rawAt) ? rawAt.map((v) => safeNumber(v, -1)).filter((v) => v >= 0) : [];
    if (typeof rawAt === 'number') {
      const idx = safeNumber(rawAt, -1);
      if (idx >= 0) atList = [idx];
    }

    const mentionText =
      (input as any).text ??
      (input as any).name ??
      (input as any).nickname ??
      (input as any).nickName ??
      '';

    let len = safeNumber((input as any).len ?? (input as any).length, 0);
    if (atList.length === 0 && occurrenceBuckets.has(inputIndex)) {
      atList = occurrenceBuckets.get(inputIndex) || [];
    }

    if (atList.length === 0) continue;
    if (!len || len <= 0) {
      len = mentionText ? String(mentionText).replace(/^@/, '').length : 1;
      if (!len || len <= 0) len = 1;
    }

    const cleanedAt = [...new Set(atList)].sort((a, b) => a - b);
    result.push({ user_id: userId, at: cleanedAt, len });
  }

  return result;
}

export function normalizeSpoilerInputs(text: string, spoilers?: SpoilerInput[]) {
  if (!Array.isArray(spoilers) || spoilers.length === 0) return [];
  const result: Array<{ loc: number; len: number }> = [];
  const maxLen = text ? text.length : 0;

  for (const input of spoilers) {
    if (!input) continue;
    let loc = safeNumber(input.loc ?? input.start, -1);
    let len = safeNumber(input.len ?? input.length, 0);
    if ((!len || len <= 0) && input.end !== undefined) {
      const end = safeNumber(input.end, -1);
      if (end >= 0 && loc >= 0) {
        len = end - loc;
      }
    }
    if (loc < 0 || len <= 0) continue;
    if (maxLen > 0) {
      if (loc >= maxLen) continue;
      if (loc + len > maxLen) {
        len = maxLen - loc;
      }
      if (len <= 0) continue;
    }
    result.push({ loc, len });
  }

  result.sort((a, b) => a.loc - b.loc);
  return result;
}

export function extractMentions(raw: any): any[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every((entry) => typeof entry === 'object' && entry && 'user_id' in entry)) {
      return raw;
    }
    for (const entry of raw) {
      if (entry && Array.isArray(entry.mentions)) {
        return entry.mentions;
      }
    }
    return undefined;
  }
  if (typeof raw === 'object' && Array.isArray(raw.mentions)) {
    return raw.mentions;
  }
  return undefined;
}
