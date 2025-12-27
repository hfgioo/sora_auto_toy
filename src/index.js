/**
 * Sora 自动化注册工具
 * 主程序入口
 */
import puppeteerCore from 'puppeteer-core';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { addExtra } from 'puppeteer-extra';
import dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { TempMailService } from './modules/tempmail.js';
import { OpenAIRegister } from './modules/register.js';
import { saveAccount } from './utils/excel.js';
import { logger } from './utils/logger.js';

// 让 puppeteer-extra 使用 puppeteer-core
const puppeteer = addExtra(puppeteerCore);
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
  screenshotDir: 'screenshots',
  // 调试模式配置
  debugMode: process.env.DEBUG_MODE === 'true',
  debugPort: parseInt(process.env.DEBUG_PORT || '9222')
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
    // 先检查浏览器是否还连接着
    if (!browser.isConnected()) {
      logger.warn('浏览器已断开连接，跳过清除缓存');
      return false;
    }

    // 创建一个新页面来执行清除操作
    const page = await browser.newPage();
    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');
      await client.send('Network.clearBrowserCache');
      await client.detach();
      logger.info('已清除浏览器缓存和 Cookie');
    } finally {
      await page.close();
    }
    return true;
  } catch (error) {
    logger.warn(`清除缓存时出错: ${error.message}`);
    return false;
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
  let accessToken = null;

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

        // 5. 将 Session Token 转换为 Access Token
        const atResult = await register.sessionToAccessToken(sessionToken);
        if (atResult.accessToken) {
          accessToken = atResult.accessToken;
          logger.success(`已获取 Access Token (长度: ${accessToken.length})`);
        }
      } else {
        logger.warn('未能获取 Session Token，但账户注册成功');
      }
    }
  } catch (error) {
    logger.error(`注册失败: ${error.message}`);
    status = `失败: ${error.message}`;
  } finally {
    // 只保存成功的账户到 Excel 和 JSON
    if (email && status === '成功') {
      await saveAccount({
        email,
        password,
        status,
        sessionToken,
        accessToken,
        createdAt: new Date().toISOString()
      });
    }

    // 安全关闭页面
    try {
      await tempMail.close();
    } catch (e) {
      logger.warn(`关闭临时邮箱页面时出错: ${e.message}`);
    }
    
    try {
      await register.close();
    } catch (e) {
      logger.warn(`关闭注册页面时出错: ${e.message}`);
    }
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
  logger.info(`- 调试模式: ${config.debugMode ? '是 (连接到已有Chrome)' : '否'}`);
  if (!config.debugMode) {
    logger.info(`- 无头模式: ${config.headless}`);
  }
  logger.info(`- 慢动作延迟: ${config.slowMo}ms`);
  logger.info(`- 截图目录: ${config.screenshotDir}/`);
  if (config.chromePath && !config.debugMode) {
    logger.info(`- Chrome 路径: ${config.chromePath}`);
  }
  if (config.debugMode) {
    logger.info(`- 调试端口: ${config.debugPort}`);
  }

  let browser;
  let successCount = 0;
  let failCount = 0;
  let index = 0;
  let chromeProcess = null;

  try {
    // 根据模式启动或连接浏览器
    if (config.debugMode) {
      // 调试模式：自动启动 Chrome 并连接
      const chromePath = config.chromePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      // 使用独立的配置目录，避免和正在运行的 Chrome 冲突
      const userDataDir = 'C:\\chrome-sora-profile';

      logger.info('正在启动 Chrome 调试模式...');
      logger.info(`使用配置目录: ${userDataDir}`);
      logger.warn('提示: 如果连接失败，请关闭所有 Chrome 窗口后重试');

      // 启动 Chrome 进程 - 只使用最少必要参数，保持浏览器"干净"
      chromeProcess = spawn(chromePath, [
        `--remote-debugging-port=${config.debugPort}`,
        `--user-data-dir=${userDataDir}`,
      ], {
        detached: true,
        stdio: 'ignore'
      });

      // 等待 Chrome 启动
      logger.info('等待 Chrome 启动...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 尝试连接，最多重试 5 次
      let connected = false;
      for (let i = 0; i < 5; i++) {
        try {
          browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${config.debugPort}`,
            slowMo: config.slowMo,
            defaultViewport: null
          });
          connected = true;
          logger.success('已连接到 Chrome 浏览器');
          break;
        } catch (error) {
          if (i < 4) {
            logger.info(`连接失败，${i + 1}/5 次重试...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (!connected) {
        logger.error('无法连接到 Chrome，请确保：');
        logger.info('1. 关闭所有 Chrome 窗口后重试');
        logger.info('2. 检查 CHROME_PATH 配置是否正确');
        logger.info(`   当前路径: ${chromePath}`);
        process.exit(1);
      }
    } else {
      // 普通模式：启动新的浏览器实例
      logger.info('正在启动浏览器 (已启用 Stealth 模式)...');

      const launchOptions = {
        headless: config.headless,
        slowMo: config.slowMo,
        args: [
          '--no-first-run',
          '--window-size=1920,1080',
          // 关键反检测参数
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--lang=en-US,en',
        ],
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection']
      };

      if (config.chromePath) {
        launchOptions.executablePath = config.chromePath;
      }

      browser = await puppeteer.launch(launchOptions);
      logger.success('浏览器已启动');
    }

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
        // 检查浏览器是否还连接着
        if (!browser.isConnected()) {
          logger.warn('浏览器连接已断开，正在重新启动...');
          // 重新启动浏览器
          if (config.debugMode) {
            // 调试模式：重新连接
            let reconnected = false;
            for (let i = 0; i < 5; i++) {
              try {
                browser = await puppeteer.connect({
                  browserURL: `http://127.0.0.1:${config.debugPort}`,
                  slowMo: config.slowMo,
                  defaultViewport: null
                });
                reconnected = true;
                logger.success('已重新连接到 Chrome 浏览器');
                break;
              } catch (error) {
                if (i < 4) {
                  logger.info(`重新连接失败，${i + 1}/5 次重试...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }
            }
            if (!reconnected) {
              logger.error('无法重新连接到浏览器，停止运行');
              break;
            }
          } else {
            // 普通模式：重新启动
            const launchOptions = {
              headless: config.headless,
              slowMo: config.slowMo,
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--window-size=1920,1080',
                '--incognito',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--lang=en-US,en',
                '--disable-web-security',
                '--allow-running-insecure-content',
              ],
              defaultViewport: null,
              ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection']
            };
            if (config.chromePath) {
              launchOptions.executablePath = config.chromePath;
            }
            browser = await puppeteer.launch(launchOptions);
            logger.success('浏览器已重新启动');
          }
        } else {
          // 浏览器还在，清除缓存
          await clearBrowserData(browser);
        }
        
        logger.info('等待 5 秒后继续下一个注册...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    logger.error(`程序出错: ${error.message}`);
  } finally {
    // 关闭浏览器
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
      logger.info('浏览器已关闭');
    }
    // 关闭 Chrome 进程
    if (chromeProcess) {
      try {
        process.kill(-chromeProcess.pid);
      } catch (e) {
        try {
          chromeProcess.kill();
        } catch (e2) {}
      }
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
