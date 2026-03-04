import { put, list, head, del } from '@vercel/blob';

/**
 * 安全的 head() 调用 - 处理 blob 不存在的错误
 */
async function safeHead(key: string): Promise<{ url: string } | null> {
  try {
    const blob = await head(key);
    return blob;
  } catch (error: any) {
    // 处理 "blob does not exist" 错误
    if (error.message?.includes('does not exist') ||
        error.message?.includes('not found') ||
        error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

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
  url: string; // Changed from path to url for blob storage
}

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AnalysisStep {
  stepId: string;
  type: 'info' | 'progress' | 'tool_call' | 'thinking' | 'result';
  title: string;
  description?: string;
  timestamp: string;
  duration?: number; // in milliseconds
  metadata?: Record<string, any>;
}

export interface SessionData {
  metadata: SessionMetadata;
  files: SessionFile[];
  messages: SessionMessage[];
  analysisSteps?: AnalysisStep[]; // 添加分析步骤数组
}

// Blob path prefixes
const SESSIONS_PREFIX = 'sessions/';

/**
 * Get the blob path for a session's metadata
 */
function getMetadataPath(sessionId: string): string {
  return `${SESSIONS_PREFIX}${sessionId}/metadata.json`;
}

/**
 * Get the blob path for a session's files index
 */
function getFilesIndexPath(sessionId: string): string {
  return `${SESSIONS_PREFIX}${sessionId}/files.json`;
}

/**
 * Get the blob path for a session's messages
 */
function getMessagesPath(sessionId: string): string {
  return `${SESSIONS_PREFIX}${sessionId}/messages.json`;
}

/**
 * Get the blob path for a session's analysis steps
 */
function getAnalysisStepsPath(sessionId: string): string {
  return `${SESSIONS_PREFIX}${sessionId}/analysis-steps.json`;
}

/**
 * Get the blob path for a session file
 */
function getFilePath(sessionId: string, fileName: string): string {
  return `${SESSIONS_PREFIX}${sessionId}/files/${fileName}`;
}

/**
 * Get all blobs for a specific session
 */
async function getSessionBlobs(sessionId: string) {
  const prefix = `${SESSIONS_PREFIX}${sessionId}/`;
  const result = await list({ prefix });
  return result.blobs;
}

/**
 * Initialize a new session
 */
export async function initializeSession(sessionId: string, title: string = 'Financial Analysis'): Promise<void> {
  const metadata: SessionMetadata = {
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title,
    fileCount: 0,
    messageCount: 0,
  };

  // Upload metadata to blob storage
  await put(getMetadataPath(sessionId), JSON.stringify(metadata, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true, // Allow overwriting metadata
  });

  // Initialize empty arrays
  await put(getFilesIndexPath(sessionId), JSON.stringify([], null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true, // Allow overwriting files index
  });

  await put(getMessagesPath(sessionId), JSON.stringify([], null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true, // Allow overwriting messages
  });
}

/**
 * Save a file to the session
 */
export async function saveSessionFile(
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  // Generate unique filename
  const timestamp = Date.now();
  const safeFileName = `${timestamp}-${fileName}`;
  const blobPath = getFilePath(sessionId, safeFileName);

  // Upload file to blob storage
  const { url } = await put(blobPath, buffer, {
    access: 'public',
    addRandomSuffix: false,
  });

  // Update files.json index
  const filesIndexPath = getFilesIndexPath(sessionId);
  const filesBlob = await safeHead(filesIndexPath);

  let files: SessionFile[] = [];
  if (filesBlob) {
    // Fetch the current files.json content
    const response = await fetch(filesBlob.url);
    files = await response.json();
  }

  files.push({
    name: safeFileName,
    originalName: fileName,
    uploadTime: new Date().toISOString(),
    size: buffer.length,
    url: url,
  });

  // Upload updated files.json
  await put(filesIndexPath, JSON.stringify(files, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true, // Allow overwriting files index
  });

  // Update metadata
  await updateMetadata(sessionId, { fileCount: files.length });

  return url;
}

/**
 * Add a message to the session
 */
export async function addSessionMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const messagesPath = getMessagesPath(sessionId);
  const messagesBlob = await safeHead(messagesPath);

  let messages: SessionMessage[] = [];
  if (messagesBlob) {
    const response = await fetch(messagesBlob.url);
    messages = await response.json();
  }

  messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  await put(messagesPath, JSON.stringify(messages, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true, // Allow overwriting messages
  });

  // Update metadata
  await updateMetadata(sessionId, { messageCount: messages.length });
}

/**
 * Update session metadata (or create if doesn't exist)
 */
async function updateMetadata(
  sessionId: string,
  updates: Partial<SessionMetadata>
): Promise<void> {
  const metadataPath = getMetadataPath(sessionId);
  const metadataBlob = await safeHead(metadataPath);

  let metadata: SessionMetadata;

  if (!metadataBlob) {
    // ✅ 如果 metadata 不存在，创建新的
    const now = new Date().toISOString();
    metadata = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      title: updates.title || 'New Session',
      fileCount: 0,
      messageCount: 0,
      ...updates,
    };
  } else {
    // ✅ 如果 metadata 存在，更新它
    const response = await fetch(metadataBlob.url);
    const existingMetadata: SessionMetadata = await response.json();
    metadata = {
      ...existingMetadata,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  await put(metadataPath, JSON.stringify(metadata, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true, // Allow overwriting metadata
  });
}

/**
 * Get all sessions
 */
export async function getAllSessions(): Promise<SessionMetadata[]> {
  try {
    const result = await list({ prefix: SESSIONS_PREFIX });

    // Find all unique session IDs by looking for metadata.json files
    const sessionIds = new Set<string>();
    for (const blob of result.blobs) {
      const match = blob.pathname.match(/^sessions\/([^\/]+)\/metadata\.json$/);
      if (match) {
        sessionIds.add(match[1]);
      }
    }

    const sessions: SessionMetadata[] = [];
    for (const sessionId of sessionIds) {
      try {
        const metadataPath = getMetadataPath(sessionId);
        const metadataBlob = await safeHead(metadataPath);
        if (metadataBlob) {
          const response = await fetch(metadataBlob.url);
          const metadata = await response.json();
          sessions.push(metadata);
        }
      } catch {
        // Skip invalid sessions
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error('Error getting all sessions:', error);
    return [];
  }
}

/**
 * Get complete session data
 */
export async function getSessionData(sessionId: string): Promise<SessionData | null> {
  try {
    const metadataPath = getMetadataPath(sessionId);
    const filesIndexPath = getFilesIndexPath(sessionId);
    const messagesPath = getMessagesPath(sessionId);
    const stepsPath = getAnalysisStepsPath(sessionId);

    const [metadataBlob, filesIndexBlob, messagesBlob] = await Promise.all([
      safeHead(metadataPath),
      safeHead(filesIndexPath),
      safeHead(messagesPath),
    ]);

    if (!metadataBlob || !filesIndexBlob || !messagesBlob) {
      return null;
    }

    const [metadata, files, messages] = await Promise.all([
      fetch(metadataBlob.url).then(r => r.json()),
      fetch(filesIndexBlob.url).then(r => r.json()),
      fetch(messagesBlob.url).then(r => r.json()),
    ]);

    // Get analysis steps if they exist
    let analysisSteps: AnalysisStep[] = [];
    const stepsBlob = await safeHead(stepsPath);
    if (stepsBlob) {
      try {
        const stepsResponse = await fetch(stepsBlob.url);
        analysisSteps = await stepsResponse.json();
      } catch (e) {
        analysisSteps = [];
      }
    }

    return {
      metadata,
      files,
      messages,
      analysisSteps,
    };
  } catch (error) {
    console.error('Error getting session data:', error);
    return null;
  }
}

/**
 * Delete a session and all its files
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    const blobs = await getSessionBlobs(sessionId);

    // Delete all blobs for this session
    await Promise.all(
      blobs.map(blob => del(blob.url))
    );
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
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
    markdown += `  - Size: ${(file.size / 1024).toFixed(2)} KB\n`;
    if (file.url) {
      markdown += `  - URL: ${file.url}\n`;
    }
    markdown += `\n`;
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
 * Get a session file (returns URL for blob storage)
 */
export async function getSessionFile(sessionId: string, fileName: string): Promise<string> {
  const filePath = getFilePath(sessionId, fileName);
  const fileBlob = await safeHead(filePath);

  if (!fileBlob) {
    throw new Error('File not found');
  }

  return fileBlob.url;
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

        const url = await saveSessionFile(sessionId, file_name, buffer);

        return `File saved successfully: ${file_name} (${(buffer.length / 1024).toFixed(2)} KB)\nURL: ${url}`;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return `Failed to save file: ${errorMessage}`;
      }
    },
  };
}

/**
 * Analysis Steps Management Functions
 */

/**
 * Add an analysis step to a session
 */
export async function addAnalysisStep(
  sessionId: string,
  step: Omit<AnalysisStep, 'stepId' | 'timestamp'>
): Promise<string> {
  const stepsPath = getAnalysisStepsPath(sessionId);
  const stepsBlob = await safeHead(stepsPath);

  let steps: AnalysisStep[] = [];

  if (stepsBlob) {
    try {
      const response = await fetch(stepsBlob.url);
      steps = await response.json();
    } catch (e) {
      // If parsing fails, start with empty array
      steps = [];
    }
  }

  // Create new step
  const newStep: AnalysisStep = {
    stepId: 'step-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    ...step,
  };

  steps.push(newStep);

  // Save updated steps
  await put(stepsPath, JSON.stringify(steps, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return newStep.stepId;
}

/**
 * Get all analysis steps for a session
 */
export async function getAnalysisSteps(sessionId: string): Promise<AnalysisStep[]> {
  const stepsPath = getAnalysisStepsPath(sessionId);
  const stepsBlob = await safeHead(stepsPath);

  if (!stepsBlob) {
    return [];
  }

  try {
    const response = await fetch(stepsBlob.url);
    const steps = await response.json();
    return steps || [];
  } catch (e) {
    return [];
  }
}

/**
 * Clear all analysis steps for a session
 */
export async function clearAnalysisSteps(sessionId: string): Promise<void> {
  const stepsPath = getAnalysisStepsPath(sessionId);
  
  // Save empty array
  await put(stepsPath, JSON.stringify([], null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
