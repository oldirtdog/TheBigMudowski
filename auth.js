const crypto = require('crypto');

const KEY_LENGTH = 64;

// Hashes a plain-text password with a random salt. Returns both — never store the plain password.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const attemptHash = crypto.scryptSync(password, salt, KEY_LENGTH);
  const storedHash = Buffer.from(hash, 'hex');
  return attemptHash.length === storedHash.length && crypto.timingSafeEqual(attemptHash, storedHash);
}

module.exports = { hashPassword, verifyPassword };
