import { Router } from 'express'
import { z } from 'zod'
import { success, error } from '../utils/response.js'
import { authMiddleware } from '../utils/auth.js'
import type { AuthRequest } from '../utils/auth.js'
import { trashService } from '../services/trashService.js'
import {
  createCrawlTask,
  getTask,
  getAllTasks,
  deleteTask,
  crawlLiepinJobs,
  crawlGeneric,
} from '../services/smartCrawler.js'

const router = Router()

// POST /api/crawler/tasks - 创建爬虫任务
router.post('/crawler/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      url: z.string().min(1),
      keyword: z.string().optional(),
      platform: z.string().optional(),
      pages: z.number().int().min(1).max(10).optional(),
    })
    const { url, keyword, platform, pages } = schema.parse(req.body)

    const task = await createCrawlTask(url, keyword, platform, pages || 2, req.user?.id)

    // 异步执行爬取
    if (platform === 'liepin' && keyword) {
      crawlLiepinJobs(task.id, keyword, 1, pages || 2).catch(console.error)
    } else {
      crawlGeneric(task.id, url).catch(console.error)
    }

    return success(res, task, '爬虫任务已创建并开始执行')
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '创建任务失败', 500)
  }
})

// GET /api/crawler/tasks - 获取所有任务
router.get('/crawler/tasks', authMiddleware, async (_req, res) => {
  try {
    const tasks = getAllTasks()
    return success(res, tasks)
  } catch (err: any) {
    return error(res, err.message || '获取任务列表失败', 500)
  }
})

// GET /api/crawler/tasks/:id - 获取单个任务
router.get('/crawler/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const task = getTask(req.params.id as string)
    if (!task) {
      return error(res, '任务不存在', 404)
    }
    return success(res, task)
  } catch (err: any) {
    return error(res, err.message || '获取任务失败', 500)
  }
})

// DELETE /api/crawler/tasks/:id - 删除任务
router.delete('/crawler/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const taskId = req.params.id as string;
    const task = getTask(taskId);
    if (task) {
      trashService.moveToTrash('crawler_tasks', Number(task.id) || 0, task, task.keyword || `抓取任务#${task.id}`);
    }
    const deleted = deleteTask(taskId);
    if (!deleted) {
      return error(res, '任务不存在', 404);
    }
    return success(res, null, '已移入回收站');
  } catch (err: any) {
    return error(res, err.message || '删除任务失败', 500)
  }
})

// POST /api/crawler/liepin - 猎聘网职位搜索
router.post('/crawler/liepin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      keyword: z.string().min(1),
      startPage: z.number().int().min(1).max(100).optional(),
      endPage: z.number().int().min(1).max(100).optional(),
    })
    const { keyword, startPage, endPage } = schema.parse(req.body)

    const sp = startPage || 1
    const ep = endPage || sp
    const totalPages = ep - sp + 1

    const task = await createCrawlTask(
      `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(keyword)}`,
      keyword,
      'liepin',
      totalPages,
      req.user?.id
    )

    // 异步执行
    crawlLiepinJobs(task.id, keyword, sp, ep).catch(console.error)

    return success(res, task, '猎聘网爬取任务已创建')
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return error(res, err.errors[0].message, 400)
    }
    return error(res, err.message || '创建任务失败', 500)
  }
})

export default router
