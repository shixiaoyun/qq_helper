import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware, requireAdmin } from '../utils/auth.js';
import { upgradeService } from '../services/upgradeService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/system/upgrade/version', authMiddleware, (_req, res) => {
  try {
    const info = upgradeService.getVersionInfo();
    res.json({ success: true, data: info });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system/upgrade/history', authMiddleware, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const result = upgradeService.getUpgradeHistory(page, pageSize);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system/upgrade/backups', authMiddleware, requireAdmin, (_req, res) => {
  try {
    const backups = upgradeService.listBackups();
    res.json({ success: true, data: backups });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/system/upgrade/backup', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const operatorId = (req as any).user.id;
    const result = await upgradeService.createBackup(req.body.name, operatorId);
    res.json({ success: true, data: result, message: '备份创建成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system/upgrade/upgrades', authMiddleware, requireAdmin, (_req, res) => {
  try {
    const upgrades = upgradeService.listUpgrades();
    res.json({ success: true, data: upgrades });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/system/upgrade/upload', authMiddleware, requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: '请上传升级包文件' });
      return;
    }
    const filename = upgradeService.saveUploadedFile(req.file.buffer, req.file.originalname);
    res.json({ success: true, data: { filename }, message: '升级包上传成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/system/upgrade/execute', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { filename, targetVersion } = req.body;
    if (!filename) {
      res.status(400).json({ success: false, error: '未指定升级包' });
      return;
    }
    const operatorId = (req as any).user.id;
    const result = await upgradeService.executeUpgrade(filename, targetVersion || 'unknown', operatorId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/system/upgrade/rollback', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({ success: false, error: '未指定备份文件' });
      return;
    }
    const operatorId = (req as any).user.id;
    const result = await upgradeService.rollbackToBackup(filename, operatorId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/system/upgrade/backups/:filename', authMiddleware, requireAdmin, (req, res) => {
  try {
    const sanitized = path.basename(req.params.filename as string);
    if (sanitized !== req.params.filename) {
      res.status(400).json({ success: false, error: '非法文件名' });
      return;
    }
    const deleted = upgradeService.deleteBackup(sanitized);
    if (!deleted) {
      res.status(404).json({ success: false, error: '备份文件不存在' });
      return;
    }
    res.json({ success: true, message: '备份已删除' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/system/upgrade/upgrades/:filename', authMiddleware, requireAdmin, (req, res) => {
  try {
    const sanitized = path.basename(req.params.filename as string);
    if (sanitized !== req.params.filename) {
      res.status(400).json({ success: false, error: '非法文件名' });
      return;
    }
    const deleted = upgradeService.deleteUpgrade(sanitized);
    if (!deleted) {
      res.status(404).json({ success: false, error: '升级包不存在' });
      return;
    }
    res.json({ success: true, message: '升级包已删除' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system/upgrade/download/:filename', authMiddleware, requireAdmin, (req, res) => {
  try {
    const sanitized = path.basename(req.params.filename as string);
    if (sanitized !== req.params.filename) {
      res.status(400).json({ success: false, error: '非法文件名' });
      return;
    }
    const filePath = path.join(upgradeService.getBackupDir(), sanitized);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: '文件不存在' });
      return;
    }
    const stats = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitized}"`);
    res.setHeader('Content-Length', stats.size);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;