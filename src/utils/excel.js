/**
 * Excel 导出工具
 */
import * as XLSX from 'xlsx';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { logger } from './logger.js';

const EXCEL_FILE = 'accounts.xlsx';

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 保存账户到 Excel 文件（带重试）
 * @param {Object} account - 账户信息
 * @param {string} account.email - 邮箱
 * @param {string} account.password - 密码
 * @param {string} account.status - 状态
 * @param {string} account.createdAt - 创建时间
 * @param {string} account.sessionToken - Session Token (可选)
 */
export async function saveAccount(account, retries = 3) {
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
