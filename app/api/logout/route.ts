/**
 * 登出 API 路由
 * Logout API Route
 *
 * 功能 (Features):
 * - 清除用户会话 Cookie
 * - 重定向到登录页面
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDeleteCookieString } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // 创建删除 Cookie 的响应
    const response = NextResponse.json({
      success: true,
      message: '登出成功 (Logout successful)',
      redirect: '/login',
    });

    // 设置删除 Cookie 的指令
    response.headers.set('Set-Cookie', createDeleteCookieString());

    return response;

  } catch (error) {
    console.error('Logout error:', error);

    return NextResponse.json(
      {
        success: false,
        error: '登出失败，请稍后重试 (Logout failed, please try again later)',
      },
      { status: 500 }
    );
  }
}

/**
 * 处理 GET 请求 - 同时支持 GET 方法登出
 * Handle GET request - Also support GET method for logout
 */
export async function GET(req: NextRequest) {
  try {
    // 创建重定向响应到登录页面
    const response = NextResponse.redirect(new URL('/login', req.url));

    // 设置删除 Cookie 的指令
    response.headers.set('Set-Cookie', createDeleteCookieString());

    return response;

  } catch (error) {
    console.error('Logout GET error:', error);

    // 即使出错也尝试重定向到登录页面
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
