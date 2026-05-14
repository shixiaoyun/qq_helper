import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import { trashService } from '../services/trashService.js';

const router = Router();

// 获取回收站列表
router.get('/trash', authMiddleware, (req, res) => {
  try {
    const user = (req as any).user;
    const userId = user?.id;
    const userRole = user?.role;
    const { table, page = '1', pageSize = '50' } = req.query;

    const isAdmin = userRole === 'admin';
    const result = trashService.getItems(
      isAdmin ? undefined : userId,
      table as string | undefined,
      parseInt(page as string),
      parseInt(pageSize as string)
    );
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 恢复单条记录
router.post('/trash/:id/restore', authMiddleware, (req, res) => {
  try {
    const result = trashService.restoreItem(parseInt(req.params.id as string));
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json({ success: true, message: '已恢复' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 永久删除单条
router.delete('/trash/:id', authMiddleware, requireAdmin, (req, res) => {
  try {
    trashService.permanentDelete(parseInt(req.params.id as string));
    res.json({ success: true, message: '已永久删除' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 批量永久删除（清空选中的回收站项）
router.post('/trash/empty', authMiddleware, requireAdmin, (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: '请提供要删除的ID列表' });
      return;
    }
    const count = trashService.emptyTrash(ids);
    res.json({ success: true, message: `已永久删除 ${count} 条记录`, count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;