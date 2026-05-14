const { chromium } = require('playwright');

(async () => {
  // 启动无头浏览器
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

  // 登录
  const loginButton = await page.locator('button:has-text("登录")').first();
  if (await loginButton.isVisible().catch(() => false)) {
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await loginButton.click();
    await page.waitForTimeout(3000);
    console.log('登录完成');
  }

  // 展开右侧栏
  const expandButton = await page.locator('button[title="展开右侧栏"]').first();
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
    await page.waitForTimeout(2000);
  }

  // 选择 Playwright 浏览器
  const playwrightOption = await page.locator('text=Playwright浏览器').first();
  if (await playwrightOption.isVisible().catch(() => false)) {
    await playwrightOption.click();
    await page.waitForTimeout(2000);
  }

  // 点击启动浏览器
  const startBrowserBtn = await page.locator('button:has-text("启动浏览器")').first();
  if (await startBrowserBtn.isVisible().catch(() => false)) {
    await startBrowserBtn.click();
    await page.waitForTimeout(3000);
    console.log('浏览器已启动');
  }

  // 截图 - 浏览器启动后
  await page.screenshot({ path: 'D:\\工作\\SOLO CN\\browser_started.png', fullPage: true });

  // ========== 关键测试：在AI对话框中发送消息，让AI自动操作浏览器 ==========
  console.log('\n========== 测试AI自动操作浏览器 ==========');

  // 启用 MCP 工具
  const mcpToggle = await page.locator('button:has-text("MCP")').first();
  if (await mcpToggle.isVisible().catch(() => false)) {
    // 检查是否已经启用（有激活样式）
    const isActive = await mcpToggle.evaluate(el => el.classList.contains('bg-primary'));
    if (!isActive) {
      await mcpToggle.click();
      console.log('已启用 MCP 工具');
    } else {
      console.log('MCP 工具已启用');
    }
  }

  // 在输入框中输入消息
  const inputBox = await page.locator('textarea[placeholder*="消息"], input[placeholder*="消息"]').first();
  if (await inputBox.isVisible().catch(() => false)) {
    console.log('找到输入框，输入测试消息...');

    // 测试1：让AI查看D盘容量
    await inputBox.fill('查看我电脑的D盘容量多大');
    await page.waitForTimeout(500);

    // 截图 - 输入消息后
    await page.screenshot({ path: 'D:\\工作\\SOLO CN\\test_input.png', fullPage: true });

    // 点击发送按钮
    const sendButton = await page.locator('button[type="submit"]').first();
    if (await sendButton.isVisible().catch(() => false)) {
      await sendButton.click();
      console.log('已发送消息：查看我电脑的D盘容量多大');
    } else {
      // 尝试按 Enter 发送
      await inputBox.press('Enter');
      console.log('按 Enter 发送消息');
    }

    // 等待AI回复（可能需要较长时间）
    console.log('等待AI回复...');
    await page.waitForTimeout(15000);

    // 截图 - AI回复后
    await page.screenshot({ path: 'D:\\工作\\SOLO CN\\test_result.png', fullPage: true });
    console.log('截图已保存: test_result.png');

    // 获取AI回复内容
    const aiMessages = await page.$$eval('.message-ai, [class*="ai"], .assistant', msgs =>
      msgs.map(m => m.textContent?.trim()).filter(Boolean)
    );
    console.log('AI回复:', aiMessages.slice(-2));
  } else {
    console.log('未找到输入框');
  }

  await browser.close();
  console.log('\n测试完成！');
})().catch(console.error);
