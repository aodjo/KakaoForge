const net = require('net');
const { EventEmitter } = require('events');
const { LocoPacket, HEADER_SIZE } = require('../protocol/loco-packet');
const { V2SLCrypto } = require('../crypto/v2sl');

/**
 * Carriage server connection (V2SL encrypted).
 * Used for LOGINLIST and all messaging after CHECKIN.
 */
class CarriageClient extends EventEmitter {
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
  connect(host, port, timeout = 10000) {
    return new Promise((resolve, reject) => {
      this._socket = new net.Socket();
      this._socket.setNoDelay(true);

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
  _onData(data) {
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

  _onPacket(packet) {
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
  request(method, body = {}, timeout = 10000) {
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
  }) {
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
  async write(chatId, text, type = 1) {
    return await this.request('WRITE', {
      chatId,
      msg: text,
      type,
      noSeen: false,
    });
  }

  /**
   * Send PING to keep connection alive.
   */
  async ping() {
    return await this.request('PING', {});
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

module.exports = { CarriageClient };
