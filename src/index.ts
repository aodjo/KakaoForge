import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Long } from 'bson';
import { BookingClient } from './net/booking-client';
import { CarriageClient } from './net/carriage-client';
import { TicketClient } from './net/ticket-client';
import { CalendarClient } from './net/calendar-client';
import { subDeviceLogin, refreshOAuthToken, qrLogin, generateDeviceUuid, buildDeviceId } from './auth/login';
import { nextClientMsgId } from './util/client-msg-id';

export type TransportMode = 'loco' | null;

export const MessageType = {
  Text: 1,
  Photo: 2,
  Video: 3,
  Contact: 4,
  Audio: 5,
  Link: 9,
  Schedule: 13,
  Location: 16,
  File: 18,
} as const;

export type MessageTypeValue = typeof MessageType[keyof typeof MessageType];

export type MessageEvent = {
  message: {
    id: number;
    text: string;
    type: number;
    logId: number;
  };
  attachments: any[];
  sender: {
    id: number;
    name: string;
  };
  room: {
    id: number;
    name: string;
  };
  raw: any;
  // Legacy aliases for compatibility
  chatId: number;
  senderId: number;
  text: string;
  type: number;
  logId: number;
};

export type SendOptions = {
  msgId?: number;
  noSeen?: boolean;
  supplement?: string;
  from?: string;
  extra?: string;
  scope?: number;
  threadId?: number;
  featureStat?: string;
  silence?: boolean;
  isSilence?: boolean;
  type?: number;
};

export type AttachmentInput = Record<string, any> | string;

export type AttachmentSendOptions = SendOptions & {
  text?: string;
};

export type LocationPayload = {
  lat: number;
  lng: number;
  address?: string;
  title?: string;
  isCurrent?: boolean;
  placeId?: number | string;
  extra?: Record<string, any>;
};

export type SchedulePayload = {
  eventAt: number | Date;
  endAt?: number | Date;
  title: string;
  location?: string | Record<string, any>;
  allDay?: boolean;
  members?: Array<number | string>;
  timeZone?: string;
  referer?: string;
  postId?: number | string;
  scheduleId?: number | string;
  subtype?: number;
  alarmAt?: number | Date;
  extra?: Record<string, any>;
};

export type ContactPayload = {
  name: string;
  phone?: string;
  phones?: string[];
  email?: string;
  vcard?: string;
  extra?: Record<string, any>;
};

export type LinkPayload = {
  url?: string;
  text?: string;
  attachment?: AttachmentInput;
  extra?: Record<string, any>;
};

export type KakaoForgeConfig = {
  userId?: number;
  oauthToken?: string;
  deviceUuid?: string;
  authPath?: string;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  reconnectMinDelayMs?: number;
  reconnectMaxDelayMs?: number;
  memberCacheTtlMs?: number;
  memberRefreshIntervalMs?: number;
  memberLookupTimeoutMs?: number;
  pingIntervalMs?: number;
  socketKeepAliveMs?: number;
  timeZone?: string;
  hasAccount?: string | boolean;
  adid?: string;
  dtype?: string | number;
  deviceId?: string;
  os?: string;
  appVer?: string;
  lang?: string;
  mccmnc?: string;
  MCCMNC?: string;
  ntype?: number;
  networkType?: number;
  refreshToken?: string;
  debug?: boolean;
};

type AuthFile = {
  userId?: number | string;
  accessToken?: string;
  oauthToken?: string;
  deviceUuid?: string;
  refreshToken?: string;
  savedAt?: string;
};

function loadAuthFile(authPath: string): AuthFile {
  if (!fs.existsSync(authPath)) {
    throw new Error(`auth.json not found at ${authPath}. Run: node cli/qr.js or node cli/login.js`);
  }
  const raw = fs.readFileSync(authPath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid auth.json at ${authPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export type ChatModule = {
  sendText: (chatId: number | string, text: string, opts?: SendOptions) => Promise<any>;
  send: (chatId: number | string, text: string, opts?: SendOptions) => Promise<any>;
  sendPhoto: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendVideo: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendAudio: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendFile: (chatId: number | string, attachment: AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendContact: (chatId: number | string, contact: ContactPayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendLocation: (chatId: number | string, location: LocationPayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendSchedule: (chatId: number | string, schedule: SchedulePayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
  sendLink: (chatId: number | string, link: string | LinkPayload | AttachmentInput, opts?: AttachmentSendOptions) => Promise<any>;
};

type ChatRoomInfo = {
  chatId?: number;
  type?: string;
  title?: string;
  roomName?: string;
  displayMembers?: any[];
  lastChatLogId?: number;
  lastSeenLogId?: number;
  lastLogId?: number;
};

type ChatListCursor = {
  lastTokenId: number;
  lastChatId: number;
};

type MessageHandler = ((chat: ChatModule, msg: MessageEvent) => void) | ((msg: MessageEvent) => void);

type MemberNameCache = Map<string, Map<string, string>>;

function uniqueStrings(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

function uniqueNumbers(list) {
  if (!Array.isArray(list)) return [];
  const nums = list.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  return [...new Set(nums)];
}

function toLong(value: any) {
  if (Long.isLong(value)) return value;
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  return Long.fromNumber(Number.isFinite(num) ? num : 0);
}

function safeNumber(value: any, fallback = 0) {
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function parseAttachments(raw: any): any[] {
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

function toUnixSeconds(value?: number | Date) {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num)) return undefined;
  return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num);
}

function snapToFiveMinutes(date: Date, mode: 'floor' | 'round' | 'ceil' = 'ceil') {
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

function toDate(value?: number | Date) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value;
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num)) return null;
  return num > 1e12 ? new Date(num) : new Date(num * 1000);
}

function formatCalendarDate(date: Date) {
  const iso = date.toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function resolveTimeZone(fallback = 'Asia/Seoul') {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // ignore
  }
  return fallback;
}

function extractShareMessageData(body: any) {
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

function normalizeScheduleShareData(data: any) {
  if (!data) return data;
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (data.P || data.CAL || data.C) return [data];
  }
  return data;
}

function extractEventId(body: any) {
  const eId = body?.eId || body?.eventId || body?.data?.eId || body?.data?.eventId || body?.result?.eId;
  if (eId === undefined || eId === null) return '';
  return String(eId);
}

function ensureScheduleAttachment(base: any, fallback: any) {
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

function previewCalendarBody(body: any, limit = 800) {
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

function assertCalendarOk(res: any, label: string) {
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

function buildExtra(attachment?: AttachmentInput, extra?: string) {
  if (typeof extra === 'string' && extra.length > 0) return extra;
  if (attachment === undefined || attachment === null) return undefined;
  if (typeof attachment === 'string') return attachment;
  try {
    return JSON.stringify(attachment);
  } catch {
    return String(attachment);
  }
}

function normalizeMediaAttachment(input: any) {
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

function normalizeFileAttachment(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const attachment: any = { ...input };
  if (attachment.size === undefined && attachment.s !== undefined) attachment.size = attachment.s;
  if (attachment.name === undefined && attachment.filename !== undefined) attachment.name = attachment.filename;
  return attachment;
}

function normalizeLocationAttachment(input: any) {
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

function normalizeScheduleAttachment(input: any) {
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

function normalizeContactAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return { name: input };
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

function normalizeLinkAttachment(input: any) {
  if (!input) return input;
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    if (input.attachment) return input.attachment;
    const { text, extra, ...rest } = input;
    if (extra && typeof extra === 'object') {
      return { ...rest, ...extra };
    }
    return rest;
  }
  return input;
}

/**
 * KakaoForge Bot - KakaoTalk bot framework (LOCO only).
 *
 * Events emitted:
 *   - 'message'     : Chat message received (chat, msg)
 *   - 'ready'       : LOCO login + push ready (chat)
 *   - 'connected'   : LOCO socket connected
 *   - 'disconnected': Bot disconnected
 *   - 'error'       : Error occurred
 */
export class KakaoForgeClient extends EventEmitter {
  userId: number;
  oauthToken: string;
  deviceUuid: string;
  os: string;
  appVer: string;
  lang: string;
  mccmnc: string;
  ntype: number;
  timeZone: string;
  hasAccount: string;
  adid: string;
  dtype: string;
  deviceId: string;
  useSub: boolean;
  refreshToken: string;
  debug: boolean;
  chat: ChatModule;
  autoReconnect: boolean;
  reconnectMinDelayMs: number;
  reconnectMaxDelayMs: number;
  memberCacheTtlMs: number;
  memberRefreshIntervalMs: number;
  memberLookupTimeoutMs: number;
  pingIntervalMs: number;
  socketKeepAliveMs: number;

  _booking: BookingClient | null;
  _carriage: CarriageClient | null;
  _calendar: CalendarClient | null;
  _messageHandler: MessageHandler | null;
  _pushHandlers: Map<string, (payload: any) => void>;
  _locoAutoConnectAttempted: boolean;
  _chatRooms: Map<string, ChatRoomInfo>;
  _chatListCursor: ChatListCursor;
  _memberNames: MemberNameCache;
  _memberFetchInFlight: Map<string, Promise<void>>;
  _memberListFetchInFlight: Map<string, Promise<void>>;
  _memberCacheUpdatedAt: Map<string, number>;
  _memberRefreshTimer: NodeJS.Timeout | null;
  _messageChains: Map<string, Promise<void>>;
  _connectPromise: Promise<any> | null;
  _reconnectTimer: NodeJS.Timeout | null;
  _reconnectAttempt: number;
  _disconnectRequested: boolean;

  constructor(config: KakaoForgeConfig = {}) {
    super();
    this.userId = config.userId || 0;
    this.oauthToken = config.oauthToken || '';
    this.deviceUuid = config.deviceUuid || '';
    this.os = config.os || 'android';
    this.appVer = config.appVer || '26.1.2';
    this.lang = config.lang || 'ko';
    this.mccmnc = config.mccmnc || config.MCCMNC || '45005';
    this.ntype = typeof config.ntype === 'number'
      ? config.ntype
      : (typeof config.networkType === 'number' ? config.networkType : 0);
    this.timeZone = config.timeZone || resolveTimeZone();
    if (typeof config.hasAccount === 'boolean') {
      this.hasAccount = config.hasAccount ? 'true' : 'false';
    } else if (typeof config.hasAccount === 'string') {
      this.hasAccount = config.hasAccount;
    } else {
      this.hasAccount = '';
    }
    this.adid = config.adid || this.deviceUuid || '';
    this.dtype = config.dtype !== undefined && config.dtype !== null ? String(config.dtype) : '2';
    this.deviceId = config.deviceId || (this.deviceUuid ? buildDeviceId(this.deviceUuid) : '');

    // Sub-device mode only: always connect as secondary device
    this.useSub = true;

    // Refresh token for token renewal
    this.refreshToken = config.refreshToken || '';

    // Debug mode: log all raw events
    this.debug = config.debug || false;

    this.autoReconnect = config.autoReconnect !== false;
    this.reconnectMinDelayMs = typeof config.reconnectMinDelayMs === 'number'
      ? config.reconnectMinDelayMs
      : 1000;
    this.reconnectMaxDelayMs = typeof config.reconnectMaxDelayMs === 'number'
      ? config.reconnectMaxDelayMs
      : 30000;
    this.memberCacheTtlMs = typeof config.memberCacheTtlMs === 'number'
      ? config.memberCacheTtlMs
      : 10 * 60 * 1000;
    this.memberRefreshIntervalMs = typeof config.memberRefreshIntervalMs === 'number'
      ? config.memberRefreshIntervalMs
      : 60 * 1000;
    this.memberLookupTimeoutMs = typeof config.memberLookupTimeoutMs === 'number'
      ? config.memberLookupTimeoutMs
      : 3000;
    this.pingIntervalMs = typeof config.pingIntervalMs === 'number'
      ? config.pingIntervalMs
      : 60000;
    this.socketKeepAliveMs = typeof config.socketKeepAliveMs === 'number'
      ? config.socketKeepAliveMs
      : 30000;

    // LOCO clients
    this._booking = null;
    this._carriage = null;
    this._calendar = null;

    this._messageHandler = null;
    this._pushHandlers = new Map();
    this._locoAutoConnectAttempted = false;
    this._chatRooms = new Map();
    this._chatListCursor = { lastTokenId: 0, lastChatId: 0 };
    this._memberNames = new Map();
    this._memberFetchInFlight = new Map();
    this._memberListFetchInFlight = new Map();
    this._memberCacheUpdatedAt = new Map();
    this._memberRefreshTimer = null;
    this._messageChains = new Map();
    this._connectPromise = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._disconnectRequested = false;

    this.chat = {
      sendText: (chatId, text, opts) => this.sendMessage(chatId, text, 1, opts),
      send: (chatId, text, opts) => this.sendMessage(chatId, text, opts),
      sendPhoto: (chatId, attachment, opts) => this.sendPhoto(chatId, attachment, opts),
      sendVideo: (chatId, attachment, opts) => this.sendVideo(chatId, attachment, opts),
      sendAudio: (chatId, attachment, opts) => this.sendAudio(chatId, attachment, opts),
      sendFile: (chatId, attachment, opts) => this.sendFile(chatId, attachment, opts),
      sendContact: (chatId, contact, opts) => this.sendContact(chatId, contact, opts),
      sendLocation: (chatId, location, opts) => this.sendLocation(chatId, location, opts),
      sendSchedule: (chatId, schedule, opts) => this.sendSchedule(chatId, schedule, opts),
      sendLink: (chatId, link, opts) => this.sendLink(chatId, link, opts),
    };
  }

  _nextClientMsgId() {
    const seed = this.deviceUuid || String(this.userId || '');
    return nextClientMsgId(seed);
  }

  /**
   * Login with email/password (sub-device mode).
   * This authenticates via HTTP, then connects to LOCO servers.
   */
  async login({ email, password, deviceName, modelName, forced = false, checkAllowlist, enforceAllowlist }: any) {
    if (!this.deviceUuid) {
      this.deviceUuid = generateDeviceUuid();
      console.log(`[*] Generated device UUID: ${this.deviceUuid.substring(0, 16)}...`);
    }

    // Step 1: HTTP login to get OAuth token
    console.log('[*] Authenticating via sub-device login...');
    const loginResult = await subDeviceLogin({
      email,
      password,
      deviceUuid: this.deviceUuid,
      deviceName,
      modelName,
      forced,
      checkAllowlist,
      enforceAllowlist,
      appVer: this.appVer,
    });

    this.userId = loginResult.userId;
    this.oauthToken = loginResult.accessToken;
    this.refreshToken = loginResult.refreshToken || '';

    console.log(`[+] Authenticated: userId=${this.userId}`);

    // Step 2: Connect to servers (LOCO only)
    return await this.connect();
  }

  /**
   * Login with QR code (sub-device mode).
   */
  async loginQR({
    deviceName,
    modelName,
    forced = false,
    checkAllowlist,
    enforceAllowlist,
    onQrUrl,
    onPasscode,
  }: any = {}) {
    if (!this.deviceUuid) {
      this.deviceUuid = generateDeviceUuid();
      console.log(`[*] Generated device UUID: ${this.deviceUuid.substring(0, 16)}...`);
    }

    // Step 1: QR code login to get OAuth token
    console.log('[*] Starting QR code login...');
    const loginResult = await qrLogin({
      deviceUuid: this.deviceUuid,
      deviceName,
      modelName,
      forced,
      appVer: this.appVer,
      checkAllowlist,
      enforceAllowlist,
      onQrUrl,
      onPasscode,
    });

    this.userId = loginResult.userId;
    this.oauthToken = loginResult.accessToken;
    this.refreshToken = loginResult.refreshToken || '';

    console.log(`[+] QR authenticated: userId=${this.userId}`);

    // Step 2: Connect to servers (LOCO only)
    return await this.connect();
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _scheduleReconnect(reason?: any) {
    if (!this.autoReconnect || this._disconnectRequested) return;
    if (this._reconnectTimer) return;

    const attempt = this._reconnectAttempt + 1;
    this._reconnectAttempt = attempt;
    const delay = Math.min(
      this.reconnectMinDelayMs * Math.pow(2, attempt - 1),
      this.reconnectMaxDelayMs
    );

    if (reason && this.debug) {
      console.error('[DBG] reconnect reason:', reason?.message || reason);
    }
    console.log(`[!] Reconnecting in ${delay}ms...`);

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect();
        this._reconnectAttempt = 0;
      } catch (err) {
        console.error('[!] Reconnect failed:', err.message);
        this._scheduleReconnect(err);
      }
    }, delay);
  }

  _startMemberRefresh() {
    this._stopMemberRefresh();
    if (!this.memberRefreshIntervalMs || this.memberRefreshIntervalMs <= 0) return;

    this._memberRefreshTimer = setInterval(() => {
      if (!this._carriage) return;
      const now = Date.now();
      for (const [chatId, updatedAt] of this._memberCacheUpdatedAt.entries()) {
        if (this._shouldRefreshMembers(chatId, now, updatedAt)) {
          this._fetchMemberList(Number(chatId)).catch(() => {});
        }
      }
    }, this.memberRefreshIntervalMs);
  }

  _stopMemberRefresh() {
    if (this._memberRefreshTimer) {
      clearInterval(this._memberRefreshTimer);
      this._memberRefreshTimer = null;
    }
  }

  _touchMemberCache(chatId: number | string) {
    this._memberCacheUpdatedAt.set(String(chatId), Date.now());
  }

  _shouldRefreshMembers(chatId: string, now: number, updatedAt?: number) {
    if (!this.memberCacheTtlMs || this.memberCacheTtlMs <= 0) return false;
    const last = typeof updatedAt === 'number'
      ? updatedAt
      : this._memberCacheUpdatedAt.get(chatId) || 0;
    if (!last) return true;
    return now - last >= this.memberCacheTtlMs;
  }

  /**
   * Connect to KakaoTalk LOCO servers.
   * Requires userId, oauthToken, deviceUuid.
   */
  async connect() {
    if (this._connectPromise) return this._connectPromise;
    this._disconnectRequested = false;
    this._clearReconnectTimer();

    this._connectPromise = (async () => {
    if (!this.oauthToken) {
      throw new Error('No OAuth token. Call login() first or set oauthToken in constructor.');
    }
    if (!this.deviceUuid) {
      throw new Error('No deviceUuid. Use auth.json or call login() first.');
    }

    if (this._carriage) {
      this._carriage.disconnect();
      this._carriage = null;
    }
    if (this._booking) {
      this._booking.disconnect();
      this._booking = null;
    }

    // Step 1: Booking - GETCONF
    console.log('[*] Connecting to Booking server...');
    this._booking = new BookingClient();
    await this._booking.connect();
    console.log('[+] Connected to Booking server');

    let checkinResult = null;
    try {
      let conf = null;
      try {
        conf = await this._booking.getConf({
          userId: this.userId,
          os: this.os,
          mccmnc: this.mccmnc,
        });
        const ticketHosts = [
          ...(conf.ticket?.lsl || []),
          ...(conf.ticket?.lsl6 || []),
        ];
        console.log(`[+] GETCONF response: ticketHosts=${ticketHosts.length}, wifiPorts=${conf.portsWifi.length}, cellPorts=${conf.portsCellular.length}`);
      } catch (err) {
        console.warn(`[!] GETCONF failed: ${err.message}`);
      }

      if (conf) {
        const preferCellular = this.ntype && this.ntype !== 0;
        const hosts = uniqueStrings([
          ...(conf.ticket?.lsl || []),
          ...(conf.ticket?.lsl6 || []),
        ]);
        const primaryPorts = preferCellular ? conf.portsCellular : conf.portsWifi;
        const fallbackPorts = preferCellular ? conf.portsWifi : conf.portsCellular;
        let ports = uniqueNumbers([...(primaryPorts || []), ...(fallbackPorts || [])]);
        if (hosts.length > 0 && ports.length === 0) {
          ports = [443];
          console.warn('[!] GETCONF returned no ports; using 443 as fallback');
        }

        if (hosts.length > 0 && ports.length > 0) {
          try {
            checkinResult = await this._checkinViaTicket(hosts, ports, {
              userId: this.userId,
              os: this.os,
              appVer: this.appVer,
              lang: this.lang,
              ntype: this.ntype,
              useSub: this.useSub,
              mccmnc: this.mccmnc,
            });
          } catch (err) {
            console.warn(`[!] Ticket CHECKIN failed: ${err.message}`);
          }
        }
      }

      if (!checkinResult) {
        console.log('[*] Falling back to Booking CHECKIN...');
        checkinResult = await this._booking.checkin({
          userId: this.userId,
          os: this.os,
          appVer: this.appVer,
          lang: this.lang,
          ntype: this.ntype,
          useSub: this.useSub,
          mccmnc: this.mccmnc,
        });
      }
    } finally {
      this._booking.disconnect();
    }

    console.log(`[+] CHECKIN ok`);

    if (!checkinResult.host || !checkinResult.port) {
      throw new Error('CHECKIN failed: no host/port received');
    }

    // Step 2: Carriage - V2SL handshake + LOGINLIST
    console.log(`[*] Connecting to Carriage server ${checkinResult.host}:${checkinResult.port}...`);
    this._carriage = new CarriageClient();

    this._carriage.on('push', (packet) => this._onPush(packet));
    this._carriage.on('error', (err) => console.error('[!] Carriage error:', err.message));
    this._carriage.on('disconnected', () => {
      console.log('[!] Disconnected from Carriage');
      this.emit('disconnected');
      this._stopMemberRefresh();
      this._scheduleReconnect();
    });

    await this._carriage.connect(checkinResult.host, checkinResult.port, 10000, this.socketKeepAliveMs);
    this.emit('connected');
    console.log('[+] Connected to Carriage server (V2SL handshake done)');

    const loginRes = await this._carriage.loginList({
      os: this.os,
      appVer: this.appVer,
      lang: this.lang,
      duuid: this.deviceUuid,
      oauthToken: this.oauthToken,
      ntype: this.ntype,
    });

    console.log(`[+] LOGINLIST response: status=${loginRes.status}`);
    if (loginRes.status !== 0) {
      console.error('[!] LOGINLIST failed with status:', loginRes.status);
      console.error('[!] Body:', JSON.stringify(loginRes.body, null, 2));
    }

    this._applyChatList(loginRes.body);

    // Start keepalive
    this._carriage.startPing(this.pingIntervalMs);
    console.log('[+] Bot is ready!');
    this.emit('ready', this.chat);
    this._startMemberRefresh();

      return loginRes;
    })();

    try {
      const result = await this._connectPromise;
      this._reconnectAttempt = 0;
      return result;
    } catch (err) {
      this._scheduleReconnect(err);
      throw err;
    } finally {
      this._connectPromise = null;
    }
  }

  async _checkinViaTicket(hosts, ports, opts) {
    let lastErr = null;
    for (const host of hosts) {
      for (const port of ports) {
        const ticket = new TicketClient();
        try {
          console.log(`[*] Ticket CHECKIN -> ${host}:${port}`);
          await ticket.connect(host, port);
          const res = await ticket.checkin(opts);
          if (res.host && res.port) {
            return res;
          }
          lastErr = new Error(`Ticket CHECKIN returned no host/port (${host}:${port})`);
        } catch (err) {
          lastErr = err;
          console.warn(`[!] Ticket CHECKIN error (${host}:${port}): ${err.message}`);
        } finally {
          ticket.disconnect();
        }
      }
    }
    if (lastErr) {
      throw lastErr;
    }
    throw new Error('Ticket CHECKIN failed: no endpoints attempted');
  }

  _onPush(packet) {
    // Emit to specific push handlers
    const handler = this._pushHandlers.get(packet.method);
    if (handler) {
      handler(packet);
    }

    if (packet.method === 'MSG') {
      const { chatId, chatLog } = packet.body || {};
      if (chatLog) {
        this._emitMessage({ chatId, chatLog });
      }
    } else if (packet.method === 'CHATINFO' || packet.method === 'UPDATECHAT') {
      const info = packet.body?.chatInfo || packet.body?.chat || packet.body?.chatData || packet.body?.chatRoom;
      if (info) {
        this._updateChatRooms([info]);
      }
    } else if (packet.method === 'KICKOUT') {
      console.error('[!] KICKOUT received:', JSON.stringify(packet.body));
      this.emit('kickout', packet.body);
    } else if (this.debug) {
      console.log(`[DBG] Push: ${packet.method}`, JSON.stringify(packet.body).substring(0, 200));
    }
  }

  onMessage(handler: MessageHandler) {
    this._messageHandler = handler;
  }

  onReady(handler: (chat: ChatModule) => void) {
    this.on('ready', handler);
  }

  onPush(method: string, handler: (payload: any) => void) {
    this._pushHandlers.set(method, handler);
  }

  _emitMessage(data: any) {
    const chatLog = data.chatLog || data;
    const roomId = safeNumber(data.chatId || chatLog.chatId || 0, 0);
    const key = roomId ? String(roomId) : '_global';
    const prev = this._messageChains.get(key) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => this._emitMessageInternal(data))
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] emit message failed:', err.message);
        }
      })
      .finally(() => {
        if (this._messageChains.get(key) === next) {
          this._messageChains.delete(key);
        }
      });
    this._messageChains.set(key, next);
  }

  async _emitMessageInternal(data: any) {
    const chatLog = data.chatLog || data;
    const roomId = safeNumber(data.chatId || chatLog.chatId || 0, 0);
    const senderId = safeNumber(chatLog.authorId || chatLog.senderId || chatLog.userId || 0, 0);
    const text = chatLog.message || chatLog.msg || chatLog.text || '';
    const type = safeNumber(chatLog.type || chatLog.msgType || 1, 1);
    const logId = safeNumber(chatLog.logId || chatLog.msgId || 0, 0);
    const attachments = parseAttachments(
      chatLog.attachment ?? chatLog.attachments ?? chatLog.extra ?? null
    );

    if (roomId) {
      this._ensureMemberList(roomId);
    }

    let senderName =
      chatLog.authorName ||
      chatLog.authorNickname ||
      chatLog.nickName ||
      chatLog.nickname ||
      chatLog.name ||
      '';

    const roomInfo = this._chatRooms.get(String(roomId)) || {};
    let roomName = roomInfo.roomName || roomInfo.title || '';

    if (roomId && (!senderName || !roomName)) {
      await this._waitForMemberContext(roomId, senderId);
      if (!senderName && senderId) {
        senderName = this._getCachedMemberName(roomId, senderId) || senderName;
      }
      if (!roomName) {
        const derived = this._buildRoomNameFromMembers(roomId);
        if (derived) {
          roomName = derived;
          this._chatRooms.set(String(roomId), { ...roomInfo, roomName });
        }
      }
    }

    const msg: MessageEvent = {
      message: { id: logId, text, type, logId },
      attachments,
      sender: { id: senderId, name: senderName },
      room: { id: roomId, name: roomName },
      raw: data,
      chatId: roomId,
      senderId,
      text,
      type,
      logId,
    };

    if (roomId) {
      const key = String(roomId);
      const prev = this._chatRooms.get(key) || {};
      const prevLast = safeNumber(prev.lastLogId || 0, 0);
      if (logId > prevLast) {
        this._chatRooms.set(key, { ...prev, lastLogId: logId });
      }
    }

    if (this._messageHandler) {
      if (this._messageHandler.length <= 1) {
        (this._messageHandler as (msg: MessageEvent) => void)(msg);
      } else {
        (this._messageHandler as (chat: ChatModule, msg: MessageEvent) => void)(this.chat, msg);
      }
    }
    this.emit('message', this.chat, msg);
  }

  _applyChatList(body: any) {
    if (!body) return [];

    const chats = this._extractChatList(body);
    this._updateChatRooms(chats);

    const delChatIds = Array.isArray(body.delChatIds) ? body.delChatIds : [];
    for (const id of delChatIds) {
      this._chatRooms.delete(String(id));
    }

    if (body.lastTokenId !== undefined) {
      this._chatListCursor.lastTokenId = safeNumber(body.lastTokenId, this._chatListCursor.lastTokenId || 0);
    }
    if (body.lastChatId !== undefined) {
      this._chatListCursor.lastChatId = safeNumber(body.lastChatId, this._chatListCursor.lastChatId || 0);
    }

    return chats;
  }

  _extractChatList(body: any): any[] {
    if (!body) return [];
    if (Array.isArray(body.chatDatas)) return body.chatDatas;
    if (Array.isArray(body.chatInfos)) return body.chatInfos;
    if (Array.isArray(body.chats)) return body.chats;
    if (Array.isArray(body.chatRooms)) return body.chatRooms;
    if (Array.isArray(body.chatList)) return body.chatList;
    return [];
  }

  _extractDisplayMembers(chat: any): string[] {
    if (!chat) return [];
    const names: string[] = [];

    if (Array.isArray(chat.displayMembers)) {
      for (const member of chat.displayMembers) {
        const name = member?.nickname || member?.nickName || member?.name || '';
        if (name) names.push(name);
      }
    }

    if (names.length === 0 && Array.isArray(chat.displayNickNames)) {
      for (const name of chat.displayNickNames) {
        if (name) names.push(String(name));
      }
    }

    if (names.length === 0 && Array.isArray(chat.displayNicknames)) {
      for (const name of chat.displayNicknames) {
        if (name) names.push(String(name));
      }
    }

    return names.filter(Boolean);
  }

  _extractTitleFromMeta(meta: any): string {
    if (!meta) return '';

    if (typeof meta === 'string') {
      const trimmed = meta.trim();
      if (!trimmed) return '';
      try {
        const parsed = JSON.parse(trimmed);
        return parsed?.title || parsed?.name || parsed?.subject || '';
      } catch {
        return trimmed.length <= 100 ? trimmed : '';
      }
    }

    if (typeof meta === 'object') {
      return meta.title || meta.name || meta.subject || '';
    }

    return '';
  }

  _extractTitle(chat: any): string {
    if (!chat) return '';

    const direct = chat.title || chat.roomName || chat.name || chat.subject;
    if (direct) return String(direct);

    const metaTitle = this._extractTitleFromMeta(chat.meta);
    if (metaTitle) return metaTitle;

    if (Array.isArray(chat.chatMetas)) {
      for (const meta of chat.chatMetas) {
        const title = this._extractTitleFromMeta(meta?.content);
        if (title) return title;
      }
    }

    return '';
  }

  _updateChatRooms(chats: any[]) {
    if (!Array.isArray(chats)) return;

    for (const chat of chats) {
      const chatId = safeNumber(chat?.chatId || chat?.id || chat?.roomId || chat?.chatRoomId, 0);
      if (!chatId) continue;

      const key = String(chatId);
      const prev = this._chatRooms.get(key) || {};
      const displayMembers = this._extractDisplayMembers(chat);
      const title = this._extractTitle(chat);
      const roomName =
        title ||
        (displayMembers.length > 0 ? displayMembers.join(', ') : '') ||
        prev.roomName ||
        '';

      const lastChatLogId = safeNumber(
        chat.lastChatLogId || chat.lastMessageId || chat.lastLogId || chat.lastSeenLogId,
        prev.lastChatLogId || 0
      );

      const lastSeenLogId = safeNumber(chat.lastSeenLogId, prev.lastSeenLogId || 0);

      const next: ChatRoomInfo = {
        ...prev,
        chatId,
        type: chat.type || prev.type,
        title: title || prev.title || '',
        roomName,
        displayMembers: displayMembers.length > 0 ? displayMembers : prev.displayMembers,
        lastChatLogId,
        lastSeenLogId,
      };

      this._chatRooms.set(key, next);
    }
  }

  _ensureMemberList(chatId: number) {
    const key = String(chatId);
    if (!this._memberCacheUpdatedAt.has(key)) {
      this._fetchMemberList(chatId, { force: true }).catch(() => {});
    }
  }

  async _waitForMemberContext(chatId: number, senderId: number) {
    const timeoutMs = this.memberLookupTimeoutMs;
    const key = String(chatId);

    if (!this._memberCacheUpdatedAt.has(key)) {
      await this._waitForMemberList(chatId, timeoutMs);
    }

    if (senderId) {
      const cached = this._getCachedMemberName(chatId, senderId);
      if (!cached) {
        await this._waitForMemberName(chatId, senderId, timeoutMs);
      }
    }
  }

  async _waitForMemberList(chatId: number, timeoutMs: number) {
    await this._waitWithTimeout(this._fetchMemberList(chatId, { force: true }), timeoutMs);
  }

  async _waitForMemberName(chatId: number, userId: number, timeoutMs: number) {
    await this._waitWithTimeout(this._fetchMemberName(chatId, userId), timeoutMs);
  }

  async _waitWithTimeout(promise?: Promise<void>, timeoutMs?: number) {
    if (!promise) return;
    if (!timeoutMs || timeoutMs <= 0) {
      await promise;
      return;
    }
    await Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  _buildRoomNameFromMembers(chatId: number) {
    const map = this._memberNames.get(String(chatId));
    if (!map || map.size === 0) return '';
    const names: string[] = [];
    for (const [id, name] of map.entries()) {
      if (!name) continue;
      if (String(id) === String(this.userId)) continue;
      names.push(name);
    }
    if (names.length === 0) return '';
    const max = 4;
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')}...`;
  }

  async _fetchMemberList(chatId: number, { force = false }: any = {}) {
    if (!this._carriage) return;
    const key = String(chatId);
    const existing = this._memberListFetchInFlight.get(key);
    if (existing) return existing;
    if (!force && !this._shouldRefreshMembers(key, Date.now())) return;

    const task = (async () => {
      let token = 0;
      let pages = 0;
      while (pages < 30) {
        const res = await this._carriage.memList({ chatId, token, excludeMe: false });
        const body = res?.body || {};
        const members = body.members || body.memberList || body.memList || [];
        if (Array.isArray(members) && members.length > 0) {
          this._cacheMembers(chatId, members);
        }
        const nextToken = safeNumber(
          body.token || body.nextToken || body.memberToken || 0,
          0
        );
        if (!nextToken || nextToken === token) break;
        token = nextToken;
        pages += 1;
      }
      this._touchMemberCache(chatId);
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] memList failed:', err.message);
        }
      })
      .finally(() => {
        this._memberListFetchInFlight.delete(key);
      });

    this._memberListFetchInFlight.set(key, task);
    return task;
  }

  _getCachedMemberName(chatId: number, userId: number) {
    const map = this._memberNames.get(String(chatId));
    if (!map) return '';
    return map.get(String(userId)) || '';
  }

  _getCachedMemberIds(chatId: number | string) {
    const map = this._memberNames.get(String(chatId));
    if (!map) return [];
    return uniqueNumbers([...map.keys()].map((id) => Number(id)));
  }

  _extractMemberName(member: any) {
    return (
      member?.nickName ||
      member?.nickname ||
      member?.name ||
      member?.profileName ||
      ''
    );
  }

  _cacheMembers(chatId: number | string, members: any[]) {
    if (!Array.isArray(members)) return;
    const key = String(chatId);
    const map = this._memberNames.get(key) || new Map<string, string>();
    for (const mem of members) {
      const userId = safeNumber(mem?.userId || mem?.id || mem?.memberId || mem?.user_id, 0);
      if (!userId) continue;
      const name = this._extractMemberName(mem);
      map.set(String(userId), String(name || ''));
    }
    if (map.size > 0) {
      this._memberNames.set(key, map);
    }
    this._touchMemberCache(chatId);

    const room = this._chatRooms.get(key);
    if (room && !room.roomName) {
      const derived = this._buildRoomNameFromMembers(Number(chatId));
      if (derived) {
        this._chatRooms.set(key, { ...room, roomName: derived });
      }
    }
  }

  async _fetchMemberName(chatId: number, userId: number) {
    if (!this._carriage) return;
    const key = `${chatId}:${userId}`;
    const existing = this._memberFetchInFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const res = await this._carriage.member(chatId, [userId]);
      const members = res?.body?.members || res?.body?.memberList || res?.body?.memList || [];
      this._cacheMembers(chatId, members);
    })()
      .catch((err) => {
        if (this.debug) {
          console.error('[DBG] member fetch failed:', err.message);
        }
      })
      .finally(() => {
        this._memberFetchInFlight.delete(key);
      });

    this._memberFetchInFlight.set(key, task);
    return task;
  }

  async _resolveChatMembers(chatId: number) {
    const key = String(chatId);
    const now = Date.now();
    const cached = this._getCachedMemberIds(chatId);
    if (cached.length > 0 && !this._shouldRefreshMembers(key, now)) {
      return cached;
    }
    if (!this._carriage) return cached;

    const ids = new Set<number>(cached);
    let token = 0;
    let pages = 0;
    while (pages < 30) {
      const res = await this._carriage.memList({ chatId, token, excludeMe: false });
      const body = res?.body || {};
      const members = body.members || body.memberList || body.memList || [];
      if (Array.isArray(members) && members.length > 0) {
        for (const mem of members) {
          const userId = safeNumber(mem?.userId || mem?.id || mem?.memberId || mem?.user_id, 0);
          if (userId) ids.add(userId);
        }
        this._cacheMembers(chatId, members);
      }
      const nextToken = safeNumber(
        body.token || body.nextToken || body.memberToken || 0,
        0
      );
      if (!nextToken || nextToken === token) break;
      token = nextToken;
      pages += 1;
    }
    if (ids.size > 0) {
      this._touchMemberCache(chatId);
    }
    return [...ids];
  }


  /**
   * Fetch chat room list via LOCO (LCHATLIST).
   * Returns { chats: [...] }
   */
  async getChatRooms() {
    if (!this._carriage) throw new Error('LOCO not connected');

    const chatIds: Long[] = [];
    const maxIds: Long[] = [];
    for (const [key, room] of this._chatRooms.entries()) {
      const chatId = safeNumber(key, 0);
      if (!chatId) continue;
      chatIds.push(toLong(chatId));
      maxIds.push(toLong(room.lastChatLogId || 0));
    }

    const res = await this._carriage.lchatList({
      chatIds,
      maxIds,
      lastTokenId: this._chatListCursor.lastTokenId || 0,
      lastChatId: this._chatListCursor.lastChatId || 0,
    });

    const chats = this._applyChatList(res.body);
    return { ...res.body, chats };
  }

  /**
   * Sync messages via LOCO (SYNCMSG).
   */
  async syncMessages(chatId: number | string, { since = 0, count = 50, max = 0 }: any = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');

    const room = this._chatRooms.get(String(chatId)) || {};
    const cur = since || room.lastLogId || 0;

    const res = await this._carriage.syncMsg({
      chatId,
      cur,
      max,
      cnt: count,
    });

    const logs = res?.body?.chatLogs || [];
    if (Array.isArray(logs)) {
      let maxLogId = cur;
      for (const log of logs) {
        const logId = safeNumber(log?.logId || log?.msgId || 0, 0);
        if (logId > cur) {
          this._emitMessage({ chatId: Number(chatId), chatLog: log });
        }
        if (logId > maxLogId) maxLogId = logId;
      }
      this._chatRooms.set(String(chatId), { ...room, lastLogId: maxLogId });
    }

    return res?.body || res;
  }

  /**
   * Send a text message to a chatroom (LOCO WRITE).
   */
  async sendMessage(chatId: number | string, text: string, type: number | SendOptions = 1, opts: SendOptions = {}) {
    let msgType = typeof type === 'number' ? type : 1;
    if (type && typeof type === 'object') {
      opts = type;
      msgType = typeof opts.type === 'number' ? opts.type : 1;
    }
    if (!opts || typeof opts !== 'object') opts = {};

    const msgId = opts.msgId !== undefined && opts.msgId !== null ? opts.msgId : this._nextClientMsgId();
    const writeOpts = {
      ...opts,
      msgId,
      noSeen: opts.noSeen ?? false,
      scope: typeof opts.scope === 'number' ? opts.scope : 1,
      silence: opts.silence ?? opts.isSilence ?? false,
    };

    if (!this._carriage && !this._locoAutoConnectAttempted) {
      this._locoAutoConnectAttempted = true;
      try {
        await this.connect();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] LOCO auto-connect failed:', err.message);
        }
      }
    }

    if (!this._carriage) {
      throw new Error('LOCO not connected. Call client.connect() first.');
    }

    return await this._carriage.write(chatId, text, msgType, writeOpts);
  }

  async _sendWithAttachment(
    chatId: number | string,
    type: number,
    text: string,
    attachment: AttachmentInput,
    opts: AttachmentSendOptions = {},
    label = 'attachment'
  ) {
    const extra = buildExtra(attachment, opts.extra);
    if (!extra) {
      throw new Error(`${label} attachment is required. Upload first and pass attachment info.`);
    }
    const { text: _text, ...sendOpts } = opts;
    return this.sendMessage(chatId, text || '', { ...sendOpts, type, extra });
  }

  async sendText(chatId: number | string, text: string, opts: SendOptions = {}) {
    return this.sendMessage(chatId, text, MessageType.Text, opts);
  }

  async sendPhoto(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeMediaAttachment(attachment);
    return this._sendWithAttachment(chatId, MessageType.Photo, opts.text || '', normalized, opts, 'photo');
  }

  async sendVideo(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeMediaAttachment(attachment);
    return this._sendWithAttachment(chatId, MessageType.Video, opts.text || '', normalized, opts, 'video');
  }

  async sendAudio(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeMediaAttachment(attachment);
    return this._sendWithAttachment(chatId, MessageType.Audio, opts.text || '', normalized, opts, 'audio');
  }

  async sendFile(chatId: number | string, attachment: AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeFileAttachment(attachment);
    return this._sendWithAttachment(chatId, MessageType.File, opts.text || '', normalized, opts, 'file');
  }

  async sendContact(chatId: number | string, contact: ContactPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeContactAttachment(contact);
    const fallbackText = typeof contact === 'string'
      ? contact
      : (contact && typeof contact === 'object' ? (contact as ContactPayload).name || '' : '');
    return this._sendWithAttachment(
      chatId,
      MessageType.Contact,
      opts.text || fallbackText || '',
      normalized,
      opts,
      'contact'
    );
  }

  async sendLocation(chatId: number | string, location: LocationPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeLocationAttachment(location);
    const fallbackText = location && typeof location === 'object'
      ? ((location as LocationPayload).title || (location as LocationPayload).address || '')
      : '';
    return this._sendWithAttachment(
      chatId,
      MessageType.Location,
      opts.text || fallbackText || '',
      normalized,
      opts,
      'location'
    );
  }

  async sendSchedule(chatId: number | string, schedule: SchedulePayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    const normalized = normalizeScheduleAttachment(schedule);
    const fallbackText = schedule && typeof schedule === 'object'
      ? ((schedule as SchedulePayload).title || '')
      : '';

    if (typeof normalized === 'string') {
      return this._sendWithAttachment(
        chatId,
        MessageType.Schedule,
        opts.text || fallbackText || '',
        normalized,
        opts,
        'schedule'
      );
    }

    if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
      const hasId = normalized.postId || normalized.scheduleId;
      if (hasId) {
        return this._sendWithAttachment(
          chatId,
          MessageType.Schedule,
          opts.text || fallbackText || '',
          normalized,
          opts,
          'schedule'
        );
      }
    }

    if (!schedule || typeof schedule !== 'object') {
      throw new Error('일정 전송에는 일정 정보가 필요합니다.');
    }

    const payload = schedule as SchedulePayload;
    if (payload.eventAt === undefined || payload.eventAt === null) {
      throw new Error('일정 전송에는 eventAt이 필요합니다.');
    }
    if (!payload.title) {
      throw new Error('일정 전송에는 title이 필요합니다.');
    }

    let eventAtDate = toDate(payload.eventAt);
    if (!eventAtDate) {
      throw new Error('일정 전송: eventAt 형식이 올바르지 않습니다.');
    }
    eventAtDate = snapToFiveMinutes(eventAtDate, 'ceil');
    let endAtDate = payload.endAt ? toDate(payload.endAt) : new Date(eventAtDate.getTime() + 60 * 60 * 1000);
    if (!endAtDate) {
      throw new Error('일정 전송: endAt 형식이 올바르지 않습니다.');
    }
    endAtDate = snapToFiveMinutes(endAtDate, 'ceil');
    if (endAtDate.getTime() <= eventAtDate.getTime()) {
      endAtDate = snapToFiveMinutes(new Date(eventAtDate.getTime() + 60 * 60 * 1000), 'ceil');
    }

    const chatIdNum = safeNumber(chatId, 0);
    if (!chatIdNum) {
      throw new Error('일정 전송: chatId가 필요합니다.');
    }

    const calendar = this._getCalendarClient();
    const eventAtStr = formatCalendarDate(eventAtDate);
    const endAtStr = formatCalendarDate(endAtDate);
    let members = uniqueNumbers(payload.members);
    if (members.length === 0) {
      members = uniqueNumbers(await this._resolveChatMembers(chatIdNum));
    }
    if (this.userId) {
      members = uniqueNumbers([...members, this.userId]);
    }
    const timeZone = payload.timeZone || this.timeZone || resolveTimeZone();
    const referer = payload.referer || 'detail';

    const addEvent: any = {
      startAt: eventAtStr,
      endAt: endAtStr,
      subject: payload.title,
      members,
      allDay: !!payload.allDay,
      chatId: chatIdNum,
      timeZone,
      attendOn: true,
    };

    if (payload.location) {
      addEvent.location = typeof payload.location === 'string'
        ? { name: payload.location }
        : payload.location;
    }

    const alarmAtDate = payload.alarmAt ? toDate(payload.alarmAt) : null;
    const eventAtSec = Math.floor(eventAtDate.getTime() / 1000);
    const alarmAtSec = alarmAtDate ? Math.floor(alarmAtDate.getTime() / 1000) : undefined;
    if (alarmAtSec !== undefined && alarmAtSec <= eventAtSec) {
      const diffMin = Math.max(0, Math.round((eventAtSec - alarmAtSec) / 60));
      addEvent.alarmMin = [diffMin];
    }

    let refreshed = false;
    const runCalendar = async (fn: () => Promise<any>) => {
      let res = await fn();
      if (res?.status === 401 && !refreshed) {
        refreshed = true;
        await this.refreshAuth();
        if (this._calendar) {
          this._calendar.oauthToken = this.oauthToken;
        }
        res = await fn();
      }
      return res;
    };

    const createRes = await runCalendar(() => calendar.createEvent(addEvent, { referer }));
    assertCalendarOk(createRes, '일정 생성');
    const eId = extractEventId(createRes?.body);
    if (!eId) {
      throw new Error('일정 생성 실패: eId 없음');
    }

    const connectRes = await runCalendar(() => calendar.connectEvent(eId, chatIdNum, referer));
    assertCalendarOk(connectRes, '일정 연결');

    const shareRes = await runCalendar(() => calendar.shareMessage(eId, referer));
    assertCalendarOk(shareRes, '일정 공유');
    let attachment = extractShareMessageData(shareRes?.body);
    attachment = normalizeScheduleShareData(attachment);

    const scheduleIdCandidate = parseInt(String(eId).split('_')[0], 10);
    const scheduleId = Number.isFinite(scheduleIdCandidate) ? scheduleIdCandidate : undefined;
    const postId = Number.isFinite(scheduleIdCandidate) ? undefined : eId;

    attachment = ensureScheduleAttachment(attachment, {
      eventAt: eventAtSec,
      alarmAt: alarmAtSec,
      title: payload.title,
      subtype: payload.subtype ?? 1,
      scheduleId,
      postId,
    });

    if (payload.extra && typeof payload.extra === 'object' && attachment && typeof attachment === 'object' && !Array.isArray(attachment)) {
      attachment = { ...attachment, ...payload.extra };
    }

    return this._sendWithAttachment(
      chatId,
      MessageType.Schedule,
      opts.text || payload.title || '',
      attachment,
      opts,
      'schedule'
    );
  }

  async sendLink(chatId: number | string, link: string | LinkPayload | AttachmentInput, opts: AttachmentSendOptions = {}) {
    if (typeof link === 'string') {
      const { text: _text, ...sendOpts } = opts;
      return this.sendMessage(chatId, link, MessageType.Text, sendOpts);
    }

    const normalized = normalizeLinkAttachment(link);
    const fallbackText = link && typeof link === 'object'
      ? ((link as LinkPayload).text || (link as LinkPayload).url || '')
      : '';
    const text = opts.text || fallbackText || '';
    const extra = buildExtra(normalized, opts.extra);

    if (!extra) {
      const { text: _text, extra: _extra, type, ...sendOpts } = opts;
      return this.sendMessage(chatId, text, MessageType.Text, sendOpts);
    }

    const { text: _text, ...sendOpts } = opts;
    return this.sendMessage(chatId, text, { ...sendOpts, type: MessageType.Link, extra });
  }

  _getCalendarClient() {
    if (this._calendar) return this._calendar;
    if (!this.oauthToken || !this.deviceUuid) {
      throw new Error('Calendar API requires oauthToken/deviceUuid');
    }
    const adid = this.adid || this.deviceUuid || '';
    this.adid = adid;
    this._calendar = new CalendarClient({
      oauthToken: this.oauthToken,
      deviceUuid: this.deviceUuid,
      deviceId: this.deviceId,
      appVer: this.appVer,
      lang: this.lang,
      os: this.os,
      timeZone: this.timeZone,
      hasAccount: this.hasAccount,
      adid,
      dtype: this.dtype,
    });
    return this._calendar;
  }

  async request(method, body = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');
    return await this._carriage.request(method, body);
  }

  async refreshAuth() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const result = await refreshOAuthToken({
      refreshToken: this.refreshToken,
      accessToken: this.oauthToken,
      deviceUuid: this.deviceUuid,
      appVer: this.appVer,
    });

    this.oauthToken = result.accessToken;
    if (result.refreshToken) {
      this.refreshToken = result.refreshToken;
    }
    if (this._calendar) {
      this._calendar.oauthToken = this.oauthToken;
    }

    console.log('[+] Token refreshed');
    return result;
  }

  get connected() {
    return !!this._carriage?._socket;
  }

  get transport(): TransportMode {
    if (this._carriage?._socket) return 'loco';
    return null;
  }

  disconnect() {
    this._disconnectRequested = true;
    this._clearReconnectTimer();
    this._reconnectAttempt = 0;
    this._stopMemberRefresh();
    if (this._booking) this._booking.disconnect();
    if (this._carriage) this._carriage.disconnect();
    this.emit('disconnected');
  }
}

export function createClient(config: KakaoForgeConfig = {}) {
  let merged: KakaoForgeConfig = { ...config };
  const missingAuth = !merged.userId || !merged.oauthToken || !merged.deviceUuid;

  if (missingAuth) {
    const authPath = merged.authPath || path.join(process.cwd(), 'auth.json');
    let auth: AuthFile;
    try {
      auth = loadAuthFile(authPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[!] ${msg}`);
      throw err;
    }

    const authConfig: KakaoForgeConfig = {};
    if (auth.userId !== undefined && auth.userId !== null && auth.userId !== '') {
      authConfig.userId = Number(auth.userId);
    }
    if (auth.accessToken || auth.oauthToken) {
      authConfig.oauthToken = auth.accessToken || auth.oauthToken;
    }
    if (auth.deviceUuid) {
      authConfig.deviceUuid = auth.deviceUuid;
    }
    if (auth.refreshToken) {
      authConfig.refreshToken = auth.refreshToken;
    }

    merged = { ...authConfig, ...merged };

    if (!merged.userId || !merged.oauthToken || !merged.deviceUuid) {
      const msg = 'auth.json is missing required fields (userId/accessToken/deviceUuid). Please re-authenticate.';
      console.error(`[!] ${msg}`);
      throw new Error(msg);
    }
  }

  const client = new KakaoForgeClient(merged);
  const autoConnect = merged.autoConnect !== false;
  if (autoConnect) {
    client.connect().catch((err) => {
      client.emit('error', err);
    });
  }
  return client;
}

export const KakaoBot = KakaoForgeClient;
export type KakaoBot = KakaoForgeClient;
