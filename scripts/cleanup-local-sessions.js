#!/usr/bin/env node

/**
 * Cleanup Script - Remove Local Agent Session Files
 *
 * This script removes old agent session JSON files from data/sessions/
 * Now that we're using Vercel Blob storage, these local files are no longer needed.
 */

import fs from 'fs/promises';
import path from 'path';

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

async function cleanup() {
  console.log('🧹 Cleaning up local session files...\n');

  try {
    // Check if directory exists
    try {
      await fs.access(SESSIONS_DIR);
    } catch {
      console.log('✅ No data/sessions directory found. Nothing to clean up!');
      return;
    }

    // Read directory contents
    const files = await fs.readdir(SESSIONS_DIR);

    if (files.length === 0) {
      console.log('✅ Session directory is empty. Nothing to clean up!');
      return;
    }

    console.log(`Found ${files.length} file(s) in data/sessions/\n`);

    let deletedCount = 0;
    let keptCount = 0;

    for (const file of files) {
      const filePath = path.join(SESSIONS_DIR, file);

      // Get file stats
      const stats = await fs.stat(filePath);
      const isFile = stats.isFile();
      const sizeKB = (stats.size / 1024).toFixed(2);

      if (isFile && file.endsWith('.json')) {
        // Delete agent session JSON files
        await fs.unlink(filePath);
        console.log(`  🗑️  Deleted: ${file} (${sizeKB} KB)`);
        deletedCount++;
      } else {
        // Keep subdirectories (if any)
        console.log(`  📁 Kept: ${file} (directory)`);
        keptCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Cleanup complete!`);
    console.log(`   Deleted: ${deletedCount} file(s)`);
    console.log(`   Kept: ${keptCount} item(s)`);
    console.log('='.repeat(50));

    // Optionally remove the empty directory
    try {
      const remainingFiles = await fs.readdir(SESSIONS_DIR);
      if (remainingFiles.length === 0) {
        await fs.rmdir(SESSIONS_DIR);
        console.log('\n✅ Removed empty data/sessions/ directory');
      }
    } catch {
      // Directory not empty or doesn't exist, ignore
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Run the cleanup
cleanup();
