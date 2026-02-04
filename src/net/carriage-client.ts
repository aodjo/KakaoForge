import * as net from 'net';
import { EventEmitter } from 'events';
import { Long } from 'bson';
import { LocoPacket, HEADER_SIZE } from '../protocol/loco-packet';
import { V2SLCrypto } from '../crypto/v2sl';

function toLongValue(value: any) {
  if (Long.isLong(value)) return value;
  if (typeof value === 'string') {
    if (!value) return Long.fromNumber(0);
    return Long.fromString(value);
  }
  if (typeof value === 'bigint') return Long.fromString(value.toString());
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num)) return Long.fromNumber(0);
  return Long.fromNumber(num);
}

/**
 * Carriage server connection (V2SL encrypted).
 * Used for LOGINLIST and all messaging after CHECKIN.
 */
export class CarriageClient extends EventEmitter {
  _socket: net.Socket | null;
  _crypto: V2SLCrypto;
  _pendingRequests: Map<number, any>;
  _packetIdCounter: number;
  _recvBuffer: Buffer;
  _decryptedBuffer: Buffer;
  _pingInterval: NodeJS.Timeout | null;

  constructor() {
    super();
    this._socket = null;
    this._crypto = new V2SLCrypto();
    this._pendingRequests = new Map();
    this._packetIdCounter = 0;
    this._recvBuffer = Buffer.alloc(0);
    this._decryptedBuffer = Buffer.alloc(0);
    this._pingInterval = null;
  }

  nextPacketId() {
    return ++this._packetIdCounter;
  }

  /**
   * Connect to the Carriage server and perform V2SL handshake.
   */
  connect(host: string, port: number, timeout = 10000, keepAliveMs = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      this._socket = new net.Socket();
      this._socket.setNoDelay(true);
      if (keepAliveMs && keepAliveMs > 0) {
        this._socket.setKeepAlive(true, keepAliveMs);
      }

      const timer = setTimeout(() => {
        this._socket.destroy();
        reject(new Error(`Connection to ${host}:${port} timed out`));
      }, timeout);

      this._socket.connect(port, host, () => {
        clearTimeout(timer);

        // Send V2SL handshake (RSA-encrypted AES key)
        const handshake = this._crypto.buildHandshake();
        this._socket.write(handshake, (err) => {
          if (err) return reject(err);
          this.emit('connected');
          resolve();
        });
      });

      this._socket.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
        this.emit('error', err);
      });

      this._socket.on('data', (data) => {
        this._onData(data);
      });

      this._socket.on('close', () => {
        this._stopPing();
        this.emit('disconnected');
      });
    });
  }

  /**
   * Handle incoming encrypted data.
   * Decrypt V2SL blocks and parse LOCO packets.
   */
  _onData(data: Buffer) {
    this._recvBuffer = Buffer.concat([this._recvBuffer, data]);

    // Try to decrypt complete V2SL blocks
    while (this._recvBuffer.length >= 4) {
      const blockTotalSize = V2SLCrypto.blockSize(this._recvBuffer);
      if (!blockTotalSize || this._recvBuffer.length < blockTotalSize) break;

      const blockBuf = this._recvBuffer.subarray(0, blockTotalSize);
      this._recvBuffer = this._recvBuffer.subarray(blockTotalSize);

      try {
        const decrypted = this._crypto.decrypt(blockBuf);
        this._decryptedBuffer = Buffer.concat([this._decryptedBuffer, decrypted]);
      } catch (err) {
        this.emit('error', new Error(`V2SL decrypt failed: ${err.message}`));
        return;
      }
    }

    // Try to parse LOCO packets from decrypted data
    this._tryParsePackets();
  }

  _tryParsePackets() {
    while (this._decryptedBuffer.length >= HEADER_SIZE) {
      const header = LocoPacket.parseHeader(this._decryptedBuffer);
      if (!header) break;

      const totalSize = HEADER_SIZE + header.bodyLength;
      if (this._decryptedBuffer.length < totalSize) break;

      const packetBuf = this._decryptedBuffer.subarray(0, totalSize);
      this._decryptedBuffer = this._decryptedBuffer.subarray(totalSize);

      try {
        const packet = LocoPacket.fromBuffer(packetBuf);
        this._onPacket(packet);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  _onPacket(packet: any) {
    const pending = this._pendingRequests.get(packet.packetId);
    if (pending) {
      clearTimeout(pending.timer);
      this._pendingRequests.delete(packet.packetId);
      pending.resolve(packet);
    } else {
      // Server push (MSG, COMPLETE, KICKOUT, etc.)
      this.emit('push', packet);
    }
  }

  /**
   * Send a LOCO request and wait for the response.
   */
  request(method: string, body: any = {}, timeout = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const packetId = this.nextPacketId();
      const packet = new LocoPacket(packetId, 0, method, body);
      const plaintext = packet.serialize();

      // Encrypt with V2SL
      const encrypted = this._crypto.encrypt(plaintext);

      const timer = setTimeout(() => {
        this._pendingRequests.delete(packetId);
        reject(new Error(`Request ${method} (id=${packetId}) timed out`));
      }, timeout);

      this._pendingRequests.set(packetId, { resolve, reject, timer });
      this._socket.write(encrypted);
    });
  }

  /**
   * Send raw payload encrypted with V2SL (used for file upload streaming).
   */
  writeEncrypted(data: Buffer): Promise<void> {
    if (!this._socket) {
      return Promise.reject(new Error('Not connected'));
    }
    const encrypted = this._crypto.encrypt(data);
    return new Promise((resolve, reject) => {
      this._socket.write(encrypted, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Send LOGINLIST to authenticate and get initial chat list.
   */
  async loginList({
    os = 'android',
    appVer = '26.1.2',
    lang = 'ko',
    ntype = 0,
    prtVer = '1',
    duuid = '',
    oauthToken = '',
    chatIds = [],
    maxIds = [],
    lastTokenId = 0,
    lbk = 0,
    bg = false,
  }: any) {
    const body = {
      os,
      appVer,
      prtVer,
      lang,
      ntype,
      duuid,
      oauthToken,
      chatIds,
      maxIds,
      lastTokenId,
      lbk,
      bg,
    };

    return await this.request('LOGINLIST', body);
  }

  /**
   * Send a message to a chatroom.
   */
  async write(chatId: number | string, text: string, type = 1, opts: any = {}) {
    const toLong = toLongValue;

    const body: any = {
      chatId: toLong(chatId),
      msg: text,
      type,
      noSeen: !!opts.noSeen,
      // Default to normal chat scope (1). 0 triggers InvalidParameter (-203).
      scope: typeof opts.scope === 'number' ? opts.scope : 1,
      silence: !!(opts.silence || opts.isSilence),
    };

    if (opts.msgId !== undefined && opts.msgId !== null && Number(opts.msgId) > 0) {
      body.msgId = toLong(opts.msgId);
    }
    if (opts.supplement) body.supplement = opts.supplement;
    if (opts.from) body.from = opts.from;
    if (opts.extra) body.extra = opts.extra;
    if (opts.threadId !== undefined && opts.threadId !== null) body.threadId = toLong(opts.threadId);
    if (opts.featureStat) body.featureStat = opts.featureStat;

    const res = await this.request('WRITE', body);
    if (typeof res.status === 'number' && res.status !== 0) {
      throw new Error(`WRITE failed: status=${res.status}`);
    }
    if (!res.body || !res.body.logId) {
      const preview = res.body ? JSON.stringify(res.body) : '(empty)';
      throw new Error(`WRITE response missing logId: ${preview}`);
    }
    return res;
  }

  /**
   * Delete a message for everyone (DELETEMSG).
   */
  async deleteMsg(chatId: number | string, logId: number | string) {
    const toLong = toLongValue;
    const body = {
      chatId: toLong(chatId),
      logId: toLong(logId),
    };
    const res = await this.request('DELETEMSG', body);
    if (typeof res.status === 'number' && res.status !== 0) {
      throw new Error(`DELETEMSG failed: status=${res.status}`);
    }
    return res;
  }

  /**
   * Modify a message within 24 hours (MODIFYMSG).
   */
  async modifyMsg(
    chatId: number | string,
    logId: number | string,
    msg: string,
    opts: { type?: number; extra?: string; supplement?: string } = {}
  ) {
    const toLong = toLongValue;
    const body: any = {
      chatId: toLong(chatId),
      logId: toLong(logId),
      msg,
      type: typeof opts.type === 'number' ? opts.type : 1,
    };
    if (opts.extra !== undefined) body.extra = opts.extra;
    if (opts.supplement !== undefined) body.supplement = opts.supplement;
    const res = await this.request('MODIFYMSG', body);
    if (typeof res.status === 'number' && res.status !== 0) {
      throw new Error(`MODIFYMSG failed: status=${res.status}`);
    }
    return res;
  }

  /**
   * Fetch chat list via LOCO (LCHATLIST).
   */
  async lchatList({
    chatIds = [],
    maxIds = [],
    lastTokenId = 0,
    lastChatId = 0,
  }: any = {}) {
    const toLong = toLongValue;

    const body = {
      chatIds: (chatIds || []).map(toLong),
      maxIds: (maxIds || []).map(toLong),
      lastTokenId: toLong(lastTokenId || 0),
      lastChatId: toLong(lastChatId || 0),
    };

    return await this.request('LCHATLIST', body);
  }

  /**
   * Sync messages via LOCO (SYNCMSG).
   * @param {Object} opts
   * @param {number|string} opts.chatId
   * @param {number} [opts.cur=0]
   * @param {number} [opts.max=0]
   * @param {number} [opts.cnt=50]
   */
  async syncMsg({ chatId, cur = 0, max = 0, cnt = 50 }: any) {
    const toLong = toLongValue;

    const body = {
      chatId: toLong(chatId),
      cur: toLong(cur),
      max: toLong(max),
      cnt: typeof cnt === 'number' ? cnt : parseInt(cnt, 10) || 50,
    };

    return await this.request('SYNCMSG', body);
  }

  /**
   * Fetch specific messages via LOCO (GETMSGS).
   * @param {number[]|string[]} chatIds
   * @param {number[]|string[]} logIds
   */
  async getMsgs(chatIds: Array<number | string>, logIds: Array<number | string>) {
    const toLong = toLongValue;

    const body = {
      chatIds: (chatIds || []).map(toLong),
      logIds: (logIds || []).map(toLong),
    };

    return await this.request('GETMSGS', body);
  }

  /**
   * Fetch member info for specific users in a chat (MEMBER).
   */
  async member(chatId: number | string, memberIds: Array<number | string>) {
    const toLong = toLongValue;

    const body = {
      chatId: toLong(chatId),
      memberIds: (memberIds || []).map(toLong),
    };

    return await this.request('MEMBER', body);
  }

  /**
   * Fetch member list for a chat (MEMLIST).
   */
  async memList({ chatId, token = 0, excludeMe = false }: any) {
    const toLong = toLongValue;

    const body = {
      chatId: toLong(chatId),
      token: toLong(token || 0),
      excludeMe: !!excludeMe,
    };

    return await this.request('MEMLIST', body);
  }

  /**
   * Fetch open link info (INFOLINK).
   */
  async infoLink(linkIds: Array<number | string>) {
    const toLong = toLongValue;
    const body = {
      lis: (linkIds || []).map(toLong),
    };
    return await this.request('INFOLINK', body);
  }

  /**
   * Sync open link list (SYNCLINK).
   */
  async syncLink(lastToken = 0) {
    const toLong = toLongValue;
    const body = {
      ltk: toLong(lastToken || 0),
    };
    return await this.request('SYNCLINK', body);
  }

  /**
   * Fetch chat room info (CHATINFO).
   */
  async chatInfo(chatId: number | string) {
    const toLong = toLongValue;
    const body = { chatId: toLong(chatId) };
    return await this.request('CHATINFO', body);
  }

  /**
   * Enter chat room context and fetch members (CHATONROOM).
   */
  async chatOnRoom({ chatId, token = 0, opt = 0 }: any) {
    const toLong = toLongValue;
    const body = {
      chatId: toLong(chatId),
      token: toLong(token || 0),
      opt: toLong(opt || 0),
    };
    return await this.request('CHATONROOM', body);
  }

  /**
   * Send PING to keep connection alive.
   */
  async ping() {
    return await this.request('PING', {});
  }

  /**
   * Kick a member from an open chat (KICKMEM).
   */
  async kickMem({
    linkId,
    chatId,
    memberId,
    reported = false,
  }: {
    linkId: number | string;
    chatId: number | string;
    memberId: number | string;
    reported?: boolean;
  }) {
    const toLong = toLongValue;
    const body = {
      li: toLong(linkId),
      c: toLong(chatId),
      mid: toLong(memberId),
      r: !!reported,
    };
    const res = await this.request('KICKMEM', body);
    if (typeof res.status === 'number' && res.status !== 0) {
      throw new Error(`KICKMEM failed: status=${res.status}`);
    }
    return res;
  }

  /**
   * Blind a member from an open chat (BLIND).
   */
  async blind({
    linkId,
    chatId,
    memberId,
    report = false,
    chatLogInfo,
    category,
  }: {
    linkId: number | string;
    chatId: number | string;
    memberId: number | string;
    report?: boolean;
    chatLogInfo?: string;
    category?: string;
  }) {
    const toLong = toLongValue;
    const body: any = {
      li: toLong(linkId),
      c: toLong(chatId),
      mid: toLong(memberId),
      r: !!report,
    };
    if (chatLogInfo && String(chatLogInfo).trim()) {
      body.cli = chatLogInfo;
    }
    if (category && String(category).trim()) {
      body.cat = category;
    }
    const res = await this.request('BLIND', body);
    if (typeof res.status === 'number' && res.status !== 0) {
      throw new Error(`BLIND failed: status=${res.status}`);
    }
    return res;
  }

  /**
   * Start periodic PING.
   */
  startPing(intervalMs = 60000) {
    this._stopPing();
    this._pingInterval = setInterval(async () => {
      try {
        await this.ping();
      } catch (err) {
        this.emit('error', new Error(`Ping failed: ${err.message}`));
      }
    }, intervalMs);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  /**
   * Gracefully close the socket after pending writes are flushed.
   */
  end(timeoutMs = 5000): Promise<void> {
    this._stopPing();
    const socket = this._socket;
    if (!socket) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this._socket === socket) {
          socket.destroy();
          this._socket = null;
        }
        resolve();
      }, timeoutMs);
      socket.once('close', () => {
        clearTimeout(timer);
        if (this._socket === socket) {
          this._socket = null;
        }
        resolve();
      });
      socket.end();
    });
  }

  disconnect() {
    this._stopPing();
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    for (const [id, { reject, timer }] of this._pendingRequests) {
      clearTimeout(timer);
      reject(new Error('Disconnected'));
    }
    this._pendingRequests.clear();
  }
}
