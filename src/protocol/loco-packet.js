const { BSON } = require('bson');

const HEADER_SIZE = 22;
const METHOD_LENGTH = 11;

class LocoPacket {
  constructor(packetId, status, method, body = {}) {
    this.packetId = packetId;
    this.status = status;
    this.method = method;
    this.body = body;
  }

  serialize() {
    const bodyBytes = BSON.serialize(this.body);

    const header = Buffer.alloc(HEADER_SIZE);
    header.writeInt32LE(this.packetId, 0);
    header.writeInt16LE(this.status, 4);

    // Write method name (11 bytes, UTF-8, null-padded)
    const methodBuf = Buffer.alloc(METHOD_LENGTH, 0);
    Buffer.from(this.method, 'utf8').copy(methodBuf, 0, 0, METHOD_LENGTH);
    methodBuf.copy(header, 6);

    // Null terminator byte
    header.writeUInt8(0, 17);

    // Body length
    header.writeInt32LE(bodyBytes.length, 18);

    return Buffer.concat([header, bodyBytes]);
  }

  static parseHeader(buf) {
    if (buf.length < HEADER_SIZE) return null;

    const packetId = buf.readInt32LE(0);
    const status = buf.readInt16LE(4);

    // Read method (11 bytes, trim null bytes)
    const methodRaw = buf.subarray(6, 17);
    const nullIdx = methodRaw.indexOf(0);
    const method = methodRaw.subarray(0, nullIdx === -1 ? METHOD_LENGTH : nullIdx).toString('utf8').trim();

    // Skip 1 byte (null terminator at offset 17)
    const bodyLength = buf.readInt32LE(18);

    return { packetId, status, method, bodyLength };
  }

  static parseBody(bodyBuf) {
    if (bodyBuf.length === 0) return {};
    return BSON.deserialize(bodyBuf);
  }

  static fromBuffer(buf) {
    const header = LocoPacket.parseHeader(buf);
    if (!header) return null;

    const bodyBuf = buf.subarray(HEADER_SIZE, HEADER_SIZE + header.bodyLength);
    const body = LocoPacket.parseBody(bodyBuf);

    return new LocoPacket(header.packetId, header.status, header.method, body);
  }

  toString() {
    return `LocoPacket(id=${this.packetId}, status=${this.status}, method=${this.method}, bodyLen=${JSON.stringify(this.body).length})`;
  }
}

module.exports = { LocoPacket, HEADER_SIZE };
