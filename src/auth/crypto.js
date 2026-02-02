const crypto = require('crypto');

/**
 * Password encryption for KakaoTalk sub-device login.
 * AES-256-CBC with key "jEibeliJAhlEeyoOnjuNg".
 *
 * From decompiled: CZ/C9844a.java (AES256.kt)
 */
const ENCRYPT_KEY = 'jEibeliJAhlEeyoOnjuNg';

function encryptPassword(password) {
  // Key: padded to 32 bytes with zeros
  const keyBuf = Buffer.alloc(32, 0);
  const keyBytes = Buffer.from(ENCRYPT_KEY, 'utf-8');
  keyBytes.copy(keyBuf, 0, 0, Math.min(keyBytes.length, 32));

  // IV: first 16 bytes of the key string
  const iv = Buffer.from(ENCRYPT_KEY.substring(0, 16), 'utf-8');

  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv);
  cipher.setAutoPadding(true); // PKCS7
  const encrypted = Buffer.concat([cipher.update(password, 'utf-8'), cipher.final()]);
  return encrypted.toString('base64');
}

function decryptPassword(encryptedBase64) {
  const keyBuf = Buffer.alloc(32, 0);
  const keyBytes = Buffer.from(ENCRYPT_KEY, 'utf-8');
  keyBytes.copy(keyBuf, 0, 0, Math.min(keyBytes.length, 32));

  const iv = Buffer.from(ENCRYPT_KEY.substring(0, 16), 'utf-8');

  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuf, iv);
  decipher.setAutoPadding(true);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

/**
 * Generate X-VC header for API authentication.
 *
 * From decompiled: LO/h.java (XVCHeader.kt)
 * Format: SHA512("BARD|{deviceUuid}|DANTE|{accountKey}|SIAN").substring(0, 16)
 */
function generateXVCHeader(deviceUuid, accountKey) {
  const raw = `BARD|${deviceUuid}|DANTE|${accountKey}|SIAN`;
  const hash = crypto.createHash('sha512').update(raw, 'utf-8').digest('hex');
  return hash.substring(0, 16);
}

module.exports = {
  encryptPassword,
  decryptPassword,
  generateXVCHeader,
  ENCRYPT_KEY,
};
