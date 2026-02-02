const { EventEmitter } = require('events');
const { BookingClient } = require('./net/booking-client');
const { CarriageClient } = require('./net/carriage-client');
const { BreweryClient } = require('./net/brewery-client');
const { subDeviceLogin, refreshOAuthToken, qrLogin, generateDeviceUuid } = require('./auth/login');

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
class KakaoBot extends EventEmitter {
  constructor(config = {}) {
    super();
    this.userId = config.userId || 0;
    this.oauthToken = config.oauthToken || '';
    this.deviceUuid = config.deviceUuid || '';
    this.os = config.os || 'android';
    this.appVer = config.appVer || '26.1.2';
    this.lang = config.lang || 'ko';

    // Sub-device mode: connects as secondary device (phone stays logged in)
    this.useSub = config.useSub !== undefined ? config.useSub : true;

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
    this._chatRooms = new Map(); // chatId → info cache
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
   */
  async login({ email, password, deviceName, modelName, forced = false, useBrewery = false }) {
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
   * @param {function} [opts.onQrUrl] - Callback when QR URL is ready: (url) => {}
   * @param {function} [opts.onPasscode] - Callback when passcode is shown: (passcode) => {}
   */
  async loginQR({ deviceName, modelName, forced = false, onQrUrl, onPasscode, useBrewery = false } = {}) {
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

    // Step 1: Booking - CHECKIN
    console.log('[*] Connecting to Booking server...');
    this._booking = new BookingClient();
    await this._booking.connect();
    console.log('[+] Connected to Booking server');

    const checkinResult = await this._booking.checkin({
      userId: this.userId,
      os: this.os,
      appVer: this.appVer,
      lang: this.lang,
      useSub: this.useSub,
    });
    console.log(`[+] CHECKIN response:`, JSON.stringify(checkinResult, null, 2));

    this._booking.disconnect();

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
  _onBreweryEvent(parsed) {
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
  _emitMessage(data) {
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
  onBreweryEvent(path, handler) {
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
  onMessage(handler) {
    this._messageHandler = handler;
  }

  /**
   * Register a push handler for a specific LOCO method or Brewery event path.
   */
  onPush(method, handler) {
    this._pushHandlers.set(method, handler);
  }

  /**
   * Send a text message to a chatroom.
   * Tries Brewery first, falls back to LOCO if available.
   *
   * @param {number|string} chatId - Chat room ID
   * @param {string} text - Message text
   * @param {number} [type=1] - Message type (1=text)
   */
  async sendMessage(chatId, text, type = 1) {
    // Try LOCO first (if connected)
    if (this._carriage) {
      return await this._carriage.write(chatId, text, type);
    }

    // Brewery mode: try POST endpoint (experimental)
    if (this._brewery) {
      // Known endpoint candidates from decompiled code analysis
      const body = JSON.stringify({
        chatId: String(chatId),
        msg: text,
        type,
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
  get transport() {
    if (this._brewery?._connected) return 'brewery';
    if (this._carriage?._socket) return 'loco';
    return null;
  }

  disconnect() {
    if (this._booking) this._booking.disconnect();
    if (this._carriage) this._carriage.disconnect();
    if (this._brewery) {
      this._brewery.disconnect();
      this._brewery = null;
    }
    this.emit('disconnected');
  }
}

module.exports = { KakaoBot };
