import { Router } from 'express'
import { z } from 'zod'
import { success, error } from '../utils/response.js'
import { authMiddleware } from '../utils/auth.js'
import type { AuthRequest } from '../utils/auth.js'
import {
  createBrowserSession,
  getAllSessions,
  navigateTo,
  screenshot,
  executeScript,
  getHtml,
  getText,
  click,
  fill,
  goBack,
  goForward,
  reload,
  closeSession,
  getPageInfo,
} from '../services/browser.js'

const router = Router()

// POST /api/browser/sessions - 创建浏览器会话
router.post('/browser/sessions', authMiddleware, async (_req, res) => {
  try {
    const session = await createBrowserSession()
    return success(res, session, '浏览器会话创建成功')
  } catch (err: any) {
    return error(res, err.message || '创建浏览器会话失败', 500)
  }
})

// GET /api/browser/sessions - 获取所有会话
router.get('/browser/sessions', authMiddleware, async (_req, res) => {
  try {
    const sessions = getAllSessions()
    return success(res, sessions)
  } catch (err: any) {
    return error(res, err.message || '获取会话列表失败', 500)
  }
})

// DELETE /api/browser/sessions/:id - 关闭会话
router.delete('/browser/sessions/:id', authMiddleware, async (req, res) => {
  try {
    await closeSession(req.params.id as string)
    return success(res, null, '会话已关闭')
  } catch (err: any) {
    return error(res, err.message || '关闭会话失败', 500)
  }
})

// POST /api/browser/sessions/:id/navigate - 导航
router.post('/browser/sessions/:id/navigate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      url: z.string().min(1),
    })
    const { url } = schema.parse(req.body)
    const result = await navigateTo(req.params.id as string, url)
    return success(res, result)
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '导航失败', 500)
  }
})

// POST /api/browser/sessions/:id/screenshot - 截图
router.post('/browser/sessions/:id/screenshot', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      fullPage: z.boolean().optional(),
    })
    const { fullPage } = schema.parse(req.body)
    const base64 = await screenshot(req.params.id as string, fullPage)
    return success(res, { image: `data:image/png;base64,${base64}` })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '截图失败', 500)
  }
})

// POST /api/browser/sessions/:id/execute - 执行JS
router.post('/browser/sessions/:id/execute', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      script: z.string().min(1),
    })
    const { script } = schema.parse(req.body)
    const result = await executeScript(req.params.id as string, script)
    return success(res, { result })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '执行脚本失败', 500)
  }
})

// GET /api/browser/sessions/:id/html - 获取HTML
router.get('/browser/sessions/:id/html', authMiddleware, async (req, res) => {
  try {
    const html = await getHtml(req.params.id as string)
    return success(res, { html })
  } catch (err: any) {
    return error(res, err.message || '获取HTML失败', 500)
  }
})

// GET /api/browser/sessions/:id/text - 获取文本
router.get('/browser/sessions/:id/text', authMiddleware, async (req, res) => {
  try {
    const text = await getText(req.params.id as string)
    return success(res, { text })
  } catch (err: any) {
    return error(res, err.message || '获取文本失败', 500)
  }
})

// POST /api/browser/sessions/:id/click - 点击元素
router.post('/browser/sessions/:id/click', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      selector: z.string().min(1),
    })
    const { selector } = schema.parse(req.body)
    await click(req.params.id as string, selector)
    return success(res, null, '点击成功')
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '点击失败', 500)
  }
})

// POST /api/browser/sessions/:id/fill - 填写输入框
router.post('/browser/sessions/:id/fill', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      selector: z.string().min(1),
      value: z.string(),
    })
    const { selector, value } = schema.parse(req.body)
    await fill(req.params.id as string, selector, value)
    return success(res, null, '填写成功')
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '填写失败', 500)
  }
})

// POST /api/browser/sessions/:id/back - 返回
router.post('/browser/sessions/:id/back', authMiddleware, async (req, res) => {
  try {
    const result = await goBack(req.params.id as string)
    return success(res, result)
  } catch (err: any) {
    return error(res, err.message || '返回失败', 500)
  }
})

// POST /api/browser/sessions/:id/forward - 前进
router.post('/browser/sessions/:id/forward', authMiddleware, async (req, res) => {
  try {
    const result = await goForward(req.params.id as string)
    return success(res, result)
  } catch (err: any) {
    return error(res, err.message || '前进失败', 500)
  }
})

// POST /api/browser/sessions/:id/reload - 刷新
router.post('/browser/sessions/:id/reload', authMiddleware, async (req, res) => {
  try {
    const result = await reload(req.params.id as string)
    return success(res, result)
  } catch (err: any) {
    return error(res, err.message || '刷新失败', 500)
  }
})

// GET /api/browser/sessions/:id/info - 获取页面信息
router.get('/browser/sessions/:id/info', authMiddleware, async (req, res) => {
  try {
    const info = await getPageInfo(req.params.id as string)
    return success(res, info)
  } catch (err: any) {
    return error(res, err.message || '获取信息失败', 500)
  }
})

export default router
