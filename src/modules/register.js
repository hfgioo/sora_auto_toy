/**
 * OpenAI/Sora 注册模块
 * 自动化注册 OpenAI 账户
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export class OpenAIRegister {
  constructor(browser, screenshotDir = '.') {
    this.browser = browser;
    this.page = null;
    this.names = [];
    this.screenshotDir = screenshotDir;
    this.loadNames();
  }

  /**
   * 获取截图路径
   */
  getScreenshotPath(filename) {
    return join(this.screenshotDir, filename);
  }

  /**
   * 加载名字列表
   */
  loadNames() {
    try {
      const content = readFileSync('name.txt', 'utf-8');
      this.names = content.split('\n').map(n => n.trim()).filter(n => n.length > 0);
      logger.info(`已加载 ${this.names.length} 个名字`);
    } catch (error) {
      logger.warn('无法加载 name.txt，将使用默认名字');
      this.names = ['John', 'Jane', 'Alex', 'Sam', 'Chris'];
    }
  }

  /**
   * 获取随机全名 (2个随机字母 + name.txt中的名字)
   */
  getRandomFullName() {
    // 生成2个随机字母
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const prefix = letters.charAt(Math.floor(Math.random() * 26)) +
                   letters.charAt(Math.floor(Math.random() * 26));

    // 从 name.txt 获取一个名字
    const name = this.names[Math.floor(Math.random() * this.names.length)];

    // 首字母大写
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    return `${capitalize(prefix)}${capitalize(name)}`;
  }

  /**
   * 生成随机生日 (18-40岁)
   * 根据页面语言返回不同格式
   */
  generateBirthday(isChinesePage = false) {
    const currentYear = new Date().getFullYear();
    const year = currentYear - Math.floor(Math.random() * 22) - 18; // 18-40岁
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');

    if (isChinesePage) {
      // 中文页面格式: 年/月/日
      return `${year}/${month}/${day}`;
    } else {
      // 英文页面格式: MM/DD/YYYY
      return `${month}/${day}/${year}`;
    }
  }

  /**
   * 生成随机用户名
   */
  generateUsername() {
    const name = this.names[Math.floor(Math.random() * this.names.length)].toLowerCase();
    const num = Math.floor(Math.random() * 9999);
    return `${name}${num}`;
  }

  /**
   * 睡眠函数
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 随机延迟函数（模拟人类行为）
   */
  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    logger.info(`等待 ${(delay / 1000).toFixed(1)} 秒...`);
    return this.sleep(delay);
  }

  /**
   * 通用重试包装函数
   */
  async withRetry(fn, stepName, retries = 3, delay = 2000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < retries - 1) {
          logger.warn(`${stepName} 失败，${delay / 1000}秒后重试 (${i + 1}/${retries}): ${error.message}`);
          await this.sleep(delay);
        }
      }
    }
    logger.error(`${stepName} 重试${retries}次后仍然失败`);
    throw lastError;
  }

  /**
   * 安全执行 evaluate（处理页面导航导致的上下文销毁，重试3次，每2秒一次）
   */
  async safeEvaluate(fn, defaultValue = null, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.page.evaluate(fn);
      } catch (e) {
        if (e.message.includes('Execution context was destroyed') ||
            e.message.includes('navigation') ||
            e.message.includes('Target closed')) {
          if (i < retries - 1) {
            logger.info(`safeEvaluate 重试 ${i + 2}/${retries}...`);
            await this.sleep(2000);
            continue;
          }
        }
        throw e;
      }
    }
    return defaultValue;
  }

  /**
   * 等待元素出现并可交互（带重试，3次，每2秒一次）
   */
  async waitForElement(selector, timeout = 15000, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.page.waitForSelector(selector, { visible: true, timeout: timeout / retries });
        return await this.page.$(selector);
      } catch (e) {
        if (i < retries - 1) {
          logger.info(`等待元素 ${selector} 重试 ${i + 2}/${retries}...`);
          await this.sleep(2000);
        }
      }
    }
    return null;
  }

  /**
   * 等待页面加载完成（loading消失）
   */
  async waitForPageLoad(timeout = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        // 检查是否有 loading 指示器
        const hasLoading = await this.page.evaluate(() => {
          // 检查常见的 loading 元素
          const loadingSelectors = [
            '[class*="loading"]',
            '[class*="spinner"]',
            '[class*="Loading"]',
            '[class*="Spinner"]',
            'svg[class*="animate"]',
            '[role="progressbar"]'
          ];
          for (const sel of loadingSelectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return true;
          }
          return false;
        });

        if (!hasLoading) {
          return true;
        }
      } catch (e) {
        // 页面导航中，等待后重试
        if (e.message.includes('Execution context was destroyed') ||
            e.message.includes('navigation')) {
          await this.sleep(1000);
          continue;
        }
        throw e;
      }
      await this.sleep(500);
    }
    return false;
  }

  /**
   * 等待页面导航完成（URL变化或网络空闲）
   */
  async waitForNavigation(timeout = 10000) {
    try {
      await Promise.race([
        this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout }),
        this.sleep(timeout)
      ]);
    } catch (e) {
      // 超时继续执行
    }
  }

  /**
   * 初始化注册页面
   */
  async init() {
    logger.step(1, '正在打开 Sora 注册页面...');
    this.page = await this.browser.newPage();

    // 设置 viewport
    await this.page.setViewport({ width: 1280, height: 800 });

    // 设置超时
    this.page.setDefaultTimeout(30000);
    this.page.setDefaultNavigationTimeout(60000);

    // 设置 User-Agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await this.page.goto('https://sora.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await this.sleep(3000);
    logger.success('Sora 页面已打开');
  }

  /**
   * 步骤1: 点击 Log in 按钮
   */
  async clickLogin() {
    logger.step(2, '正在点击 Log in 按钮...');

    try {
      // 等待按钮出现
      await this.page.waitForSelector('button, a', { visible: true, timeout: 10000 });

      // 点击 Log in 按钮
      const clicked = await this.safeEvaluate(() => {
        const elements = document.querySelectorAll('button, a');
        for (const el of elements) {
          const text = el.textContent.trim().toLowerCase();
          if (text === 'log in' || text === '登录') {
            el.click();
            return true;
          }
        }
        return false;
      }, false);

      if (clicked) {
        logger.success('已点击 Log in 按钮');
        // 等待页面跳转
        await this.waitForNavigation();
      } else {
        throw new Error('找不到 Log in 按钮');
      }
    } catch (error) {
      try {
        await this.page.screenshot({ path: this.getScreenshotPath('debug-login-btn.png') });
      } catch (e) {}
      throw error;
    }
  }

  /**
   * 步骤2: 点击免费注册按钮
   */
  async clickSignUp() {
    logger.step(3, '正在点击免费注册按钮...');

    try {
      // 等待注册按钮出现
      await this.page.waitForSelector('button, a', { visible: true, timeout: 10000 });

      // 点击免费注册按钮
      const clicked = await this.safeEvaluate(() => {
        const elements = document.querySelectorAll('button, a');
        for (const el of elements) {
          const text = el.textContent.trim();
          if (text.includes('免费注册') || text.includes('Sign up') || text.includes('注册')) {
            el.click();
            return true;
          }
        }
        return false;
      }, false);

      if (clicked) {
        logger.success('已点击免费注册按钮');
        await this.waitForNavigation();
        await this.sleep(3000);
      } else {
        logger.info('可能已经在登录页面');
      }
    } catch (error) {
      try {
        await this.page.screenshot({ path: this.getScreenshotPath('debug-signup-btn.png') });
      } catch (e) {}
      logger.warn(`点击注册按钮时出错: ${error.message}`);
    }
  }

  /**
   * 步骤3: 输入邮箱地址
   */
  async enterEmail(email) {
    logger.step(4, `正在输入邮箱: ${email}`);

    try {
      // 等待邮箱输入框出现
      const emailInput = await this.waitForElement('input[type="email"], input[name="email"], input[autocomplete="email"]');

      if (emailInput) {
        await emailInput.click({ clickCount: 3 });
        await emailInput.type(email, { delay: 30 });
        logger.success('邮箱已输入');
      } else {
        // 备用方案
        const firstInput = await this.waitForElement('input:not([type="hidden"]):not([type="password"])');
        if (firstInput) {
          await firstInput.click({ clickCount: 3 });
          await firstInput.type(email, { delay: 30 });
          logger.success('邮箱已输入 (备用方案)');
        } else {
          throw new Error('找不到邮箱输入框');
        }
      }

      await this.clickContinue();
    } catch (error) {
      await this.page.screenshot({ path: this.getScreenshotPath('debug-email-input.png') });
      throw error;
    }
  }

  /**
   * 步骤4: 输入密码
   */
  async enterPassword(password) {
    logger.step(5, '正在输入密码...');

    try {
      // 等待密码输入框出现
      const passwordInput = await this.waitForElement('input[type="password"]');

      if (passwordInput) {
        await passwordInput.click();
        await passwordInput.type(password, { delay: 30 });
        logger.success('密码已输入');
        await this.clickContinue();
      } else {
        throw new Error('找不到密码输入框');
      }
    } catch (error) {
      await this.page.screenshot({ path: this.getScreenshotPath('debug-password-input.png') });
      throw error;
    }
  }

  /**
   * 步骤5: 输入验证码
   */
  async enterVerificationCode(code) {
    logger.step(6, `正在输入验证码: ${code}`);

    try {
      // 切换回注册页面
      logger.info('切换回注册页面...');
      await this.page.bringToFront();

      // 等待验证码输入框出现
      const codeInput = await this.waitForElement('input:not([type="password"]):not([type="hidden"])');

      if (codeInput) {
        await codeInput.click({ clickCount: 3 });
        await codeInput.type(code, { delay: 50 });
        logger.success('验证码已输入');
        await this.clickContinue();
      } else {
        throw new Error('找不到验证码输入框');
      }
    } catch (error) {
      await this.page.screenshot({ path: this.getScreenshotPath('debug-code-input.png') });
      throw error;
    }
  }

  /**
   * 步骤6: 输入全名和生日
   */
  async enterNameAndBirthday() {
    logger.step(7, '正在输入全名和生日...');

    try {
      // 先等待页面加载完成
      await this.waitForPageLoad();

      // 等待名字输入框出现
      await this.page.waitForSelector('input[name="name"], input[autocomplete="name"], input:not([type="hidden"])', { visible: true, timeout: 15000 });

      // 检测页面是否是中文
      const isChinesePage = await this.safeEvaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('确认') || bodyText.includes('年龄') || bodyText.includes('生日日期');
      }, false);

      const fullName = this.getRandomFullName();
      const currentYear = new Date().getFullYear();
      const year = currentYear - Math.floor(Math.random() * 22) - 18;
      const month = Math.floor(Math.random() * 12) + 1;
      const day = Math.floor(Math.random() * 28) + 1;

      logger.info(`使用名字: ${fullName}, 生日: ${month}/${day}/${year} (${isChinesePage ? '中文页面' : '英文页面'})`);

      // 输入名字
      const nameInput = await this.page.$('input[name="name"], input[autocomplete="name"]');
      if (nameInput) {
        await nameInput.click({ clickCount: 3 });
        await nameInput.type(fullName, { delay: 30 });
        logger.success('全名已输入');
      } else {
        const inputs = await this.page.$$('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
        if (inputs.length >= 1) {
          await inputs[0].click({ clickCount: 3 });
          await inputs[0].type(fullName, { delay: 30 });
          logger.success('全名已输入 (备用方案)');
        }
      }

      // 等待日期组件出现
      await this.sleep(500);

      // 处理 React Aria DateField 组件
      const hasReactAriaDateField = await this.page.$('div[role="spinbutton"]');

      if (hasReactAriaDateField) {
        logger.info('检测到 React Aria DateField 组件');

        if (isChinesePage) {
          // 中文: 年、月、日
          const yearSpinner = await this.page.$('div[role="spinbutton"][aria-label*="年"]');
          if (yearSpinner) {
            await yearSpinner.click();
            await this.page.keyboard.type(String(year), { delay: 50 });
          }

          const monthSpinner = await this.page.$('div[role="spinbutton"][aria-label*="月"]');
          if (monthSpinner) {
            await monthSpinner.click();
            await this.page.keyboard.type(String(month), { delay: 50 });
          }

          const daySpinner = await this.page.$('div[role="spinbutton"][aria-label*="日"]');
          if (daySpinner) {
            await daySpinner.click();
            await this.page.keyboard.type(String(day), { delay: 50 });
          }
        } else {
          // 英文: Month, Day, Year
          const monthSpinner = await this.page.$('div[role="spinbutton"][aria-label*="month" i]');
          if (monthSpinner) {
            await monthSpinner.click();
            await this.page.keyboard.type(String(month), { delay: 50 });
          }

          const daySpinner = await this.page.$('div[role="spinbutton"][aria-label*="day" i]');
          if (daySpinner) {
            await daySpinner.click();
            await this.page.keyboard.type(String(day), { delay: 50 });
          }

          const yearSpinner = await this.page.$('div[role="spinbutton"][aria-label*="year" i]');
          if (yearSpinner) {
            await yearSpinner.click();
            await this.page.keyboard.type(String(year), { delay: 50 });
          }
        }

        logger.success('生日已输入 (React Aria DateField)');
      } else {
        // 备用方案
        logger.info('使用备用方案输入生日');
        const birthdayInput = await this.page.$('input[name*="birth"], input[type="date"]');
        if (birthdayInput) {
          await birthdayInput.click();
          const monthStr = String(month).padStart(2, '0');
          const dayStr = String(day).padStart(2, '0');
          await this.page.keyboard.type(`${monthStr}${dayStr}${year}`, { delay: 30 });
          logger.success('生日已输入');
        }
      }

      await this.clickContinue();
    } catch (error) {
      await this.page.screenshot({ path: this.getScreenshotPath('debug-name-birthday.png') });
      throw error;
    }
  }

  /**
   * 步骤7: 输入用户名
   */
  async enterUsername() {
    logger.step(8, '正在输入用户名...');

    try {
      // 先等待页面加载完成（loading消失）
      logger.info('等待页面加载完成...');
      await this.waitForPageLoad();

      // 额外等待确保页面完全渲染
      await this.sleep(3000);

      // 等待页面标题或特定文本出现，确认是用户名页面
      const isUsernamePage = await this.safeEvaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return bodyText.includes('username') || bodyText.includes('用户名');
      }, false);

      if (!isUsernamePage) {
        logger.info('等待用户名页面加载...');
        // 等待更长时间让页面跳转完成
        for (let i = 0; i < 10; i++) {
          await this.sleep(2000);
          const ready = await this.safeEvaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            return bodyText.includes('username') || bodyText.includes('用户名') || bodyText.includes('choose your username');
          }, false);
          if (ready) {
            logger.info('用户名页面已加载');
            break;
          }
          logger.info(`等待用户名页面... ${i + 1}/10`);
        }
      }

      // 再次等待确保输入框可交互
      await this.sleep(1000);

      // 尝试多种选择器查找用户名输入框
      const selectors = [
        'input[name="username"]',
        'input[autocomplete="username"]',
        'input[placeholder*="username" i]',
        'input[placeholder*="用户名"]',
        'input[aria-label*="username" i]',
        'input[aria-label*="用户名"]',
        'input[type="text"]:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]):not([type="email"])'
      ];

      let usernameInput = null;

      for (const selector of selectors) {
        try {
          usernameInput = await this.page.$(selector);
          if (usernameInput) {
            // 检查元素是否可见
            const isVisible = await usernameInput.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            });
            if (isVisible) {
              logger.info(`找到用户名输入框，使用选择器: ${selector}`);
              break;
            }
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
        usernameInput = null;
      }

      // 如果还没找到，使用更通用的方法
      if (!usernameInput) {
        logger.info('使用通用方法查找输入框...');
        const inputs = await this.page.$$('input');
        for (const input of inputs) {
          const inputInfo = await input.evaluate(el => ({
            type: el.type,
            name: el.name,
            placeholder: el.placeholder,
            visible: el.offsetParent !== null,
            value: el.value
          }));
          logger.info(`发现输入框: type=${inputInfo.type}, name=${inputInfo.name}, placeholder=${inputInfo.placeholder}, visible=${inputInfo.visible}, value=${inputInfo.value}`);

          if (inputInfo.visible && inputInfo.type !== 'hidden' && inputInfo.type !== 'checkbox' && inputInfo.type !== 'radio') {
            usernameInput = input;
            logger.info('使用通用方法找到输入框');
            break;
          }
        }
      }

      const username = this.generateUsername();
      logger.info(`使用用户名: ${username}`);

      if (usernameInput) {
        // 清空现有内容并输入新用户名
        await usernameInput.click({ clickCount: 3 });
        await this.sleep(200);
        await this.page.keyboard.press('Backspace');
        await this.sleep(200);
        await usernameInput.type(username, { delay: 50 });
        logger.success('用户名已输入');

        // 等待一下让页面验证用户名
        await this.sleep(1500);

        await this.clickContinue();
      } else {
        // 保存调试截图
        await this.page.screenshot({ path: this.getScreenshotPath('debug-username-not-found.png') });

        // 打印页面HTML帮助调试
        const pageContent = await this.safeEvaluate(() => document.body.innerHTML.substring(0, 2000), '');
        logger.info(`页面内容片段: ${pageContent}`);

        throw new Error('找不到用户名输入框');
      }
    } catch (error) {
      try {
        await this.page.screenshot({ path: this.getScreenshotPath('debug-username.png') });
      } catch (e) {
        // 截图失败，忽略
      }
      throw error;
    }
  }

  /**
   * 点击继续按钮
   */
  async clickContinue() {
    logger.info('正在点击继续按钮...');

    try {
      // 等待按钮可点击
      await this.page.waitForSelector('button', { visible: true, timeout: 10000 });

      // 先尝试用 Puppeteer 直接点击
      const buttons = await this.page.$$('button');
      let clicked = false;

      for (const btn of buttons) {
        const text = await btn.evaluate(el => el.textContent.trim().toLowerCase());
        if (text === '继续' || text === 'continue' || text === 'next' || text === '下一步') {
          await btn.click();
          clicked = true;
          logger.success('已点击继续按钮');
          break;
        }
      }

      // 如果没找到，尝试提交表单
      if (!clicked) {
        const submitBtn = await this.page.$('button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          clicked = true;
          logger.success('已点击提交按钮');
        }
      }

      if (!clicked) {
        logger.warn('未找到继续按钮');
      }

      // 等待页面响应
      await this.sleep(2000);
    } catch (error) {
      logger.warn(`点击继续按钮时出错: ${error.message}`);
    }
  }

  /**
   * 检测页面是否显示 "We ran into an issue" 错误
   * @returns {Promise<boolean>} 是否存在该错误
   */
  async checkForSignInIssue() {
    const errorText = await this.safeEvaluate(() => {
      const bodyText = document.body.innerText;
      if (bodyText.includes('We ran into an issue') ||
          bodyText.includes('please take a break') ||
          bodyText.includes('try again soon')) {
        return true;
      }
      // 也检查错误元素
      const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]');
      for (const el of errorElements) {
        const text = el.textContent.trim();
        if (text.includes('We ran into an issue') || text.includes('try again')) {
          return true;
        }
      }
      return false;
    }, false);

    return errorText;
  }

  /**
   * 完成注册流程
   */
  async register(email, password, getVerificationCode) {
    try {
      // 1. 点击 Log in (带重试)
      await this.withRetry(
        () => this.clickLogin(),
        '点击 Log in 按钮',
        3,
        2000
      );

      // 2. 点击免费注册 (带重试)
      await this.withRetry(
        () => this.clickSignUp(),
        '点击免费注册按钮',
        3,
        2000
      );

      // 3. 输入邮箱 (带重试)
      await this.withRetry(
        () => this.enterEmail(email),
        '输入邮箱',
        3,
        2000
      );

      // 4. 输入密码 (带重试)
      await this.withRetry(
        () => this.enterPassword(password),
        '输入密码',
        3,
        2000
      );

      // 5. 等待并输入验证码 (带重试)
      logger.info('等待邮箱验证码...');
      const code = await getVerificationCode();
      await this.withRetry(
        () => this.enterVerificationCode(code),
        '输入验证码',
        3,
        2000
      );

      // 6. 输入全名和生日 (带重试)
      await this.withRetry(
        () => this.enterNameAndBirthday(),
        '输入全名和生日',
        3,
        2000
      );

      // 检查是否出现 "We ran into an issue" 错误
      await this.sleep(2000);
      const hasSignInIssue = await this.checkForSignInIssue();
      if (hasSignInIssue) {
        logger.error('检测到 "We ran into an issue while signing you in" 错误');
        await this.page.screenshot({ path: this.getScreenshotPath('debug-signin-issue.png') });
        throw new Error('We ran into an issue while signing you in, please take a break and try again soon.');
      }

      // 7. 输入用户名 (带重试)
      await this.withRetry(
        () => this.enterUsername(),
        '输入用户名',
        3,
        2000
      );

      // 8. 等待注册完成
      await this.sleep(5000);

      // 截图保存最终状态
      try {
        await this.page.screenshot({ path: this.getScreenshotPath('debug-final-state.png') });
        logger.info('已保存最终状态截图: debug-final-state.png');
      } catch (e) {
        logger.warn('保存最终状态截图失败');
      }

      // 检查是否注册成功
      const currentUrl = this.page.url();
      logger.info(`当前页面: ${currentUrl}`);

      // 检查页面是否还在注册流程中（未完成）
      if (currentUrl.includes('auth.openai.com')) {
        // 检查页面上是否有错误提示
        const hasError = await this.safeEvaluate(() => {
          const errorElements = document.querySelectorAll('[class*="error"], [class*="Error"], [role="alert"]');
          for (const el of errorElements) {
            if (el.textContent.trim().length > 0) {
              return el.textContent.trim();
            }
          }
          return null;
        }, null);

        if (hasError) {
          logger.error(`注册失败，页面显示错误: ${hasError}`);
          return false;
        }

        // 还在 auth 页面，说明注册未完成
        logger.warn(`注册可能未完成，当前仍在认证页面: ${currentUrl}`);
        return false;
      }

      // 成功跳转到 sora 或 chat 页面
      if (currentUrl.includes('sora.com') || currentUrl.includes('chat.openai.com') || currentUrl.includes('chatgpt.com')) {
        logger.success('注册成功！已跳转到主页面');
        return true;
      }

      // 其他情况，记录警告
      logger.warn(`注册状态不确定，当前页面: ${currentUrl}`);
      return false;
    } catch (error) {
      logger.error(`注册过程出错: ${error.message}`);
      try {
        await this.page.screenshot({ path: this.getScreenshotPath('debug-register-error.png') });
      } catch (e) {}
      throw error;
    }
  }

  /**
   * 获取 Session Token 和 Refresh Token
   * @returns {Promise<Object>} 包含所有相关 Cookie 和 Token 的对象
   */
  async getSessionToken() {
    logger.info('正在获取 Session Token 和 Refresh Token...');

    try {
      // 获取所有 Cookie
      const cookies = await this.page.cookies();

      // 从 localStorage 获取 token（包括 refresh token）
      const localStorageData = await this.safeEvaluate(() => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          // 获取所有可能包含 token 的 key
          if (key.includes('token') || key.includes('Token') ||
              key.includes('auth') || key.includes('Auth') ||
              key.includes('session') || key.includes('Session') ||
              key.includes('refresh') || key.includes('Refresh') ||
              key.includes('access') || key.includes('Access') ||
              key.includes('oai') || key.includes('openai')) {
            try {
              const value = localStorage.getItem(key);
              // 尝试解析 JSON
              try {
                data[key] = JSON.parse(value);
              } catch {
                data[key] = value;
              }
            } catch (e) {
              // 忽略无法读取的项
            }
          }
        }
        return data;
      }, {});

      // 从 sessionStorage 获取 token
      const sessionStorageData = await this.safeEvaluate(() => {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key.includes('token') || key.includes('Token') ||
              key.includes('auth') || key.includes('Auth') ||
              key.includes('session') || key.includes('Session') ||
              key.includes('refresh') || key.includes('Refresh') ||
              key.includes('access') || key.includes('Access') ||
              key.includes('oai') || key.includes('openai')) {
            try {
              const value = sessionStorage.getItem(key);
              try {
                data[key] = JSON.parse(value);
              } catch {
                data[key] = value;
              }
            } catch (e) {
              // 忽略无法读取的项
            }
          }
        }
        return data;
      }, {});

      // 筛选出 OpenAI 相关的鉴权 Cookie
      const authCookies = {};
      const relevantDomains = ['.openai.com', '.sora.com', '.chatgpt.com', 'auth.openai.com'];
      const relevantNames = [
        '__Secure-next-auth.session-token',
        '__Host-next-auth.csrf-token',
        '__cf_bm',
        '_cfuvid',
        'cf_clearance',
        'oai-did',
        'oai-dm-tgt-c-240329',
        '__Secure-next-auth.callback-url',
        'ajs_anonymous_id'
      ];

      for (const cookie of cookies) {
        // 检查是否是相关域名的 Cookie
        const isRelevantDomain = relevantDomains.some(domain =>
          cookie.domain.includes(domain.replace('.', '')) || cookie.domain === domain
        );

        if (isRelevantDomain) {
          // 优先保存重要的鉴权 Cookie
          if (relevantNames.includes(cookie.name) || cookie.name.includes('session') || cookie.name.includes('token')) {
            authCookies[cookie.name] = {
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              expires: cookie.expires,
              httpOnly: cookie.httpOnly,
              secure: cookie.secure
            };
          }
        }
      }

      // 特别提取最重要的 session token
      const sessionToken = cookies.find(c => c.name === '__Secure-next-auth.session-token');

      if (sessionToken) {
        logger.success('成功获取 Session Token');
        logger.info(`Session Token 域名: ${sessionToken.domain}`);
        logger.info(`Session Token 过期时间: ${new Date(sessionToken.expires * 1000).toLocaleString()}`);
      } else {
        logger.warn('未找到 __Secure-next-auth.session-token，可能使用其他鉴权方式');
      }

      // 尝试从 localStorage 提取 refresh token
      let refreshToken = null;
      for (const [key, value] of Object.entries(localStorageData)) {
        if (key.toLowerCase().includes('refresh')) {
          if (typeof value === 'string') {
            refreshToken = value;
          } else if (value && value.refreshToken) {
            refreshToken = value.refreshToken;
          } else if (value && value.refresh_token) {
            refreshToken = value.refresh_token;
          }
          if (refreshToken) {
            logger.success(`成功获取 Refresh Token (来自 localStorage: ${key})`);
            break;
          }
        }
      }

      // 如果 localStorage 没有，尝试从 sessionStorage 获取
      if (!refreshToken) {
        for (const [key, value] of Object.entries(sessionStorageData)) {
          if (key.toLowerCase().includes('refresh')) {
            if (typeof value === 'string') {
              refreshToken = value;
            } else if (value && value.refreshToken) {
              refreshToken = value.refreshToken;
            } else if (value && value.refresh_token) {
              refreshToken = value.refresh_token;
            }
            if (refreshToken) {
              logger.success(`成功获取 Refresh Token (来自 sessionStorage: ${key})`);
              break;
            }
          }
        }
      }

      if (!refreshToken) {
        logger.warn('未找到 Refresh Token');
      }

      // 记录找到的所有 storage 数据
      if (Object.keys(localStorageData).length > 0) {
        logger.info(`localStorage 中找到 ${Object.keys(localStorageData).length} 个相关项`);
      }
      if (Object.keys(sessionStorageData).length > 0) {
        logger.info(`sessionStorage 中找到 ${Object.keys(sessionStorageData).length} 个相关项`);
      }

      // 返回结果
      return {
        sessionToken: sessionToken ? sessionToken.value : null,
        refreshToken: refreshToken,
        allAuthCookies: authCookies,
        localStorage: localStorageData,
        sessionStorage: sessionStorageData,
        rawCookies: cookies.filter(c =>
          relevantDomains.some(domain =>
            c.domain.includes(domain.replace('.', '')) || c.domain === domain
          )
        )
      };
    } catch (error) {
      logger.error(`获取 Token 失败: ${error.message}`);
      return {
        sessionToken: null,
        refreshToken: null,
        allAuthCookies: {},
        localStorage: {},
        sessionStorage: {},
        rawCookies: []
      };
    }
  }

  /**
   * 将 Session Token 转换为 Access Token
   * @param {string} sessionToken - Session Token
   * @returns {Promise<Object>} 包含 accessToken 和用户信息的对象
   */
  async sessionToAccessToken(sessionToken) {
    logger.info('正在将 Session Token 转换为 Access Token...');

    if (!sessionToken) {
      logger.error('Session Token 为空，无法转换');
      return { accessToken: null, user: null, expires: null };
    }

    try {
      // 使用 Puppeteer 发起请求（利用现有页面的网络环境和代理）
      const result = await this.page.evaluate(async (st) => {
        try {
          const response = await fetch('https://sora.chatgpt.com/api/auth/session', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Cookie': `__Secure-next-auth.session-token=${st}`,
              'Origin': 'https://sora.chatgpt.com',
              'Referer': 'https://sora.chatgpt.com/'
            },
            credentials: 'include'
          });

          if (!response.ok) {
            return { error: `HTTP ${response.status}: ${response.statusText}` };
          }

          const data = await response.json();
          return data;
        } catch (e) {
          return { error: e.message };
        }
      }, sessionToken);

      if (result.error) {
        // 如果页面内 fetch 失败，尝试通过导航到 session API 获取
        logger.warn(`页面内请求失败: ${result.error}，尝试直接导航获取...`);

        // 先设置 Cookie
        await this.page.setCookie({
          name: '__Secure-next-auth.session-token',
          value: sessionToken,
          domain: '.chatgpt.com',
          path: '/',
          secure: true,
          httpOnly: true
        });

        // 导航到 session API
        const response = await this.page.goto('https://sora.chatgpt.com/api/auth/session', {
          waitUntil: 'networkidle0',
          timeout: 30000
        });

        if (response && response.ok()) {
          const content = await this.page.content();
          // 提取 JSON 内容
          const jsonMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
          if (jsonMatch) {
            const data = JSON.parse(jsonMatch[1]);
            if (data.accessToken) {
              logger.success('成功获取 Access Token');
              logger.info(`用户邮箱: ${data.user?.email || '未知'}`);
              logger.info(`过期时间: ${data.expires || '未知'}`);
              return {
                accessToken: data.accessToken,
                user: data.user || null,
                expires: data.expires || null
              };
            }
          }

          // 尝试直接解析页面文本
          const text = await this.page.evaluate(() => document.body.innerText);
          try {
            const data = JSON.parse(text);
            if (data.accessToken) {
              logger.success('成功获取 Access Token');
              return {
                accessToken: data.accessToken,
                user: data.user || null,
                expires: data.expires || null
              };
            }
          } catch (e) {
            // 解析失败
          }
        }

        logger.error('无法获取 Access Token');
        return { accessToken: null, user: null, expires: null };
      }

      // 成功获取
      if (result.accessToken) {
        logger.success('成功获取 Access Token');
        logger.info(`用户邮箱: ${result.user?.email || '未知'}`);
        logger.info(`过期时间: ${result.expires || '未知'}`);
        return {
          accessToken: result.accessToken,
          user: result.user || null,
          expires: result.expires || null
        };
      }

      logger.warn('返回数据中没有 accessToken');
      return { accessToken: null, user: result.user || null, expires: null };
    } catch (error) {
      logger.error(`转换 Access Token 失败: ${error.message}`);
      return { accessToken: null, user: null, expires: null };
    }
  }

  /**
   * 获取当前页面
   */
  getPage() {
    return this.page;
  }

  /**
   * 关闭页面
   */
  async close() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }
}
