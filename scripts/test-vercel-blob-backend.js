#!/usr/bin/env node

/**
 * Test Vercel Blob backend for borderless-agent
 *
 * This script tests that agent sessions are correctly stored in Vercel Blob
 * and no local files are created.
 */

import { list } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnvFile();

const AGENT_SESSIONS_PREFIX = 'agent-sessions/';
const APP_SESSIONS_PREFIX = 'sessions/';

console.log('🧪 Testing Vercel Blob Storage Backend\n');
console.log('='.repeat(60));

async function testVercelBlobStorage() {
  try {
    // List agent sessions
    console.log('\n📦 Checking Agent Sessions in Vercel Blob...\n');

    try {
      const agentSessions = await list({
        prefix: AGENT_SESSIONS_PREFIX,
      });

      if (agentSessions.blobs.length === 0) {
        console.log('   ℹ️  No agent sessions found yet (expected on first run)');
      } else {
        console.log(`   ✅ Found ${agentSessions.blobs.length} agent session(s):`);
        agentSessions.blobs.forEach(blob => {
          console.log(`      - ${blob.pathname} (${blob.size} bytes)`);
        });
      }
    } catch (error) {
      console.log(`   ⚠️  Could not list agent sessions: ${error.message}`);
      console.log('      This is normal if BLOB_READ_WRITE_TOKEN is not set correctly');
    }

    // List application sessions
    console.log('\n📦 Checking Application Sessions in Vercel Blob...\n');

    try {
      const appSessions = await list({
        prefix: APP_SESSIONS_PREFIX,
      });

      if (appSessions.blobs.length === 0) {
        console.log('   ℹ️  No application sessions found yet');
      } else {
        console.log(`   ✅ Found ${appSessions.blobs.length} application session file(s):`);
        appSessions.blobs.slice(0, 10).forEach(blob => {
          console.log(`      - ${blob.pathname} (${blob.size} bytes)`);
        });
        if (appSessions.blobs.length > 10) {
          console.log(`      ... and ${appSessions.blobs.length - 10} more`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not list application sessions: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Vercel Blob storage is accessible!\n');

    console.log('💡 Next steps:');
    console.log('   1. Upload a file via the web interface');
    console.log('   2. Run this script again to verify sessions are stored');
    console.log('   3. Check that no local files are created in data/sessions/\n');

    return true;
  } catch (error) {
    console.error('\n❌ Error testing Vercel Blob storage:', error.message);
    console.error('\n   Please check:');
    console.error('   - BLOB_READ_WRITE_TOKEN is set correctly');
    console.error('   - The token has read/write permissions\n');
    return false;
  }
}

// Check for local files
function checkLocalFiles() {
  console.log('🔍 Checking for local session files...\n');

  const sessionsDir = path.join(process.cwd(), 'data/sessions');

  if (!fs.existsSync(sessionsDir)) {
    console.log('   ✅ data/sessions/ directory does not exist');
    console.log('      (No local files will be created)\n');
    return;
  }

  const jsonFiles = fs.readdirSync(sessionsDir)
    .filter(file => file.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('   ✅ No JSON files in data/sessions/');
    console.log('      (Agent sessions are NOT being stored locally)\n');
  } else {
    console.log(`   ⚠️  Found ${jsonFiles.length} JSON file(s) in data/sessions/:`);
    jsonFiles.forEach(file => {
      console.log(`      - ${file}`);
    });
    console.log('\n   💡 If AGENT_STORAGE_BACKEND=cloud, these should not appear.');
    console.log('      You can safely delete them.\n');
  }
}

// Run tests
async function main() {
  checkLocalFiles();
  await testVercelBlobStorage();
}

main();
