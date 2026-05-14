import { chromium, Browser } from 'playwright'
import {
  createCrawlTaskRecord,
  getCrawlTaskById,
  getAllCrawlTasks,
  updateCrawlTaskStatus,
  deleteCrawlTask,
} from '../models/crawlTask.js'

export interface CrawlTask {
  id: string
  url: string
  status: 'pending' | 'running' | 'completed' | 'error'
  keyword?: string
  platform?: string
  pages?: number
  results: any[]
  error?: string
  createdAt: Date
  updatedAt: Date
}

// 内存缓存用于运行时状态跟踪
const taskCache = new Map<string, CrawlTask>()

function generateTaskId(): string {
  return 'crawl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

function recordToTask(record: Awaited<ReturnType<typeof getCrawlTaskById>>): CrawlTask | undefined {
  if (!record) return undefined
  return {
    id: record.id,
    url: record.url,
    status: record.status as CrawlTask['status'],
    keyword: record.keyword || undefined,
    platform: record.platform || undefined,
    pages: record.pages,
    results: JSON.parse(record.results || '[]'),
    error: record.error || undefined,
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
  }
}

// 创建爬虫任务
export async function createCrawlTask(
  url: string,
  keyword?: string,
  platform?: string,
  pages: number = 2,
  userId?: number
): Promise<CrawlTask> {
  const id = generateTaskId()
  createCrawlTaskRecord({ id, userId, url, keyword, platform, pages })
  const task: CrawlTask = {
    id,
    url,
    status: 'pending',
    keyword,
    platform,
    pages,
    results: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  taskCache.set(id, task)
  return task
}

// 获取任务
export function getTask(taskId: string): CrawlTask | undefined {
  // 优先从缓存获取（包含实时状态）
  const cached = taskCache.get(taskId)
  if (cached) return cached
  // 从数据库获取
  const record = getCrawlTaskById(taskId)
  return recordToTask(record)
}

// 获取所有任务
export function getAllTasks(userId?: number): CrawlTask[] {
  const records = getAllCrawlTasks(userId)
  return records.map(r => recordToTask(r)!).filter(Boolean)
}

// 删除任务
export function deleteTask(taskId: string): boolean {
  taskCache.delete(taskId)
  return deleteCrawlTask(taskId)
}

// 执行猎聘网职位搜索爬取
export async function crawlLiepinJobs(taskId: string, keyword: string, startPage: number = 1, endPage?: number): Promise<void> {
  const record = getCrawlTaskById(taskId)
  if (!record) return

  updateCrawlTaskStatus(taskId, 'running')

  const sp = startPage
  const ep = endPage || sp

  let browser: Browser | null = null
  const allJobs: any[] = []
  const debugInfo: string[] = []

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    })

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      permissions: ['geolocation'],
      geolocation: { latitude: 31.2304, longitude: 121.4737 },
    })

    const page = await context.newPage()

    // 隐藏自动化特征
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] })
      // @ts-ignore
      if (!window.chrome) window.chrome = { runtime: {} }
    })

    for (let pageNum = sp; pageNum <= ep; pageNum++) {
      try {
        const searchUrl = pageNum === 1
          ? `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(keyword)}`
          : `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(keyword)}&curPage=${pageNum - 1}`

        debugInfo.push(`正在访问: ${searchUrl}`)
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })

        // 等待页面加载，先等几秒让JS渲染
        await page.waitForTimeout(3000)

        // 检查是否有验证码或反爬页面
        const pageTitle = await page.title()
        const pageUrl = page.url()
        debugInfo.push(`页面标题: ${pageTitle}`)
        debugInfo.push(`当前URL: ${pageUrl}`)

        if (pageUrl.includes('captcha') || pageTitle.includes('验证') || pageTitle.includes('安全')) {
          debugInfo.push('检测到验证码/安全验证页面')
          updateCrawlTaskStatus(taskId, 'error', allJobs, '猎聘网触发了验证码验证，请稍后重试或使用右侧浏览器手动访问')
          if (browser) await browser.close()
          return
        }

        // 尝试多种选择器等待职位列表
        let listFound = false
        const waitSelectors = [
          '[class*="job"]',
          '[class*="list"]',
          '.sojob-result-list',
          '.job-list',
          '.search-result',
        ]

        for (const sel of waitSelectors) {
          try {
            await page.waitForSelector(sel, { timeout: 5000 })
            debugInfo.push(`找到列表选择器: ${sel}`)
            listFound = true
            break
          } catch {
            // 继续尝试下一个选择器
          }
        }

        if (!listFound) {
          debugInfo.push('未找到职位列表选择器，尝试直接提取')
        }

        // 提取职位数据 - 使用更广泛的选择器
        const jobs = await page.evaluate(() => {
          const items: any[] = []

          // 尝试多种可能的选择器组合
          const selectorGroups = [
            // 猎聘网常见列表项
            '.job-list-item',
            '.list-item',
            '[data-selector="job-list-item"]',
            '.sojob-result-list li',
            '.search-job-list li',
            '[class*="job-list-item"]',
            '[class*="JobListItem"]',
            // 更通用的选择器
            'div[class*="job"]',
            'div[class*="Job"]',
            'li[class*="job"]',
            'li[class*="Job"]',
          ]

          let usedSelector = ''
          let elements: NodeListOf<Element> | null = null

          for (const selector of selectorGroups) {
            elements = document.querySelectorAll(selector)
            if (elements && elements.length > 0) {
              usedSelector = selector
              break
            }
          }

          if (!elements || elements.length === 0) {
            // 如果都没找到，尝试获取页面中所有包含职位相关文本的元素
            const allDivs = document.querySelectorAll('div, li')
            const jobElements: Element[] = []
            allDivs.forEach((el) => {
              const text = el.textContent || ''
              // 判断是否包含职位特征（薪资、经验要求等）
              if ((text.includes('K') || text.includes('k') || text.includes('薪') || text.includes('经验')) &&
                  el.querySelector('a') &&
                  el.children.length >= 2) {
                jobElements.push(el)
              }
            })
            if (jobElements.length > 0) {
              elements = jobElements as unknown as NodeListOf<Element>
              usedSelector = 'heuristic-match'
            }
          }

          if (!elements || elements.length === 0) {
            return { items, usedSelector, pageHtml: document.body.innerHTML.substring(0, 500) }
          }

          elements.forEach((el) => {
            // 尝试多种方式提取标题
            const titleSelectors = [
              '.job-title',
              '.title',
              'h3',
              'h2',
              'a[data-nick]',
              'a[title]',
              '[class*="title"]',
              '[class*="Title"]',
            ]
            let titleEl: Element | null = null
            for (const sel of titleSelectors) {
              titleEl = el.querySelector(sel)
              if (titleEl) break
            }
            if (!titleEl) {
              // 尝试从a标签获取
              const aEl = el.querySelector('a')
              if (aEl) titleEl = aEl
            }

            // 尝试提取公司名
            const companySelectors = [
              '.company-name',
              '.company',
              '[class*="company"]',
              '[class*="Company"]',
            ]
            let companyEl: Element | null = null
            for (const sel of companySelectors) {
              companyEl = el.querySelector(sel)
              if (companyEl) break
            }

            // 尝试提取薪资
            const salarySelectors = [
              '.salary',
              '[class*="salary"]',
              '[class*="Salary"]',
              '[class*="money"]',
              '[class*="Money"]',
            ]
            let salaryEl: Element | null = null
            for (const sel of salarySelectors) {
              salaryEl = el.querySelector(sel)
              if (salaryEl) break
            }
            // 如果没找到薪资元素，尝试在文本中匹配薪资模式
            let salaryText = salaryEl?.textContent?.trim() || ''
            if (!salaryText) {
              const elText = el.textContent || ''
              const salaryMatch = elText.match(/\d+[Kk]-\d+[Kk]|\d+万-\d+万|\d+-\d+元|\d+K-|\d+k-/)
              if (salaryMatch) salaryText = salaryMatch[0]
            }

            // 尝试提取地点
            const locationSelectors = [
              '.job-area',
              '.location',
              '[class*="area"]',
              '[class*="location"]',
              '[class*="Location"]',
              '[class*="city"]',
            ]
            let locationEl: Element | null = null
            for (const sel of locationSelectors) {
              locationEl = el.querySelector(sel)
              if (locationEl) break
            }

            // 提取链接
            const urlEl = el.querySelector('a[href*="job"]') || el.querySelector('a[href*="liepin"]') || el.querySelector('a')

            const title = titleEl?.textContent?.trim() || ''
            if (title && title.length > 1) {
              items.push({
                title,
                company: companyEl?.textContent?.trim() || '',
                salary: salaryText,
                location: locationEl?.textContent?.trim() || '',
                url: (urlEl as HTMLAnchorElement)?.href || '',
                source_platform: 'liepin',
                crawled_at: new Date().toISOString(),
              })
            }
          })

          return { items, usedSelector, totalFound: elements?.length || 0 }
        })

        debugInfo.push(`使用选择器: ${jobs.usedSelector}, 找到${jobs.totalFound}个元素, 提取${jobs.items.length}条数据`)

        if (jobs.items.length > 0) {
          allJobs.push(...jobs.items)
        }

        // 随机延迟，避免被封
        if (pageNum < ep) {
          const delay = 3000 + Math.random() * 4000
          debugInfo.push(`等待 ${Math.round(delay)}ms 后继续下一页`)
          await page.waitForTimeout(delay)
        }
      } catch (err: any) {
        debugInfo.push(`Page ${pageNum} crawl error: ${err.message}`)
        console.error(`Page ${pageNum} crawl error:`, err.message)
      }
    }

    // 去重：根据标题+地点的联合键去重
    const seen = new Set<string>()
    const uniqueJobs: any[] = []
    for (const job of allJobs) {
      const key = `${job.title}|${job.location}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueJobs.push(job)
      }
    }

    if (uniqueJobs.length > 0) {
      updateCrawlTaskStatus(taskId, 'completed', uniqueJobs)
    } else {
      updateCrawlTaskStatus(taskId, 'error', allJobs, `未找到职位数据。调试信息: ${debugInfo.join('; ')}`)
    }
  } catch (err: any) {
    updateCrawlTaskStatus(taskId, 'error', allJobs, err.message || '爬取失败')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// 通用网页爬取
export async function crawlGeneric(taskId: string, url: string, _depth: number = 1): Promise<void> {
  const record = getCrawlTaskById(taskId)
  if (!record) return

  updateCrawlTaskStatus(taskId, 'running')

  let browser: Browser | null = null

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    // 提取页面基本信息
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') || '',
        h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim()).filter(Boolean),
        h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim()).filter(Boolean),
        links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
          text: a.textContent?.trim(),
          href: (a as HTMLAnchorElement).href,
        })).filter(l => l.text && l.href.startsWith('http')).slice(0, 50),
        images: Array.from(document.querySelectorAll('img[src]')).map(img => ({
          alt: img.getAttribute('alt') || '',
          src: img.getAttribute('src') || '',
        })).slice(0, 20),
      }
    })

    updateCrawlTaskStatus(taskId, 'completed', [pageInfo])
  } catch (err: any) {
    updateCrawlTaskStatus(taskId, 'error', [], err.message || '爬取失败')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// 从当前浏览器会话爬取
export async function crawlFromSession(taskId: string, _sessionId: string, _selector: string): Promise<void> {
  const record = getCrawlTaskById(taskId)
  if (!record) return

  // 这里需要与browser.ts中的session关联
  // 简化实现：返回提示信息
  updateCrawlTaskStatus(taskId, 'completed', [{ message: '请使用右侧浏览器模块访问目标网站后，再执行抓取' }])
}
