import { Router } from 'express';
import { authMiddleware, requireAdmin, AuthRequest } from '../utils/auth.js';
import { getDatabase } from '../config/database.js';

const router = Router();

router.get('/settings/ui', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT value FROM system_config WHERE key = ?').get('ui_page_size') as { value: string } | undefined;
    const pageSize = row ? Number(row.value) : 16;
    res.json({ success: true, data: { pageSize } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/settings/ui', authMiddleware, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined || value === null) {
      res.status(400).json({ success: false, error: '参数key和value不能为空' });
      return;
    }
    const db = getDatabase();
    db.prepare(`
      INSERT INTO system_config (key, value, description, updated_at)
      VALUES (?, ?, 'UI设置', CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `).run(key, String(value), String(value));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
