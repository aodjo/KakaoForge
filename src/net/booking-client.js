const tls = require('tls');
const { EventEmitter } = require('events');
const { Long } = require('bson');
const { LocoPacket } = require('../protocol/loco-packet');
const { LocoStream } = require('./loco-stream');

const BOOKING_HOST = 'booking-loco.kakao.com';
const BOOKING_PORT = 443;

/**
 * Booking server connection (SSL/TLS).
 * Used for CHECKIN to get the Carriage server address.
 */
class BookingClient extends EventEmitter {
  constructor() {
    super();
    this._socket = null;
    this._stream = new LocoStream();
    this._pendingRequests = new Map();

    this._stream.on('packet', (packet) => this._onPacket(packet));
    this._stream.on('error', (err) => this.emit('error', err));
  }

  connect() {
    return new Promise((resolve, reject) => {
      this._socket = tls.connect(BOOKING_PORT, BOOKING_HOST, {
        rejectUnauthorized: true,
      });

      this._socket.once('secureConnect', () => {
        this.emit('connected');
        resolve();
      });

      this._socket.once('error', (err) => {
        reject(err);
        this.emit('error', err);
      });

      this._socket.on('data', (data) => {
        this._stream.feed(data);
      });

      this._socket.on('close', () => {
        this.emit('disconnected');
      });
    });
  }

  /**
   * Send a LOCO request and wait for the response.
   */
  request(method, body = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const packetId = this._stream.nextPacketId();
      const packet = new LocoPacket(packetId, 0, method, body);
      const data = packet.serialize();

      const timer = setTimeout(() => {
        this._pendingRequests.delete(packetId);
        reject(new Error(`Request ${method} (id=${packetId}) timed out`));
      }, timeout);

      this._pendingRequests.set(packetId, { resolve, reject, timer });
      this._socket.write(data);
    });
  }

  /**
   * Send CHECKIN to get Carriage server address.
   */
  async checkin({ userId, os = 'android', appVer = '26.1.2', lang = 'ko', ntype = 0, useSub = false, mccmnc = '450,05' }) {
    const body = {
      userId: Long.fromNumber(typeof userId === 'number' ? userId : parseInt(userId)),
      os,
      ntype,
      appVer,
      lang,
    };
    if (useSub) body.useSub = true;
    if (mccmnc) body.MCCMNC = mccmnc;

    const res = await this.request('CHECKIN', body);
    console.log(`[DBG] CHECKIN raw response: status=${res.status}, body=`, JSON.stringify(res.body));
    return {
      host: res.body.host || '',
      host6: res.body.host6 || '',
      port: res.body.port || 0,
      cacheExpire: res.body.cacheExpire || 0,
      status: res.status,
    };
  }

  _onPacket(packet) {
    const pending = this._pendingRequests.get(packet.packetId);
    if (pending) {
      clearTimeout(pending.timer);
      this._pendingRequests.delete(packet.packetId);
      pending.resolve(packet);
    } else {
      this.emit('push', packet);
    }
  }

  disconnect() {
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

module.exports = { BookingClient, BOOKING_HOST, BOOKING_PORT };
