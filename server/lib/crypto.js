// AES-256-GCM encryption for secrets stored at rest (currently: LLM API keys).
//
// Uses ENCRYPTION_KEY from the environment if set (recommended — any random
// 32+ char string). Falls back to deriving a key from SESSION_SECRET so
// existing deployments don't break on upgrade, but ENCRYPTION_KEY is strongly
// preferred since SESSION_SECRET rotation would otherwise strand encrypted
// data.
const crypto = require('crypto');

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Neither ENCRYPTION_KEY nor SESSION_SECRET is set — cannot encrypt secrets');
  }
  // scrypt derives a stable 32-byte key from any-length secret
  return crypto.scryptSync(secret, 'tally-llm-settings', 32);
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(encoded) {
  if (!encoded) return null;
  const buf  = Buffer.from(encoded, 'base64');
  const iv   = buf.subarray(0, 12);
  const tag  = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
