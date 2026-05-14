import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import {
  getUserTokenLimits,
  updateUserTokenLimits,
  checkUserTokenLimits,
  getAllUsersTokenLimits,
  getAllUsersTotalTokenUsage,
} from '../models/tokenLimits.js';
import { getUserUsageStats } from '../models/stats.js';

const router = Router();

router.get('/admin/token-limits', authMiddleware, requireAdmin, (_req: Request, res: Response) => {
  try {
    const users = getAllUsersTokenLimits();
    const totals = getAllUsersTotalTokenUsage();
    res.json({ success: true, data: { users, totals } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/admin/token-limits/:userId', authMiddleware, requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId as string);
    const { daily_limit, weekly_limit, monthly_limit } = req.body;
    const limits = updateUserTokenLimits(userId, { daily_limit, weekly_limit, monthly_limit });
    res.json({ success: true, data: limits });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats/my-token-usage', authMiddleware, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 1;
    const limits = getUserTokenLimits(userId);
    const check = checkUserTokenLimits(userId);
    const stats = getUserUsageStats(userId);
    res.json({
      success: true,
      data: {
        limits: {
          daily_limit: limits.daily_limit,
          weekly_limit: limits.weekly_limit,
          monthly_limit: limits.monthly_limit,
        },
        usage: stats,
        check,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
