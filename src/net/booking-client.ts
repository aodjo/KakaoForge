import * as tls from 'tls';
import { EventEmitter } from 'events';
import { Long } from 'bson';
import { LocoPacket } from '../protocol/loco-packet';
import { LocoStream } from './loco-stream';

export const BOOKING_HOST = 'booking-loco.kakao.com';
export const BOOKING_PORT = 443;

function normalizeStringList(list: any[]) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
}

function normalizePortList(list: any[]) {
  if (!Array.isArray(list)) return [];
  const ports = list
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return [...new Set(ports)];
}

function normalizeGetConf(body: any = {}) {
  const ticket = body.ticket || body.ticketInfo || body.TicketInfo || {};
  const lsl = normalizeStringList(ticket.lsl);
  const lsl6 = normalizeStringList(ticket.lsl6);

  const wifi = body.wifi || body.connInfoForWifi || body.connInfoWifi || {};
  const cell = body['3g'] || body.connInfoForCellular || body.connInfo3g || {};

  const portsWifi = normalizePortList(wifi.ports);
  const portsCellular = normalizePortList(cell.ports);

  return {
    revision: typeof body.revision === 'number' ? body.revision : 0,
    ticket: { lsl, lsl6 },
    connInfo: { wifi, cellular: cell },
    portsWifi,
    portsCellular,
    raw: body,
  };
}

/**
 * Booking server connection (SSL/TLS).
 * Used for CHECKIN to get the Carriage server address.
 */
export class BookingClient extends EventEmitter {
  _socket: tls.TLSSocket | null;
  _stream: LocoStream;
  _pendingRequests: Map<number, any>;

  constructor() {
    super();
    this._socket = null;
    this._stream = new LocoStream();
    this._pendingRequests = new Map();

    this._stream.on('packet', (packet) => this._onPacket(packet));
    this._stream.on('error', (err) => this.emit('error', err));
  }

  connect(host = BOOKING_HOST, port = BOOKING_PORT): Promise<void> {
    return new Promise((resolve, reject) => {
      this._socket = tls.connect(port, host, {
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
  request(method: string, body: any = {}, timeout = 10000): Promise<any> {
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
  async checkin({ userId, os = 'android', appVer = '26.1.2', lang = 'ko', ntype = 0, useSub = false, mccmnc = '45005' }: any) {
    const body: any = {
      userId: Long.fromNumber(typeof userId === 'number' ? userId : parseInt(userId)),
      os,
      ntype,
      appVer,
      lang,
    };
    if (useSub) body.useSub = true;
    if (mccmnc) body.MCCMNC = mccmnc;

    const res = await this.request('CHECKIN', body);
    return {
      host: res.body.host || '',
      host6: res.body.host6 || '',
      port: res.body.port || 0,
      cacheExpire: res.body.cacheExpire || 0,
      status: res.status,
    };
  }

  /**
   * Send GETCONF to retrieve Ticket hosts and port lists.
   */
  async getConf({ userId, os = 'android', mccmnc = '45005' }: any) {
    const body: any = {
      userId: Long.fromNumber(typeof userId === 'number' ? userId : parseInt(userId)),
      mccmnc,
      os,
    };

    const res = await this.request('GETCONF', body);
    return normalizeGetConf(res.body);
  }

  _onPacket(packet: any) {
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
