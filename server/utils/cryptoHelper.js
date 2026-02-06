const crypto = require('crypto');

/**
 * Normalize encryption key to exactly 32 bytes using SHA-256
 * @param {string} secret - Any length string
 * @returns {Buffer} - 32-byte buffer
 */
function normalizeKey(secret) {
  if (!secret) throw new Error('encryption secret required');
  // Use SHA-256 to create a consistent 32-byte key from any length input
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt plain text using AES-256-CBC. Returns base64 string in format iv:cipher
 * @param {string} plain
 * @param {string} secret - Any length string, will be normalized to 32 bytes
 */
function encryptText(plain, secret) {
  if (!secret) throw new Error('encryption secret required');
  const key = normalizeKey(secret);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plain, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  // prefix IV (base64) then ':' then cipher text
  return iv.toString('base64') + ':' + encrypted;
}

/**
 * Decrypt a base64 iv:cipher string using AES-256-CBC
 * @param {string} cipherText
 * @param {string} secret - Any length string, will be normalized to 32 bytes
 */
function decryptText(cipherText, secret) {
  if (!secret) throw new Error('encryption secret required');
  const key = normalizeKey(secret);
  const parts = cipherText.split(':');
  if (parts.length !== 2) throw new Error('Invalid cipher text format');
  const iv = Buffer.from(parts[0], 'base64');
  const data = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let out = decipher.update(data, 'base64', 'utf8');
  out += decipher.final('utf8');
  return out;
}

module.exports = { encryptText, decryptText };
