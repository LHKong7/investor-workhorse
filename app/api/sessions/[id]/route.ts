import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionData,
  deleteSession,
  exportSession,
  exportSessionAsMarkdown,
  readSessionFile
} from '@/lib/session-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/sessions/[id] - Get session details
 * Query params:
 * - format: 'json' | 'markdown' (default: 'json')
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';
    const download = searchParams.get('download') === 'true';

    if (format === 'markdown') {
      // Export as Markdown
      const markdown = await exportSessionAsMarkdown(id);

      if (download) {
        return new NextResponse(markdown, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="session-${id}.md"`,
          },
        });
      }

      return NextResponse.json({ markdown });
    }

    // Get session data
    const data = await getSessionData(id);

    if (!data) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (download) {
      // Export as JSON for download
      const json = await exportSession(id);
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="session-${id}.json"`,
        },
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error getting session:', error);
    return NextResponse.json(
      { error: 'Failed to get session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sessions/[id] - Delete a session
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    await deleteSession(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
