#!/usr/bin/env node

/**
 * Patch borderless-agent to support reasoning_content field
 *
 * This script modifies the borderless-agent OpenAIProvider to extract
 * and return reasoning_content from LLM responses (for models like o1).
 *
 * Run: node scripts/patch-reasoning-content.js
 */

import fs from 'fs';
import path from 'path';

const LLM_PROTOCOL_JS = path.join(process.cwd(), 'node_modules/borderless-agent/dist/llmProtocol.js');
const LLM_PROTOCOL_DTS = path.join(process.cwd(), 'node_modules/borderless-agent/dist/llmProtocol.d.ts');

console.log('🔧 Patching borderless-agent to support reasoning_content...\n');

/**
 * Patch llmProtocol.js to extract reasoning_content
 */
function patchLLMProtocolJS() {
  let content = fs.readFileSync(LLM_PROTOCOL_JS, 'utf-8');

  // Check if already patched
  if (content.includes('reasoning_content')) {
    console.log('✅ llmProtocol.js already patched for reasoning_content');
    return;
  }

  // Patch the _chatStream function to capture reasoning_content
  const oldStreamChunk = `                yield {
                    content: part,
                    toolCalls: [],
                    usage: {},
                    model: this._model,
                };`;

  const newStreamChunk = `                yield {
                    content: part,
                    reasoning_content: delta?.reasoning_content || null,
                    toolCalls: [],
                    usage: {},
                    model: this._model,
                };`;

  content = content.replace(oldStreamChunk, newStreamChunk);

  // Patch the final yield in _chatStream
  const oldFinalYield = `        yield {
            content: fullContent || null,
            toolCalls: toolCallsOut,
            usage,
            model: this._model,
        };`;

  const newFinalYield = `        yield {
            content: fullContent || null,
            reasoning_content: null, // Final chunk has content but no delta
            toolCalls: toolCallsOut,
            usage,
            model: this._model,
        };`;

  content = content.replace(oldFinalYield, newFinalYield);

  // Patch _chatNonStream to include reasoning_content
  const oldNonStreamReturn = `        return {
            content: (msg.content ?? '').trim() || null,
            toolCalls,
            usage,
            model: this._model,
        };`;

  const newNonStreamReturn = `        return {
            content: (msg.content ?? '').trim() || null,
            reasoning_content: (msg.reasoning_content ?? '').trim() || null,
            toolCalls,
            usage,
            model: this._model,
        };`;

  content = content.replace(oldNonStreamReturn, newNonStreamReturn);

  fs.writeFileSync(LLM_PROTOCOL_JS, content, 'utf-8');
  console.log('✅ Patched llmProtocol.js to support reasoning_content');
}

/**
 * Patch llmProtocol.d.ts to add reasoning_content to types
 */
function patchLLMProtocolDTS() {
  let content = fs.readFileSync(LLM_PROTOCOL_DTS, 'utf-8');

  // Check if already patched
  if (content.includes('reasoning_content')) {
    console.log('✅ llmProtocol.d.ts already patched for reasoning_content');
    return;
  }

  // Find and patch the StreamChunkResponse interface (or similar)
  // The d.ts file uses a different structure, we need to add reasoning_content to the response type

  // Add reasoning_content to the exported types if there's a response interface
  const oldExport = `export interface OpenAIProvider`;
  const newExport = `export interface LLMStreamChunkResponse {
    content: string | null;
    reasoning_content?: string | null;
    toolCalls: any[];
    usage: any;
    model: string;
}

export interface OpenAIProvider`;

  if (!content.includes('LLMStreamChunkResponse')) {
    content = content.replace(oldExport, newExport);
  }

  fs.writeFileSync(LLM_PROTOCOL_DTS, content, 'utf-8');
  console.log('✅ Patched llmProtocol.d.ts to support reasoning_content');
}

/**
 * Main execution
 */
function main() {
  try {
    // Check if borderless-agent is installed
    if (!fs.existsSync(LLM_PROTOCOL_JS)) {
      console.log('⚠️  borderless-agent not found. Skipping patch.\n');
      console.log('   Run: npm install\n');
      return;
    }

    console.log('='.repeat(60));

    patchLLMProtocolJS();
    patchLLMProtocolDTS();

    console.log('='.repeat(60));
    console.log('\n✅ borderless-agent successfully patched for reasoning_content!\n');
    console.log('💡 The patch enables capturing reasoning_content from models');
    console.log('   that support it (e.g., OpenAI o1 series).\n');

  } catch (error) {
    console.error('\n❌ Error patching borderless-agent:', error.message);
    process.exit(1);
  }
}

// Run the patch
main();
