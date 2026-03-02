import { NextRequest, NextResponse } from 'next/server';
import { AgentBuilder } from 'borderless-agent';
import { loadFinancialAnalystConfig, getModelConfig } from '@/lib/prompts';
import {
  initializeSession,
  addSessionMessage,
  getSessionData,
  createFileWriterTool
} from '@/lib/session-storage';
import { validateApiAuth } from '@/lib/api-auth';
import { getVerifiedSession } from '@/lib/api-auth';
import { recordUserUsageAsync, validateGoogleSheetsConfig } from '@/lib/google-sheets';

// Load configuration
const config = loadFinancialAnalystConfig();
const modelConfig = getModelConfig(config);

// Initialize the agent for chat with streaming enabled
const baseAgent = new AgentBuilder()
  .setLLM({
    apiKey: process.env.OPENAI_API_KEY!,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.MODEL_ID || modelConfig.model.default,
  })
  .setSystemPrompt(`You are a helpful financial analysis assistant. You help users understand and follow up on financial report analyses.

**Your Role:**
- Clarify and explain financial concepts and metrics
- Provide additional insights based on the analysis
- Answer follow-up questions about the financial reports
- Help users understand the implications of findings
- Suggest areas for deeper investigation when relevant

**Communication Style:**
- ${config.system.behavior.tone}
- ${config.system.behavior.style}
- Use clear, non-technical language when possible
- Provide examples to illustrate complex concepts

**Language:**
${config.system.language_support.instructions}

**Scope:**
- Stay within the bounds of the provided analysis
- Don't provide investment or legal advice
- Flag when questions require additional data or expertise
- Reference specific sections from the analysis when relevant`)
  .setIncludeBuiltinTools(modelConfig.tools.builtin)
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
    .setSystemPrompt(`You are a helpful financial analysis assistant. You help users understand and follow up on financial report analyses.

**Your Role:**
- Clarify and explain financial concepts and metrics
- Provide additional insights based on the analysis
- Answer follow-up questions about the financial reports
- Help users understand the implications of findings
- Suggest areas for deeper investigation when relevant

**Communication Style:**
- ${config.system.behavior.tone}
- ${config.system.behavior.style}
- Use clear, non-technical language when possible
- Provide examples to illustrate complex concepts

**Language:**
${config.system.language_support.instructions}

**Scope:**
- Stay within the bounds of the provided analysis
- Don't provide investment or legal advice
- Flag when questions require additional data or expertise
- Reference specific sections from the analysis when relevant`)
    .setIncludeBuiltinTools(modelConfig.tools.builtin)
    .enableStreaming(true)
    .addTool(fileWriterTool)
    .build();
}

export async function POST(req: NextRequest) {
  // 二次验证：确认请求中的认证状态
  const authError = await validateApiAuth(req);
  if (authError) {
    return authError;
  }

  // 获取已验证的会话信息（包含用户邮箱）
  const userSession = await getVerifiedSession(req);

  try {
    const { message, sessionId } = await req.json();

    // 异步记录用户使用情况（如果配置了 Google Sheets）
    if (userSession?.email && validateGoogleSheetsConfig().valid) {
      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      recordUserUsageAsync({
        timestamp,
        email: userSession.email,
        action: '使用 Agent 对话',
        messageLength: message.length,
        estimatedTokens: Math.ceil(message.length / 2), // 简单估算 token 数量
      });
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    // Get or create agent session
    const agentSession = baseAgent.restoreSession(sessionId ?? '') ?? baseAgent.createSession();

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          // Save user message to session
          await addSessionMessage(agentSession.id, 'user', message);

          // Get session-specific agent with file writer tool
          const sessionAgent = getAgentForSession(agentSession.id);
          const sessionWithTool = sessionAgent.restoreSession(agentSession.id) || sessionAgent.createSession();

          // Stream the response from agent
          const streamGenerator = sessionWithTool.stream(message);

          let fullContent = '';

          for await (const chunk of streamGenerator) {
            if (chunk.delta) {
              // Send content delta as it arrives
              fullContent += chunk.delta;
              sendEvent('chunk', {
                delta: chunk.delta,
                sessionId: agentSession.id,
              });
            }

            if (chunk.done) {
              const finalContent = chunk.reply || fullContent;

              // Save assistant response to session
              await addSessionMessage(agentSession.id, 'assistant', finalContent);

              // Send the final complete reply
              sendEvent('reply', {
                content: finalContent,
                sessionId: agentSession.id,
              });

              // Send completion event
              sendEvent('done', { sessionId: agentSession.id });

              break;
            }
          }

          controller.close();
        } catch (error) {
          console.error('Chat API error:', error);
          sendEvent('error', {
            error: error instanceof Error ? error.message : 'Failed to process chat message'
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
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}
