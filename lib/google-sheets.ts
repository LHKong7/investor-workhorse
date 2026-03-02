/**
 * Google Sheets 辅助库
 * Google Sheets Helper Library
 *
 * 功能 (Features):
 * - 连接 Google Sheets API
 * - 记录用户登录信息
 * - 记录用户使用情况
 * - 管理表格数据
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// ========================================
// 配置 (Configuration)
// ========================================

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const SHEET_TITLE = process.env.GOOGLE_SHEET_TITLE || 'Users';
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || '';
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// ========================================
// 类型定义 (Type Definitions)
// ========================================

export interface UserLoginRecord {
  timestamp: string;
  email: string;
  action: string; // 例如: "首次登录", "再次登录", "使用 Agent 对话"
  tokensUsed?: number; // 可选：消耗的 token 数量
  metadata?: Record<string, any>; // 可选：额外的元数据
}

export interface UsageRecord {
  timestamp: string;
  email: string;
  action: string;
  messageLength: number;
  estimatedTokens?: number;
}

// ========================================
// 辅助函数 (Helper Functions)
// ========================================

/**
 * 验证 Google Sheets 配置是否完整
 * Validate Google Sheets configuration
 */
export function validateGoogleSheetsConfig(): { valid: boolean; error?: string } {
  if (!SPREADSHEET_ID) {
    return { valid: false, error: 'GOOGLE_SHEET_ID is not configured' };
  }

  if (!GOOGLE_CLIENT_EMAIL) {
    return { valid: false, error: 'GOOGLE_CLIENT_EMAIL is not configured' };
  }

  if (!GOOGLE_PRIVATE_KEY || GOOGLE_PRIVATE_KEY.includes('Your_Private_Key_Here')) {
    return { valid: false, error: 'GOOGLE_PRIVATE_KEY is not configured' };
  }

  return { valid: true };
}

/**
 * 获取 Google Sheets 文档实例
 * Get Google Spreadsheet instance
 */
async function getSpreadsheet(): Promise<GoogleSpreadsheet> {
  // 验证配置
  const validation = validateGoogleSheetsConfig();
  if (!validation.valid) {
    throw new Error(`Google Sheets configuration error: ${validation.error}`);
  }

  // 1. 初始化 Google Auth JWT 客户端
  // 必须处理 private_key 中的换行符，否则在 .env 中读取时会导致签名失效
  const serviceAccountAuth = new JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  // 2. 将 Auth 客户端传入 Spreadsheet 实例
  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

  try {
    // 3. 加载文档信息以验证连接是否成功
    await doc.loadInfo();
    return doc;
  } catch (error) {
    console.error('Google Sheets authentication failed:', error);
    throw new Error('Failed to authenticate with Google Sheets API');
  }
}

/**
 * 获取或创建工作表
 * Get or create worksheet
 */
async function getOrCreateWorksheet(doc: GoogleSpreadsheet) {
  // 检查工作表是否存在
  let sheet = doc.sheetsByTitle[SHEET_TITLE];

  if (!sheet) {
    // 如果不存在，创建新工作表
    sheet = await doc.addSheet({
      title: SHEET_TITLE,
      headerValues: ['时间戳', '邮箱', '操作类型', 'Token使用量', '元数据'],
    });
  } else {
    // 加载表头
    await sheet.loadHeaderRow();
  }

  return sheet;
}

/**
 * 记录用户登录信息到 Google Sheets
 * Record user login information to Google Sheets
 */
export async function recordUserLogin(record: UserLoginRecord): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await getSpreadsheet();
    const sheet = await getOrCreateWorksheet(doc);

    // 添加新行
    await sheet.addRow({
      时间戳: record.timestamp,
      邮箱: record.email,
      操作类型: record.action,
      Token使用量: record.tokensUsed || 0,
      元数据: record.metadata ? JSON.stringify(record.metadata) : '',
    });

    return { success: true };
  } catch (error) {
    console.error('Error recording user login to Google Sheets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 记录用户使用情况到 Google Sheets
 * Record user usage to Google Sheets
 */
export async function recordUserUsage(record: UsageRecord): Promise<{ success: boolean; error?: string }> {
  try {
    const doc = await getSpreadsheet();
    const sheet = await getOrCreateWorksheet(doc);

    // 添加新行
    await sheet.addRow({
      时间戳: record.timestamp,
      邮箱: record.email,
      操作类型: record.action,
      Token使用量: record.estimatedTokens || 0,
      元数据: record.messageLength ? JSON.stringify({ messageLength: record.messageLength }) : '',
    });

    return { success: true };
  } catch (error) {
    console.error('Error recording user usage to Google Sheets:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 异步记录用户使用情况（不阻塞主流程）
 * Asynchronously record user usage (non-blocking)
 */
export async function recordUserUsageAsync(record: UsageRecord): Promise<void> {
  // 异步执行，不等待结果
  recordUserUsage(record).catch(error => {
    console.error('Async usage recording failed:', error);
  });
}

/**
 * 获取用户的历史记录
 * Get user history records
 */
export async function getUserHistory(email: string, limit: number = 10): Promise<UserLoginRecord[]> {
  try {
    const doc = await getSpreadsheet();
    const sheet = await getOrCreateWorksheet(doc);

    // 获取所有行
    const rows = await sheet.getRows();

    // 过滤特定用户的记录
    const userRecords = rows
      .filter(row => row.get('邮箱') === email)
      .slice(-limit) // 获取最近的记录
      .map(row => ({
        timestamp: row.get('时间戳') as string,
        email: row.get('邮箱') as string,
        action: row.get('操作类型') as string,
        tokensUsed: parseInt(row.get('Token使用量') as string) || 0,
        metadata: row.get('元数据') ? JSON.parse(row.get('元数据') as string) : undefined,
      }));

    return userRecords;
  } catch (error) {
    console.error('Error getting user history:', error);
    return [];
  }
}
