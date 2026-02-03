import * as crypto from 'crypto';

// RSA public key from KakaoTalk APK (kq/d.java)
const RSA_MODULUS = Buffer.from(
  'A3B076E8C445851F19A670C231AAC6DB42EFD09717D06048A5CC56906CD1AB27' +
  'B9DF37FFD5017E7C13A1405B5D1C3E4879A6A499D3C618A72472B0B50CA5EF1E' +
  'F6EEA70369D9413FE662D8E2B479A9F72142EE70CEE6C2AD12045D52B25C4A20' +
  '4A28968E37F0BA6A49EE3EC9F2AC7A65184160F22F62C43A4067CD8D2A6F13D9' +
  'B8298AB002763D236C9D1879D7FCE5B8FA910882B21E15247E0D0A24791308E5' +
  '1983614402E9FA03057C57E9E178B1CC39FE67288EFC461945CBCAA11D1FCC12' +
  '3E750B861F0D447EBE3C115F411A42DC95DDB21DA42774A5BCB1DDF7FA5F1062' +
  '8010C74F36F31C40EFCFE289FD81BABA44A6556A6C301210414B6023C3F46371',
  'hex'
);
const RSA_EXPONENT = 3;

export const AES_KEY_SIZE = 16;       // 128 bits
export const AES_IV_SIZE = 12;        // GCM nonce
const GCM_TAG_BITS = 128;
const ENCRYPTION_TYPE = 3;     // AES_GCM128
const MAX_BLOCK_SIZE = 131068;

export class V2SLCrypto {
  aesKey: Buffer;
  handshaked: boolean;

  constructor() {
    this.aesKey = crypto.randomBytes(AES_KEY_SIZE);
    this.handshaked = false;
  }

  /**
   * Create RSA public key object from raw modulus/exponent
   */
  _getRsaPublicKey() {
    // Build RSA public key in DER format
    const modulus = RSA_MODULUS;
    const exponent = Buffer.from([0x03]);

    // Use Node.js crypto to create key from components
    const key = crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: modulus.toString('base64url'),
        e: Buffer.from([0x03]).toString('base64url'),
      },
      format: 'jwk',
    });
    return key;
  }

  /**
   * RSA-OAEP encrypt the AES key for handshake
   */
  rsaEncrypt(data: Buffer) {
    const pubKey = this._getRsaPublicKey();
    return crypto.publicEncrypt(
      {
        key: pubKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha1',
      },
      data
    );
  }

  /**
   * Build the V2SL handshake packet:
   *   [4 bytes] RSA encrypted data length
   *   [4 bytes] 16 (key size)
   *   [4 bytes] 3  (encryption type = AES_GCM128)
   *   [N bytes] RSA encrypted AES key
   */
  buildHandshake() {
    const encryptedKey = this.rsaEncrypt(this.aesKey);

    const header = Buffer.alloc(12);
    header.writeInt32LE(encryptedKey.length, 0);
    header.writeInt32LE(AES_KEY_SIZE, 4);
    header.writeInt32LE(ENCRYPTION_TYPE, 8);

    this.handshaked = true;
    return Buffer.concat([header, encryptedKey]);
  }

  /**
   * Encrypt data with AES-GCM:
   *   [4 bytes] block_size = iv_size + encrypted_size (with tag)
   *   [12 bytes] random IV
   *   [N bytes]  AES-GCM ciphertext + tag
   */
  encrypt(plaintext: Buffer) {
    const iv = crypto.randomBytes(AES_IV_SIZE);
    const cipher = crypto.createCipheriv('aes-128-gcm', this.aesKey, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertext = Buffer.concat([encrypted, tag]);

    const blockSize = AES_IV_SIZE + ciphertext.length;
    const header = Buffer.alloc(4);
    header.writeInt32LE(blockSize, 0);

    return Buffer.concat([header, iv, ciphertext]);
  }

  /**
   * Decrypt AES-GCM block:
   *   Read [4 bytes] block_size
   *   Read [12 bytes] IV
   *   Read [block_size - 12 bytes] ciphertext + tag
   *   Decrypt and return plaintext
   */
  decrypt(blockBuf: Buffer) {
    const blockSize = blockBuf.readInt32LE(0);
    if (blockSize > MAX_BLOCK_SIZE) {
      throw new Error(`V2SL block too large: ${blockSize}`);
    }

    const iv = blockBuf.subarray(4, 4 + AES_IV_SIZE);
    const ciphertextWithTag = blockBuf.subarray(4 + AES_IV_SIZE, 4 + blockSize);

    // GCM tag is last 16 bytes
    const tagStart = ciphertextWithTag.length - 16;
    const ciphertext = ciphertextWithTag.subarray(0, tagStart);
    const tag = ciphertextWithTag.subarray(tagStart);

    const decipher = crypto.createDecipheriv('aes-128-gcm', this.aesKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Read a single encrypted block from a buffer reader.
   * Returns { data, bytesConsumed } or null if not enough data.
   */
  static blockSize(buf: Buffer) {
    if (buf.length < 4) return null;
    return buf.readInt32LE(0) + 4; // block_size + 4 bytes for the size field
  }
}
