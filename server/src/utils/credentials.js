const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
function getEncryptionKey() {
  const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encryptionKey || !/^[a-f0-9]{64}$/i.test(encryptionKey)) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hex key.');
  }
  return Buffer.from(encryptionKey, 'hex');
}

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function encryptTemporaryPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decryptTemporaryPassword(value) {
  if (!value) return null;
  const [ivHex, tagHex, encryptedHex] = value.split(':');
  if (!ivHex || !tagHex || !encryptedHex) return null;

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = {
  comparePassword,
  decryptTemporaryPassword,
  encryptTemporaryPassword,
  generateTemporaryPassword,
  hashPassword,
};