/**
 * 认证系统辅助库
 * Authentication System Helper Library
 *
 * 功能 (Features):
 * - JWT token 生成和验证 (JWT token generation and verification)
 * - Cookie 设置和读取 (Cookie setting and reading)
 * - 访问令牌验证 (Access token verification)
 */

import { SignJWT, jwtVerify } from 'jose';

// ========================================
// 配置 (Configuration)
// ========================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
);

const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || '24', 10) * 60 * 60 * 1000; // 转换为毫秒

const AGENT_ACCESS_TOKEN = process.env.AGENT_ACCESS_TOKEN || 'joygen-beta-2026';

const COOKIE_NAME = 'joygen_session';

// ========================================
// 类型定义 (Type Definitions)
// ========================================

export interface SessionPayload {
  authenticated: boolean;
  email?: string; // 用户邮箱
  iat?: number;
  exp?: number;
  [key: string]: any; // Index signature for JWTPayload compatibility
}

// ========================================
// JWT 相关函数 (JWT Functions)
// ========================================

/**
 * 生成 JWT token
 * Generate JWT token
 */
export async function createSessionToken(email?: string): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = {
    authenticated: true,
    email: email, // 包含用户邮箱
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + SESSION_MAX_AGE) / 1000),
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  return token;
}

/**
 * 验证 JWT token
 * Verify JWT token
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

// ========================================
// 访问令牌验证 (Access Token Verification)
// ========================================

/**
 * 验证用户提供的访问令牌
 * Verify user-provided access token
 */
export function verifyAccessToken(token: string): boolean {
  // 移除可能的空格
  const cleanToken = token.trim();

  // 精确比对
  return cleanToken === AGENT_ACCESS_TOKEN;
}

// ========================================
// Cookie 相关函数 (Cookie Functions)
// ========================================

/**
 * 获取会话 Cookie 配置
 * Get session cookie configuration
 */
export function getSessionCookieConfig() {
  return {
    name: COOKIE_NAME,
    value: '', // 在使用时设置
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: SESSION_MAX_AGE / 1000, // 转换为秒
    },
  };
}

/**
 * 创建会话 Cookie 字符串
 * Create session cookie string
 */
export async function createSessionCookie(email?: string): Promise<string> {
  const token = await createSessionToken(email);
  const config = getSessionCookieConfig();

  const cookieValue = `${config.name}=${token}; HttpOnly; Path=/; SameSite=lax; Max-Age=${config.options.maxAge}`;

  if (config.options.secure) {
    return `${cookieValue}; Secure`;
  }

  return cookieValue;
}

/**
 * 创建删除 Cookie 字符串
 * Create delete cookie string
 */
export function createDeleteCookieString(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=lax; Max-Age=0`;
}

// ========================================
// 辅助函数 (Helper Functions)
// ========================================

/**
 * 从 Cookie 字符串中提取特定的 Cookie 值
 * Extract specific cookie value from cookie string
 */
export function getCookieValue(cookieString: string, name: string): string | undefined {
  const cookies = cookieString.split(';').map(cookie => cookie.trim());
  const targetCookie = cookies.find(cookie => cookie.startsWith(`${name}=`));
  return targetCookie ? targetCookie.substring(name.length + 1) : undefined;
}

/**
 * 检查是否为认证相关的路径
 * Check if it's an authentication-related path
 */
export function isAuthPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/api/login' || pathname === '/api/logout';
}

/**
 * 检查是否需要认证的路径
 * Check if path requires authentication
 */
export function isProtectedPath(pathname: string): boolean {
  // 保护聊天页面和所有 API 路由（除了认证相关的）
  if (pathname.startsWith('/chat') || pathname.startsWith('/app')) {
    return true;
  }

  // 保护特定的 API 路由
  const protectedApiPaths = ['/api/analyze', '/api/chat', '/api/sessions'];
  return protectedApiPaths.some(path => pathname.startsWith(path));
}
