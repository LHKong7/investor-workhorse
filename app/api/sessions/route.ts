import { NextRequest, NextResponse } from 'next/server';
import { getAllSessions } from '@/lib/blob-session-storage';

/**
 * GET /api/sessions - Get all sessions
 */
export async function GET() {
  try {
    const sessions = await getAllSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error getting sessions:', error);
    return NextResponse.json(
      { error: 'Failed to get sessions' },
      { status: 500 }
    );
  }
}
