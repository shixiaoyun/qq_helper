import { chromium, Browser, Page, BrowserContext } from 'playwright'

export interface BrowserSession {
  id: string
  browser: Browser
  context: BrowserContext
  page: Page
  url: string
  title: string
  createdAt: Date
  lastUsedAt: Date
  userId?: number
  snapshotCounter?: number
  elementMap?: Map<string, string>
}

export interface SnapshotResult {
  title: string
  url: string
  elements: Array<{
    ref: string
    tag: string
    type?: string
    name?: string
    placeholder?: string
    text: string
    selector: string
  }>
  text: string
}

const sessions = new Map<string, BrowserSession>()

// 会话超时配置
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

setInterval(() => {
  cleanupExpiredSessions()
}, CLEANUP_INTERVAL_MS)

function cleanupExpiredSessions() {
  const now = Date.now()
  const expiredSessions: string[] = []

  for (const [id, session] of sessions.entries()) {
    if (now - session.lastUsedAt.getTime() > SESSION_TIMEOUT_MS) {
      expiredSessions.push(id)
    }
  }

  for (const id of expiredSessions) {
    console.log(`[Browser] 清理过期会话: ${id}`)
    closeSession(id).catch(() => {})
  }
}

function generateId(): string {
  return 'browser-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

// 创建浏览器会话
export async function createBrowserSession(headless = true, userId?: number): Promise<{ id: string; url: string }> {
  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  })

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })

  const page = await context.newPage()

  // 隐藏自动化特征
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    // @ts-ignore
    window.chrome = { runtime: {} }
  })

  const id = generateId()
  const now = new Date()
  const session: BrowserSession = {
    id,
    browser,
    context,
    page,
    url: 'about:blank',
    title: '空白页',
    createdAt: now,
    lastUsedAt: now,
    userId,
    snapshotCounter: 0,
    elementMap: new Map(),
  }

  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      try {
        session.url = frame.url()
        session.title = await page.title()
      } catch {
        // 页面可能已关闭
      }
    }
  })

  sessions.set(id, session)
  return { id, url: session.url }
}

// 获取会话
export function getSession(id: string): BrowserSession | undefined {
  const session = sessions.get(id)
  if (session) {
    session.lastUsedAt = new Date()
  }
  return session
}

// 获取所有会话
export function getAllSessions(): Array<{ id: string; url: string; title: string; createdAt: Date; userId?: number }> {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    url: s.url,
    title: s.title,
    createdAt: s.createdAt,
    userId: s.userId,
  }))
}

// 导航到URL
export async function navigateTo(sessionId: string, url: string): Promise<{ url: string; title: string }> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  let targetUrl = url
  if (!url.startsWith('http')) {
    targetUrl = 'https://' + url
  }

  await session.page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 })

  session.url = session.page.url()
  session.title = await session.page.title()

  return { url: session.url, title: session.title }
}

// 截图
export async function screenshot(sessionId: string, fullPage = false): Promise<string> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const buffer = await session.page.screenshot({
    fullPage,
    type: 'png',
  })

  return buffer.toString('base64')
}

// 执行JavaScript
export async function executeScript(sessionId: string, script: string): Promise<unknown> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return await session.page.evaluate((code) => {
    // eslint-disable-next-line no-eval
    return eval(code)
  }, script)
}

// 获取页面HTML
export async function getHtml(sessionId: string): Promise<string> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return await session.page.content()
}

// 获取页面文本
export async function getText(sessionId: string): Promise<string> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return await session.page.evaluate(() => document.body.innerText)
}

// 点击元素
export async function click(sessionId: string, selector: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  // 支持 @e1 元素引用
  const resolvedSelector = resolveElementRef(session, selector)
  await session.page.click(resolvedSelector)
}

// 填写输入框
export async function fill(sessionId: string, selector: string, value: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)
  await session.page.fill(resolvedSelector, value)
}

// 类型输入（模拟真实打字）
export async function typeText(sessionId: string, selector: string, text: string, delay = 50): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)
  await session.page.type(resolvedSelector, text, { delay })
}

// 按键
export async function pressKey(sessionId: string, key: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.keyboard.press(key)
}

// 悬停
export async function hover(sessionId: string, selector: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)
  await session.page.hover(resolvedSelector)
}

// 选择下拉框
export async function selectOption(sessionId: string, selector: string, value: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)
  await session.page.selectOption(resolvedSelector, value)
}

// 获取元素文本
export async function getElementText(sessionId: string, selector: string): Promise<string> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)
  return await session.page.textContent(resolvedSelector) || ''
}

// 获取元素属性
export async function getElementAttr(sessionId: string, selector: string, attr: string): Promise<string> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)
  return await session.page.getAttribute(resolvedSelector, attr) || ''
}

// 滚动
export async function scroll(sessionId: string, direction: 'up' | 'down' | 'left' | 'right', pixels?: number): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const amount = pixels || 500
  const directions = { up: [0, -amount], down: [0, amount], left: [-amount, 0], right: [amount, 0] }
  const [x, y] = directions[direction]
  await session.page.evaluate(([dx, dy]) => window.scrollBy(dx, dy), [x, y])
}

// 等待元素
export async function waitForSelector(sessionId: string, selector: string, timeout = 10000): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.waitForSelector(selector, { timeout })
}

// 等待时间
export async function waitForTimeout(sessionId: string, ms: number): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.waitForTimeout(ms)
}

// 返回上一页
export async function goBack(sessionId: string): Promise<{ url: string; title: string }> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.goBack({ waitUntil: 'networkidle' })
  session.url = session.page.url()
  session.title = await session.page.title()

  return { url: session.url, title: session.title }
}

// 前进
export async function goForward(sessionId: string): Promise<{ url: string; title: string }> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.goForward({ waitUntil: 'networkidle' })
  session.url = session.page.url()
  session.title = await session.page.title()

  return { url: session.url, title: session.title }
}

// 刷新
export async function reload(sessionId: string): Promise<{ url: string; title: string }> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.reload({ waitUntil: 'networkidle' })
  session.url = session.page.url()
  session.title = await session.page.title()

  return { url: session.url, title: session.title }
}

// 关闭会话
export async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return

  try {
    await session.browser.close()
  } catch {
    // 忽略关闭错误
  }
  sessions.delete(sessionId)
}

// 关闭所有会话
export async function closeAllSessions(): Promise<void> {
  for (const session of sessions.values()) {
    try {
      await session.browser.close()
    } catch {
      // 忽略关闭错误
    }
  }
  sessions.clear()
}

// 获取页面信息
export async function getPageInfo(sessionId: string): Promise<{ url: string; title: string }> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return {
    url: session.page.url(),
    title: await session.page.title(),
  }
}

// 获取元素位置
export async function getElementBoxes(sessionId: string, selectors: string[]): Promise<Array<{ x: number; y: number; width: number; height: number; label: string }>> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return await session.page.evaluate((selList) => {
    const boxes: Array<{ x: number; y: number; width: number; height: number; label: string }> = []
    for (const selector of selList) {
      const el = document.querySelector(selector)
      if (el) {
        const rect = el.getBoundingClientRect()
        boxes.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          label: selector,
        })
      }
    }
    return boxes
  }, selectors)
}

// ============================================================================
// 元素引用系统 (@e1, @e2) - 参考 ruflo 项目
// ============================================================================

function resolveElementRef(session: BrowserSession, selector: string): string {
  if (selector.startsWith('@')) {
    const mapped = session.elementMap?.get(selector)
    if (mapped) return mapped
    // 如果找不到映射，尝试直接使用选择器
  }
  return selector
}

// 获取页面快照（带元素引用）
export async function getSnapshot(sessionId: string, options: { interactive?: boolean; compact?: boolean } = {}): Promise<SnapshotResult> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const { interactive = true, compact = true } = options

  // 重置计数器和映射
  session.snapshotCounter = 0
  session.elementMap = new Map()

  const title = await session.page.title()
  const url = session.page.url()

  // 获取可交互元素
  const elements = await session.page.evaluate((opts) => {
    const results: Array<{
      ref: string
      tag: string
      type?: string
      name?: string
      placeholder?: string
      text: string
      selector: string
    }> = []

    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label']
    const allElements = Array.from(document.querySelectorAll('*'))

    for (const el of allElements) {
      const tag = el.tagName.toLowerCase()
      const isInteractive = interactiveTags.includes(tag) ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('onclick') !== null ||
        el.getAttribute('tabindex') === '0'

      if (opts.interactive && !isInteractive) continue

      const text = (el.textContent || '').trim().slice(0, 100)
      if (opts.compact && !text && tag !== 'input' && tag !== 'select' && tag !== 'textarea') continue

      // 生成唯一选择器
      let selector = ''
      if (el.id) {
        selector = `#${el.id}`
      } else if (el.getAttribute('data-testid')) {
        selector = `[data-testid="${el.getAttribute('data-testid')}"]`
      } else if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter((c: string) => c).slice(0, 2)
        selector = `.${classes.join('.')}`
      } else {
        const parent = el.parentElement
        if (parent) {
          const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === el.tagName)
          const index = siblings.indexOf(el) + 1
          selector = `${tag}:nth-of-type(${index})`
        } else {
          selector = tag
        }
      }

      results.push({
        ref: '',
        tag,
        type: el.getAttribute('type') || undefined,
        name: el.getAttribute('name') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        text,
        selector,
      })
    }

    return results
  }, { interactive, compact })

  // 分配引用编号
  const mappedElements = elements.slice(0, 50).map((el, index) => {
    const ref = `@e${index + 1}`
    session.elementMap!.set(ref, el.selector)
    return { ...el, ref }
  })

  // 获取页面文本
  const text = await session.page.evaluate(() => {
    return document.body.innerText.slice(0, 3000)
  })

  return {
    title,
    url,
    elements: mappedElements,
    text,
  }
}

// 高亮元素
export async function highlightElement(sessionId: string, selector: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  const resolvedSelector = resolveElementRef(session, selector)

  await session.page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el) {
      (el as HTMLElement).style.outline = '3px solid red'
      ;(el as HTMLElement).style.outlineOffset = '2px'
      setTimeout(() => {
        (el as HTMLElement).style.outline = ''
        ;(el as HTMLElement).style.outlineOffset = ''
      }, 3000)
    }
  }, resolvedSelector)
}

// 获取Cookie
export async function getCookies(sessionId: string): Promise<any[]> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return await session.context.cookies()
}

// 设置Cookie
export async function setCookie(sessionId: string, name: string, value: string, domain?: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.context.addCookies([{
    name,
    value,
    domain: domain || new URL(session.url).hostname,
    path: '/',
  }])
}

// 获取localStorage
export async function getLocalStorage(sessionId: string, key?: string): Promise<any> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  return await session.page.evaluate((k) => {
    if (k) return localStorage.getItem(k)
    const result: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) result[key] = localStorage.getItem(key) || ''
    }
    return result
  }, key)
}

// 设置localStorage
export async function setLocalStorage(sessionId: string, key: string, value: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error('会话不存在')

  await session.page.evaluate(([k, v]) => {
    localStorage.setItem(k, v)
  }, [key, value])
}
