import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';

import { env } from '../config/env.js';

function getJwtSecret(): Uint8Array {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    console.error('[Auth] JWT_SECRET 未设置或长度不足32字符，请设置强密钥！');
    throw new Error('JWT_SECRET 未配置或太短，必须至少32个字符');
  }
  return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN || '7d';

export interface JWTPayload {
  sub: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

export async function createToken(user: { id: number; username: string; role: string }): Promise<string> {
  return new SignJWT({
    sub: String(user.id),
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      clockTolerance: 60,
    });
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: '未提供认证令牌' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = await verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: '认证令牌无效或已过期' });
      return;
    }

    req.user = {
      id: Number(payload.sub),
      username: payload.username,
      role: payload.role,
    };

    next();
  } catch {
    res.status(401).json({ error: '认证失败' });
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: '请先登录' });
      return;
    }

    if (req.user.role === 'admin') {
      next();
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: '权限不足' });
      return;
    }

    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }

  next();
}

export function requireSupervisor(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }

  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    res.status(403).json({ error: '需要主管及以上权限' });
    return;
  }

  next();
}
