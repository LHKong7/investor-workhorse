import { NextRequest, NextResponse } from 'next/server';
import { AgentBuilder } from 'borderless-agent';
import mammoth from 'mammoth';
import PDFParser from 'pdf2json';
import { generateFinancialAnalystSystemPrompt, loadFinancialAnalystConfig, getModelConfig } from '@/lib/prompts';
import {
  initializeSession,
  saveSessionFile,
  addSessionMessage,
  getSessionData,
  createFileWriterTool
} from '@/lib/session-storage';
import { validateApiAuth } from '@/lib/api-auth';

// Load configuration and generate system prompt
const config = loadFinancialAnalystConfig();
const systemPrompt = generateFinancialAnalystSystemPrompt(config);
const modelConfig = getModelConfig(config);

console.log("Financial Analyst System Prompt:\n", systemPrompt);

// Initialize the agent for financial analysis with streaming enabled
const baseAgent = new AgentBuilder()
  .setLLM({
    apiKey: process.env.OPENAI_API_KEY!,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.MODEL_ID || modelConfig.model.default,
  })
  .setSystemPrompt(systemPrompt)
  .setIncludeBuiltinTools(true)
  .enableStreaming(true)  // Enable streaming
  .build();

// Create a function to get agent with session-specific tools
function getAgentForSession(sessionId: string) {
  const fileWriterTool = createFileWriterTool(sessionId);

  return new AgentBuilder()
    .setLLM({
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.MODEL_ID || modelConfig.model.default,
    })
    .setSystemPrompt(systemPrompt)
    .setIncludeBuiltinTools(true)
    .enableStreaming(true)
    .addTool(fileWriterTool)
    .build();
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    // Suppress pdf.js warnings
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      const msg = args[0];
      if (typeof msg === 'string' && (
        msg.includes('Setting up fake worker') ||
        msg.includes('TT:') ||
        msg.includes('complementing a missing function')
      )) {
        return; // Suppress these warnings
      }
      originalWarn.apply(console, args);
    };

    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      console.warn = originalWarn; // Restore console.warn
      reject(new Error(`PDF parsing error: ${errData?.parserError || errData}`));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      console.warn = originalWarn; // Restore console.warn
      try {
        let fullText = '';

        // Access pages directly from the root
        const pages = pdfData.Pages || pdfData.formImage?.Pages;

        if (pages && Array.isArray(pages)) {
          pages.forEach((page: any) => {
            if (page.Texts) {
              page.Texts.forEach((text: any) => {
                if (text.R && text.R.length > 0) {
                  text.R.forEach((r: any) => {
                    if (r.T) {
                      try {
                        fullText += decodeURIComponent(r.T) + ' ';
                      } catch {
                        fullText += r.T + ' ';
                      }
                    }
                  });
                }
              });
            }
            fullText += '\n';
          });
        }

        // Also try to get raw text if available
        if (!fullText.trim() && typeof pdfParser.getRawTextContent === 'function') {
          try {
            const rawText = pdfParser.getRawTextContent();
            if (rawText && rawText.trim().length > 0) {
              fullText = rawText;
            }
          } catch (e) {
            // Ignore raw text extraction errors
          }
        }

        resolve(fullText.trim());
      } catch (error) {
        reject(error);
      }
    });

    // Parse the PDF buffer
    pdfParser.parseBuffer(buffer);
  });
}

async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return await extractTextFromPDF(buffer);
  } else if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else if (
    fileType === 'text/plain' ||
    fileName.endsWith('.txt')
  ) {
    return buffer.toString('utf-8');
  } else {
    throw new Error('Unsupported file type');
  }
}

export async function POST(req: NextRequest) {
  // 二次验证：确认请求中的认证状态
  const authError = await validateApiAuth(req);
  if (authError) {
    return authError;
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExtension) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload PDF, DOCX, or TXT files.' },
        { status: 400 }
      );
    }

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          // Send start event
          sendEvent('start', { fileName: file.name });

          // Extract text from file
          sendEvent('progress', { stage: 'parsing', message: 'Reading file...' });

          let fileContent: string;
          try {
            fileContent = await extractTextFromFile(file);
          } catch (error) {
            console.error('Error extracting text from file:', error);
            sendEvent('error', { error: 'Failed to read file content' });
            controller.close();
            return;
          }

          // Check if content was extracted
          if (!fileContent || fileContent.trim().length === 0) {
            sendEvent('error', { error: 'No readable content found in the file' });
            controller.close();
            return;
          }

          sendEvent('progress', {
            stage: 'analyzing',
            message: 'Analyzing financial report...',
            textLength: fileContent.length
          });

          // Get or create session
          let session = baseAgent.restoreSession(sessionId ?? '');

          if (!session) {
            // Create new session
            session = baseAgent.createSession();
            // Initialize session folder
            await initializeSession(session.id, `Financial Analysis - ${file.name}`);
          }

          // Get session-specific agent with file writer tool
          const sessionAgent = getAgentForSession(session.id);
          const sessionWithTool = sessionAgent.restoreSession(session.id) || sessionAgent.createSession();

          // Save the uploaded file to session
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          await saveSessionFile(session.id, file.name, buffer);

          // Add user message (file upload) to session
          await addSessionMessage(session.id, 'user', `[Uploaded file: ${file.name}]\n\nFile content analysis request:`);

          // Analyze the financial report with streaming
          const analysisPrompt = `Please analyze the following financial report content and provide a comprehensive analysis:\n\n${fileContent}`;

          // Stream the analysis
          const streamGenerator = sessionWithTool.stream(analysisPrompt);

          let fullContent = '';

          for await (const chunk of streamGenerator) {
            if (chunk.delta) {
              // Send content delta as it arrives
              fullContent += chunk.delta;
              sendEvent('chunk', {
                delta: chunk.delta,
                sessionId: session.id,
              });
            }

            if (chunk.done) {
              const finalContent = chunk.reply || fullContent;

              // Save assistant response to session
              await addSessionMessage(session.id, 'assistant', finalContent);

              // Get session data to include files
              const sessionData = await getSessionData(session.id);

              // Send the final complete analysis
              sendEvent('analysis', {
                content: finalContent,
                sessionId: session.id,
                fileName: file.name,
                files: sessionData?.files || [],
              });

              // Send completion event with files
              sendEvent('done', {
                sessionId: session.id,
                fileName: file.name,
                files: sessionData?.files || [],
              });

              break;
            }
          }

          controller.close();
        } catch (error) {
          console.error('Analysis API error:', error);
          sendEvent('error', {
            error: error instanceof Error ? error.message : 'Failed to analyze financial report'
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze financial report' },
      { status: 500 }
    );
  }
}
