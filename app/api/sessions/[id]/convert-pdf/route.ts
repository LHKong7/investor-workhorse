import { NextRequest, NextResponse } from 'next/server';
import { getSessionData, readSessionFile, saveSessionFileFromContent } from '@/lib/session-storage';
import { convertMarkdownToPDF, isMarkdownFile } from '@/lib/pdf-generator';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/sessions/[id]/convert-pdf - Convert a Markdown file in session to PDF
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { filename } = body;

    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

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

    // Check if it's a Markdown file
    if (!isMarkdownFile(filename)) {
      return NextResponse.json(
        { error: 'File is not a Markdown file' },
        { status: 400 }
      );
    }

    // Read the Markdown file
    const markdownBuffer = await readSessionFile(id, filename);
    const markdownContent = markdownBuffer.toString('utf-8');

    // Generate PDF
    const pdfBuffer = await convertMarkdownToPDF(
      markdownContent,
      file.originalName.replace(/\.(md|markdown)$/i, '')
    );

    // Generate PDF filename
    const pdfFilename = file.originalName.replace(/\.(md|markdown)$/i, '.pdf');

    // Save PDF to session
    const pdfPath = await saveSessionFileFromContent(id, pdfFilename, pdfBuffer);

    return NextResponse.json({
      success: true,
      message: 'PDF generated successfully',
      pdfFile: {
        name: pdfPath.split('/').pop() || pdfFilename,
        originalName: pdfFilename,
        size: pdfBuffer.length,
      },
    });
  } catch (error) {
    console.error('Error converting to PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to convert to PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
