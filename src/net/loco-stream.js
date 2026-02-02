const { EventEmitter } = require('events');
const { LocoPacket, HEADER_SIZE } = require('../protocol/loco-packet');

/**
 * Handles framing of LOCO packets over a raw byte stream.
 * Works for both SSL (plain) and V2SL (encrypted) connections.
 */
class LocoStream extends EventEmitter {
  constructor() {
    super();
    this._buffer = Buffer.alloc(0);
    this._packetIdCounter = 0;
  }

  nextPacketId() {
    return ++this._packetIdCounter;
  }

  /**
   * Feed raw bytes into the stream parser.
   * Emits 'packet' events for each complete LOCO packet.
   */
  feed(data) {
    this._buffer = Buffer.concat([this._buffer, data]);
    this._tryParse();
  }

  _tryParse() {
    while (this._buffer.length >= HEADER_SIZE) {
      const header = LocoPacket.parseHeader(this._buffer);
      if (!header) break;

      const totalSize = HEADER_SIZE + header.bodyLength;
      if (this._buffer.length < totalSize) break;

      const packetBuf = this._buffer.subarray(0, totalSize);
      this._buffer = this._buffer.subarray(totalSize);

      try {
        const packet = LocoPacket.fromBuffer(packetBuf);
        this.emit('packet', packet);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }
}

module.exports = { LocoStream };
