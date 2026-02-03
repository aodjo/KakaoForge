import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { BookingClient } from './net/booking-client';
import { CarriageClient } from './net/carriage-client';
import { TicketClient } from './net/ticket-client';
import { BreweryClient } from './net/brewery-client';
import { subDeviceLogin, refreshOAuthToken, qrLogin, generateDeviceUuid } from './auth/login';
import { nextClientMsgId } from './util/client-msg-id';

export type TransportMode = 'brewery' | 'loco' | null;

export type MessageEvent = {
  chatId: number;
  sender: number;
  text: string;
  type: number;
  logId: number;
  raw: any;
};

export type BreweryEvent = {
  path: string;
  type: string;
  payload: any;
  raw: any;
};

export type SyncOptions = {
  since?: number;
  count?: number;
};

export type WatchAllOptions = {
  includeHistory?: boolean;
  forceUpdate?: boolean;
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

export type AutoWatchOptions = {
  intervalMs?: number;
};

export type KakaoForgeConfig = {
  userId?: number;
  oauthToken?: string;
  deviceUuid?: string;
  authPath?: string;
  autoConnect?: boolean;
  os?: string;
  appVer?: string;
  lang?: string;
  mccmnc?: string;
  MCCMNC?: string;
  ntype?: number;
  networkType?: number;
  refreshToken?: string;
  debug?: boolean;
  syncInterval?: number;
  autoWatchInterval?: number;
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
  watch: (chatId: number | string, lastLogId?: number) => void;
  unwatch: (chatId: number | string) => void;
  watchAll: (opts?: WatchAllOptions) => Promise<number>;
  unwatchAll: () => void;
  startSync: (intervalMs?: number) => void;
  stopSync: () => void;
  startAutoWatch: (opts?: AutoWatchOptions) => void;
  stopAutoWatch: () => void;
  list: () => Promise<any>;
  sync: (chatId: number | string, opts?: SyncOptions) => Promise<any>;
};

function uniqueStrings(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

function uniqueNumbers(list) {
  if (!Array.isArray(list)) return [];
  const nums = list.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
  return [...new Set(nums)];
}

/**
 * KakaoForge Bot - KakaoTalk bot framework.
 *
 * Supports two transport modes:
 *   - Brewery (HTTP/2): v26.1.2+ event stream via talk-pilsner.kakao.com
 *   - LOCO (TCP): Legacy binary protocol via booking-loco.kakao.com
 *
 * Events emitted:
 *   - 'message'     : Chat message received { chatId, sender, text, type, logId, raw }
 *   - 'event'       : Any Brewery event { path, type, payload, raw }
 *   - 'connected'   : Bot connected to server
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

  _booking: BookingClient | null;
  _carriage: CarriageClient | null;
  _brewery: BreweryClient | null;

  _messageHandler: ((msg: MessageEvent) => void) | null;
  _pushHandlers: Map<string, (payload: any) => void>;
  _breweryEventHandlers: Map<string, (event: BreweryEvent) => void>;
  _chatRooms: Map<string, any>;

  _syncTimer: NodeJS.Timeout | null;
  _syncInterval: number;
  _syncChatIds: Set<string>;
  _autoWatchTimer: NodeJS.Timeout | null;
  _autoWatchInterval: number;

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

    // Legacy LOCO clients
    this._booking = null;
    this._carriage = null;

    // Brewery HTTP/2 client (v26.1.2+)
    this._brewery = null;

    this._messageHandler = null;
    this._pushHandlers = new Map();
    this._breweryEventHandlers = new Map();
    this._chatRooms = new Map(); // chatId → { lastLogId, ... }

    // Message sync polling
    this._syncTimer = null;
    this._syncInterval = config.syncInterval || 3000; // 3s default
    this._syncChatIds = new Set(); // chatIds to poll
    this._autoWatchTimer = null;
    this._autoWatchInterval = config.autoWatchInterval || 60000; // 60s default

    this.chat = {
      sendText: (chatId, text, opts) => this.sendMessage(chatId, text, 1, opts),
      send: (chatId, text, opts) => this.sendMessage(chatId, text, opts),
      watch: (chatId, lastLogId) => this.watchChat(chatId, lastLogId),
      unwatch: (chatId) => this.unwatchChat(chatId),
      watchAll: (opts) => this.watchAllChats(opts),
      unwatchAll: () => this.unwatchAllChats(),
      startSync: (intervalMs) => this.startSync(intervalMs),
      stopSync: () => this.stopSync(),
      startAutoWatch: (opts) => this.startAutoWatchAll(opts),
      stopAutoWatch: () => this.stopAutoWatchAll(),
      list: () => this.getChatRooms(),
      sync: (chatId, opts) => this.syncMessages(chatId, opts),
    };
  }

  _nextClientMsgId() {
    const seed = this.deviceUuid || String(this.userId || '');
    return nextClientMsgId(seed);
  }

  /**
   * Login with email/password (sub-device mode).
   * This authenticates via HTTP, then connects to LOCO servers.
   *
   * @param {Object} opts
   * @param {string} opts.email - Kakao account email
   * @param {string} opts.password - Kakao account password
   * @param {string} [opts.deviceName] - Device name shown in settings
   * @param {string} [opts.modelName] - Device model name
   * @param {boolean} [opts.forced] - Force login (kick other sub-devices)
   * @param {boolean} [opts.checkAllowlist] - Check allowlist.json before login (sub-device)
   * @param {boolean} [opts.enforceAllowlist] - Throw if not allowlisted (sub-device)
   */
  async login({ email, password, deviceName, modelName, forced = false, checkAllowlist, enforceAllowlist, useBrewery = false }: any) {
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

    // Step 2: Connect to servers
    if (useBrewery) {
      return await this.connectBrewery();
    }
    return await this.connect();
  }

  /**
   * Login with QR code (sub-device mode).
   * Generates a QR code URL, waits for the user to scan it on their phone,
   * then connects to LOCO servers.
   *
   * @param {Object} [opts]
   * @param {string} [opts.deviceName] - Device name shown in settings
   * @param {string} [opts.modelName] - Device model name
   * @param {boolean} [opts.forced] - Force login (kick other sub-devices)
   * @param {boolean} [opts.checkAllowlist] - Check allowlist.json before QR login
   * @param {boolean} [opts.enforceAllowlist] - Throw if not allowlisted
   * @param {function} [opts.onQrUrl] - Callback when QR URL is ready: (url) => {}
   * @param {function} [opts.onPasscode] - Callback when passcode is shown: (passcode) => {}
   */
  async loginQR({
    deviceName,
    modelName,
    forced = false,
    checkAllowlist,
    enforceAllowlist,
    onQrUrl,
    onPasscode,
    useBrewery = false,
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

    // Step 2: Connect to servers
    if (useBrewery) {
      return await this.connectBrewery();
    }
    return await this.connect();
  }

  /**
   * Connect to KakaoTalk LOCO servers.
   * Requires userId and oauthToken to be set (either manually or via login()).
   *
   * Flow: Booking CHECKIN → Carriage V2SL → LOGINLIST
   */
  async connect() {
    if (!this.oauthToken) {
      throw new Error('No OAuth token. Call login() first or set oauthToken in constructor.');
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
    this._carriage.on('disconnected', () => console.log('[!] Disconnected from Carriage'));

    await this._carriage.connect(checkinResult.host, checkinResult.port);
    console.log('[+] Connected to Carriage server (V2SL handshake done)');

    const loginRes = await this._carriage.loginList({
      os: this.os,
      appVer: this.appVer,
      lang: this.lang,
      duuid: this.deviceUuid,
      oauthToken: this.oauthToken,
    });

    console.log(`[+] LOGINLIST response: status=${loginRes.status}`);
    if (loginRes.status !== 0) {
      console.error('[!] LOGINLIST failed with status:', loginRes.status);
      console.error('[!] Body:', JSON.stringify(loginRes.body, null, 2));
    }

    // Start keepalive
    this._carriage.startPing(60000);
    console.log('[+] Bot is ready!');

    return loginRes;
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

  /**
   * Connect to KakaoTalk via Brewery HTTP/2 protocol (v26.1.2+).
   * This replaces the legacy Booking/Carriage LOCO flow for receiving events.
   *
   * Connects to talk-pilsner.kakao.com, starts the /listen event stream,
   * and begins periodic /ping keepalive.
   *
   * Note: Message sending via Brewery is not yet supported.
   * The WRITE command still uses LOCO TCP binary protocol internally.
   */
  async connectBrewery() {
    if (!this.oauthToken) {
      throw new Error('No OAuth token. Call login() first or set oauthToken in constructor.');
    }

    console.log('[*] Connecting to Brewery (HTTP/2)...');
    this._brewery = new BreweryClient({
      oauthToken: this.oauthToken,
      deviceUuid: this.deviceUuid,
      lang: this.lang,
      appVer: this.appVer,
    });

    await this._brewery.connect();

    // Map brewery events to handlers
    this._brewery.on('event', (parsed) => this._onBreweryEvent(parsed));

    this._brewery.on('listenEnd', () => {
      console.log('[*] Listen stream ended, reconnecting in 1s...');
      setTimeout(() => {
        if (this._brewery) this._brewery.startListen();
      }, 1000);
    });

    this._brewery.on('listenError', (err) => {
      console.error('[!] Listen error:', err.message);
      if (err.message && err.message.includes('401')) {
        console.error('[!] 인증 실패 (401). 토큰이 만료되었거나 형식이 잘못됨.');
        return;
      }
      console.log('[*] Reconnecting listen in 5s...');
      setTimeout(() => {
        if (this._brewery) this._brewery.startListen();
      }, 5000);
    });

    // Start listening for events and keepalive ping
    this._brewery.startListen();
    this._brewery.startPing();

    console.log('[+] Brewery connected and listening!');
  }

  /**
   * Handle Brewery server-sent events.
   * Routes events to registered handlers, detects chat messages,
   * and emits appropriate events.
   */
  _onBreweryEvent(parsed: BreweryEvent) {
    // Debug: log all raw events
    if (this.debug) {
      const payloadPreview = parsed.payload
        ? JSON.stringify(parsed.payload).substring(0, 300)
        : '(empty)';
      console.log(`[DBG] event path="${parsed.path}" type="${parsed.type}" payload=${payloadPreview}`);
    }

    // Emit generic 'event' for all Brewery events
    this.emit('event', parsed);

    // Check for specific brewery event path handlers
    const brewHandler = this._breweryEventHandlers.get(parsed.path);
    if (brewHandler) {
      brewHandler(parsed);
    }

    // Check push handlers (path acts like LOCO method name)
    const pushHandler = this._pushHandlers.get(parsed.path);
    if (pushHandler) {
      pushHandler(parsed);
    }

    // gateway/Hello is the initial handshake event
    if (parsed.path === 'gateway/Hello') {
      console.log('[+] Brewery gateway/Hello received');
      this.emit('ready', parsed);
      return;
    }

    // Try to detect and route chat message events
    this._tryRouteMessage(parsed);

    // Log unhandled events (if no specific handler and not debug mode)
    if (!brewHandler && !pushHandler && !this.debug) {
      const payloadStr = parsed.payload ? JSON.stringify(parsed.payload).substring(0, 200) : '';
      console.log(`[<] ${parsed.path} (${parsed.type}) ${payloadStr}`);
    }
  }

  /**
   * Try to extract chat message from Brewery event.
   * Handles known event paths that carry chat messages.
   */
  _tryRouteMessage(parsed) {
    if (!parsed.payload) return;

    const p = parsed.payload;

    // Known chat message patterns from Brewery events
    // The exact path is discovered empirically - these are candidates:
    if (parsed.path === 'chat/Message' || parsed.path === 'MSG') {
      this._emitMessage(p);
      return;
    }

    // Generic detection: look for chatLog-like structures in payload
    if (p.chatId && (p.chatLog || p.msgId || p.logId)) {
      this._emitMessage(p);
      return;
    }

    // Array of chatLogs (SYNCMSG-like)
    if (p.chatId && Array.isArray(p.chatLogs) && p.chatLogs.length > 0) {
      for (const log of p.chatLogs) {
        this._emitMessage({ chatId: p.chatId, chatLog: log });
      }
    }
  }

  /**
   * Emit a normalized message event.
   */
  _emitMessage(data: any) {
    const chatLog = data.chatLog || data;
    const msg = {
      chatId: data.chatId || chatLog.chatId || 0,
      sender: chatLog.authorId || chatLog.senderId || chatLog.userId || 0,
      text: chatLog.message || chatLog.msg || chatLog.text || '',
      type: chatLog.type || chatLog.msgType || 1,
      logId: chatLog.logId || chatLog.msgId || 0,
      raw: data,
    };

    if (this._messageHandler) {
      this._messageHandler(msg);
    }
    this.emit('message', msg);
  }

  /**
   * Register a handler for a specific Brewery event path.
   * Event paths: 'talk/ProfileUpdated', 'chat/SettingsUpdated', etc.
   * handler(event) where event = { path, type, payload, raw }
   */
  onBreweryEvent(path: string, handler: (event: BreweryEvent) => void) {
    this._breweryEventHandlers.set(path, handler);
  }

  /**
   * Send a generic Brewery HTTP/2 request.
   * @param {string} method - HTTP method (GET, POST)
   * @param {string} path - URL path
   * @param {Object} [opts] - { headers, body, timeout }
   * @returns {Promise<{status: number, headers: Object, body: Buffer}>}
   */
  async breweryRequest(method, path, opts = {}) {
    if (!this._brewery) throw new Error('Brewery not connected. Call connectBrewery() first.');
    return await this._brewery.request(method, path, opts);
  }

  /**
   * Handle server push messages (LOCO mode).
   */
  _onPush(packet) {
    // Emit to specific push handlers
    const handler = this._pushHandlers.get(packet.method);
    if (handler) {
      handler(packet);
    }

    if (packet.method === 'MSG') {
      const { chatId, chatLog } = packet.body;
      if (chatLog) {
        this._emitMessage({ chatId, chatLog });
      }
    } else if (packet.method === 'KICKOUT') {
      console.error('[!] KICKOUT received:', JSON.stringify(packet.body));
      this.emit('kickout', packet.body);
    } else if (this.debug) {
      console.log(`[DBG] Push: ${packet.method}`, JSON.stringify(packet.body).substring(0, 200));
    }
  }

  /**
   * Register a message handler.
   * handler(msg) where msg = { chatId, sender, text, type, logId, raw }
   */
  onMessage(handler: (msg: MessageEvent) => void) {
    this._messageHandler = handler;
  }

  /**
   * Register a push handler for a specific LOCO method or Brewery event path.
   */
  onPush(method: string, handler: (payload: any) => void) {
    this._pushHandlers.set(method, handler);
  }

  // ─── Message Sync (Sub-device REST polling) ──────────────────────

  /**
   * Fetch messages from a chat room via Brewery REST API.
   * Sub-devices use this instead of LOCO push for message reception.
   *
   * @param {number|string} chatId - Chat room ID
   * @param {Object} [opts]
   * @param {number} [opts.since=0] - Fetch messages after this logId
   * @param {number} [opts.count=50] - Number of messages to fetch
   * @returns {Promise<Array>} Array of LogMeta objects
   */
  async syncMessages(chatId: number | string, { since = 0, count = 50 }: SyncOptions = {}) {
    if (!this._brewery) throw new Error('Brewery not connected');

    const room = this._chatRooms.get(String(chatId)) || {};
    const cur = since || room.lastLogId || 0;

    const result = await this._brewery.syncMessages(chatId, { cur, cnt: count });

    // Process and emit new messages
    if (result.content && result.content.length > 0) {
      let maxLogId = cur;
      for (const meta of result.content) {
        if (meta.logId > cur) {
          this._emitMessage({
            chatId: meta.chatId || Number(chatId),
            chatLog: {
              logId: meta.logId,
              chatId: meta.chatId || Number(chatId),
              type: meta.type || 1,
              message: meta.content || '',
              extra: meta.extra,
              linkId: meta.linkId,
              revision: meta.revision,
            },
          });
        }
        if (meta.logId > maxLogId) maxLogId = meta.logId;
      }

      // Update cursor
      this._chatRooms.set(String(chatId), { ...room, lastLogId: maxLogId });
    }

    return result;
  }

  /**
   * Fetch message metadata for a specific range.
   *
   * @param {number|string} chatId
   * @param {number} from - Start logId
   * @param {number} to - End logId
   * @param {boolean} [desc=false]
   * @returns {Promise<Object>} { content: [LogMeta], size, last }
   */
  async getMessages(chatId: number | string, from: number, to: number, desc = false) {
    if (!this._brewery) throw new Error('Brewery not connected');
    return await this._brewery.getMessages(chatId, from, to, desc);
  }

  /**
   * Add a chat room to the polling list.
   * Messages will be fetched periodically via syncMessages().
   *
   * @param {number|string} chatId
   * @param {number} [lastLogId=0] - Start polling from this logId
   */
  watchChat(chatId: number | string, lastLogId = 0) {
    const key = String(chatId);
    this._syncChatIds.add(key);
    if (lastLogId) {
      this._chatRooms.set(key, { ...this._chatRooms.get(key), lastLogId });
    }
    console.log(`[+] Watching chat ${chatId} (from logId=${lastLogId})`);
  }

  /**
   * Remove a chat room from the polling list.
   */
  unwatchChat(chatId: number | string) {
    this._syncChatIds.delete(String(chatId));
  }

  /**
   * Start periodic message polling for watched chats.
   * @param {number} [intervalMs] - Poll interval (default: syncInterval from config)
   */
  startSync(intervalMs?: number) {
    this.stopSync();
    const interval = intervalMs || this._syncInterval;

    this._syncTimer = setInterval(async () => {
      for (const chatId of this._syncChatIds) {
        try {
          await this.syncMessages(chatId);
        } catch (err) {
          if (this.debug) {
            console.error(`[DBG] Sync error for chat ${chatId}:`, err.message);
          }
        }
      }
    }, interval);

    console.log(`[+] Message sync started (interval=${interval}ms, chats=${this._syncChatIds.size})`);
  }

  /**
   * Stop periodic message polling.
   */
  stopSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  /**
   * Watch all chat rooms from the chat list.
   * By default, starts from each chat's lastMessageId to avoid backfill.
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.includeHistory=false] - Start from logId=0 for all
   * @param {boolean} [opts.forceUpdate=false] - Override existing watch cursors
   * @returns {Promise<number>} number of chats added/updated
   */
  async watchAllChats({ includeHistory = false, forceUpdate = false }: WatchAllOptions = {}) {
    if (!this._brewery) throw new Error('Brewery not connected');
    const result = await this.getChatRooms();
    const chats = result.chats || [];
    let count = 0;

    for (const chat of chats) {
      const chatId = chat.chatId;
      if (!chatId) continue;
      const key = String(chatId);
      const already = this._syncChatIds.has(key);
      if (already && !forceUpdate) continue;

      let lastLogId = 0;
      if (!includeHistory) {
        lastLogId = chat.lastMessageId || chat.lastSeenLogId || 0;
      }

      this.watchChat(chatId, lastLogId);
      count += 1;
    }

    return count;
  }

  /**
   * Clear all watched chats.
   */
  unwatchAllChats() {
    this._syncChatIds.clear();
    this._chatRooms.clear();
  }

  /**
   * Periodically refresh the chat list and watch all chats.
   * Useful for auto-detecting new incoming messages across all rooms.
   *
   * @param {Object} [opts]
   * @param {number} [opts.intervalMs] - refresh interval
   */
  startAutoWatchAll({ intervalMs }: AutoWatchOptions = {}) {
    this.stopAutoWatchAll();
    const interval = intervalMs || this._autoWatchInterval;

    const tick = async () => {
      try {
        await this.watchAllChats({ includeHistory: false, forceUpdate: false });
        if (!this._syncTimer) this.startSync();
      } catch (err) {
        if (this.debug) {
          console.error('[DBG] auto watch error:', err.message);
        }
      }
    };

    tick();
    this._autoWatchTimer = setInterval(tick, interval);
    console.log(`[+] Auto watch started (interval=${interval}ms)`);
  }

  stopAutoWatchAll() {
    if (this._autoWatchTimer) {
      clearInterval(this._autoWatchTimer);
      this._autoWatchTimer = null;
    }
  }

  /**
   * Fetch chat tab settings to discover chat rooms with updates.
   * @param {number} [revision=0]
   * @returns {Promise<Object>}
   */
  async getChatTabSettings(revision = 0) {
    if (!this._brewery) throw new Error('Brewery not connected');
    return await this._brewery.getChatTabSettings(revision);
  }

  /**
   * Fetch chat room list via GET /messaging/chats.
   * Returns { chats: [{ chatId, type, title, unreadCount, lastMessageId, displayMembers, ... }] }
   *
   * @returns {Promise<Object>}
   */
  async getChatRooms() {
    if (!this._brewery) throw new Error('Brewery not connected');
    return await this._brewery.getChatRooms();
  }

  // ─── Message Sending ────────────────────────────────────────────

  /**
   * Send a text message to a chatroom.
   * Tries Brewery first, falls back to LOCO if available.
   *
   * @param {number|string} chatId - Chat room ID
   * @param {string} text - Message text
   * @param {number} [type=1] - Message type (1=text)
   * @param {Object} [opts]
   * @param {number} [opts.msgId] - Client message ID
   * @param {boolean} [opts.noSeen=false] - Do not mark as read
   * @param {string} [opts.supplement]
   * @param {string} [opts.from]
   * @param {string} [opts.extra]
   * @param {number} [opts.scope=1]
   * @param {number} [opts.threadId]
   * @param {string} [opts.featureStat]
   * @param {boolean} [opts.silence=false]
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

    // Try LOCO first (if connected)
    if (this._carriage) {
      return await this._carriage.write(chatId, text, msgType, writeOpts);
    }

    // Brewery mode: try POST endpoint (experimental)
    if (this._brewery) {
      // Known endpoint candidates from decompiled code analysis
      const body = JSON.stringify({
        chatId: String(chatId),
        msg: text,
        type: msgType,
        noSeen: false,
      });

      try {
        const res = await this._brewery.request('POST', '/chat/write', {
          headers: { 'content-type': 'application/json' },
          body,
        });
        if (res.status === 200) {
          return JSON.parse(res.body.toString('utf8'));
        }
        // If /chat/write doesn't work, it might not exist on Brewery
        throw new Error(`Brewery /chat/write returned ${res.status}`);
      } catch (err) {
        throw new Error(
          `메시지 전송 실패: ${err.message}. ` +
          'Brewery에는 메시지 전송 엔드포인트가 없을 수 있습니다. ' +
          'LOCO 연결이 필요합니다.'
        );
      }
    }

    throw new Error('Not connected. Call connectBrewery() or connect() first.');
  }

  /**
   * Send a raw LOCO request (LOCO mode only).
   */
  async request(method, body = {}) {
    if (!this._carriage) throw new Error('LOCO not connected');
    return await this._carriage.request(method, body);
  }

  /**
   * Refresh the OAuth token using the refresh token.
   */
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

    // Update Brewery client if connected
    if (this._brewery) {
      this._brewery._oauthToken = this.oauthToken;
    }

    console.log('[+] Token refreshed');
    return result;
  }

  /**
   * Check if bot is connected.
   */
  get connected() {
    return !!(this._brewery?._connected || this._carriage?._socket);
  }

  /**
   * Get the current transport mode.
   * @returns {'brewery'|'loco'|null}
   */
  get transport(): TransportMode {
    if (this._brewery?._connected) return 'brewery';
    if (this._carriage?._socket) return 'loco';
    return null;
  }

  disconnect() {
    this.stopSync();
    if (this._booking) this._booking.disconnect();
    if (this._carriage) this._carriage.disconnect();
    if (this._brewery) {
      this._brewery.disconnect();
      this._brewery = null;
    }
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
    client.connectBrewery().catch((err) => {
      client.emit('error', err);
    });
  }
  return client;
}

export const KakaoBot = KakaoForgeClient;
export type KakaoBot = KakaoForgeClient;
