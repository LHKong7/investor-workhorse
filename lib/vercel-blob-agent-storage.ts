/**
 * Vercel Blob Storage Backend for borderless-agent
 *
 * This implements the StorageBackend interface using Vercel Blob,
 * allowing agent sessions to persist in Vercel Blob storage.
 */

import { put, head, list } from '@vercel/blob';
import type {
  SessionStore,
  MemoryStore,
  SkillStore,
  ContextStore,
  StorageBackend
} from 'borderless-agent';

// Import the actual StorageBackend class
// @ts-ignore - borderless-agent doesn't export this properly
import { StorageBackend as StorageBackendClass } from 'borderless-agent/dist/storage/protocols';

// Blob storage prefix for agent data
const AGENT_PREFIX = 'agent-sessions/';

/**
 * Vercel Blob Session Store
 */
class VercelBlobSessionStore implements SessionStore {
  private cache = new Map<string, Record<string, any>>();

  constructor() {}

  private getKey(sessionId: string): string {
    return `${AGENT_PREFIX}sessions/${sessionId}.json`;
  }

  async getAsync(sessionId: string): Promise<Record<string, any> | null> {
    try {
      const key = this.getKey(sessionId);
      const blob = await head(key);

      if (!blob) {
        return null;
      }

      // Check cache first
      if (this.cache.has(sessionId)) {
        return this.cache.get(sessionId)!;
      }

      // Fetch from blob
      const response = await fetch(blob.url);
      const data = await response.json();

      // Update cache
      this.cache.set(sessionId, data);

      return data;
    } catch {
      return null;
    }
  }

  get(sessionId: string): Record<string, any> | null {
    // Synchronous version - return from cache
    return this.cache.get(sessionId) || null;
  }

  async putAsync(sessionId: string, data: Record<string, any>): Promise<void> {
    const key = this.getKey(sessionId);

    // Upload to Vercel Blob
    await put(key, JSON.stringify(data, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Update cache
    this.cache.set(sessionId, data);
  }

  put(sessionId: string, data: Record<string, any>): void {
    // Async fire-and-forget
    this.putAsync(sessionId, data);
  }

  async listIdsAsync(): Promise<string[]> {
    try {
      const result = await list({ prefix: `${AGENT_PREFIX}sessions/` });
      return result.blobs
        .map(blob => {
          const match = blob.pathname.match(/sessions\/([^\/]+)\.json$/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  listIds(): string[] {
    // Return from cache or empty
    return Array.from(this.cache.keys());
  }

  async listSummariesAsync(limit?: number): Promise<Record<string, any>[]> {
    try {
      const ids = await this.listIdsAsync();
      const summaries: Record<string, any>[] = [];

      for (const id of ids) {
        const data = await this.getAsync(id);
        if (data) {
          summaries.push(data);
        }
        if (limit && summaries.length >= limit) {
          break;
        }
      }

      return summaries;
    } catch {
      return [];
    }
  }

  listSummaries(limit?: number): Record<string, any>[] {
    // Return from cache
    return Array.from(this.cache.values()).slice(0, limit);
  }
}

/**
 * Vercel Blob Memory Store
 */
class VercelBlobMemoryStore implements MemoryStore {
  private memoryKey = `${AGENT_PREFIX}memory.json`;
  private cache: Record<string, any>[] = [];

  async loadAsync(): Promise<Record<string, any>[]> {
    try {
      const blob = await head(this.memoryKey);

      if (!blob) {
        return [];
      }

      const response = await fetch(blob.url);
      const data = await response.json();

      this.cache = data;
      return data;
    } catch {
      return [];
    }
  }

  load(): Record<string, any>[] {
    return this.cache;
  }

  async saveAsync(items: Record<string, any>[]): Promise<void> {
    // Upload to Vercel Blob
    await put(this.memoryKey, JSON.stringify(items, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    this.cache = items;
  }

  save(items: Record<string, any>[]): void {
    // Async fire-and-forget
    this.saveAsync(items);
  }
}

/**
 * Vercel Blob Skill Store
 */
class VercelBlobSkillStore implements SkillStore {
  private cache = new Map<string, Record<string, any>>();

  private getSkillKey(name: string): string {
    return `${AGENT_PREFIX}skills/${name}.json`;
  }

  async getSkillAsync(name: string): Promise<Record<string, any> | null> {
    try {
      // Check cache first
      if (this.cache.has(name)) {
        return this.cache.get(name)!;
      }

      const key = this.getSkillKey(name);
      const blob = await head(key);

      if (!blob) {
        return null;
      }

      const response = await fetch(blob.url);
      const data = await response.json();

      // Update cache
      this.cache.set(name, data);

      return data;
    } catch {
      return null;
    }
  }

  getSkill(name: string): Record<string, any> | null {
    return this.cache.get(name) || null;
  }

  async listSkillsAsync(): Promise<string[]> {
    try {
      const result = await list({ prefix: `${AGENT_PREFIX}skills/` });
      return result.blobs
        .map(blob => {
          const match = blob.pathname.match(/skills\/([^\/]+)\.json$/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];
    } catch {
      return [];
    }
  }

  listSkills(): string[] {
    return Array.from(this.cache.keys());
  }

  async registerSkillAsync(name: string, skill: Record<string, any>): Promise<void> {
    const key = this.getSkillKey(name);

    // Upload to Vercel Blob
    await put(key, JSON.stringify(skill, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Update cache
    this.cache.set(name, skill);
  }

  registerSkill(name: string, skill: Record<string, any>): void {
    // Async fire-and-forget
    this.registerSkillAsync(name, skill);
  }
}

/**
 * Vercel Blob Context Store
 */
class VercelBlobContextStore implements ContextStore {
  private cache = new Map<string, Record<string, any>>();

  private getContextKey(sessionId: string): string {
    return `${AGENT_PREFIX}contexts/${sessionId}.json`;
  }

  async getAsync(sessionId: string): Promise<Record<string, any> | null> {
    try {
      // Check cache first
      if (this.cache.has(sessionId)) {
        return this.cache.get(sessionId)!;
      }

      const key = this.getContextKey(sessionId);
      const blob = await head(key);

      if (!blob) {
        return null;
      }

      const response = await fetch(blob.url);
      const data = await response.json();

      // Update cache
      this.cache.set(sessionId, data);

      return data;
    } catch {
      return null;
    }
  }

  get(sessionId: string): Record<string, any> | null {
    // Synchronous version - return from cache
    return this.cache.get(sessionId) || null;
  }

  async setAsync(sessionId: string, data: Record<string, any>): Promise<void> {
    const key = this.getContextKey(sessionId);

    // Upload to Vercel Blob
    await put(key, JSON.stringify(data, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    // Update cache
    this.cache.set(sessionId, data);
  }

  set(sessionId: string, data: Record<string, any>): void {
    // Async fire-and-forget
    this.setAsync(sessionId, data);
  }
}

/**
 * Create a Vercel Blob storage backend for borderless-agent
 *
 * This allows agent sessions, memory, skills, and context to be
 * persisted in Vercel Blob storage instead of local filesystem.
 */
export function createVercelBlobBackend(): StorageBackend {
  const sessionStore = new VercelBlobSessionStore();
  const memoryStore = new VercelBlobMemoryStore();
  const skillStore = new VercelBlobSkillStore();
  const contextStore = new VercelBlobContextStore();

  // @ts-ignore - Access private constructor
  return new StorageBackendClass(
    sessionStore,
    memoryStore,
    skillStore,
    contextStore
  );
}

/**
 * Export stores for direct access if needed
 */
export {
  VercelBlobSessionStore,
  VercelBlobMemoryStore,
  VercelBlobSkillStore,
  VercelBlobContextStore
};
