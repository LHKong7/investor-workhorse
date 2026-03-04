#!/usr/bin/env node

/**
 * List Vercel Blob Sessions
 *
 * This script connects to Vercel Blob Storage and displays
 * all session folders and their contents.
 */

import 'dotenv/config';
import { list } from '@vercel/blob';

async function listBlobSessions() {
  console.log('📦 Listing Vercel Blob Storage - Sessions\n');
  console.log('=' .repeat(70));

  try {
    // List all blobs with 'sessions/' prefix
    const result = await list({ prefix: 'sessions/' });

    if (result.blobs.length === 0) {
      console.log('\n⚠️  No sessions found in Vercel Blob Storage.');
      console.log('\n💡 To create a session, use the application to upload a file or start a chat.');
      return;
    }

    // Group blobs by session
    const sessions = new Map();

    for (const blob of result.blobs) {
      // Extract session ID from path
      // Format: sessions/{sessionId}/{filename}
      const match = blob.pathname.match(/^sessions\/([^\/]+)\/(.+)$/);

      if (match) {
        const sessionId = match[1];
        const filename = match[2];

        if (!sessions.has(sessionId)) {
          sessions.set(sessionId, {
            files: [],
            metadata: null,
            totalCount: 0,
            totalSize: 0,
            uploadedAt: blob.uploadedAt
          });
        }

        const session = sessions.get(sessionId);
        session.totalCount++;
        session.totalSize += blob.size;

        // Track metadata file
        if (filename === 'metadata.json') {
          session.metadata = blob;
        }

        session.files.push({
          name: filename,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
          url: blob.url
        });
      }
    }

    // Display sessions
    console.log(`\n✅ Found ${sessions.size} session(s) in Vercel Blob Storage:\n`);

    let index = 1;
    for (const [sessionId, session] of sessions) {
      console.log(`${index}. 📁 Session: ${sessionId}`);
      console.log(`   📅 Created: ${session.uploadedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log(`   📊 ${session.totalCount} file(s), ${(session.totalSize / 1024).toFixed(2)} KB total`);
      console.log('   📄 Files:');

      // Show file structure
      const structure = {
        metadata: false,
        files: false,
        messages: false,
        uploadedFiles: []
      };

      for (const file of session.files) {
        if (file.name === 'metadata.json') structure.metadata = true;
        else if (file.name === 'files.json') structure.files = true;
        else if (file.name === 'messages.json') structure.messages = true;
        else if (file.name.startsWith('files/')) structure.uploadedFiles.push(file.name);
      }

      if (structure.metadata) console.log('      ✓ metadata.json');
      if (structure.files) console.log('      ✓ files.json');
      if (structure.messages) console.log('      ✓ messages.json');
      if (structure.uploadedFiles.length > 0) {
        console.log('      📂 files/');
        for (const uploadedFile of structure.uploadedFiles) {
          const fileName = uploadedFile.replace('files/', '');
          console.log(`         - ${fileName}`);
        }
      }

      console.log('');
      index++;
    }

    console.log('='.repeat(70));
    console.log('\n🎉 All sessions are stored in Vercel Blob Storage!');
    console.log('💾 Access them anytime from anywhere.');
    console.log('🌐 No local file system dependency.\n');

  } catch (error) {
    console.error('\n❌ Error accessing Vercel Blob Storage:', error.message);

    if (error.message.includes('BLOB_READ_WRITE_TOKEN')) {
      console.log('\n💡 Solution: Make sure BLOB_READ_WRITE_TOKEN is set in .env.local');
      console.log('   Example: BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...\n');
    }
  }
}

// Run the listing
listBlobSessions();
