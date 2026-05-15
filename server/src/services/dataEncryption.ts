import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// 降级密钥已移除 - 所有加密数据必须使用当前 ENCRYPTION_KEY
// 升级旧数据请参考变更日志
const FALLBACK_KEYS: string[] = [];

export function getCurrentKeyFingerprint(): string {
  const keyStr = process.env.ENCRYPTION_KEY || '';
  if (!keyStr) return '';
  return crypto.createHash('sha256').update(keyStr).digest('hex').substring(0, 16);
}

export function hasEncryptionKeyChanged(storedFingerprint: string): boolean {
  const current = getCurrentKeyFingerprint();
  if (!storedFingerprint || !current) return false;
  return storedFingerprint !== current;
}

function getKey(key?: string): Buffer {
  const keyStr = key || process.env.ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error('ENCRYPTION_KEY environment variable is required for encryption operations');
  }
  return crypto.createHash('sha256').update(keyStr).digest();
}

export function encrypt(text: string, key?: string): string {
  if (!text || typeof text !== 'string') {
    throw new Error('Encrypt input must be a non-empty string');
  }

  const keyBuffer = getKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string, key?: string): string {
  if (!encrypted || typeof encrypted !== 'string') {
    throw new Error('Decrypt input must be a non-empty string');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, tagHex, encryptedHex] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const keyBuffer = getKey(key);
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

function tryDecrypt(encrypted: string, keyStr: string): string | null {
  try {
    const keyBuffer = crypto.createHash('sha256').update(keyStr).digest();
    const parts = encrypted.split(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, Buffer.from(parts[0], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

export function isEncryptedFormat(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts[0].length === IV_LENGTH * 2 && parts[1].length === TAG_LENGTH * 2;
}

export function decryptWithFallback(encrypted: string, key?: string): { plaintext: string; migrated: boolean } {
  if (!encrypted || typeof encrypted !== 'string') return { plaintext: '', migrated: false };
  if (!isEncryptedFormat(encrypted)) return { plaintext: encrypted, migrated: false };

  const currentKey = key || process.env.ENCRYPTION_KEY || '';

  const currentResult = tryDecrypt(encrypted, currentKey);
  if (currentResult !== null) {
    return { plaintext: currentResult, migrated: false };
  }

  for (const fallbackKey of FALLBACK_KEYS) {
    if (fallbackKey === currentKey) continue;
    const fallbackResult = tryDecrypt(encrypted, fallbackKey);
    if (fallbackResult !== null) {
      return { plaintext: fallbackResult, migrated: true };
    }
  }

  return { plaintext: '', migrated: false };
}

export function reEncrypt(encrypted: string, key?: string): string | null {
  const { plaintext, migrated } = decryptWithFallback(encrypted, key);
  if (!plaintext) return null;
  if (!migrated) return null;
  return encrypt(plaintext, key);
}
