/**
 * 临时邮箱模块 - temporam.com
 * 用于获取临时邮箱地址和接收验证码
 */
import { join } from 'path';
import { logger } from '../utils/logger.js';

export class TempMailService {
  constructor(browser, screenshotDir = '.') {
    this.browser = browser;
    this.page = null;
    this.email = null;
    this.screenshotDir = screenshotDir;
  }

  /**
   * 获取截图路径
   */
  getScreenshotPath(filename) {
    return join(this.screenshotDir, filename);
  }

  /**
   * 初始化临时邮箱页面
   */
  async init() {
    logger.step(1, '正在打开临时邮箱网站...');
    this.page = await this.browser.newPage();

    // 设置 viewport
    await this.page.setViewport({ width: 1280, height: 900 });

    // 设置更长的超时时间
    this.page.setDefaultTimeout(60000);
    this.page.setDefaultNavigationTimeout(60000);

    logger.info('正在加载页面，请稍候...');

    try {
      await this.page.goto('https://www.temporam.com/zh', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (error) {
      logger.warn(`页面加载警告: ${error.message}`);
      // 继续执行，页面可能已部分加载
    }

    // 等待页面稳定
    await this.sleep(3000);

    // 截图查看当前状态
    await this.page.screenshot({ path: this.getScreenshotPath('debug-tempmail-init.png') });
    logger.info('已保存页面截图: debug-tempmail-init.png');

    logger.success('临时邮箱网站已打开');
  }

  /**
   * 睡眠函数
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取临时邮箱地址
   * @returns {Promise<string>} 邮箱地址
   */
  async getEmailAddress() {
    logger.step(2, '正在获取临时邮箱地址...');

    try {
      // 先等待页面稳定
      await this.sleep(2000);

      // 打印页面上的所有 input 元素信息用于调试
      const inputInfo = await this.page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map(input => ({
          type: input.type,
          value: input.value,
          placeholder: input.placeholder,
          className: input.className
        }));
      });
      logger.info(`页面上找到 ${inputInfo.length} 个 input 元素`);
      if (inputInfo.length > 0) {
        logger.info(`Input 信息: ${JSON.stringify(inputInfo.slice(0, 3))}`);
      }

      // 尝试等待邮箱地址出现，但不强制要求
      try {
        await this.page.waitForFunction(() => {
          const inputs = document.querySelectorAll('input');
          for (const input of inputs) {
            if (input.value && input.value.includes('@') && input.value.includes('.')) {
              return true;
            }
          }
          // 也检查页面文本
          return document.body.innerText.includes('@');
        }, { timeout: 15000 });
      } catch (e) {
        logger.warn('等待邮箱元素超时，尝试直接获取...');
      }

      // 获取邮箱地址 - 从输入框中获取
      this.email = await this.page.evaluate(() => {
        // 查找包含邮箱格式的输入框
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          if (input.value && input.value.includes('@') && input.value.includes('.')) {
            const value = input.value.trim();
            if (value.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
              return value;
            }
          }
        }

        // 备用方案：从页面文本中匹配任意邮箱格式
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const bodyText = document.body.innerText;
        const matches = bodyText.match(emailRegex);
        if (matches) {
          // 过滤掉常见的非临时邮箱
          for (const email of matches) {
            if (!email.includes('example') && !email.includes('test@')) {
              return email;
            }
          }
          return matches[0];
        }

        return null;
      });

      if (this.email) {
        logger.success(`获取到临时邮箱: ${this.email}`);
        return this.email;
      } else {
        // 保存截图用于调试
        await this.page.screenshot({ path: this.getScreenshotPath('debug-no-email.png') });
        logger.error('无法获取邮箱，已保存截图: debug-no-email.png');
        throw new Error('无法获取临时邮箱地址，请检查截图');
      }
    } catch (error) {
      logger.error(`获取邮箱失败: ${error.message}`);
      await this.page.screenshot({ path: this.getScreenshotPath('debug-tempmail-error.png') });
      logger.info('已保存调试截图: debug-tempmail-error.png');
      throw error;
    }
  }

  /**
   * 等待并获取验证码邮件
   * @param {number} timeout - 超时时间(毫秒)
   * @returns {Promise<string>} 验证码
   */
  async waitForVerificationCode(timeout = 120000) {
    logger.step(3, '正在等待验证码邮件...');

    const startTime = Date.now();
    let verificationCode = null;

    // 确保切换到邮箱页面
    await this.page.bringToFront();

    while (Date.now() - startTime < timeout) {
      try {
        // 不刷新页面，只等待并检查
        await this.sleep(3000);

        // 截图查看当前状态
        await this.page.screenshot({ path: this.getScreenshotPath('debug-tempmail-check.png') });

        // 检查页面上是否有 OpenAI 相关的邮件或验证码
        const pageInfo = await this.page.evaluate(() => {
          const bodyText = document.body.innerText;
          const hasOpenAI = bodyText.toLowerCase().includes('openai') ||
                           bodyText.toLowerCase().includes('verify') ||
                           bodyText.toLowerCase().includes('verification');

          // 检查邮件数量 (格式: "X 封")
          const countMatch = bodyText.match(/(\d+)\s*封/);
          const mailCount = countMatch ? parseInt(countMatch[1]) : 0;

          return { hasOpenAI, mailCount, bodyText: bodyText.substring(0, 500) };
        });

        logger.info(`邮件数量: ${pageInfo.mailCount}, 检测到OpenAI邮件: ${pageInfo.hasOpenAI}`);

        if (pageInfo.mailCount > 0 || pageInfo.hasOpenAI) {
          logger.info('检测到新邮件，尝试点击查看...');

          // 尝试点击邮件列表中的邮件
          await this.page.evaluate(() => {
            // 查找可点击的邮件元素
            const selectors = [
              '[class*="mail-item"]',
              '[class*="message-item"]',
              '[class*="inbox-item"]',
              '[class*="email-item"]',
              'tr[class*="mail"]',
              'li[class*="mail"]'
            ];

            for (const selector of selectors) {
              const items = document.querySelectorAll(selector);
              if (items.length > 0) {
                items[0].click();
                return;
              }
            }

            // 备用方案：查找包含 OpenAI 或时间的可点击元素
            const allElements = document.querySelectorAll('div, tr, li, a, span');
            for (const el of allElements) {
              const text = el.textContent.toLowerCase();
              if ((text.includes('openai') || text.includes('verify')) &&
                  el.offsetWidth > 0 && el.offsetHeight > 0) {
                el.click();
                return;
              }
            }
          });

          await this.sleep(2000);

          // 提取验证码
          verificationCode = await this.extractVerificationCode();

          if (verificationCode) {
            logger.success(`获取到验证码: ${verificationCode}`);
            return verificationCode;
          }
        }

        // 直接尝试从页面提取验证码（有些邮箱直接显示在列表中）
        verificationCode = await this.extractVerificationCode();
        if (verificationCode) {
          logger.success(`获取到验证码: ${verificationCode}`);
          return verificationCode;
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.info(`暂未收到验证码，已等待 ${elapsed} 秒，继续等待...`);

      } catch (error) {
        logger.warn(`检查邮件时出错: ${error.message}`);
      }

      await this.sleep(5000);
    }

    await this.page.screenshot({ path: this.getScreenshotPath('debug-tempmail-timeout.png') });
    throw new Error('等待验证码超时');
  }

  /**
   * 刷新收件箱
   */
  async refreshInbox() {
    try {
      // 根据截图，刷新按钮在收件箱区域左上角，是一个圆形刷新图标
      // 尝试多种选择器
      const refreshSelectors = [
        'svg[class*="refresh"]',
        '[class*="refresh"]',
        'button svg',
        '.inbox-header button',
        // 通过文本"收件箱"附近的按钮
        'div:has-text("收件箱") button',
        'div:has-text("收件箱") svg'
      ];

      for (const selector of refreshSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            await element.click();
            await this.sleep(1000);
            return;
          }
        } catch (e) {
          // 继续尝试下一个
        }
      }

      // 如果找不到刷新按钮，尝试通过坐标点击（根据截图，刷新图标在收件箱区域左侧）
      // 或者直接刷新页面
      await this.page.evaluate(() => {
        // 查找包含刷新图标的元素
        const svgs = document.querySelectorAll('svg');
        for (const svg of svgs) {
          const parent = svg.parentElement;
          if (parent && parent.tagName === 'BUTTON') {
            parent.click();
            return;
          }
        }
      });
    } catch (error) {
      logger.warn('刷新收件箱失败，将重新加载页面');
      await this.page.reload({ waitUntil: 'networkidle2' });
    }
  }

  /**
   * 检查是否有新邮件
   */
  async checkForNewMail() {
    return await this.page.evaluate(() => {
      // 检查收件箱数量，根据截图显示 "0 封，1 秒后刷新"
      const inboxText = document.body.innerText;

      // 匹配 "X 封" 格式
      const countMatch = inboxText.match(/(\d+)\s*封/);
      if (countMatch && parseInt(countMatch[1]) > 0) {
        return true;
      }

      // 也检查是否有邮件列表项
      const mailItems = document.querySelectorAll('[class*="mail-item"], [class*="message-item"], [class*="inbox-item"]');
      if (mailItems.length > 0) {
        return true;
      }

      // 检查是否有 OpenAI 相关的文本
      if (inboxText.toLowerCase().includes('openai') ||
          inboxText.toLowerCase().includes('verify')) {
        return true;
      }

      return false;
    });
  }

  /**
   * 点击最新的邮件
   */
  async clickLatestMail() {
    await this.page.evaluate(() => {
      // 查找邮件列表项
      const selectors = [
        '[class*="mail-item"]',
        '[class*="message-item"]',
        '[class*="inbox-item"]',
        '[class*="email-item"]',
        'tr[class*="mail"]',
        'li[class*="mail"]',
        'div[class*="mail"]'
      ];

      for (const selector of selectors) {
        const items = document.querySelectorAll(selector);
        if (items.length > 0) {
          items[0].click();
          return;
        }
      }

      // 备用方案：查找包含 OpenAI 文本的可点击元素
      const allElements = document.querySelectorAll('div, tr, li');
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.toLowerCase().includes('openai') ||
            text.toLowerCase().includes('verify') ||
            text.toLowerCase().includes('verification')) {
          el.click();
          return;
        }
      }
    });
  }

  /**
   * 从邮件中提取验证码
   * @returns {Promise<string|null>} 验证码或 null
   */
  async extractVerificationCode() {
    return await this.page.evaluate(() => {
      const bodyText = document.body.innerText;

      // OpenAI 验证码通常是 6 位数字
      // 优先匹配明确的验证码格式
      const codePatterns = [
        /verification code[:\s]+(\d{6})/i,
        /verify[:\s]+(\d{6})/i,
        /code[:\s]+(\d{6})/i,
        /验证码[:\s]*(\d{6})/,
        /Your code is[:\s]*(\d{6})/i,
        /Enter this code[:\s]*(\d{6})/i,
        /\b(\d{6})\b/  // 最后尝试匹配任意 6 位数字
      ];

      for (const pattern of codePatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          return match[1];
        }
      }

      return null;
    });
  }

  /**
   * 关闭临时邮箱页面
   */
  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }

  /**
   * 获取当前邮箱地址
   */
  getEmail() {
    return this.email;
  }
}
