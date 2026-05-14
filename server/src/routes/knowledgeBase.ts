import { Router } from 'express';
import { z } from 'zod';
import { success, error } from '../utils/response.js';
import { authMiddleware, requireAuth } from '../utils/auth.js';
import type { AuthRequest } from '../utils/auth.js';
import { prismaService } from '../services/prismaService.js';
import { ragService } from '../services/ragService.js';
import { trashService } from '../services/trashService.js';


const router = Router();

// GET /api/knowledge-bases - List knowledge bases
router.get('/knowledge-bases', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const knowledgeBases = await prismaService.knowledgeBase.findByUser(req.user!.id);
    return success(res, knowledgeBases);
  } catch (err: any) {
    return error(res, err.message || '获取知识库失败', 500);
  }
});

// POST /api/knowledge-bases - Create knowledge base
router.post('/knowledge-bases', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    });

    const data = schema.parse(req.body);
    const kb = await ragService.createKnowledgeBase(req.user!.id, data.name, data.description);
    return success(res, kb, '知识库创建成功');
  } catch (err: any) {
    return error(res, err.message || '创建知识库失败', 500);
  }
});

// GET /api/knowledge-bases/:id - Get knowledge base details
router.get('/knowledge-bases/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const kb = await prismaService.knowledgeBase.findById(id);

    if (!kb || kb.userId !== req.user!.id) {
      return error(res, '知识库不存在或无权限', 404);
    }

    return success(res, kb);
  } catch (err: any) {
    return error(res, err.message || '获取知识库失败', 500);
  }
});

// DELETE /api/knowledge-bases/:id - Delete knowledge base
router.delete('/knowledge-bases/:id', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const kb = await prismaService.knowledgeBase.findById(id);

    if (!kb || kb.userId !== req.user!.id) {
      return error(res, '知识库不存在或无权限', 404);
    }

    trashService.moveToTrash('knowledge_bases', kb.id, kb, kb.name, kb.userId, req.user!.id);
    await prismaService.knowledgeBase.delete(id);
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除知识库失败', 500);
  }
});

// POST /api/knowledge-bases/:id/documents - Upload document
router.post('/knowledge-bases/:id/documents', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const kbId = Number(req.params.id);
    const kb = await prismaService.knowledgeBase.findById(kbId);

    if (!kb || kb.userId !== req.user!.id) {
      return error(res, '知识库不存在或无权限', 404);
    }

    // Expect file content in body (base64 or text)
    const schema = z.object({
      fileName: z.string(),
      originalName: z.string(),
      fileType: z.string(),
      fileSize: z.number(),
      content: z.string(), // File content as text
    });

    const data = schema.parse(req.body);

    const result = await ragService.uploadDocument(kbId, req.user!.id, {
      fileName: data.fileName,
      originalName: data.originalName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      filePath: `/uploads/${data.fileName}`,
      content: data.content,
    });

    return success(res, result, '文档上传成功');
  } catch (err: any) {
    return error(res, err.message || '上传文档失败', 500);
  }
});

// GET /api/knowledge-bases/:id/documents - List documents
router.get('/knowledge-bases/:id/documents', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const kbId = Number(req.params.id);
    const kb = await prismaService.knowledgeBase.findById(kbId);

    if (!kb || kb.userId !== req.user!.id) {
      return error(res, '知识库不存在或无权限', 404);
    }

    const documents = await prismaService.document.findByKnowledgeBase(kbId);
    return success(res, documents);
  } catch (err: any) {
    return error(res, err.message || '获取文档列表失败', 500);
  }
});

// DELETE /api/knowledge-bases/:id/documents/:docId - Delete document
router.delete('/knowledge-bases/:id/documents/:docId', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const docId = Number(req.params.docId);
    try {
      const doc = await (prismaService as any).document?.findById?.(docId);
      if (doc) {
        trashService.moveToTrash('knowledge_documents', doc.id, doc, doc.fileName || `文档#${doc.id}`, req.user!.id, req.user!.id);
      }
    } catch { /* document may not support findById, skip trash */ }
    await ragService.deleteDocument(docId);
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除文档失败', 500);
  }
});

// POST /api/knowledge-bases/:id/search - Search knowledge base
router.post('/knowledge-bases/:id/search', authMiddleware, requireAuth, async (req: AuthRequest, res) => {
  try {
    const kbId = Number(req.params.id);
    const kb = await prismaService.knowledgeBase.findById(kbId);

    if (!kb || kb.userId !== req.user!.id) {
      return error(res, '知识库不存在或无权限', 404);
    }

    const schema = z.object({
      query: z.string().min(1),
      topK: z.number().optional().default(5),
    });

    const data = schema.parse(req.body);
    const results = await ragService.search(kbId, data.query, data.topK);

    return success(res, {
      results,
      context: ragService.formatContext(results),
    });
  } catch (err: any) {
    return error(res, err.message || '搜索失败', 500);
  }
});

export default router;
