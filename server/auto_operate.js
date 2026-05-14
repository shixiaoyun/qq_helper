const { chromium } = require('playwright');

(async () => {
  // 启动无头浏览器（不弹出窗口）
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // 打开 OQ 助手
  await page.goto('http://localhost:3031/chat');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('已打开 OQ 助手');

  // 检查是否需要登录
  const loginButton = await page.locator('button:has-text("登录")').first();
  if (await loginButton.isVisible().catch(() => false)) {
    console.log('需要登录，正在输入账号密码...');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await loginButton.click();
    await page.waitForTimeout(3000);
    console.log('登录完成');
  }

  // ========== 步骤1: 点击"展开右侧栏"按钮 ==========
  console.log('\n========== 步骤1: 展开右侧栏 ==========');

  const expandButton = await page.locator('button[title="展开右侧栏"]').first();
  if (await expandButton.isVisible().catch(() => false)) {
    console.log('找到展开右侧栏按钮，正在点击...');
    await expandButton.click();
    await page.waitForTimeout(2000);
    console.log('已点击展开右侧栏按钮');
  }

  await page.screenshot({ path: 'D:\\工作\\SOLO CN\\step1_after.png', fullPage: true });
  console.log('步骤1截图已保存');

  // ========== 步骤2: 选择 Playwright 浏览器模块 ==========
  console.log('\n========== 步骤2: 选择 Playwright 浏览器模块 ==========');

  // 查找包含"Playwright浏览器"文本的元素并点击
  const playwrightOption = await page.locator('text=Playwright浏览器').first();
  if (await playwrightOption.isVisible().catch(() => false)) {
    console.log('找到 Playwright 浏览器选项，正在点击...');
    await playwrightOption.click();
    await page.waitForTimeout(3000);
    console.log('已选择 Playwright 浏览器');
  } else {
    console.log('未找到 Playwright 浏览器选项');
  }

  await page.screenshot({ path: 'D:\\工作\\SOLO CN\\step2_after.png', fullPage: true });
  console.log('步骤2截图已保存');

  // ========== 步骤3: 启动浏览器 ==========
  console.log('\n========== 步骤3: 启动浏览器 ==========');

  // 查找"启动浏览器"按钮（可能在 Playwright 浏览器面板内）
  const startBrowserButton = await page.locator('button:has-text("启动浏览器")').first();
  if (await startBrowserButton.isVisible().catch(() => false)) {
    console.log('找到启动浏览器按钮，正在点击...');
    await startBrowserButton.click();
    await page.waitForTimeout(5000);
    console.log('已点击启动浏览器按钮');
  } else {
    console.log('未找到启动浏览器按钮，尝试查找其他相关按钮...');
    // 列出所有按钮
    const allButtons = await page.$$eval('button', btns =>
      btns.map(b => ({
        text: b.textContent?.trim(),
        title: b.title,
        class: b.className
      })).filter(b => b.text && b.text.length > 0)
    );
    console.log('所有按钮:', JSON.stringify(allButtons.slice(0, 30), null, 2));
  }

  await page.screenshot({ path: 'D:\\工作\\SOLO CN\\step3_after.png', fullPage: true });
  console.log('步骤3截图已保存');

  // ========== 步骤4: 进行自动化操作 ==========
  console.log('\n========== 步骤4: 进行自动化操作 ==========');

  // 查找地址栏并输入网址
  const urlInput = await page.locator('input[placeholder*="网址"], input[type="text"]').first();
  if (await urlInput.isVisible().catch(() => false)) {
    console.log('找到地址栏，输入百度网址...');
    await urlInput.fill('https://www.baidu.com');
    await urlInput.press('Enter');
    await page.waitForTimeout(5000);
    console.log('已导航到百度');
  } else {
    console.log('未找到地址栏');
  }

  await page.screenshot({ path: 'D:\\工作\\SOLO CN\\step4_after.png', fullPage: true });
  console.log('步骤4截图已保存');

  await browser.close();
  console.log('\n所有步骤完成！');
})().catch(console.error);
