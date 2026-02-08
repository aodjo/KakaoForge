import * as LosslessJSON from 'lossless-json';
import { type MemberAction } from '../types';
import { normalizeIdValue } from './helpers';
import { parseAttachmentJson } from './parsing';

export function extractFeedPayload(chatLog: any, attachmentsRaw: any[]): any | null {
  if (chatLog && typeof chatLog === 'object') {
    if (chatLog.feed && typeof chatLog.feed === 'object') return chatLog.feed;
    if (chatLog.message && typeof chatLog.message === 'object') {
      const maybeFeed = chatLog.message as any;
      if (maybeFeed && typeof maybeFeed === 'object' && ('feedType' in maybeFeed || 'ft' in maybeFeed || 'feed' in maybeFeed)) {
        return maybeFeed.feed || maybeFeed;
      }
    }
    if (typeof chatLog.message === 'string') {
      const text = chatLog.message.trim();
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          const parsed = LosslessJSON.parse(text) as any;
          if (parsed && typeof parsed === 'object' && ('feedType' in parsed || 'ft' in parsed || 'feed' in parsed)) {
            return parsed.feed || parsed;
          }
        } catch {
          // ignore
        }
      }
    }
    if (chatLog.extra !== undefined && chatLog.extra !== null) {
      const extra = parseAttachmentJson(chatLog.extra) ?? chatLog.extra;
      if (extra && typeof extra === 'object') {
        if ('feedType' in extra || 'ft' in extra || 'feed' in extra) {
          return (extra as any).feed || extra;
        }
      }
    }
  }

  if (Array.isArray(attachmentsRaw)) {
    for (const entry of attachmentsRaw) {
      if (!entry || typeof entry !== 'object') continue;
      if ('feedType' in entry || 'ft' in entry || 'feed' in entry) {
        return (entry as any).feed || entry;
      }
    }
  }
  return null;
}

export function extractMemberIdsFromPayload(payload: any, opts: { excludeUserId?: boolean } = {}) {
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const id = normalizeIdValue(value);
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };

  if (Array.isArray(payload?.memberIds)) {
    payload.memberIds.forEach(add);
  }
  if (Array.isArray(payload?.mids)) {
    payload.mids.forEach(add);
  }
  if (Array.isArray(payload?.members)) {
    for (const mem of payload.members) {
      add(mem?.userId);
    }
  }
  if (!opts.excludeUserId) {
    add(payload?.userId);
  }
  return out;
}

export function extractFeedMemberIds(feed: any) {
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const id = normalizeIdValue(value);
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };
  if (feed?.member && typeof feed.member === 'object') {
    add(feed.member.userId);
  }
  if (Array.isArray(feed?.members)) {
    for (const mem of feed.members) {
      add(mem?.userId);
    }
  }
  return out;
}

export function extractPushMemberIds(body: any, method: string) {
  const out: Array<number | string> = [];
  const seen = new Set<string>();
  const add = (value: any) => {
    const id = normalizeIdValue(value);
    if (!id) return;
    const key = String(id);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(id);
  };

  if (method === 'DELMEM' && body?.kid !== undefined) {
    add(body.kid);
  }

  if (Array.isArray(body?.memberIds)) {
    body.memberIds.forEach(add);
  }

  if (Array.isArray(body?.members)) {
    for (const mem of body.members) {
      add(mem?.userId);
    }
  }

  if (body?.userId !== undefined) {
    add(body.userId);
  }

  return out;
}

export function buildMemberNameMap(payload: any) {
  const map = new Map<string, string>();
  const add = (idValue: any, nameValue: any) => {
    const id = normalizeIdValue(idValue);
    if (!id) return;
    const name = nameValue ? String(nameValue) : '';
    map.set(String(id), name);
  };
  if (Array.isArray(payload?.members)) {
    for (const mem of payload.members) {
      add(mem?.userId, mem?.nickName ?? mem?.nickname ?? mem?.name);
    }
  }
  add(payload?.userId, payload?.memberName ?? payload?.nickName);
  return map;
}

export function buildFeedMemberNameMap(feed: any) {
  const map = new Map<string, string>();
  const add = (idValue: any, nameValue: any) => {
    const id = normalizeIdValue(idValue);
    if (!id) return;
    const name = nameValue ? String(nameValue) : '';
    map.set(String(id), name);
  };
  if (feed?.member && typeof feed.member === 'object') {
    add(feed.member.userId, feed.member.nickName);
  }
  if (Array.isArray(feed?.members)) {
    for (const mem of feed.members) {
      add(mem?.userId, mem?.nickName);
    }
  }
  return map;
}

export function extractActorIdFromPayload(payload: any) {
  return normalizeIdValue(
    payload?.actorId ??
      payload?.aid ??
      payload?.inviterId ??
      payload?.fromUserId ??
      payload?.ownerId ??
      0
  );
}

export const PUSH_MEMBER_ACTIONS: Record<string, MemberAction> = {
  NEWMEM: 'join',
  JOIN: 'join',
  INVMEM: 'invite',
  INVITEMEM: 'invite',
  DELMEM: 'leave',
  LEAVEMEM: 'leave',
  LEAVE: 'leave',
  KICKMEM: 'kick',
  KICK: 'kick',
};

export const PUSH_DELETE_ACTIONS = new Set(['DELETEMSG', 'DELMSG', 'DELM', 'DELMESSAGE', 'MSGDEL', 'SYNCDLMSG']);
export const PUSH_HIDE_ACTIONS = new Set(['BLIND', 'BLINDMSG', 'HIDEMSG', 'HIDE', 'SYNCREWR']);

export const DEFAULT_FEED_TYPE_MAP: Record<number, MemberAction> = {
  4: 'join',
  6: 'kick',
};

export function resolveMemberActionFromPush(method: string): MemberAction | null {
  return PUSH_MEMBER_ACTIONS[method] || null;
}

export function resolveDeleteActionFromPush(method: string): boolean {
  const key = String(method || '').toUpperCase();
  return PUSH_DELETE_ACTIONS.has(key);
}

export function resolveHideActionFromPush(method: string): boolean {
  const key = String(method || '').toUpperCase();
  return PUSH_HIDE_ACTIONS.has(key);
}

export function normalizeMemberAction(value: any): MemberAction | null {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (text.includes('join') || text.includes('enter')) return 'join';
  if (text.includes('leave') || text.includes('exit')) return 'leave';
  if (text.includes('invite')) return 'invite';
  if (text.includes('kick') || text.includes('ban')) return 'kick';
  return null;
}
