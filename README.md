# 🎙️ FlashNotes

高精度、隐私友好的中文录音转写工具。基于 WhisperX 和 Replicate，支持说话人分离、幻觉去重与自动化质量修复。

## 🌟 核心特性

- **高精度转写**：采用 WhisperX `large-v3` 模型，针对中文会议与讨论进行优化。
- **说话人分离**：自动识别并标注不同的发言者（Diarization）。
- **质量修复**：内置幻觉清理、重复短句去重及提示词过滤。
- **隐私保护**：音频仅在转写时上传至专用云端 GPU，不持久化存储。

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 设置环境变量
创建 `.env.local` 文件并填入：
```
REPLICATE_API_TOKEN=你的TOKEN
```

### 3. 本地运行
```bash
# 需要安装 Vercel CLI: npm i -g vercel
vercel dev
```

## 🌐 推荐部署方案 (双重部署)

为了拥有优雅的 `.web.app` 自定义域名，同时享受 Vercel 的免费后端资源，推荐以下混合部署方式：

### 第一步：部署后端到 Vercel
1. 在项目目录执行：`vercel --prod`
2. 根据提示完成部署，记录下生成的 Vercel 域名（如 `https://your-proj.vercel.app`）。
3. 在 Vercel 后台配置环境变量 `REPLICATE_API_TOKEN`。

### 第二步：部署前端到 Firebase
1. 打开根目录下的 `apiService.js`。
2. 将 `VERCEL_API_BASE` 的值修改为你刚刚从 Vercel 获取的域名。
   ```javascript
   const VERCEL_API_BASE = 'https://your-proj.vercel.app';
   ```
3. 在项目目录执行：`firebase deploy --only hosting`

一切就绪！你现在可以通过 Firebase 域名访问完全免费的转写服务。

## 📄 License
MIT
