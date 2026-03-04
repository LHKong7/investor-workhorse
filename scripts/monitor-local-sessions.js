#!/usr/bin/env node

/**
 * Monitor Local Session Files
 *
 * This script monitors the data/sessions/ directory and alerts
 * if any new JSON files are created. Use this to verify that
 * AGENT_STORAGE_BACKEND=memory is working correctly.
 */

import fs from 'fs/promises';
import path from 'path';

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

let previousFiles = new Set();

async function getLocalSessionFiles() {
  try {
    await fs.access(SESSIONS_DIR);
    const files = await fs.readdir(SESSIONS_DIR);
    return files.filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
}

async function checkForNewFiles() {
  const currentFiles = await getLocalSessionFiles();
  const currentSet = new Set(currentFiles);

  // Check for new files
  const newFiles = [...currentSet].filter(f => !previousFiles.has(f));

  if (newFiles.length > 0) {
    console.log('\n⚠️  WARNING: New local session file(s) detected!\n');
    for (const file of newFiles) {
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = await fs.stat(filePath);
      console.log(`  📄 ${file}`);
      console.log(`     Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`     Created: ${stats.birthtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log('');
    }

    console.log('💡 Solution: Make sure AGENT_STORAGE_BACKEND=memory is set in .env.local');
    console.log('   This will prevent agent sessions from writing to local files.\n');
  } else if (currentFiles.length > 0) {
    console.log(`ℹ️  Found ${currentFiles.length} existing local session file(s):`);
    for (const file of currentFiles) {
      console.log(`   - ${file}`);
    }
    console.log('\n💡 Run cleanup script to remove them:');
    console.log('   node scripts/cleanup-local-sessions.js\n');
  } else {
    console.log('✅ No local session files found. Agent storage is using memory backend!\n');
  }

  previousFiles = currentSet;
  return newFiles.length;
}

async function monitorOnce() {
  console.log('🔍 Checking for local session files...\n');
  console.log('='.repeat(60));

  const newFileCount = await checkForNewFiles();

  console.log('='.repeat(60));

  if (newFileCount === 0) {
    console.log('\n✅ SUCCESS: All session data is stored in Vercel Blob!');
    console.log('   No local files are being created.\n');
    process.exit(0);
  } else {
    console.log('\n❌ FAIL: Local files are still being created.');
    console.log('   Please check your AGENT_STORAGE_BACKEND setting.\n');
    process.exit(1);
  }
}

// Run the check
monitorOnce();
