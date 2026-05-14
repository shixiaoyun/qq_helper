import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyStr = process.env.ENCRYPTION_KEY;
  if (!keyStr) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  return crypto.createHash('sha256').update(keyStr).digest();
}

function encrypt(text: string): string {
  const keyBuffer = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return encrypted;
  const keyBuffer = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

interface SensitivePattern {
  name: string;
  pattern: RegExp;
  replacement: string;
  description: string;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    name: 'api_key',
    pattern: /\b(sk-[a-zA-Z0-9]{32,})\b/g,
    replacement: '[API_KEY_REDACTED]',
    description: 'API密钥',
  },
  {
    name: 'jwt_secret',
    pattern: /\b([a-zA-Z0-9_-]{32,})\b/g,
    replacement: '[SECRET_REDACTED]',
    description: 'JWT密钥',
  },
  {
    name: 'password',
    pattern: /\b(password\s*[:=]\s*["']?)([^"'\s]+)/gi,
    replacement: '$1[PASSWORD_REDACTED]',
    description: '密码',
  },
  {
    name: 'database_url',
    pattern: /\b(mongodb|mysql|postgresql|redis):\/\/[^\s]+/gi,
    replacement: '[DB_URL_REDACTED]',
    description: '数据库连接URL',
  },
  {
    name: 'private_key',
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[PRIVATE_KEY_REDACTED]',
    description: '私钥',
  },
  {
    name: 'credit_card',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[CREDIT_CARD_REDACTED]',
    description: '信用卡号',
  },
  {
    name: 'phone_number',
    pattern: /\b1[3-9]\d{9}\b/g,
    replacement: '[PHONE_REDACTED]',
    description: '手机号',
  },
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
    description: '邮箱地址',
  },
  {
    name: 'id_card',
    pattern: /\b\d{17}[\dXx]\b/g,
    replacement: '[ID_CARD_REDACTED]',
    description: '身份证号',
  },
  {
    name: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_REDACTED]',
    description: 'IP地址',
  },
  {
    name: 'file_path',
    pattern: /\b([A-Z]:\\Users\\[^\\]+|\/home\/[^\/]+|\/Users\/[^\/]+)\b/gi,
    replacement: '[USER_PATH_REDACTED]',
    description: '用户路径',
  },
];

interface PrivacyOptions {
  encryptSensitive?: boolean;
  redactPatterns?: boolean;
  allowedPatterns?: string[];
  encryptFields?: string[];
}

const DEFAULT_OPTIONS: PrivacyOptions = {
  encryptSensitive: true,
  redactPatterns: true,
  allowedPatterns: [],
  encryptFields: ['apiKey', 'api_key', 'secret', 'password', 'token', 'privateKey'],
};

export class PrivacyGuard {
  private options: PrivacyOptions;
  private encryptionMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();

  constructor(options: Partial<PrivacyOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  sanitize(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let sanitized = text;

    if (this.options.redactPatterns) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (this.options.allowedPatterns?.includes(pattern.name)) continue;
        sanitized = sanitized.replace(pattern.pattern, pattern.replacement);
      }
    }

    return sanitized;
  }

  encrypt(text: string): string {
    if (!text || typeof text !== 'string') return text;
    if (!this.options.encryptSensitive) return text;

    const encrypted = encrypt(text);
    const placeholder = `[ENC:${crypto.randomBytes(8).toString('hex')}]`;
    this.encryptionMap.set(placeholder, encrypted);
    this.reverseMap.set(encrypted, text);
    return placeholder;
  }

  decrypt(text: string): string {
    if (!text || typeof text !== 'string') return text;

    const encMatch = text.match(/\[ENC:([a-f0-9]{16})\]/g);
    if (!encMatch) return text;

    let decrypted = text;
    for (const placeholder of encMatch) {
      const encrypted = this.encryptionMap.get(placeholder);
      if (encrypted) {
        try {
          const original = decrypt(encrypted);
          decrypted = decrypted.replace(placeholder, original);
        } catch {
          // 解密失败保留占位符
        }
      }
    }
    return decrypted;
  }

  sanitizeObject(obj: any, depth = 0): any {
    if (depth > 10) return obj;
    if (!obj) return obj;

    if (typeof obj === 'string') {
      return this.sanitize(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const shouldEncrypt = this.options.encryptFields?.some(
          field => key.toLowerCase().includes(field.toLowerCase())
        );

        if (shouldEncrypt && typeof value === 'string') {
          result[key] = this.encrypt(value);
        } else {
          result[key] = this.sanitizeObject(value, depth + 1);
        }
      }
      return result;
    }

    return obj;
  }

  restoreObject(obj: any, depth = 0): any {
    if (depth > 10) return obj;
    if (!obj) return obj;

    if (typeof obj === 'string') {
      return this.decrypt(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.restoreObject(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.restoreObject(value, depth + 1);
      }
      return result;
    }

    return obj;
  }

  sanitizeMessages(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
    return messages.map(msg => ({
      ...msg,
      content: this.sanitize(msg.content),
    }));
  }

  getStats(): { patternsRedacted: number; fieldsEncrypted: number } {
    return {
      patternsRedacted: SENSITIVE_PATTERNS.length,
      fieldsEncrypted: this.options.encryptFields?.length || 0,
    };
  }
}

export function createPrivacyGuard(options?: Partial<PrivacyOptions>): PrivacyGuard {
  return new PrivacyGuard(options);
}

export const defaultPrivacyGuard = new PrivacyGuard();
