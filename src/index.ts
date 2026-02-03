import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Long } from 'bson';
import { BookingClient } from './net/booking-client';
import { CarriageClient } from './net/carriage-client';
import { TicketClient } from './net/ticket-client';
import { subDeviceLogin, refreshOAuthToken, qrLogin, generateDeviceUuid } from './auth/login';
import { nextClientMsgId } from './util/client-msg-id';

export type TransportMode = 'loco' | null;

export type MessageEvent = {
  msg: {
    id: number;
    text: string;
    type: number;
    logId: number;
  };
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

  _booking: BookingClient | null;
  _carriage: CarriageClient | null;
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

    // LOCO clients
    this._booking = null;
    this._carriage = null;

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

    console.log(`[+] CHECKIN response:`, JSON.stringify(checkinResult, null, 2));

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

    await this._carriage.connect(checkinResult.host, checkinResult.port);
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
    this._carriage.startPing(60000);
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
          console.log(`[+] Ticket CHECKIN response: status=${res.status}`);
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
      msg: { id: logId, text, type, logId },
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
      if (name) {
        map.set(String(userId), String(name));
      }
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
      deviceUuid: this.deviceUuid,
      appVer: this.appVer,
    });

    this.oauthToken = result.accessToken;
    if (result.refreshToken) {
      this.refreshToken = result.refreshToken;
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
