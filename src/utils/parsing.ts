import { toLong, safeNumber, isBlankText, truncateChatLogMessage, stringifyLossless, normalizeIdValue } from './helpers';
import { CarriageClient } from '../net/carriage-client';

export function parseAttachments(raw: any): any[] {
  if (raw === undefined || raw === null) return [];
  let parsed: any = raw;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') return [parsed];
  return [];
}

export function extractChatLogPayload(raw: any): any {
  if (!raw || typeof raw !== 'object') return null;
  const chatLog = raw.chatLog;
  if (chatLog && typeof chatLog === 'object') {
    if (chatLog.chatLog && typeof chatLog.chatLog === 'object') return chatLog.chatLog;
    return chatLog;
  }
  return raw;
}

export function parseAttachmentJson(raw: any): any {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

export function buildSpamChatLogInfo(raw: any): string | null {
  const chatLog = extractChatLogPayload(raw);
  if (!chatLog || typeof chatLog !== 'object') return null;

  const attachmentRaw = chatLog.attachment ?? chatLog.attachments ?? chatLog.extra ?? null;
  const attachmentJson = parseAttachmentJson(attachmentRaw);
  let message = chatLog.message ?? chatLog.msg ?? chatLog.text ?? '';
  if (isBlankText(message) && typeof attachmentRaw === 'string' && attachmentJson === null) {
    message = attachmentRaw;
  }
  message = truncateChatLogMessage(String(message ?? ''));

  const hasAttachmentRaw =
    attachmentRaw !== undefined &&
    attachmentRaw !== null &&
    !(typeof attachmentRaw === 'string' && attachmentRaw.trim().length === 0);
  const messageBody: any = {};
  if (!isBlankText(message)) {
    messageBody.message = message;
  }
  if (attachmentJson !== null) {
    const isArray = Array.isArray(attachmentJson);
    const isObject = !isArray && typeof attachmentJson === 'object';
    const hasContent = isArray ? attachmentJson.length > 0 : isObject ? Object.keys(attachmentJson).length > 0 : true;
    if (hasContent || hasAttachmentRaw) {
      messageBody.attachment = attachmentJson;
    }
  } else if (hasAttachmentRaw) {
    messageBody.attachment = attachmentRaw;
  }
  if (typeof chatLog.referer === 'number') {
    messageBody.referer = chatLog.referer;
  }
  if (typeof chatLog.revision === 'number') {
    messageBody.revision = chatLog.revision;
  }

  if (Object.keys(messageBody).length === 0) return null;

  const info = {
    u: toLong(chatLog.authorId ?? chatLog.userId ?? chatLog.senderId ?? 0),
    m: messageBody,
    s: toLong(chatLog.sendAt ?? chatLog.createdAt ?? chatLog.s ?? 0),
    t: safeNumber(chatLog.type ?? chatLog.msgType ?? 1, 1),
    l: toLong(chatLog.logId ?? chatLog.msgId ?? chatLog.id ?? 0),
    scope: typeof chatLog.scope === 'number' ? chatLog.scope : safeNumber(chatLog.scope ?? 1, 1),
    threadId: toLong(chatLog.threadId ?? chatLog.tid ?? chatLog.thread ?? 0),
  };

  return stringifyLossless([info].reverse());
}

export function extractOpenLinkIdFromRaw(raw: any): number | string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw.li !== undefined && raw.li !== null && raw.li !== '') {
    return normalizeIdValue(raw.li);
  }
  const chatLog = raw.chatLog;
  if (chatLog && typeof chatLog === 'object') {
    if (chatLog.li !== undefined && chatLog.li !== null && chatLog.li !== '') {
      return normalizeIdValue(chatLog.li);
    }
    const nested = chatLog.chatLog;
    if (nested && typeof nested === 'object' && nested.li !== undefined && nested.li !== null && nested.li !== '') {
      return normalizeIdValue(nested.li);
    }
  }
  return undefined;
}

export function resolveRoomFlags(source: any) {
  const typeRaw = source?.type ?? source?.t ?? source?.chatType ?? '';
  const typeName = String(typeRaw).toLowerCase();
  const openLinkId = source?.openLinkId ?? source?.openChatId ?? source?.li ?? source?.openLink ?? source?.openChat;
  const openToken = source?.openToken ?? source?.otk;

  let isOpenChat = false;
  if (typeof source?.isOpenChat === 'boolean') {
    isOpenChat = source.isOpenChat;
  } else if (typeof source?.openChat === 'boolean') {
    isOpenChat = source.openChat;
  } else if (typeof source?.isOpen === 'boolean') {
    isOpenChat = source.isOpen;
  } else if (typeName === 'om' || typeName === 'od') {
    isOpenChat = true;
  } else if (typeName.includes('open')) {
    isOpenChat = true;
  } else if (openLinkId || openToken) {
    isOpenChat = true;
  } else if (source?.meta) {
    try {
      const meta = typeof source.meta === 'string' ? JSON.parse(source.meta) : source.meta;
      if (meta?.openLink || meta?.openLinkId || meta?.openChatId) {
        isOpenChat = true;
      }
    } catch {
      // ignore
    }
  } else if (Array.isArray(source?.chatMetas)) {
    for (const meta of source.chatMetas) {
      try {
        const content = meta?.content ?? meta;
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        if (parsed?.openLink || parsed?.openLinkId || parsed?.openChatId) {
          isOpenChat = true;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  let isGroupChat = false;
  if (typeof source?.isGroupChat === 'boolean') {
    isGroupChat = source.isGroupChat;
  } else if (typeof source?.isMultiChat === 'boolean') {
    isGroupChat = source.isMultiChat;
  } else if (typeof source?.multiChat === 'boolean') {
    isGroupChat = source.multiChat;
  } else if (typeof source?.isGroup === 'boolean') {
    isGroupChat = source.isGroup;
  } else if (typeof source?.directChat === 'boolean') {
    isGroupChat = !source.directChat;
  } else if (isOpenChat) {
    if (typeName === 'od') {
      isGroupChat = false;
    } else {
      isGroupChat = true;
    }
  } else if (typeName.includes('multi') || typeName.includes('group') || typeName.includes('moim')) {
    isGroupChat = true;
  } else if (typeName.includes('direct') || typeName.includes('memo') || typeName.includes('self')) {
    isGroupChat = false;
  }

  return { isGroupChat, isOpenChat };
}

export function extractOpenLinkNameFromMr(input: any): string {
  if (!input) return '';
  let parsed: any = input;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return '';
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return '';
    }
  }
  if (!parsed || typeof parsed !== 'object') return '';

  const candidates = [
    'ln',
    'linkName',
    'name',
    'title',
    'subject',
    'roomName',
  ];

  for (const key of candidates) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const nested = [parsed.openLink, parsed.link, parsed.ol, parsed.open];
  for (const node of nested) {
    if (!node || typeof node !== 'object') continue;
    for (const key of candidates) {
      const value = node[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }

  return '';
}

export function unwrapAttachment(input: any) {
  if (!input || typeof input !== 'object') return input;
  if ('attachment' in input && (input as any).attachment !== undefined) {
    return (input as any).attachment;
  }
  return input;
}

export function extractShareMessageData(body: any) {
  if (!body) return null;
  const data = body.data ?? body.shareMessage ?? body;
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

export function normalizeScheduleShareData(data: any) {
  if (!data) return data;
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (data.P || data.CAL || data.C) return [data];
  }
  return data;
}

export function extractEventId(body: any) {
  const eId = body?.eId || body?.eventId || body?.data?.eId || body?.data?.eventId || body?.result?.eId;
  if (eId === undefined || eId === null) return '';
  return String(eId);
}

export function ensureScheduleAttachment(base: any, fallback: any) {
  if (typeof base === 'string') return base;
  if (Array.isArray(base)) return base;
  const result: any = typeof base === 'object' && base ? { ...base } : {};
  if (result.eventAt === undefined && fallback.eventAt !== undefined) result.eventAt = fallback.eventAt;
  if (!result.title && fallback.title) result.title = fallback.title;
  if (result.subtype === undefined && fallback.subtype !== undefined) result.subtype = fallback.subtype;
  if (result.alarmAt === undefined && fallback.alarmAt !== undefined) result.alarmAt = fallback.alarmAt;
  if (!result.postId && !result.scheduleId) {
    if (fallback.postId !== undefined) result.postId = fallback.postId;
    if (fallback.scheduleId !== undefined) result.scheduleId = fallback.scheduleId;
  }
  return result;
}

export function previewCalendarBody(body: any, limit = 800) {
  if (body === undefined || body === null) return '';
  let text = '';
  if (typeof body === 'string') {
    text = body;
  } else {
    try {
      text = JSON.stringify(body);
    } catch {
      text = String(body);
    }
  }
  if (limit > 0 && text.length > limit) {
    return `${text.slice(0, limit)}...`;
  }
  return text;
}

export function assertCalendarOk(res: any, label: string) {
  const statusCode = res?.status;
  if (typeof statusCode === 'number' && statusCode >= 400) {
    const bodyPreview = previewCalendarBody(res?.body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${statusCode}${suffix}`);
  }
  const body = res?.body;
  if (body && typeof body === 'object' && typeof body.status === 'number' && body.status !== 0) {
    const message = body.message ? ` (${body.message})` : '';
    const bodyPreview = previewCalendarBody(body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${body.status}${message}${suffix}`);
  }
}

export function previewBubbleBody(body: any, limit = 800) {
  if (body === undefined || body === null) return '';
  let text = '';
  if (typeof body === 'string') {
    text = body;
  } else {
    try {
      text = JSON.stringify(body);
    } catch {
      text = String(body);
    }
  }
  if (limit > 0 && text.length > limit) {
    return `${text.slice(0, limit)}...`;
  }
  return text;
}

export function assertBubbleOk(res: any, label: string) {
  const statusCode = res?.status;
  if (typeof statusCode === 'number' && statusCode >= 400) {
    const bodyPreview = previewBubbleBody(res?.body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${statusCode}${suffix}`);
  }
  const body = res?.body;
  if (body && typeof body === 'object' && typeof body.status === 'number' && body.status !== 0) {
    const message = body.message ? ` (${body.message})` : '';
    const bodyPreview = previewBubbleBody(body);
    const suffix = bodyPreview ? ` body=${bodyPreview}` : '';
    throw new Error(`${label} status=${body.status}${message}${suffix}`);
  }
}

export function waitForPushMethod(client: CarriageClient, method: string, timeoutMs: number) {
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  let resolveFn: (packet: any) => void = () => {};
  let rejectFn: (err: Error) => void = () => {};

  const cleanup = () => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    client.off('push', onPush);
    client.off('error', onError);
    client.off('disconnected', onClose);
  };

  const onPush = (packet: any) => {
    if (packet?.method !== method) return;
    cleanup();
    resolveFn(packet);
  };

  const onError = (err: Error) => {
    cleanup();
    rejectFn(err);
  };

  const onClose = () => {
    cleanup();
    rejectFn(new Error(`Upload connection closed before ${method}`));
  };

  const promise = new Promise<any>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
    client.on('push', onPush);
    client.on('error', onError);
    client.on('disconnected', onClose);
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${method} timeout`));
      }, timeoutMs);
    }
  });

  return { promise, cancel: cleanup };
}

export function extractProfileFromResponse(body: any, fallbackUserId?: number | string) {
  if (!body || typeof body !== 'object') return null;

  const profile = body.profile ?? body.data?.profile ?? body;
  if (!profile || typeof profile !== 'object') return null;

  const userId = normalizeIdValue(
    profile.userId ?? profile.user_id ?? profile.id ?? fallbackUserId ?? 0
  );

  const result: any = { userId };

  const nickName = profile.nickName ?? profile.nickname ?? profile.name ?? profile.displayName;
  if (nickName) result.nickName = String(nickName);

  const fullProfileImageUrl =
    profile.fullProfileImageUrl ?? profile.profileImageUrl ?? profile.profileUrl ?? profile.imageUrl;
  if (fullProfileImageUrl) result.fullProfileImageUrl = String(fullProfileImageUrl);

  const profileImageUrl = profile.profileImageUrl ?? profile.thumbnailUrl ?? profile.thumbUrl;
  if (profileImageUrl) result.profileImageUrl = String(profileImageUrl);

  const statusMessage = profile.statusMessage ?? profile.status ?? profile.message;
  if (statusMessage) result.statusMessage = String(statusMessage);

  const accessPermit = profile.accessPermit ?? profile.permit;
  if (accessPermit) result.accessPermit = String(accessPermit);

  return result;
}

export function escapeVCardValue(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildVCard(contact: { name: string; phone?: string; phones?: string[]; email?: string }) {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardValue(contact.name)}`,
  ];

  const phones = contact.phones ?? (contact.phone ? [contact.phone] : []);
  for (const phone of phones) {
    lines.push(`TEL:${escapeVCardValue(phone)}`);
  }

  if (contact.email) {
    lines.push(`EMAIL:${escapeVCardValue(contact.email)}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}
