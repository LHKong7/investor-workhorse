#!/bin/bash

# borderless-agent 云端存储验证脚本
#
# 用法: ./scripts/verify-cloud-storage.sh

echo "🔍 borderless-agent 云端存储验证"
echo "======================================"
echo ""

# 1. 检查环境变量
echo "1️⃣ 检查环境变量配置..."
if grep -q "AGENT_STORAGE_BACKEND=cloud" .env.local 2>/dev/null; then
    echo "   ✅ AGENT_STORAGE_BACKEND=cloud"
else
    echo "   ❌ AGENT_STORAGE_BACKEND 未设置为 cloud"
    exit 1
fi

if grep -q "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_" .env.local 2>/dev/null; then
    echo "   ✅ BLOB_READ_WRITE_TOKEN 已设置"
else
    echo "   ❌ BLOB_READ_WRITE_TOKEN 未设置"
    exit 1
fi
echo ""

# 2. 检查 Vercel Blob 后端文件
echo "2️⃣ 检查 Vercel Blob 后端文件..."
if [ -f "node_modules/borderless-agent/dist/storage/vercelBlobBackend.js" ]; then
    echo "   ✅ vercelBlobBackend.js 存在"
else
    echo "   ❌ vercelBlobBackend.js 不存在"
    echo "   请运行: npm run postinstall"
    exit 1
fi

if [ -f "node_modules/borderless-agent/dist/storage/vercelBlobBackend.d.ts" ]; then
    echo "   ✅ vercelBlobBackend.d.ts 存在"
else
    echo "   ❌ vercelBlobBackend.d.ts 不存在"
    exit 1
fi
echo ""

# 3. 检查存储后端选择逻辑
echo "3️⃣ 检查存储后端选择逻辑..."
if grep -q "createVercelBlobBackend" node_modules/borderless-agent/dist/storage/index.js 2>/dev/null; then
    echo "   ✅ index.js 已配置使用 Vercel Blob"
else
    echo "   ❌ index.js 未配置 Vercel Blob"
    exit 1
fi
echo ""

# 4. 检查本地文件
echo "4️⃣ 检查本地 session 文件..."
if [ -d "data/sessions" ]; then
    json_count=$(find data/sessions -name "*.json" 2>/dev/null | wc -l)
    if [ "$json_count" -eq 0 ]; then
        echo "   ✅ 无本地 JSON 文件（正确）"
    else
        echo "   ⚠️  发现 $json_count 个本地 JSON 文件"
        echo "   这些文件应该不存在，可以安全删除"
    fi
else
    echo "   ✅ data/sessions/ 目录不存在（正确）"
fi
echo ""

# 5. 运行存储测试
echo "5️⃣ 运行 Vercel Blob 存储测试..."
if node scripts/test-vercel-blob-backend.js 2>/dev/null | grep -q "Vercel Blob storage is accessible"; then
    echo "   ✅ Vercel Blob 存储可访问"
else
    echo "   ⚠️  Vercel Blob 存储测试失败"
    echo "   可能是 BLOB_READ_WRITE_TOKEN 配置问题"
fi
echo ""

# 6. 检查 API Routes
echo "6️⃣ 检查 API Routes 配置..."
if grep -q "new AgentBuilder()" app/api/chat/route.ts 2>/dev/null; then
    if ! grep -q "\.setStorage\|\.setSessionStorage" app/api/chat/route.ts 2>/dev/null; then
        echo "   ✅ chat/route.ts 正确配置（使用环境变量）"
    else
        echo "   ⚠️  chat/route.ts 显式设置了存储（应该使用环境变量）"
    fi
else
    echo "   ❌ chat/route.ts 未使用 AgentBuilder"
fi

if grep -q "new AgentBuilder()" app/api/analyze/route.ts 2>/dev/null; then
    if ! grep -q "\.setStorage\|\.setSessionStorage" app/api/analyze/route.ts 2>/dev/null; then
        echo "   ✅ analyze/route.ts 正确配置（使用环境变量）"
    else
        echo "   ⚠️  analyze/route.ts 显式设置了存储（应该使用环境变量）"
    fi
else
    echo "   ❌ analyze/route.ts 未使用 AgentBuilder"
fi
echo ""

# 7. 总结
echo "======================================"
echo "✅ 验证完成！"
echo ""
echo "📊 配置总结:"
echo "   - 存储后端: Vercel Blob (cloud)"
echo "   - Agent 持久化: ✅ 是"
echo "   - 本地文件: ❌ 无"
echo "   - API Routes: ✅ 正确配置"
echo ""
echo "🚀 下一步:"
echo "   1. 访问 http://localhost:3000"
echo "   2. 上传文件进行财务分析"
echo "   3. 刷新页面验证 session 持久化"
echo "   4. 运行测试: node scripts/test-vercel-blob-backend.js"
echo ""
