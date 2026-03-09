import fs from 'fs/promises';
import path from 'path';
import { mkdir, writeFile, appendFile, readFile, readdir, stat } from 'fs/promises';

export interface SessionMetadata {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  fileCount: number;
  messageCount: number;
}

export interface SessionFile {
  name: string;
  originalName: string;
  uploadTime: string;
  size: number;
  path: string;
}

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  reasoning_content?: string; // 思考过程内容
}

export interface SessionData {
  metadata: SessionMetadata;
  files: SessionFile[];
  messages: SessionMessage[];
}

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

/**
 * Ensure sessions directory exists
 */
async function ensureSessionsDir(): Promise<void> {
  try {
    await mkdir(SESSIONS_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

/**
 * Get session directory path
 */
function getSessionDir(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId);
}

/**
 * Initialize a new session folder
 */
export async function initializeSession(sessionId: string, title: string = 'Financial Analysis'): Promise<void> {
  await ensureSessionsDir();

  const sessionDir = getSessionDir(sessionId);
  await mkdir(sessionDir, { recursive: true });

  // Create subdirectories
  await mkdir(path.join(sessionDir, 'files'), { recursive: true });
  await mkdir(path.join(sessionDir, 'messages'), { recursive: true });

  // Initialize metadata
  const metadata: SessionMetadata = {
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title,
    fileCount: 0,
    messageCount: 0,
  };

  await writeFile(
    path.join(sessionDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  // Initialize empty arrays
  await writeFile(
    path.join(sessionDir, 'files.json'),
    JSON.stringify([], null, 2)
  );

  await writeFile(
    path.join(sessionDir, 'messages.json'),
    JSON.stringify([], null, 2)
  );
}

/**
 * Save a file to the session
 */
export async function saveSessionFile(
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const sessionDir = getSessionDir(sessionId);
  const filesDir = path.join(sessionDir, 'files');

  // Generate unique filename
  const timestamp = Date.now();
  const safeFileName = `${timestamp}-${fileName}`;
  const filePath = path.join(filesDir, safeFileName);

  // Save file
  await writeFile(filePath, buffer);

  // Update files.json
  const filesPath = path.join(sessionDir, 'files.json');
  const files: SessionFile[] = JSON.parse(await readFile(filesPath, 'utf-8'));

  files.push({
    name: safeFileName,
    originalName: fileName,
    uploadTime: new Date().toISOString(),
    size: buffer.length,
    path: filePath,
  });

  await writeFile(filesPath, JSON.stringify(files, null, 2));

  // Update metadata
  await updateMetadata(sessionId, { fileCount: files.length });

  return filePath;
}

/**
 * Add a message to the session
 */
export async function addSessionMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  reasoningContent?: string // 可选的思考过程内容
): Promise<void> {
  const sessionDir = getSessionDir(sessionId);
  const messagesPath = path.join(sessionDir, 'messages.json');

  const messages: SessionMessage[] = JSON.parse(await readFile(messagesPath, 'utf-8'));

  const message: SessionMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  // 如果提供了思考过程，添加到消息中
  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }

  messages.push(message);

  await writeFile(messagesPath, JSON.stringify(messages, null, 2));

  // Update metadata
  await updateMetadata(sessionId, { messageCount: messages.length });
}

/**
 * Update session metadata
 */
async function updateMetadata(
  sessionId: string,
  updates: Partial<SessionMetadata>
): Promise<void> {
  const sessionDir = getSessionDir(sessionId);
  const metadataPath = path.join(sessionDir, 'metadata.json');

  const metadata: SessionMetadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

  const updated = {
    ...metadata,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(metadataPath, JSON.stringify(updated, null, 2));
}

/**
 * Get all sessions
 */
export async function getAllSessions(): Promise<SessionMetadata[]> {
  await ensureSessionsDir();

  try {
    const sessionDirs = await readdir(SESSIONS_DIR);
    const sessions: SessionMetadata[] = [];

    for (const dir of sessionDirs) {
      const metadataPath = path.join(SESSIONS_DIR, dir, 'metadata.json');
      try {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
        sessions.push(metadata);
      } catch {
        // Skip invalid sessions
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Get complete session data
 */
export async function getSessionData(sessionId: string): Promise<SessionData | null> {
  const sessionDir = getSessionDir(sessionId);

  try {
    const [metadata, files, messages] = await Promise.all([
      readFile(path.join(sessionDir, 'metadata.json'), 'utf-8'),
      readFile(path.join(sessionDir, 'files.json'), 'utf-8'),
      readFile(path.join(sessionDir, 'messages.json'), 'utf-8'),
    ]);

    return {
      metadata: JSON.parse(metadata),
      files: JSON.parse(files),
      messages: JSON.parse(messages),
    };
  } catch {
    return null;
  }
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const sessionDir = getSessionDir(sessionId);
  await fs.rm(sessionDir, { recursive: true, force: true });
}

/**
 * Export session as JSON
 */
export async function exportSession(sessionId: string): Promise<string> {
  const data = await getSessionData(sessionId);
  if (!data) {
    throw new Error('Session not found');
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Export session as Markdown
 */
export async function exportSessionAsMarkdown(sessionId: string): Promise<string> {
  const data = await getSessionData(sessionId);
  if (!data) {
    throw new Error('Session not found');
  }

  let markdown = `# ${data.metadata.title}\n\n`;
  markdown += `**Session ID:** ${data.metadata.sessionId}\n`;
  markdown += `**Created:** ${new Date(data.metadata.createdAt).toLocaleString()}\n`;
  markdown += `**Updated:** ${new Date(data.metadata.updatedAt).toLocaleString()}\n\n`;

  markdown += `## Files (${data.metadata.fileCount})\n\n`;
  for (const file of data.files) {
    markdown += `- **${file.originalName}**\n`;
    markdown += `  - Uploaded: ${new Date(file.uploadTime).toLocaleString()}\n`;
    markdown += `  - Size: ${(file.size / 1024).toFixed(2)} KB\n\n`;
  }

  markdown += `## Conversation (${data.metadata.messageCount} messages)\n\n`;
  for (const msg of data.messages) {
    const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
    markdown += `### ${role}\n`;
    markdown += `*${new Date(msg.timestamp).toLocaleString()}*\n\n`;
    markdown += `${msg.content}\n\n`;
    markdown += `---\n\n`;
  }

  return markdown;
}

/**
 * Read a session file
 */
export async function readSessionFile(sessionId: string, fileName: string): Promise<Buffer> {
  const filePath = path.join(getSessionDir(sessionId), 'files', fileName);
  return await readFile(filePath);
}

/**
 * Save generated content as a file in the session
 */
export async function saveSessionFileFromContent(
  sessionId: string,
  fileName: string,
  content: string | Buffer
): Promise<string> {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  return await saveSessionFile(sessionId, fileName, buffer);
}

/**
 * Create a custom file writer tool for agent
 */
export function createFileWriterTool(sessionId: string) {
  return {
    name: 'save_file',
    description: 'Save content to a file in the current session. Use this to save generated reports, charts, data exports, or any other output.',
    parameters: {
      file_name: {
        type: 'string',
        description: 'The name of the file to save (e.g., "financial_summary.txt", "analysis.csv", "chart.png").',
      },
      content: {
        type: 'string',
        description: 'The content to save to the file. For binary data, use base64 encoding.',
      },
      encoding: {
        type: 'string',
        description: 'Content encoding: "text" (default) or "base64" for binary data.',
        enum: ['text', 'base64'],
      },
    },
    required: ['file_name', 'content'],
    execute: async (args: Record<string, any>) => {
      try {
        const { file_name, content, encoding = 'text' } = args;

        let buffer: Buffer;
        if (encoding === 'base64') {
          // Remove data URI prefix if present
          const base64Data = content.replace(/^data:[^,]+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          buffer = Buffer.from(content, 'utf-8');
        }

        const filePath = await saveSessionFile(sessionId, file_name, buffer);

        return `File saved successfully: ${file_name} (${(buffer.length / 1024).toFixed(2)} KB)`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return `Failed to save file: ${errorMessage}`;
      }
    },
  };
}
