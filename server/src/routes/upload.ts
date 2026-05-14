import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { authMiddleware, requireAuth } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { success, error } from '../utils/response.js';
import { saveUploadedFile } from '../services/uploadService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(env.MAX_FILE_SIZE),
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  },
});

// POST /api/upload - 上传文件
router.post('/upload', authMiddleware, requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return error(res, '没有上传文件', 400);
    }

    const result = saveUploadedFile(req.file.buffer, req.file.originalname, req.user!.id);

    return success(res, {
      fileName: result.fileName,
      url: result.url,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }, '上传成功');
  } catch (err: any) {
    return error(res, err.message || '上传失败', 500);
  }
});

// POST /api/upload/image - 上传图片 (专用接口)
router.post('/upload/image', authMiddleware, requireAuth, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return error(res, '没有上传图片', 400);
    }

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedImageTypes.includes(req.file.mimetype)) {
      return error(res, '只支持 JPEG/PNG/GIF/WebP 图片', 400);
    }

    const result = saveUploadedFile(req.file.buffer, req.file.originalname, req.user!.id);

    return success(res, {
      fileName: result.fileName,
      url: result.url,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }, '图片上传成功');
  } catch (err: any) {
    return error(res, err.message || '上传失败', 500);
  }
});

export default router;
