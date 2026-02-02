const http2 = require('http2');
const { EventEmitter } = require('events');
const protobuf = require('protobufjs');

const BREWERY_HOST = 'talk-pilsner.kakao.com';
const BREWERY_PORT = 443;
const APP_VER = '26.1.2';

/**
 * Protobuf Event schema (from com.kakao.talk.brewery.push.Event)
 *
 * message Event {
 *   string path = 1;
 *   string type = 2;
 *   bytes payload = 3;
 *   bytes padding = 4;
 * }
 */
const EventProto = new protobuf.Type('Event')
  .add(new protobuf.Field('path', 1, 'string'))
  .add(new protobuf.Field('type', 2, 'string'))
  .add(new protobuf.Field('payload', 3, 'bytes'))
  .add(new protobuf.Field('padding', 4, 'bytes'));

new protobuf.Root().add(EventProto);

/** Length prefix size: 4-byte big-endian uint32 */
const LEN_PREFIX_SIZE = 4;

/**
 * Brewery HTTP/2 client for KakaoTalk v26.1.2+.
 *
 * Replaces the legacy LOCO binary protocol with HTTP/2 Retrofit-style
 * communication to talk-pilsner.kakao.com.
 *
 * Usage:
 *   const client = new BreweryClient({ oauthToken, lang });
 *   await client.connect();
 *   client.on('event', (event) => { ... });
 *   client.startListen();
 */
class BreweryClient extends EventEmitter {
  constructor({ oauthToken, deviceUuid = '', lang = 'ko', appVer = APP_VER }) {
    super();
    this._oauthToken = oauthToken;
    this._deviceUuid = deviceUuid;
    this._lang = lang;
    this._appVer = appVer;
    this._session = null;
    this._listenStream = null;
    this._pingTimer = null;
    this._lastSubscribed = 0;
    this._listenBuffer = Buffer.alloc(0);
    this._connected = false;
  }

  /**
   * Common headers for all brewery requests (PILSNER auth).
   */
  _headers(extra = {}) {
    return {
      'authorization': `${this._oauthToken}-${this._deviceUuid}`,
      'talk-agent': `android/${this._appVer}`,
      'talk-language': this._lang,
      ...extra,
    };
  }

  /**
   * Headers for Drawer requests (MALDIVE auth).
   */
  _drawerHeaders(extra = {}) {
    return {
      'authorization': `MALDIVE ${this._oauthToken}`,
      'talk-agent': `android/${this._appVer}`,
      'talk-language': this._lang,
      ...extra,
    };
  }

  /**
   * Connect HTTP/2 session to talk-pilsner.kakao.com.
   */
  connect() {
    return new Promise((resolve, reject) => {
      this._session = http2.connect(`https://${BREWERY_HOST}:${BREWERY_PORT}`);

      this._session.on('connect', () => {
        this._connected = true;
        console.log(`[+] HTTP/2 connected to ${BREWERY_HOST}`);
        this.emit('connected');
        resolve();
      });

      this._session.on('error', (err) => {
        console.error('[!] HTTP/2 session error:', err.message);
        this.emit('error', err);
        if (!this._connected) reject(err);
      });

      this._session.on('close', () => {
        this._connected = false;
        console.log('[!] HTTP/2 session closed');
        this.emit('disconnected');
      });

      this._session.on('goaway', (errorCode) => {
        console.log(`[!] HTTP/2 GOAWAY received: errorCode=${errorCode}`);
      });
    });
  }

  /**
   * Send an HTTP/2 request and return the response.
   * @param {string} method - HTTP method
   * @param {string} path - URL path
   * @param {Object} [headers] - Extra headers
   * @param {Buffer|string} [body] - Request body
   * @returns {Promise<{status: number, headers: Object, body: Buffer}>}
   */
  request(method, path, { headers = {}, body = null, timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      const reqHeaders = {
        ':method': method,
        ':path': path,
        ...this._headers(headers),
      };

      if (body && typeof body === 'object' && !(body instanceof Buffer)) {
        body = JSON.stringify(body);
        reqHeaders['content-type'] = 'application/json';
      }

      const stream = this._session.request(reqHeaders);
      const chunks = [];

      const timer = setTimeout(() => {
        stream.close();
        reject(new Error(`Request ${method} ${path} timed out`));
      }, timeout);

      stream.on('response', (resHeaders) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          clearTimeout(timer);
          const status = resHeaders[':status'];
          const respBody = Buffer.concat(chunks);
          resolve({ status, headers: resHeaders, body: respBody });
        });
      });

      stream.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      if (body) {
        stream.write(body);
      }
      stream.end();
    });
  }

  /**
   * Send GET /ping keepalive.
   */
  async ping() {
    try {
      const res = await this.request('GET', '/ping');
      console.log(`[<] PING response: ${res.status}`);
      return res;
    } catch (err) {
      console.error('[!] PING error:', err.message);
      throw err;
    }
  }

  /**
   * Start periodic ping (default 10 min = 600000ms, matching app behavior).
   */
  startPing(intervalMs = 600000) {
    this.stopPing();
    this._pingTimer = setInterval(() => this.ping().catch(() => {}), intervalMs);
  }

  stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Start listening for real-time events via GET /listen.
   * Events are emitted as 'event' with parsed Event protobuf.
   */
  startListen() {
    if (this._listenStream) {
      console.log('[*] Listen stream already active');
      return;
    }

    const reqHeaders = {
      ':method': 'GET',
      ':path': '/listen',
      ...this._headers({
        'talk-last-subscribed': String(this._lastSubscribed),
      }),
    };

    console.log(`[*] Starting listen stream (lastSubscribed=${this._lastSubscribed})...`);
    this._listenStream = this._session.request(reqHeaders);
    this._listenBuffer = Buffer.alloc(0);

    this._listenStream.on('response', (resHeaders) => {
      const status = resHeaders[':status'];
      console.log(`[+] Listen stream opened: status=${status}`);

      if (status !== 200) {
        console.error(`[!] Listen stream rejected: status=${status}`);
        this._listenStream = null;
        this.emit('listenError', new Error(`Listen returned ${status}`));
        return;
      }

      this.emit('listening');
    });

    this._listenStream.on('data', (chunk) => {
      this._listenBuffer = Buffer.concat([this._listenBuffer, chunk]);
      this._processListenBuffer();
    });

    this._listenStream.on('end', () => {
      console.log('[!] Listen stream ended');
      this._listenStream = null;
      this.emit('listenEnd');
    });

    this._listenStream.on('error', (err) => {
      console.error('[!] Listen stream error:', err.message);
      this._listenStream = null;
      this.emit('listenError', err);
    });
  }

  /**
   * Process buffered listen data.
   * Events arrive as length-delimited protobuf messages (varint length prefix).
   */
  _processListenBuffer() {
    while (this._listenBuffer.length >= LEN_PREFIX_SIZE) {
      // Read 4-byte big-endian length prefix
      const msgLen = this._listenBuffer.readUInt32BE(0);

      // Check if we have the full message
      if (this._listenBuffer.length < LEN_PREFIX_SIZE + msgLen) break;

      // Extract the message bytes
      const msgBytes = this._listenBuffer.slice(LEN_PREFIX_SIZE, LEN_PREFIX_SIZE + msgLen);
      this._listenBuffer = this._listenBuffer.slice(LEN_PREFIX_SIZE + msgLen);

      try {
        const event = EventProto.decode(msgBytes);
        const payloadStr = event.payload && event.payload.length > 0
          ? Buffer.from(event.payload).toString('utf8')
          : null;

        let payloadJson = null;
        if (payloadStr) {
          try {
            payloadJson = JSON.parse(payloadStr);
          } catch {
            payloadJson = payloadStr;
          }
        }

        const parsed = {
          path: event.path,
          type: event.type,
          payload: payloadJson,
          raw: event,
        };

        this._lastSubscribed = Date.now();
        this.emit('event', parsed);

        // Emit specific event by path
        if (event.path) {
          this.emit(`event:${event.path}`, parsed);
        }
      } catch (err) {
        // Only log non-trivial parse errors
        if (msgBytes.length > 1) {
          console.error('[!] Protobuf parse error (%d bytes):', msgBytes.length, err.message);
          console.error('[!] Hex:', msgBytes.slice(0, 100).toString('hex'));
        }
      }
    }
  }

  /**
   * Stop the listen stream.
   */
  stopListen() {
    if (this._listenStream) {
      this._listenStream.close();
      this._listenStream = null;
    }
  }

  /**
   * Send push acknowledgment.
   * @param {Object} body - Ack payload
   */
  async pushAck(body) {
    return this.request('POST', '/push-tracker/pushAck', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Generic GET request to a brewery path.
   */
  async get(path, headers = {}) {
    return this.request('GET', path, { headers });
  }

  /**
   * Generic POST request to a brewery path.
   */
  async post(path, body, headers = {}) {
    return this.request('POST', path, {
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  /**
   * Parse JSON response body, returning null on failure.
   */
  _parseJson(res) {
    try {
      return JSON.parse(res.body.toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Fetch message metadata from a chat using bubble/sync-meta.
   * Used by sub-devices to sync messages via REST polling.
   *
   * @param {number|string} chatId - Chat room ID
   * @param {Object} [opts]
   * @param {number} [opts.cur=0] - Current cursor position (start from this logId)
   * @param {number} [opts.max=0] - Max logId to fetch up to (0 = latest)
   * @param {number} [opts.cnt=50] - Number of messages to fetch
   * @returns {Promise<{content: Array, size: number, last: boolean}>}
   */
  async syncMessages(chatId, { cur = 0, max = 0, cnt = 50 } = {}) {
    const path = `/messaging/chats/${chatId}/bubble/sync-meta?cur=${cur}&max=${max}&cnt=${cnt}`;
    const res = await this.request('GET', path, { timeout: 15000 });

    if (res.status !== 200) {
      throw new Error(`syncMessages failed: status=${res.status}`);
    }

    return this._parseJson(res) || { content: [], size: 0, last: true };
  }

  /**
   * Fetch message metadata for a range of logIds.
   *
   * @param {number|string} chatId - Chat room ID
   * @param {number} from - Start logId
   * @param {number} to - End logId
   * @param {boolean} [desc=false] - Descending order
   * @returns {Promise<{content: Array, size: number, last: boolean}>}
   */
  async getMessages(chatId, from, to, desc = false) {
    const path = `/messaging/chats/${chatId}/bubble/meta?from=${from}&to=${to}&desc=${desc}`;
    const res = await this.request('GET', path, { timeout: 15000 });

    if (res.status !== 200) {
      throw new Error(`getMessages failed: status=${res.status}`);
    }

    return this._parseJson(res) || { content: [], size: 0, last: true };
  }

  /**
   * Fetch chat tab settings (used to detect new messages across chats).
   *
   * @param {number} [revision=0] - Last known revision
   * @returns {Promise<Object>}
   */
  async getChatTabSettings(revision = 0) {
    const path = `/chat/tab/settings?revision=${revision}`;
    const res = await this.request('GET', path, { timeout: 15000 });

    if (res.status !== 200) {
      throw new Error(`getChatTabSettings failed: status=${res.status}`);
    }

    return this._parseJson(res);
  }

  /**
   * Fetch chat room list (DrawerService: /drawer/chat/list).
   * Uses MALDIVE auth instead of standard PILSNER auth.
   * Returns NavigationResponse: { items: [NavigationItem], hasMore: boolean }
   * NavigationItem: { chatId, title, type, count, size, joined, displayMembers, ... }
   *
   * @param {Object} [opts]
   * @param {string} [opts.verticalType] - Vertical type filter
   * @param {string} [opts.status] - Status filter
   * @returns {Promise<Object>}
   */
  async getChatList({ verticalType = '', status = '' } = {}) {
    const params = new URLSearchParams();
    if (verticalType) params.set('verticalType', verticalType);
    if (status) params.set('status', status);
    const qs = params.toString();
    const path = `/drawer/chat/list${qs ? '?' + qs : ''}`;
    const res = await this.request('GET', path, {
      headers: { 'authorization': `MALDIVE ${this._oauthToken}` },
      timeout: 15000,
    });

    if (res.status !== 200) {
      throw new Error(`getChatList failed: status=${res.status}`);
    }

    return this._parseJson(res) || { items: [], hasMore: false };
  }

  /**
   * Disconnect everything.
   */
  disconnect() {
    this.stopPing();
    this.stopListen();
    if (this._session) {
      this._session.close();
      this._session = null;
    }
    this._connected = false;
  }
}

module.exports = { BreweryClient, BREWERY_HOST, BREWERY_PORT, EventProto };
