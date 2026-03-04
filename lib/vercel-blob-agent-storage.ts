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

  async get(sessionId: string): Promise<Record<string, any> | null> {
    // Check cache first
    if (this.cache.has(sessionId)) {
      return this.cache.get(sessionId)!;
    }

    try {
      const key = this.getKey(sessionId);
      const blob = await head(key);

      if (!blob) {
        return null;
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

  async put(sessionId: string, data: Record<string, any>): Promise<void> {
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

  async listIds(): Promise<string[]> {
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

  async listSummaries(limit?: number): Promise<Record<string, any>[]> {
    try {
      const ids = await this.listIds();
      const summaries: Record<string, any>[] = [];

      for (const id of ids) {
        const data = await this.get(id);
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
}

/**
 * Vercel Blob Memory Store
 */
class VercelBlobMemoryStore implements MemoryStore {
  private memoryKey = `${AGENT_PREFIX}memory.json`;
  private cache: Record<string, any>[] = [];

  async load(): Promise<Record<string, any>[]> {
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

  async save(items: Record<string, any>[]): Promise<void> {
    // Upload to Vercel Blob
    await put(this.memoryKey, JSON.stringify(items, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    this.cache = items;
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

  async getSkill(name: string): Promise<Record<string, any> | null> {
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

  async listSkills(): Promise<string[]> {
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

  async registerSkill(name: string, skill: Record<string, any>): Promise<void> {
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
}

/**
 * Vercel Blob Context Store
 */
class VercelBlobContextStore implements ContextStore {
  private cache = new Map<string, Record<string, any>>();

  private getContextKey(sessionId: string): string {
    return `${AGENT_PREFIX}contexts/${sessionId}.json`;
  }

  async get(sessionId: string): Promise<Record<string, any> | null> {
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

  async set(sessionId: string, data: Record<string, any>): Promise<void> {
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
