const { chromium } = require('playwright');

(async () => {
  // 尝试连接 TRAE 的 Chrome (通常使用端口 9222 或 9223)
  const cdpPorts = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230, 17789, 51001, 64987];
  let browser = null;

  for (const port of cdpPorts) {
    try {
      browser = await chromium.connectOverCDP('http://localhost:' + port);
      console.log('成功连接到 CDP 端口: ' + port);
      break;
    } catch (e) {
      // 继续尝试下一个端口
    }
  }

  if (!browser) {
    console.log('无法连接到 TRAE 的 CDP，尝试启动新浏览器');
    browser = await chromium.launch({ headless: true });
  }

  const contexts = browser.contexts();
  console.log('Contexts:', contexts.length);

  let page = null;
  if (contexts.length > 0) {
    const pages = contexts[0].pages();
    console.log('Pages:', pages.length);
    // 找到 OQ 助手页面
    for (const p of pages) {
      const url = p.url();
      console.log('Page URL:', url);
      if (url.includes('localhost:3031')) {
        page = p;
        break;
      }
    }
  }

  if (!page) {
    console.log('未找到 OQ 助手页面');
    await browser.close();
    return;
  }

  console.log('找到 OQ 助手页面，准备操作...');

  // 截图当前状态
  await page.screenshot({ path: 'D:\\工作\\SOLO CN\\oq_before.png' });
  console.log('截图已保存: oq_before.png');

  // 查找右上角的展开按钮
  const buttons = await page.$$eval('button', btns => btns.map(b => ({ text: b.textContent, class: b.className, title: b.title })));
  console.log('Buttons:', JSON.stringify(buttons.slice(0, 20), null, 2));

  await browser.close();
})().catch(console.error);
