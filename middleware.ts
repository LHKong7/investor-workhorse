/**
 * Next.js 中间件 - 全局认证门卫
 * Next.js Middleware - Global Authentication Gatekeeper
 *
 * 功能 (Features):
 * - 拦截所有需要认证的路径
 * - 验证用户会话 Cookie
 * - 重定向未认证用户到登录页面
 * - 放行已认证用户
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, getCookieValue, isAuthPath, isProtectedPath } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ========================================
  // 1. 检查是否为认证相关的路径
  // Check if it's an authentication-related path
  // ========================================

  if (isAuthPath(pathname)) {
    // 如果已认证，访问登录页面时重定向到应用首页
    if (pathname === '/login') {
      const cookieHeader = request.headers.get('cookie') || '';
      const sessionToken = getCookieValue(cookieHeader, 'joygen_session');

      if (sessionToken) {
        const payload = await verifySessionToken(sessionToken);
        if (payload && payload.authenticated) {
          // 已认证用户重定向到应用页面
          return NextResponse.redirect(new URL('/app', request.url));
        }
      }
    }

    // 认证路径直接放行
    return NextResponse.next();
  }

  // ========================================
  // 2. 检查是否为需要认证的路径
  // Check if path requires authentication
  // ========================================

  if (isProtectedPath(pathname)) {
    // 获取会话 Cookie
    const cookieHeader = request.headers.get('cookie') || '';
    const sessionToken = getCookieValue(cookieHeader, 'joygen_session');

    // 如果没有会话 Token，重定向到登录页面
    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 验证 JWT Token
    const payload = await verifySessionToken(sessionToken);

    // 如果 Token 无效或已过期，重定向到登录页面
    if (!payload || !payload.authenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Token 有效，放行请求
    return NextResponse.next();
  }

  // ========================================
  // 3. 其他路径直接放行
  // Let other paths pass through
  // ========================================

  return NextResponse.next();
}

// ========================================
// 中间件配置 (Middleware Configuration)
// ========================================

export const config = {
  // 定义匹配规则
  matcher: [
    /*
     * 匹配所有路径除了:
     * - _next/static (静态文件)
     * - _next/image (图片优化文件)
     * - favicon.ico (网站图标)
     * - public folder 中的文件
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
