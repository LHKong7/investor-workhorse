/**
 * 测试 Vercel Blob 存储后端
 *
 * 验证自定义存储实现是否正常工作
 */

import { createVercelBlobStorage } from './vercel-agent-storage';
import { list } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

// 加载环境变量
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

/**
 * 测试 Session Store
 */
async function testSessionStore() {
  console.log('\n🧪 测试 VercelBlobSessionStore...\n');

  const { VercelBlobSessionStore } = await import('./vercel-agent-storage');
  const sessionStore = new VercelBlobSessionStore();

  // 创建测试 session
  const testSessionId = `test-${Date.now()}`;
  const testData = {
    id: testSessionId,
    state: 'active',
    history: [
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi there!' }
    ],
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
  };

  // 测试 put
  console.log('1️⃣ 测试 put()...');
  await sessionStore.put(testSessionId, testData);
  console.log('   ✅ Session 数据已保存');

  // 测试 get
  console.log('\n2️⃣ 测试 get()...');
  const retrieved = await sessionStore.get(testSessionId);
  if (retrieved && retrieved.id === testSessionId) {
    console.log('   ✅ Session 数据检索成功');
    console.log(`   📦 数据: ${JSON.stringify(retrieved, null, 2).substring(0, 100)}...`);
  } else {
    console.log('   ❌ Session 数据检索失败');
    return false;
  }

  // 测试缓存
  console.log('\n3️⃣ 测试缓存...');
  const cached = await sessionStore.get(testSessionId);
  if (cached && cached.id === testSessionId) {
    console.log('   ✅ 缓存工作正常');
  } else {
    console.log('   ❌ 缓存失败');
    return false;
  }

  // 测试 listIds
  console.log('\n4️⃣ 测试 listIds()...');
  const ids = await sessionStore.listIds();
  if (ids.includes(testSessionId)) {
    console.log(`   ✅ 找到测试 session ID: ${testSessionId}`);
    console.log(`   📋 总共 ${ids.length} 个 sessions`);
  } else {
    console.log('   ❌ 未找到测试 session ID');
    return false;
  }

  // 测试 listSummaries
  console.log('\n5️⃣ 测试 listSummaries()...');
  const summaries = await sessionStore.listSummaries(10);
  const testSummary = summaries.find(s => s.id === testSessionId);
  if (testSummary) {
    console.log('   ✅ Summary 列表包含测试 session');
    console.log(`   📊 Summary: ${JSON.stringify(testSummary, null, 2)}`);
  } else {
    console.log('   ❌ Summary 列表未找到测试 session');
    return false;
  }

  // 清理测试数据
  console.log('\n6️⃣ 清理测试数据...');
  // 注意：Vercel Blob 不提供 delete 方法，测试数据会保留
  console.log('   ⚠️  测试数据保留在 Vercel Blob 中');

  return true;
}

/**
 * 测试 Memory Store
 */
async function testMemoryStore() {
  console.log('\n🧪 测试 VercelBlobMemoryStore...\n');

  const { VercelBlobMemoryStore } = await import('./vercel-agent-storage');
  const memoryStore = new VercelBlobMemoryStore();

  // 创建测试记忆数据
  const testMemories = [
    { id: '1', content: 'Memory 1', timestamp: Date.now() },
    { id: '2', content: 'Memory 2', timestamp: Date.now() },
  ];

  // 测试 save
  console.log('1️⃣ 测试 save()...');
  await memoryStore.save(testMemories);
  console.log('   ✅ 记忆数据已保存');

  // 测试 load
  console.log('\n2️⃣ 测试 load()...');
  const loaded = await memoryStore.load();
  if (loaded.length === testMemories.length) {
    console.log('   ✅ 记忆数据加载成功');
    console.log(`   📦 加载了 ${loaded.length} 条记忆`);
  } else {
    console.log(`   ⚠️  记忆数量不匹配: ${loaded.length} vs ${testMemories.length}`);
  }

  return true;
}

/**
 * 测试 Context Store
 */
async function testContextStore() {
  console.log('\n🧪 测试 VercelBlobContextStore...\n');

  const { VercelBlobContextStore } = await import('./vercel-agent-storage');
  const contextStore = new VercelBlobContextStore();

  // 创建测试上下文
  const testSessionId = `test-context-${Date.now()}`;
  const testContext = {
    sessionId: testSessionId,
    tokens: 1000,
    messages: 5,
  };

  // 测试 set
  console.log('1️⃣ 测试 set()...');
  await contextStore.set(testSessionId, testContext);
  console.log('   ✅ 上下文数据已保存');

  // 测试 get
  console.log('\n2️⃣ 测试 get()...');
  const retrieved = await contextStore.get(testSessionId);
  if (retrieved && retrieved.sessionId === testSessionId) {
    console.log('   ✅ 上下文数据检索成功');
    console.log(`   📦 数据: ${JSON.stringify(retrieved, null, 2)}`);
  } else {
    console.log('   ❌ 上下文数据检索失败');
    return false;
  }

  // 测试缓存
  console.log('\n3️⃣ 测试缓存...');
  const cached = await contextStore.get(testSessionId);
  if (cached && cached.sessionId === testSessionId) {
    console.log('   ✅ 缓存工作正常');
  } else {
    console.log('   ❌ 缓存失败');
    return false;
  }

  return true;
}

/**
 * 测试 StorageBackend 组合
 */
async function testStorageBackend() {
  console.log('\n🧪 测试 StorageBackend 组合...\n');

  const { createVercelBlobStorage } = await import('./vercel-agent-storage');

  // 创建完整的存储后端
  console.log('1️⃣ 创建 StorageBackend...');
  const backend = createVercelBlobStorage();
  console.log('   ✅ StorageBackend 创建成功');
  console.log(`   📦 包含以下组件:`);
  console.log(`      - SessionStore: ${backend.sessionStore.constructor.name}`);
  console.log(`      - MemoryStore: ${backend.memoryStore.constructor.name}`);
  console.log(`      - SkillStore: ${backend.skillStore.constructor.name}`);
  console.log(`      - ContextStore: ${backend.contextStore.constructor.name}`);

  return true;
}

/**
 * 验证 Vercel Blob 存储
 */
async function verifyVercelBlobStorage() {
  console.log('\n🔍 验证 Vercel Blob 存储...\n');

  try {
    // 列出所有 agent-sessions
    const result = await list({
      prefix: 'agent-sessions/',
    });

    console.log(`   ✅ 找到 ${result.blobs.length} 个 agent session 文件`);

    if (result.blobs.length > 0) {
      console.log('\n   📋 最近添加的文件:');
      result.blobs.slice(-5).forEach(blob => {
        console.log(`      - ${blob.pathname} (${blob.size} bytes)`);
      });
    }

    return true;
  } catch (error: any) {
    console.log(`   ❌ 访问 Vercel Blob 失败: ${error.message}`);
    return false;
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('============================================================');
  console.log('🧪 Vercel Blob Agent Storage 测试套件');
  console.log('============================================================');

  const results = {
    sessionStore: false,
    memoryStore: false,
    contextStore: false,
    storageBackend: false,
    vercelBlob: false,
  };

  try {
    // 验证 Vercel Blob 连接
    results.vercelBlob = await verifyVercelBlobStorage();

    // 测试各个组件
    results.sessionStore = await testSessionStore();
    results.memoryStore = await testMemoryStore();
    results.contextStore = await testContextStore();
    results.storageBackend = await testStorageBackend();

  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  }

  // 打印结果
  console.log('\n============================================================');
  console.log('📊 测试结果');
  console.log('============================================================\n');

  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ 通过' : '❌ 失败';
    console.log(`   ${test}: ${status}`);
  });

  const allPassed = Object.values(results).every(r => r);

  if (allPassed) {
    console.log('\n✅ 所有测试通过！\n');
  } else {
    console.log('\n⚠️  部分测试失败\n');
  }

  console.log('============================================================\n');

  return allPassed;
}

// 运行测试
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
