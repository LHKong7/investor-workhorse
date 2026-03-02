/**
 * 登录 API 路由
 * Login API Route
 *
 * 功能 (Features):
 * - 验证用户提供的访问令牌
 * - 记录用户登录信息到 Google Sheets
 * - 签发包含邮箱的 JWT 会话凭证
 * - 设置 HTTP-Only Cookie
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, createSessionCookie, createDeleteCookieString } from '@/lib/auth';
import { recordUserLogin, validateGoogleSheetsConfig } from '@/lib/google-sheets';

export async function POST(req: NextRequest) {
  try {
    // 获取请求体
    const body = await req.json();
    const { token, email } = body;

    // 验证 Token 是否存在
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '请提供访问令牌 (Please provide access token)',
        },
        { status: 400 }
      );
    }

    // 验证邮箱是否提供
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: '请提供邮箱地址 (Please provide email address)',
        },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: '邮箱格式不正确 (Invalid email format)',
        },
        { status: 400 }
      );
    }

    // 验证 Token 是否正确
    const isValidToken = verifyAccessToken(token);

    if (!isValidToken) {
      // 清除可能存在的无效 Cookie
      const response = NextResponse.json(
        {
          success: false,
          error: '访问令牌无效 (Invalid access token)',
        },
        { status: 401 }
      );

      response.headers.set('Set-Cookie', createDeleteCookieString());
      return response;
    }

    // 记录用户登录信息到 Google Sheets（如果配置了）
    const googleSheetsConfigured = validateGoogleSheetsConfig().valid;
    if (googleSheetsConfigured) {
      try {
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        await recordUserLogin({
          timestamp,
          email,
          action: '首次登录',
          tokensUsed: 0,
        });
        console.log(`User login recorded: ${email} at ${timestamp}`);
      } catch (error) {
        // 记录失败不影响登录流程
        console.error('Failed to record user login to Google Sheets:', error);
      }
    } else {
      console.log('Google Sheets not configured, skipping user login recording');
    }

    // 创建包含邮箱的会话 Cookie
    const sessionCookie = await createSessionCookie(email);

    // 返回成功响应，设置 Cookie
    const response = NextResponse.json({
      success: true,
      message: '登录成功 (Login successful)',
      redirect: '/app',
      email,
      googleSheetsConfigured,
    });

    response.headers.set('Set-Cookie', sessionCookie);

    return response;

  } catch (error) {
    console.error('Login error:', error);

    return NextResponse.json(
      {
        success: false,
        error: '登录失败，请稍后重试 (Login failed, please try again later)',
      },
      { status: 500 }
    );
  }
}

/**
 * 处理 GET 请求 - 检查登录状态
 * Handle GET request - Check login status
 */
export async function GET(req: NextRequest) {
  try {
    // 获取 Cookie
    const cookieHeader = req.headers.get('cookie') || '';
    const sessionToken = cookieHeader
      .split(';')
      .find(cookie => cookie.trim().startsWith('joygen_session='))
      ?.split('=')[1];

    if (!sessionToken) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: '未登录 (Not authenticated)',
      });
    }

    // 这里可以添加 JWT 验证逻辑
    // 简化版本只检查 Cookie 是否存在
    return NextResponse.json({
      success: true,
      authenticated: true,
    });

  } catch (error) {
    console.error('Check login status error:', error);

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: '检查登录状态失败 (Failed to check login status)',
      },
      { status: 500 }
    );
  }
}
