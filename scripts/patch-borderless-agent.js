#!/usr/bin/env node

/**
 * Patch borderless-agent to support memory and Vercel Blob storage backends
 *
 * This script modifies the borderless-agent package to add proper
 * support for:
 * - AGENT_STORAGE_BACKEND=memory: prevents agent sessions from writing to local filesystem
 * - AGENT_STORAGE_BACKEND=cloud: uses Vercel Blob for persistent cloud storage
 *
 * Run automatically after npm install via postinstall script.
 */

import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'node_modules/borderless-agent/dist/storage');
const MEMORY_BACKEND_JS = path.join(STORAGE_DIR, 'memoryBackend.js');
const MEMORY_BACKEND_DTS = path.join(STORAGE_DIR, 'memoryBackend.d.ts');
const VERCEL_BLOB_BACKEND_JS = path.join(STORAGE_DIR, 'vercelBlobBackend.js');
const VERCEL_BLOB_BACKEND_DTS = path.join(STORAGE_DIR, 'vercelBlobBackend.d.ts');
const INDEX_JS = path.join(STORAGE_DIR, 'index.js');

console.log('🔧 Patching borderless-agent storage backends...\n');

/**
 * Create memoryBackend.js
 */
function createMemoryBackendJS() {
  const code = `
/**
 * memoryBackend.ts - In-memory storage backend
 *
 * This backend stores all data in memory and doesn't write to filesystem.
 * Perfect for serverless deployments.
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMemoryBackend = void 0;

class MemorySessionStore {
    constructor() {
        this.sessions = new Map();
    }
    get(sessionId) {
        return this.sessions.get(sessionId) || null;
    }
    put(sessionId, data) {
        this.sessions.set(sessionId, data);
    }
    listSummaries(limit) {
        const all = Array.from(this.sessions.values());
        return limit ? all.slice(0, limit) : all;
    }
    listIds() {
        return Array.from(this.sessions.keys());
    }
    clear() {
        this.sessions.clear();
    }
}

class InMemoryMemoryStore {
    constructor() {
        this.memories = [];
    }
    load() {
        return this.memories;
    }
    save(items) {
        this.memories = items;
    }
    clear() {
        this.memories = [];
    }
}

class MemorySkillStore {
    constructor() {
        this.skills = new Map();
    }
    listSkills() {
        return Array.from(this.skills.keys());
    }
    getSkill(name) {
        return this.skills.get(name) || null;
    }
    registerSkill(name, skill) {
        this.skills.set(name, skill);
    }
}

class MemoryContextStore {
    constructor() {
        this.contexts = new Map();
    }
    get(sessionId) {
        return this.contexts.get(sessionId) || null;
    }
    set(sessionId, data) {
        this.contexts.set(sessionId, data);
    }
    clear() {
        this.contexts.clear();
    }
}

function createMemoryBackend() {
    const protocols_1 = require("./protocols");
    return new protocols_1.StorageBackend(
        new MemorySessionStore(),
        new InMemoryMemoryStore(),
        new MemorySkillStore(),
        new MemoryContextStore()
    );
}

exports.createMemoryBackend = createMemoryBackend;
`;

  fs.writeFileSync(MEMORY_BACKEND_JS, code, 'utf-8');
  console.log('✅ Created memoryBackend.js');
}

/**
 * Create memoryBackend.d.ts
 */
function createMemoryBackendDTS() {
  const code = `
/**
 * memoryBackend.ts - In-memory storage backend
 *
 * This backend stores all data in memory and doesn't write to filesystem.
 * Perfect for serverless deployments.
 */
import { StorageBackend } from './protocols';
export declare function createMemoryBackend(): StorageBackend;
`;

  fs.writeFileSync(MEMORY_BACKEND_DTS, code, 'utf-8');
  console.log('✅ Created memoryBackend.d.ts');
}

/**
 * Create vercelBlobBackend.js
 */
function createVercelBlobBackendJS() {
  const code = `
/**
 * vercelBlobBackend.ts - Vercel Blob storage backend
 *
 * This replaces the S3 cloud backend with Vercel Blob storage.
 * Set AGENT_STORAGE_BACKEND=cloud to use Vercel Blob.
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVercelBlobBackend = void 0;

const { put, list, head, del } = require('@vercel/blob');

const SESSIONS_PREFIX = 'agent-sessions/sessions/';
const MEMORY_PREFIX = 'agent-sessions/memory/';
const SKILLS_PREFIX = 'agent-sessions/skills/';
const CONTEXTS_PREFIX = 'agent-sessions/contexts/';

function encode(data) {
    return JSON.stringify(data, null, 2);
}

function decode(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        console.error('Failed to decode JSON:', e);
        return null;
    }
}

async function fetchBlobData(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(\`Failed to fetch blob: \${response.statusText}\`);
    }
    const text = await response.text();
    return decode(text);
}

class VercelBlobSessionStore {
    constructor() {
        this.cache = new Map();
    }

    _key(sessionId) {
        return \`\${SESSIONS_PREFIX}\${sessionId}.json\`;
    }

    async getAsync(sessionId) {
        const key = this._key(sessionId);

        // Check cache first
        if (this.cache.has(sessionId)) {
            return this.cache.get(sessionId);
        }

        try {
            const blob = await head({ key });
            if (!blob) {
                return null;
            }
            const data = await fetchBlobData(blob.url);
            this.cache.set(sessionId, data);
            return data;
        } catch (error) {
            if (error.message.includes('not found')) {
                return null;
            }
            throw error;
        }
    }

    get(sessionId) {
        // Synchronous version - return from cache or null
        return this.cache.get(sessionId) || null;
    }

    async putAsync(sessionId, data) {
        const key = this._key(sessionId);
        const content = encode(data);

        await put(key, content, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        this.cache.set(sessionId, data);
    }

    put(sessionId, data) {
        // Synchronous version - update cache and async write
        this.cache.set(sessionId, data);
        this.putAsync(sessionId, data).catch(console.error);
    }

    async listIdsAsync() {
        try {
            const result = await list({
                prefix: SESSIONS_PREFIX,
            });
            return result.blobs.map(blob => {
                // Extract sessionId from path: agent-sessions/sessions/{sessionId}.json
                const match = blob.pathname.match(/\${SESSIONS_PREFIX}(.+)\.json/);
                return match ? match[1] : null;
            }).filter(Boolean);
        } catch (error) {
            console.error('Failed to list session IDs:', error);
            return [];
        }
    }

    listIds() {
        // Return cached IDs or empty array
        return Array.from(this.cache.keys());
    }

    async listSummariesAsync(limit) {
        const sessions = await this.listIdsAsync();
        const summaries = [];

        for (const sessionId of sessions) {
            const data = await this.getAsync(sessionId);
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

    listSummaries(limit) {
        // Return cached summaries
        return Array.from(this.cache.values()).slice(0, limit);
    }
}

class VercelBlobMemoryStore {
    constructor() {
        this.cache = null;
        this.memoryKey = \`\${MEMORY_PREFIX}data\`;
    }

    async loadAsync() {
        // Check cache first
        if (this.cache !== null) {
            return this.cache;
        }

        try {
            const blob = await head({ key: this.memoryKey });
            if (!blob) {
                this.cache = [];
                return this.cache;
            }
            const data = await fetchBlobData(blob.url);
            this.cache = data || [];
            return this.cache;
        } catch (error) {
            if (error.message.includes('not found')) {
                this.cache = [];
                return this.cache;
            }
            throw error;
        }
    }

    load() {
        return this.cache || [];
    }

    async saveAsync(items) {
        const content = encode(items);

        await put(this.memoryKey, content, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        this.cache = items;
    }

    save(items) {
        this.cache = items;
        this.saveAsync(items).catch(console.error);
    }
}

class VercelBlobSkillStore {
    constructor() {
        this.cache = new Map();
    }

    _key(name) {
        return \`\${SKILLS_PREFIX}\${name}.json\`;
    }

    async getSkillAsync(name) {
        // Check cache first
        if (this.cache.has(name)) {
            return this.cache.get(name);
        }

        const key = this._key(name);
        try {
            const blob = await head({ key });
            if (!blob) {
                return null;
            }
            const data = await fetchBlobData(blob.url);
            this.cache.set(name, data);
            return data;
        } catch (error) {
            if (error.message.includes('not found')) {
                return null;
            }
            throw error;
        }
    }

    getSkill(name) {
        return this.cache.get(name) || null;
    }

    async listSkillsAsync() {
        try {
            const result = await list({
                prefix: SKILLS_PREFIX,
            });
            return result.blobs.map(blob => {
                // Extract skillName from path: agent-sessions/skills/{skillName}.json
                const match = blob.pathname.match(/\${SKILLS_PREFIX}(.+)\.json/);
                return match ? match[1] : null;
            }).filter(Boolean);
        } catch (error) {
            console.error('Failed to list skills:', error);
            return [];
        }
    }

    listSkills() {
        return Array.from(this.cache.keys());
    }
}

class VercelBlobContextStore {
    constructor() {
        this.cache = new Map();
    }

    _key(sessionId) {
        return \`\${CONTEXTS_PREFIX}\${sessionId}.json\`;
    }

    async getAsync(sessionId) {
        // Check cache first
        if (this.cache.has(sessionId)) {
            return this.cache.get(sessionId);
        }

        const key = this._key(sessionId);
        try {
            const blob = await head({ key });
            if (!blob) {
                return null;
            }
            const data = await fetchBlobData(blob.url);
            this.cache.set(sessionId, data);
            return data;
        } catch (error) {
            if (error.message.includes('not found')) {
                return null;
            }
            throw error;
        }
    }

    get(sessionId) {
        return this.cache.get(sessionId) || null;
    }

    async setAsync(sessionId, data) {
        const key = this._key(sessionId);
        const content = encode(data);

        await put(key, content, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
        });

        this.cache.set(sessionId, data);
    }

    set(sessionId, data) {
        this.cache.set(sessionId, data);
        this.setAsync(sessionId, data).catch(console.error);
    }
}

function createVercelBlobBackend() {
    const protocols_1 = require("./protocols");
    return new protocols_1.StorageBackend(
        new VercelBlobSessionStore(),
        new VercelBlobMemoryStore(),
        new VercelBlobSkillStore(),
        new VercelBlobContextStore()
    );
}

exports.createVercelBlobBackend = createVercelBlobBackend;
`;

  fs.writeFileSync(VERCEL_BLOB_BACKEND_JS, code, 'utf-8');
  console.log('✅ Created vercelBlobBackend.js');
}

/**
 * Create vercelBlobBackend.d.ts
 */
function createVercelBlobBackendDTS() {
  const code = `
/**
 * storage/vercelBlobBackend.ts - Vercel Blob storage backend
 *
 * This replaces the S3 cloud backend with Vercel Blob storage.
 * Set AGENT_STORAGE_BACKEND=cloud to use Vercel Blob.
 */
import { SessionStore, MemoryStore, SkillStore, ContextStore, StorageBackend } from './protocols';
export declare class VercelBlobSessionStore implements SessionStore {
    constructor();
    private cache;
    _key(sessionId: string): string;
    getAsync(sessionId: string): Promise<Record<string, any> | null>;
    get(sessionId: string): Record<string, any> | null;
    putAsync(sessionId: string, data: Record<string, any>): Promise<void>;
    put(sessionId: string, data: Record<string, any>): void;
    listIdsAsync(): Promise<string[]>;
    listIds(): string[];
    listSummariesAsync(limit?: number): Promise<Record<string, any>[]>;
    listSummaries(limit?: number): Record<string, any>[];
}
export declare class VercelBlobMemoryStore implements MemoryStore {
    constructor();
    private cache;
    loadAsync(): Promise<Record<string, any>[]>;
    load(): Record<string, any>[];
    saveAsync(items: Record<string, any>[]): Promise<void>;
    save(items: Record<string, any>[]): void;
}
export declare class VercelBlobSkillStore implements SkillStore {
    constructor();
    private cache;
    _key(name: string): string;
    getSkillAsync(name: string): Promise<Record<string, any> | null>;
    getSkill(name: string): Record<string, any> | null;
    listSkillsAsync(): Promise<string[]>;
    listSkills(): string[];
}
export declare class VercelBlobContextStore implements ContextStore {
    constructor();
    private cache;
    _key(sessionId: string): string;
    getAsync(sessionId: string): Promise<Record<string, any> | null>;
    get(sessionId: string): Record<string, any> | null;
    setAsync(sessionId: string, data: Record<string, any>): Promise<void>;
    set(sessionId: string, data: Record<string, any>): void;
}
export declare function createVercelBlobBackend(): StorageBackend;
`;

  fs.writeFileSync(VERCEL_BLOB_BACKEND_DTS, code, 'utf-8');
  console.log('✅ Created vercelBlobBackend.d.ts');
}

/**
 * Patch index.js to support memory and Vercel Blob backend
 */
function patchIndexJS() {
  let content = fs.readFileSync(INDEX_JS, 'utf-8');

  // Check if already patched for Vercel Blob
  if (content.includes('createVercelBlobBackend')) {
    console.log('✅ index.js already patched for Vercel Blob backend');
    return;
  }

  // Check if already patched for memory
  if (content.includes('else if (choice === \'memory\')')) {
    console.log('✅ index.js already patched for memory backend');
    // Now add Vercel Blob support
  }

  // Replace cloud backend to use Vercel Blob
  const oldCloudCode = `    if (choice === 'cloud') {
        // Dynamic import to avoid requiring @aws-sdk when using file backend
        const { createCloudBackend } = require('./cloudBackend');
        _defaultBackend = createCloudBackend();
    }`;

  const newCloudCode = `    if (choice === 'cloud') {
        // Use Vercel Blob backend instead of S3
        const { createVercelBlobBackend } = require('./vercelBlobBackend');
        _defaultBackend = (0, createVercelBlobBackend)();
    }
    else if (choice === 'memory') {
        // Use in-memory backend to avoid filesystem writes
        const { createMemoryBackend } = require('./memoryBackend');
        _defaultBackend = (0, createMemoryBackend)();
    }`;

  if (content.includes(oldCloudCode)) {
    content = content.replace(oldCloudCode, newCloudCode);
    fs.writeFileSync(INDEX_JS, content, 'utf-8');
    console.log('✅ Patched index.js to support memory and Vercel Blob backends');
  } else if (content.includes('else if (choice === \'memory\')')) {
    // Already has memory support, just add Vercel Blob
    const memoryOnlyCode = `    if (choice === 'cloud') {
        // Dynamic import to avoid requiring @aws-sdk when using file backend
        const { createCloudBackend } = require('./cloudBackend');
        _defaultBackend = createCloudBackend();
    }
    else if (choice === 'memory') {
        // Use in-memory backend to avoid filesystem writes
        const { createMemoryBackend } = require('./memoryBackend');
        _defaultBackend = (0, createMemoryBackend)();
    }`;
    content = content.replace(memoryOnlyCode, newCloudCode);
    fs.writeFileSync(INDEX_JS, content, 'utf-8');
    console.log('✅ Patched index.js to support Vercel Blob backend');
  }
}

/**
 * Main execution
 */
function main() {
  try {
    // Check if borderless-agent is installed
    if (!fs.existsSync(STORAGE_DIR)) {
      console.log('⚠️  borderless-agent not found. Skipping patch.\n');
      console.log('   The patch will be applied automatically when you run: npm install\n');
      return;
    }

    console.log('='.repeat(60));

    // Create memory backend files
    createMemoryBackendJS();
    createMemoryBackendDTS();

    // Create Vercel Blob backend files
    createVercelBlobBackendJS();
    createVercelBlobBackendDTS();

    // Patch index.js
    patchIndexJS();

    console.log('='.repeat(60));
    console.log('\n✅ borderless-agent successfully patched!\n');
    console.log('💡 Available storage backends:');
    console.log('   - AGENT_STORAGE_BACKEND=cloud (Vercel Blob, persistent)');
    console.log('   - AGENT_STORAGE_BACKEND=memory (in-memory, ephemeral)');
    console.log('   - AGENT_STORAGE_BACKEND=file (local filesystem, default)\n');
    console.log('📝 This patch is applied automatically after every npm install.\n');

  } catch (error) {
    console.error('\n❌ Error patching borderless-agent:', error.message);
    process.exit(1);
  }
}

// Run the patch
main();
