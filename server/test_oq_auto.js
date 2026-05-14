const { chromium } = require('playwright');

(async () => {
  console.log('启动自动化测试...');

  // 启动无头浏览器
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // 步骤1: 打开登录页面
    console.log('\n========== 步骤1: 打开登录页面 ==========');
    await page.goto('http://localhost:3031/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'D:\\工作\\SOLO CN\\auto_step1_login.png', fullPage: true });
    console.log('截图已保存: auto_step1_login.png');

    // 步骤2: 输入账号密码
    console.log('\n========== 步骤2: 输入账号密码 ==========');

    // 输入用户名
    await page.fill('input[type="text"], input[name="username"], input[placeholder*="用户名"]', 'admin');
    console.log('已输入用户名: admin');

    // 输入密码
    await page.fill('input[type="password"], input[name="password"]', 'admin123');
    console.log('已输入密码: admin123');

    await page.screenshot({ path: 'D:\\工作\\SOLO CN\\auto_step2_filled.png', fullPage: true });
    console.log('截图已保存: auto_step2_filled.png');

    // 步骤3: 点击登录按钮
    console.log('\n========== 步骤3: 点击登录 ==========');
    const loginButton = await page.locator('button:has-text("登录"), button[type="submit"]').first();
    await loginButton.click();
    console.log('已点击登录按钮');

    // 等待登录完成并跳转
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'D:\\工作\\SOLO CN\\auto_step3_loggedin.png', fullPage: true });
    console