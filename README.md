<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Puppeteer-23.x-orange?style=flat-square&logo=puppeteer" alt="Puppeteer">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<h1 align="center">Sora Auto Toy</h1>

<p align="center">
  <b>一个基于 Puppeteer 的浏览器自动化学习项目</b><br>
  <sub>探索 Web 自动化、反检测技术、表单交互的最佳实践</sub>
</p>

---

## 声明

> **本项目仅供学习研究 Web 自动化技术使用**
>
> 旨在帮助开发者深入理解 Puppeteer 浏览器自动化、反检测机制、页面交互等核心技术

### 禁止事项

| 禁止行为 | 说明 |
|---------|------|
| 商业用途 | 禁止将本项目用于任何商业目的 |
| 账户交易 | 禁止批量注册账户进行倒卖或非法交易 |
| 违反条款 | 禁止进行任何违反 OpenAI 服务条款的行为 |
| 滥用行为 | 禁止进行垃圾账户注册、刷量等滥用行为 |
| 违法活动 | 禁止用于任何违反当地法律法规的活动 |
| 攻击行为 | 禁止对目标网站进行攻击、压力测试或造成服务中断 |

### 免责声明

1. 本项目作者不对任何因使用本项目而产生的直接或间接损失负责
2. 使用者需自行承担使用本项目所带来的一切风险和法律责任
3. 本项目不提供任何形式的担保，包括但不限于适销性和特定用途适用性
4. **如果您不同意以上条款，请立即删除本项目**

---

## 特性

- **Stealth 模式** - 集成 puppeteer-extra-plugin-stealth，有效规避自动化检测
- **智能等待** - 多重等待策略，自适应页面加载状态
- **错误恢复** - 完善的异常处理和重试机制，提高稳定性
- **模块化设计** - 清晰的代码结构，易于理解和扩展
- **调试友好** - 自动截图、详细日志，快速定位问题
- **数据导出** - 支持 Excel 格式导出，方便数据管理

## 技术栈

```
Node.js (ES Modules)     - 运行环境
Puppeteer-Extra          - 浏览器自动化框架
Stealth Plugin           - 反检测插件
xlsx                     - Excel 文件处理
dotenv                   - 环境变量管理
```

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/hfgioo/sora_auto_toy.git
cd sora_auto_toy
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置文件
# Windows: notepad .env
# macOS/Linux: nano .env
```

### 4. 运行程序

```bash
# 启动
npm start

# 开发模式 (文件变更自动重启)
npm run dev
```

## 配置说明

| 配置项 | 说明 | 默认值 |
|-------|------|--------|
| `DEFAULT_PASSWORD` | 账户密码 | `YourSecurePassword123!` |
| `HEADLESS` | 无头模式 | `false` |
| `SLOW_MO` | 操作延迟(ms) | `50` |
| `NAVIGATION_TIMEOUT` | 导航超时(ms) | `60000` |
| `WAIT_FOR_EMAIL_TIMEOUT` | 邮件等待超时(ms) | `120000` |
| `CHROME_PATH` | Chrome 路径 | 自动检测 |

> 详细配置请参考 [.env.example](.env.example)

## 项目结构

```
sora-auto-toy/
├── src/
│   ├── index.js              # 主程序入口
│   ├── modules/
│   │   ├── register.js       # 注册流程控制
│   │   └── tempmail.js       # 临时邮箱服务
│   └── utils/
│       ├── logger.js         # 日志工具
│       └── excel.js          # Excel 导出
├── screenshots/              # 调试截图
├── name.txt                  # 名字列表
├── .env.example              # 配置模板
├── package.json
└── README.md
```

## 核心技术点

### 1. 反检测技术

```javascript
// 使用 Stealth 插件隐藏自动化特征
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

// 自定义 User-Agent
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...');

// 禁用自动化标识
args: ['--disable-blink-features=AutomationControlled']
```

### 2. 智能等待策略

```javascript
// 等待页面加载完成 (loading 消失)
async waitForPageLoad(timeout = 30000) {
  // 检测 loading 指示器
  // 处理页面导航中的上下文销毁
}

// 安全执行 evaluate (处理导航异常)
async safeEvaluate(fn, defaultValue, retries = 3) {
  // 自动重试机制
}
```

### 3. 多选择器策略

```javascript
// 按优先级尝试多种选择器
const selectors = [
  'input[name="username"]',
  'input[autocomplete="username"]',
  'input[placeholder*="username" i]',
  // ...
];
```

## 运行截图

```
╔═══════════════════════════════════════════════════════════╗
║           Sora 自动化注册工具 v1.0.0                      ║
║                                                           ║
║  注意: 此工具仅供学习研究使用                             ║
║  请遵守 OpenAI 的服务条款                                 ║
║                                                           ║
║  按 Ctrl+C 停止注册                                       ║
╚═══════════════════════════════════════════════════════════╝

[INFO] 配置信息:
[INFO] - 模式: 持续注册 (按 Ctrl+C 停止)
[INFO] - 无头模式: false
[INFO] - 慢动作延迟: 50ms
[SUCCESS] 浏览器已启动

========== 开始第 1 个账户注册 ==========

[STEP 1] 正在打开 Sora 注册页面...
[SUCCESS] Sora 页面已打开
[STEP 2] 正在点击 Log in 按钮...
[SUCCESS] 已点击 Log in 按钮
...
```

## 常见问题

<details>
<summary><b>Q: 提示找不到 Chrome 浏览器？</b></summary>

在 `.env` 文件中配置 `CHROME_PATH`：

```env
# Windows
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# macOS
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Linux
CHROME_PATH=/usr/bin/google-chrome
```
</details>

<details>
<summary><b>Q: 页面加载超时怎么办？</b></summary>

1. 检查网络连接
2. 增加超时时间：`NAVIGATION_TIMEOUT=120000`
3. 增加操作延迟：`SLOW_MO=100`
</details>

<details>
<summary><b>Q: 如何查看调试信息？</b></summary>

- 设置 `HEADLESS=false` 查看浏览器操作
- 查看 `screenshots/` 目录下的调试截图
- 查看控制台日志输出
</details>

## 学习资源

- [Puppeteer 官方文档](https://pptr.dev/)
- [puppeteer-extra 插件系统](https://github.com/berstend/puppeteer-extra)
- [Web 自动化测试最佳实践](https://developer.chrome.com/docs/puppeteer/)

## 贡献

欢迎提交 Issue 和 Pull Request！

## License

[MIT](LICENSE) - 仅供学习研究使用

---

<p align="center">
  <b>本项目仅供学习研究，请勿用于任何违规用途</b><br>
  <sub>使用者需遵守相关法律法规及目标网站的服务条款</sub>
</p>
