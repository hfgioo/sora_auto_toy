/**
 * Sora 自动化注册工具
 * 主程序入口
 */
import puppeteerExtra from 'puppeteer-extra';
import puppeteerCore from 'puppeteer-core';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { TempMailService } from './modules/tempmail.js';
import { OpenAIRegister } from './modules/register.js';
import { saveAccount } from './utils/excel.js';
import { logger } from './utils/logger.js';

// 使用 puppeteer-core 作为基础
const puppeteer = puppeteerExtra.use(StealthPlugin());
puppeteer.use(StealthPlugin());

// 加载环境变量
dotenv.config();

// 配置
const config = {
  defaultPassword: process.env.DEFAULT_PASSWORD || 'SecurePass123!@#',
  headless: process.env.HEADLESS === 'true',
  slowMo: parseInt(process.env.SLOW_MO || '50'),
  navigationTimeout: parseInt(process.env.NAVIGATION_TIMEOUT || '60000'),
  waitForEmailTimeout: parseInt(process.env.WAIT_FOR_EMAIL_TIMEOUT || '120000'),
  chromePath: process.env.CHROME_PATH || null,
  screenshotDir: 'screenshots'
};

// 确保截图目录存在
if (!existsSync(config.screenshotDir)) {
  mkdirSync(config.screenshotDir, { recursive: true });
}

// 是否继续运行
let isRunning = true;

// 监听 Ctrl+C 停止
process.on('SIGINT', () => {
  logger.warn('\n收到停止信号，将在当前注册完成后停止...');
  isRunning = false;
});

/**
 * 生成随机密码
 */
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%^&*';
  let password = '';

  // 确保包含大写、小写、数字和特殊字符
  password += 'A'; // 大写
  password += 'a'; // 小写
  password += '1'; // 数字
  password += '!'; // 特殊字符

  // 填充剩余字符
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // 打乱顺序
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * 清除浏览器缓存和 Cookie
 */
async function clearBrowserData(browser) {
  try {
    const pages = await browser.pages();
    for (const page of pages) {
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      await client.send('Network.clearBrowserCache');
    }
    logger.info('已清除浏览器缓存和 Cookie');
  } catch (error) {
    logger.warn(`清除缓存时出错: ${error.message}`);
  }
}

/**
 * 单次注册流程
 */
async function registerOne(browser, index) {
  logger.info(`\n========== 开始第 ${index + 1} 个账户注册 ==========\n`);

  const tempMail = new TempMailService(browser, config.screenshotDir);
  const register = new OpenAIRegister(browser, config.screenshotDir);

  let email = null;
  let password = config.defaultPassword || generatePassword();
  let status = '失败';
  let sessionToken = null;

  try {
    // 1. 获取临时邮箱
    await tempMail.init();
    email = await tempMail.getEmailAddress();

    // 2. 开始注册流程
    await register.init();

    // 3. 执行注册，传入获取验证码的回调
    const success = await register.register(email, password, async () => {
      return await tempMail.waitForVerificationCode(config.waitForEmailTimeout);
    });

    if (success) {
      status = '成功';
      logger.success(`账户 ${email} 注册成功！`);

      // 4. 获取 Session Token
      const tokenResult = await register.getSessionToken();
      if (tokenResult.sessionToken) {
        sessionToken = tokenResult.sessionToken;
        logger.success(`已获取 Session Token (长度: ${sessionToken.length})`);
      } else {
        logger.warn('未能获取 Session Token，但账户注册成功');
      }
    }
  } catch (error) {
    logger.error(`注册失败: ${error.message}`);
    status = `失败: ${error.message}`;
  } finally {
    // 只保存成功的账户到 Excel
    if (email && status === '成功') {
      await saveAccount({
        email,
        password,
        status,
        sessionToken,
        createdAt: new Date().toISOString()
      });
    }

    // 关闭页面
    await tempMail.close();
    await register.close();
  }

  return status === '成功';
}

/**
 * 主函数
 */
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Sora 自动化注册工具 v1.0.0                      ║
║                                                           ║
║  注意: 此工具仅供学习研究使用                             ║
║  请遵守 OpenAI 的服务条款                                 ║
║                                                           ║
║  按 Ctrl+C 停止注册                                       ║
╚═══════════════════════════════════════════════════════════╝
  `);

  logger.info(`配置信息:`);
  logger.info(`- 模式: 持续注册 (按 Ctrl+C 停止)`);
  logger.info(`- 无头模式: ${config.headless}`);
  logger.info(`- 慢动作延迟: ${config.slowMo}ms`);
  logger.info(`- 截图目录: ${config.screenshotDir}/`);
  if (config.chromePath) {
    logger.info(`- Chrome 路径: ${config.chromePath}`);
  }

  let browser;
  let successCount = 0;
  let failCount = 0;
  let index = 0;

  try {
    // 启动浏览器
    logger.info('正在启动浏览器 (已启用 Stealth 模式)...');

    const launchOptions = {
      headless: config.headless,
      slowMo: config.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        // 反检测参数
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-plugins-discovery',
        '--lang=zh-CN,zh',
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      },
      ignoreDefaultArgs: ['--enable-automation']
    };

    // 如果配置了本地 Chrome 路径，使用本地 Chrome
    if (config.chromePath) {
      launchOptions.executablePath = config.chromePath;
    }

    browser = await puppeteer.launch(launchOptions);

    logger.success('浏览器已启动');

    // 持续注册直到手动停止
    while (isRunning) {
      const success = await registerOne(browser, index);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      index++;

      // 如果还要继续，清除缓存并等待
      if (isRunning) {
        await clearBrowserData(browser);
        logger.info('等待 5 秒后继续下一个注册...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    logger.error(`程序出错: ${error.message}`);
  } finally {
    // 关闭浏览器
    if (browser) {
      await browser.close();
      logger.info('浏览器已关闭');
    }
  }

  // 输出统计
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                      注册完成                              ║
╠═══════════════════════════════════════════════════════════╣
║  总计: ${index.toString().padEnd(3)} 个                                        ║
║  成功: ${successCount.toString().padEnd(3)} 个                                        ║
║  失败: ${failCount.toString().padEnd(3)} 个                                        ║
║                                                           ║
║  账户信息已保存到 accounts.xlsx                           ║
║  截图已保存到 ${config.screenshotDir}/ 目录                          ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

// 运行主程序
main().catch(console.error);
