import { Long } from 'bson';
import { type AttachmentInput, type ReplyTarget, type ReplyOptions, type MessageEvent } from '../types';
import { stringifyLossless, toUnixSeconds, normalizeIdValue, safeNumber, toLong } from './helpers';
import { extractChatLogPayload, extractOpenLinkIdFromRaw, buildSpamChatLogInfo } from './parsing';

export function buildExtra(attachment?: AttachmentInput, extra?: string) {
  if (typeof extra === 'string' && extra.length > 0) return extra;
  if (attachment === undefined || attachment === null) return undefined;
  if (typeof attachment === 'string') return attachment;
  try {
    return stringifyLossless(attachment);
  } catch {
    return String(attachment);
  }
}

export function normalizeMediaAttachment(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const attachment: any = { ...input };
  if (attachment.size !== undefined && attachment.s === undefined) attachment.s = attachment.size;
  if (attachment.mime !== undefined && attachment.mt === undefined) attachment.mt = attachment.mime;
  if (attachment.duration !== undefined && attachment.d === undefined) attachment.d = attachment.duration;
  if (attachment.width !== undefined && attachment.w === undefined) attachment.w = attachment.width;
  if (attachment.height !== undefined && attachment.h === undefined) attachment.h = attachment.height;
  if (attachment.token !== undefined && attachment.tk === undefined) attachment.tk = attachment.token;
  if (attachment.tokenHigh !== undefined && attachment.tkh === undefined) attachment.tkh = attachment.tokenHigh;
  if (attachment.urlHigh !== undefined && attachment.urlh === undefined) attachment.urlh = attachment.urlHigh;
  return attachment;
}

export function normalizeFileAttachment(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const attachment: any = { ...input };
  if (attachment.size === undefined && attachment.s !== undefined) attachment.size = attachment.s;
  if (attachment.name === undefined && attachment.filename !== undefined) attachment.name = attachment.filename;
  return attachment;
}

export function normalizeLocationAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && 'lat' in input && 'lng' in input) {
    const attachment: any = {
      lat: Number(input.lat),
      lng: Number(input.lng),
    };
    if (input.address) attachment.a = input.address;
    if (input.title) attachment.t = input.title;
    if (typeof input.isCurrent === 'boolean') attachment.c = input.isCurrent;
    if (input.placeId !== undefined) attachment.cid = String(input.placeId);
    if (input.extra && typeof input.extra === 'object') {
      Object.assign(attachment, input.extra);
    }
    return attachment;
  }
  return input;
}

export function normalizeScheduleAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && ('eventAt' in input || 'title' in input)) {
    const attachment: any = {};
    const eventAt = toUnixSeconds(input.eventAt);
    if (eventAt !== undefined) attachment.eventAt = eventAt;
    if (input.title) attachment.title = input.title;
    if (input.postId !== undefined) attachment.postId = String(input.postId);
    if (input.scheduleId !== undefined) attachment.scheduleId = String(input.scheduleId);
    if (input.subtype !== undefined) attachment.subtype = input.subtype;
    const alarmAt = toUnixSeconds(input.alarmAt);
    if (alarmAt !== undefined) attachment.alarmAt = alarmAt;
    if (input.extra && typeof input.extra === 'object') {
      Object.assign(attachment, input.extra);
    }
    return attachment;
  }
  return input;
}

export function normalizeContactAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return { name: input };
  if (typeof input === 'object') {
    const attachment: any = { ...input };
    if (attachment.extra && typeof attachment.extra === 'object') {
      Object.assign(attachment, attachment.extra);
      delete attachment.extra;
    }
    if (!attachment.url && attachment.path) {
      attachment.url = attachment.path;
      delete attachment.path;
    }
    return attachment;
  }
  return input;
}

export function normalizeProfileAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') {
    return { accessPermit: input };
  }
  if (typeof input === 'object') {
    const attachment: any = { ...input };
    if (attachment.extra && typeof attachment.extra === 'object') {
      Object.assign(attachment, attachment.extra);
      delete attachment.extra;
    }
    if (attachment.userId === undefined && attachment.id !== undefined) attachment.userId = attachment.id;
    if (attachment.nickName === undefined && attachment.nickname !== undefined) attachment.nickName = attachment.nickname;
    if (attachment.fullProfileImageUrl === undefined && attachment.fullProfileImage !== undefined) {
      attachment.fullProfileImageUrl = attachment.fullProfileImage;
    }
    if (attachment.profileImageUrl === undefined && attachment.profileImage !== undefined) {
      attachment.profileImageUrl = attachment.profileImage;
    }
    if (attachment.statusMessage === undefined && attachment.status !== undefined) {
      attachment.statusMessage = attachment.status;
    }
    return attachment;
  }
  return input;
}

export function normalizeLinkAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return { url: trimmed };
    }
    return { text: trimmed };
  }
  if (typeof input === 'object') {
    const attachment: any = { ...input };
    if (attachment.extra && typeof attachment.extra === 'object') {
      Object.assign(attachment, attachment.extra);
      delete attachment.extra;
    }
    return attachment;
  }
  return input;
}

export function truncateReplyMessage(text: string, maxLen = 100) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

export function buildReplyAttachment(target: ReplyTarget, opts: ReplyOptions = {}) {
  const attachment: any = {
    attach_only: opts.attachOnly === true,
    attach_type: opts.attachType ?? 0,
    src_linkId: target.linkId !== undefined ? toLong(target.linkId) : undefined,
    src_logId: toLong(target.logId),
    src_mentions: target.mentions && target.mentions.length > 0 ? target.mentions : undefined,
    src_message: truncateReplyMessage(target.text || ''),
    src_type: target.type ?? 1,
    src_userId: toLong(target.userId),
  };

  Object.keys(attachment).forEach((key) => {
    if (attachment[key] === undefined) {
      delete attachment[key];
    }
  });

  return attachment;
}

export function normalizeReplyTarget(input: any): ReplyTarget | null {
  if (!input) return null;

  if (typeof input === 'object' && 'logId' in input && 'userId' in input) {
    return input as ReplyTarget;
  }

  const raw = input.raw ?? input;
  if (!raw || typeof raw !== 'object') return null;

  const chatLog = extractChatLogPayload(raw);
  if (!chatLog) return null;

  const logId = chatLog.logId ?? chatLog.msgId ?? chatLog.id;
  const userId = chatLog.authorId ?? chatLog.senderId ?? chatLog.userId;

  if (logId === undefined || userId === undefined) return null;

  const result: ReplyTarget = {
    logId: normalizeIdValue(logId),
    userId: normalizeIdValue(userId),
  };

  const text = chatLog.message ?? chatLog.msg ?? chatLog.text;
  if (text !== undefined) result.text = String(text);

  const type = chatLog.type ?? chatLog.msgType;
  if (type !== undefined) result.type = safeNumber(type, 1);

  const linkId = extractOpenLinkIdFromRaw(raw) ?? (input.room?.openLinkId ? normalizeIdValue(input.room.openLinkId) : undefined);
  if (linkId !== undefined) result.linkId = linkId;

  if (input.room?.isOpenChat === true) {
    result.isOpenChat = true;
  }

  return result;
}

export function normalizeReactionTarget(input: any): { logId: number | string; linkId?: number | string; isOpenChat?: boolean } | null {
  if (!input) return null;

  if (typeof input === 'object' && 'logId' in input) {
    return {
      logId: normalizeIdValue(input.logId),
      linkId: input.linkId !== undefined ? normalizeIdValue(input.linkId) : undefined,
      isOpenChat: input.isOpenChat,
    };
  }

  const raw = input.raw ?? input;
  if (!raw || typeof raw !== 'object') return null;

  const chatLog = extractChatLogPayload(raw);
  if (!chatLog) return null;

  const logId = chatLog.logId ?? chatLog.msgId ?? chatLog.id;
  if (logId === undefined) return null;

  const linkId = extractOpenLinkIdFromRaw(raw) ?? (input.room?.openLinkId ? normalizeIdValue(input.room.openLinkId) : undefined);
  const isOpenChat = input.room?.isOpenChat === true;

  return {
    logId: normalizeIdValue(logId),
    linkId,
    isOpenChat,
  };
}

export function normalizeOpenChatMemberTarget(
  input: any
): { memberId: number | string | Long; linkId?: number | string; isOpenChat?: boolean } | null {
  if (!input) return null;

  if (typeof input === 'number' || typeof input === 'string' || Long.isLong(input)) {
    return { memberId: input };
  }

  if (typeof input === 'object' && ('memberId' in input || 'userId' in input || 'id' in input)) {
    const memberId = input.memberId ?? input.userId ?? input.id;
    return {
      memberId,
      linkId: input.linkId !== undefined ? normalizeIdValue(input.linkId) : undefined,
      isOpenChat: input.isOpenChat,
    };
  }

  const raw = input.raw ?? input;
  const chatLog = extractChatLogPayload(raw);
  if (!chatLog || typeof chatLog !== 'object') return null;

  const memberId = chatLog.authorId ?? chatLog.userId ?? chatLog.senderId;
  if (memberId === undefined || memberId === null) return null;

  const linkId = extractOpenLinkIdFromRaw(raw) ?? (input.room?.openLinkId ? normalizeIdValue(input.room.openLinkId) : undefined);
  const isOpenChat = input.room?.isOpenChat;

  return { memberId, linkId, isOpenChat };
}

export function normalizeOpenChatBlindTarget(
  input: any
): { memberId: number | string | Long; linkId?: number | string; isOpenChat?: boolean; chatLogInfo?: string } | null {
  if (!input) return null;
  const raw = input.raw ?? input;
  const chatLog = extractChatLogPayload(raw);
  if (!chatLog || typeof chatLog !== 'object') return null;

  const memberId = chatLog.authorId ?? chatLog.userId ?? chatLog.senderId;
  if (memberId === undefined || memberId === null) return null;

  const linkId = extractOpenLinkIdFromRaw(raw) ?? (input.room?.openLinkId ? normalizeIdValue(input.room.openLinkId) : undefined);
  const isOpenChat = input.room?.isOpenChat;
  const chatLogInfo = buildSpamChatLogInfo(raw) ?? undefined;

  return { memberId, linkId, isOpenChat, chatLogInfo };
}

export function normalizeLogTarget(input: any): number | string {
  if (typeof input === 'number' || typeof input === 'string') {
    return normalizeIdValue(input);
  }
  if (Long.isLong(input)) {
    return normalizeIdValue(input);
  }
  if (typeof input === 'object') {
    const logId = input.logId ?? input.msgId ?? input.id ?? input.message?.logId;
    if (logId !== undefined) return normalizeIdValue(logId);
    const raw = input.raw ?? input;
    const chatLog = extractChatLogPayload(raw);
    if (chatLog) {
      const id = chatLog.logId ?? chatLog.msgId ?? chatLog.id;
      if (id !== undefined) return normalizeIdValue(id);
    }
  }
  return 0;
}

export function normalizeEditTarget(input: any): { logId: number | string; type?: number; extra?: string } | null {
  if (!input) return null;

  if (typeof input === 'number' || typeof input === 'string' || Long.isLong(input)) {
    return { logId: normalizeIdValue(input) };
  }

  if (typeof input === 'object' && 'logId' in input) {
    return {
      logId: normalizeIdValue(input.logId),
      type: input.type !== undefined ? safeNumber(input.type, undefined) : undefined,
      extra: input.extra,
    };
  }

  const raw = input.raw ?? input;
  const chatLog = extractChatLogPayload(raw);
  if (!chatLog) return null;

  const logId = chatLog.logId ?? chatLog.msgId ?? chatLog.id;
  if (logId === undefined) return null;

  return {
    logId: normalizeIdValue(logId),
    type: chatLog.type !== undefined ? safeNumber(chatLog.type, undefined) : undefined,
    extra: chatLog.extra ?? chatLog.attachment,
  };
}
