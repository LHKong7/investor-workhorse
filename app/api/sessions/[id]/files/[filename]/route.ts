import { NextRequest, NextResponse } from 'next/server';
import { readSessionFile } from '@/lib/session-storage';
import { getSessionData } from '@/lib/session-storage';

type RouteContext = {
  params: Promise<{ id: string; filename: string }>;
};

/**
 * GET /api/sessions/[id]/files/[filename] - Download a session file
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id, filename } = await context.params;

    // Verify session exists
    const sessionData = await getSessionData(id);
    if (!sessionData) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Find the file in session
    const file = sessionData.files.find(f => f.name === filename);
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read file content
    const buffer = await readSessionFile(id, filename);

    // Determine content type
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'json': 'application/json',
      'md': 'text/markdown',
    };

    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(buffer);

    // Properly encode filename for Content-Disposition header (RFC 5987)
    // This handles Chinese and other non-ASCII characters
    const encodedFilename = encodeURIComponent(file.originalName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');

    // Return file for download with properly encoded filename
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
