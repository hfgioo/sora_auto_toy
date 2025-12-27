/**
 * Excel 和 JSON 导出工具
 */
import * as XLSX from 'xlsx';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { logger } from './logger.js';

const EXCEL_FILE = 'accounts.xlsx';
const TOKENS_FILE = 'tokens.json';

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取当前日期字符串 (YYYY-MM-DD)
 */
function getDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 保存 Token 到 JSON 文件（按日期分区，包含 sessionToken 和 accessToken）
 * @param {Object} tokenData - Token 数据
 * @param {string} tokenData.email - 邮箱
 * @param {string} tokenData.sessionToken - Session Token
 * @param {string} tokenData.accessToken - Access Token
 * @param {string} tokenData.createdAt - 创建时间
 */
function saveTokens(tokenData) {
  if (!tokenData.sessionToken && !tokenData.accessToken) {
    return;
  }

  try {
    let jsonData = {};

    // 如果文件存在，读取现有数据
    if (existsSync(TOKENS_FILE)) {
      const content = readFileSync(TOKENS_FILE, 'utf-8');
      jsonData = JSON.parse(content);
    }

    // 获取当前日期作为分区 key
    const dateKey = getDateString();

    // 确保日期分区存在
    if (!jsonData[dateKey]) {
      jsonData[dateKey] = [];
    }

    // 添加新的 token
    jsonData[dateKey].push({
      email: tokenData.email,
      sessionToken: tokenData.sessionToken || null,
      accessToken: tokenData.accessToken || null,
      createdAt: tokenData.createdAt || new Date().toISOString()
    });

    // 写入文件
    writeFileSync(TOKENS_FILE, JSON.stringify(jsonData, null, 2), 'utf-8');
    logger.success(`Token 已保存到 ${TOKENS_FILE} (分区: ${dateKey})`);
  } catch (error) {
    logger.error(`保存 Token JSON 失败: ${error.message}`);
  }
}

/**
 * 保存账户到 Excel 文件（带重试）
 * @param {Object} account - 账户信息
 * @param {string} account.email - 邮箱
 * @param {string} account.password - 密码
 * @param {string} account.status - 状态
 * @param {string} account.createdAt - 创建时间
 * @param {string} account.sessionToken - Session Token (可选)
 * @param {string} account.accessToken - Access Token (可选)
 */
export async function saveAccount(account, retries = 3) {
  // 保存 Token 到 JSON（sessionToken 和 accessToken 一起保存）
  if (account.sessionToken || account.accessToken) {
    saveTokens({
      email: account.email,
      sessionToken: account.sessionToken,
      accessToken: account.accessToken,
      createdAt: account.createdAt
    });
  }

  // 保存到 Excel
  for (let i = 0; i < retries; i++) {
    try {
      let workbook;
      let worksheet;
      let data = [];

      // 如果文件存在，读取现有数据
      if (existsSync(EXCEL_FILE)) {
        const fileBuffer = readFileSync(EXCEL_FILE);
        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        worksheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(worksheet);
      }

      // 添加新账户
      data.push({
        '邮箱': account.email,
        '密码': account.password,
        '状态': account.status,
        'Session Token': account.sessionToken || '',
        'Access Token': account.accessToken || '',
        '创建时间': account.createdAt || new Date().toISOString()
      });

      // 创建新的工作表
      worksheet = XLSX.utils.json_to_sheet(data);

      // 设置列宽
      worksheet['!cols'] = [
        { wch: 35 },  // 邮箱
        { wch: 25 },  // 密码
        { wch: 15 },  // 状态
        { wch: 100 }, // Session Token
        { wch: 150 }, // Access Token (JWT 较长)
        { wch: 25 }   // 创建时间
      ];

      // 创建或更新工作簿
      workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '账户列表');

      // 写入文件
      XLSX.writeFile(workbook, EXCEL_FILE);
      logger.success(`账户已保存到 ${EXCEL_FILE}`);
      return true;
    } catch (error) {
      if (i < retries - 1) {
        logger.warn(`保存 Excel 失败，${i + 1}/${retries} 次重试: ${error.message}`);
        await sleep(1000);
      } else {
        logger.error(`保存 Excel 失败: ${error.message}`);
        return false;
      }
    }
  }
}

/**
 * 获取所有已保存的账户
 * @returns {Array} 账户列表
 */
export function getAccounts() {
  if (!existsSync(EXCEL_FILE)) {
    return [];
  }

  const fileBuffer = readFileSync(EXCEL_FILE);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet);
}

/**
 * 获取所有 Token（按日期分区）
 * @returns {Object} 按日期分区的 Token 数据
 */
export function getTokens() {
  if (!existsSync(TOKENS_FILE)) {
    return {};
  }

  const content = readFileSync(TOKENS_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * 获取指定日期的 Token 列表
 * @param {string} date - 日期字符串 (YYYY-MM-DD)，默认为今天
 * @returns {Array} Token 列表
 */
export function getTokensByDate(date = null) {
  const tokens = getTokens();
  const dateKey = date || getDateString();
  return tokens[dateKey] || [];
}
