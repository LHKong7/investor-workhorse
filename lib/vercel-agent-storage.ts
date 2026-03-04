/**
 * Vercel Blob Storage Backend for borderless-agent
 *
 * 使用 @vercel/blob 作为 borderless-agent 的存储后端
 *
 * 用法:
 * ```typescript
 * import { createVercelBlobStorage } from '@/lib/vercel-agent-storage';
 *
 * const agent = new AgentBuilder()
 *   .setLLM({ apiKey: '...', model: 'gpt-4' })
 *   .setStorage({ backend: 'memory', custom: createVercelBlobStorage() })
 *   .build();
 * ```
 */

import { put, list, head } from '@vercel/blob';
import { StorageBackend, SessionStore, MemoryStore, ContextStore } from 'borderless-agent';

// Prefixes for different data types in Blob storage
const SESSIONS_PREFIX = 'agent-sessions/sessions/';
const MEMORY_PREFIX = 'agent-sessions/memory/';
const CONTEXTS_PREFIX = 'agent-sessions/contexts/';

/**
 * Vercel Blob Session Store
 * 存储和检索 agent session 数据
 */
export class VercelBlobSessionStore implements SessionStore {
  private cache = new Map<string, Record<string, any>>();

  private getKey(sessionId: string): string {
    return `${SESSIONS_PREFIX}${sessionId}.json`;
  }

  async get(sessionId: string): Promise<Record<string, any> | null> {
    // Check cache first
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId)!;
    }

    try {
      const blob = await head({ key: this.getKey(sessionId) });
      if (!blob) {
        return null;
      }

      // Fetch data from blob URL
      const response = await fetch(blob.url);
      const data = await response.json();

      this.cache.set(sessionId, data);
      return data;
    } catch (error: any) {
      // Handle "blob does not exist" error
      if (error.message?.includes('does not exist') ||
          error.message?.includes('not found') ||
          error.statusCode === 404) {
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async put(sessionId: string, data: Record<string, any>): Promise<void> {
    const key = this.getKey(sessionId);
    const content = JSON.stringify(data, null, 2);

    await put(key, content, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    this.cache.set(sessionId, data);
  }

  async listIds(): Promise<string[]> {
    try {
      const result = await list({
        prefix: SESSIONS_PREFIX,
      });

      return result.blobs
        .map(blob => {
          // Extract sessionId from path: agent-sessions/sessions/{sessionId}.json
          const match = blob.pathname.match(/\/([^/]+)\.json$/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
    } catch (error) {
      console.error('Failed to list session IDs:', error);
      return [];
    }
  }

  async listSummaries(limit?: number): Promise<Record<string, any>[]> {
    const sessionIds = await this.listIds();
    const summaries: Record<string, any>[] = [];

    for (const sessionId of sessionIds) {
      const data = await this.get(sessionId);
      if (data) {
        summaries.push({
          id: sessionId,
          created_at: data.created_at,
          updated_at: data.updated_at,
          state: data.state,
        });
      }
      if (limit && summaries.length >= limit) {
        break;
      }
    }

    return summaries.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }
}

/**
 * Vercel Blob Memory Store
 * 存储和检索长期记忆数据
 */
export class VercelBlobMemoryStore implements MemoryStore {
  private cache: Record<string, any>[] | null = null;
  private memoryKey = `${MEMORY_PREFIX}data`;

  async load(): Promise<Record<string, any>[]> {
    // Return cached data if available
    if (this.cache !== null) {
      return this.cache;
    }

    try {
      const blob = await head({ key: this.memoryKey });
      if (!blob) {
        this.cache = [];
        return this.cache;
      }

      const response = await fetch(blob.url);
      const data = await response.json();

      this.cache = data || [];
      return this.cache;
    } catch (error: any) {
      // Handle "blob does not exist" error
      if (error.message?.includes('does not exist') ||
          error.message?.includes('not found') ||
          error.statusCode === 404) {
        this.cache = [];
        return this.cache;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async save(items: Record<string, any>[]): Promise<void> {
    const content = JSON.stringify(items, null, 2);

    await put(this.memoryKey, content, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    this.cache = items;
  }
}

/**
 * Vercel Blob Context Store
 * 存储和检索上下文数据
 */
export class VercelBlobContextStore implements ContextStore {
  private cache = new Map<string, Record<string, any>>();

  private getKey(sessionId: string): string {
    return `${CONTEXTS_PREFIX}${sessionId}.json`;
  }

  async get(sessionId: string): Promise<Record<string, any> | null> {
    // Check cache first
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId)!;
    }

    try {
      const blob = await head({ key: this.getKey(sessionId) });
      if (!blob) {
        return null;
      }

      const response = await fetch(blob.url);
      const data = await response.json();

      this.cache.set(sessionId, data);
      return data;
    } catch (error: any) {
      // Handle "blob does not exist" error
      if (error.message?.includes('does not exist') ||
          error.message?.includes('not found') ||
          error.statusCode === 404) {
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async set(sessionId: string, data: Record<string, any>): Promise<void> {
    const key = this.getKey(sessionId);
    const content = JSON.stringify(data, null, 2);

    await put(key, content, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    this.cache.set(sessionId, data);
  }
}

/**
 * 创建 Vercel Blob 存储后端
 *
 * @returns StorageBackend 实例
 */
export function createVercelBlobStorage(): StorageBackend {
  return new StorageBackend(
    new VercelBlobSessionStore(),
    new VercelBlobMemoryStore(),
    // SkillStore - 使用默认实现（内存存储）
    {
      listSkills: async () => [],
      getSkill: async () => null,
    },
    new VercelBlobContextStore()
  );
}

/**
 * 创建只包含 Session 和 Context 的轻量级存储后端
 * 适用于不需要记忆功能的场景
 */
export function createVercelBlobStorageLite(): StorageBackend {
  return new StorageBackend(
    new VercelBlobSessionStore(),
    // MemoryStore - 空实现
    {
      load: async () => [],
      save: async () => {},
    },
    // SkillStore - 空实现
    {
      listSkills: async () => [],
      getSkill: async () => null,
    },
    new VercelBlobContextStore()
  );
}
