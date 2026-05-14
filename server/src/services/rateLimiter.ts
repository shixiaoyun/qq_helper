interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface CheckResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

const DEFAULT_IP_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60 * 1000, // 1分钟
};

const DEFAULT_USER_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1分钟
};

export class RateLimiter {
  private ipStore: Map<string, RateLimitEntry> = new Map();
  private userStore: Map<string, RateLimitEntry> = new Map();
  private ipConfig: RateLimitConfig;
  private userConfig: RateLimitConfig;

  constructor(
    ipConfig: Partial<RateLimitConfig> = {},
    userConfig: Partial<RateLimitConfig> = {}
  ) {
    this.ipConfig = { ...DEFAULT_IP_CONFIG, ...ipConfig };
    this.userConfig = { ...DEFAULT_USER_CONFIG, ...userConfig };
    this.startCleanupTimer();
  }

  check(ip: string, userId?: number): CheckResult {
    const now = Date.now();

    // 检查IP级别限流
    const ipResult = this.checkLimit(this.ipStore, ip, this.ipConfig, now);
    if (!ipResult.allowed) {
      return ipResult;
    }

    // 检查用户级别限流
    if (userId !== undefined && userId !== null) {
      const userKey = String(userId);
      const userResult = this.checkLimit(this.userStore, userKey, this.userConfig, now);
      if (!userResult.allowed) {
        return userResult;
      }
      // 返回用户级别的剩余配额（更严格）
      return {
        allowed: true,
        remaining: Math.min(ipResult.remaining, userResult.remaining),
        resetTime: Math.max(ipResult.resetTime, userResult.resetTime),
      };
    }

    return ipResult;
  }

  private checkLimit(
    store: Map<string, RateLimitEntry>,
    key: string,
    config: RateLimitConfig,
    now: number
  ): CheckResult {
    const entry = store.get(key);

    if (!entry || now >= entry.resetTime) {
      // 新窗口或窗口已过期
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + config.windowMs,
      };
      store.set(key, newEntry);
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: newEntry.resetTime,
      };
    }

    if (entry.count >= config.maxRequests) {
      // 超过限制
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    // 增加计数
    entry.count += 1;
    store.set(key, entry);

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  private startCleanupTimer(): void {
    // 每5分钟清理一次过期的条目
    const CLEANUP_INTERVAL = 5 * 60 * 1000;
    setInterval(() => {
      this.cleanup(this.ipStore);
      this.cleanup(this.userStore);
    }, CLEANUP_INTERVAL);
  }

  private cleanup(store: Map<string, RateLimitEntry>): void {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now >= entry.resetTime) {
        store.delete(key);
      }
    }
  }
}
