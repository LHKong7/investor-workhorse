/**
 * API 路由认证辅助函数
 * API Route Authentication Helper Functions
 *
 * 功能 (Features):
 * - 为 API 路由提供二次认证验证
 * - 验证请求中的 Cookie
 * - 提供统一的错误响应
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, getCookieValue } from './auth';

/**
 * 验证 API 请求的认证状态
 * Verify authentication status of API request
 *
 * @param request - Next.js 请求对象
 * @returns 如果验证失败返回错误响应，否则返回 null
 */
export async function validateApiAuth(request: NextRequest): Promise<NextResponse | null> {
  // 获取 Cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const sessionToken = getCookieValue(cookieHeader, 'joygen_session');

  // 如果没有会话 Token
  if (!sessionToken) {
    return NextResponse.json(
      {
        success: false,
        error: '未授权访问 (Unauthorized access)',
        code: 'NO_SESSION',
      },
      { status: 401 }
    );
  }

  // 验证 JWT Token
  const payload = await verifySessionToken(sessionToken);

  // 如果 Token 无效或已过期
  if (!payload || !payload.authenticated) {
    return NextResponse.json(
      {
        success: false,
        error: '会话已过期，请重新登录 (Session expired, please login again)',
        code: 'INVALID_SESSION',
      },
      { status: 401 }
    );
  }

  // 验证通过
  return null;
}

/**
 * 获取已验证的会话信息
 * Get verified session information
 *
 * @param request - Next.js 请求对象
 * @returns 会话信息或 null
 */
export async function getVerifiedSession(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || '';
  const sessionToken = getCookieValue(cookieHeader, 'joygen_session');

  if (!sessionToken) {
    return null;
  }

  const payload = await verifySessionToken(sessionToken);

  if (!payload || !payload.authenticated) {
    return null;
  }

  return payload;
}
