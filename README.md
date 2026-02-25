<div align="center">

# 🎙️ FlashNotes

**[English](#english) | [中文](#中文)**

High-precision, privacy-friendly audio transcription tool. Powered by WhisperX and Replicate, featuring speaker diarization, hallucination filtering, and automated quality repair.

</div>

---

<br>

<h2 id="english">English</h2>

## 🌟 Core Features

- **High-Precision Transcription**: Uses the WhisperX `large-v3` model, optimized for meetings and multi-speaker discussions.
- **Speaker Diarization**: Automatically identifies and labels different speakers.
- **Quality Repair**: Built-in hallucination cleaning, repetitive phrase deduplication, and prompt leakage filtering.
- **Privacy Protection**: Audio is only sent to dedicated cloud GPUs during transcription and is never persistently stored.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
Create a `.env.local` file and add your Replicate token:
```
REPLICATE_API_TOKEN=YOUR_TOKEN_HERE
APP_SHARED_KEY=YOUR_SHARED_SECRET
```

### 3. Run Locally
```bash
# Requires Vercel CLI: npm i -g vercel
vercel dev
```

## 🌐 Recommended Deployment (Hybrid)

To get a beautiful `.web.app` custom domain while enjoying free backend resources from Vercel, we recommend a hybrid deployment:

### Step 1: Deploy Backend to Vercel
1. Run in your project directory: `vercel --prod`
2. Follow the prompts and save the generated Vercel domain (e.g., `https://your-proj.vercel.app`).
3. Set `REPLICATE_API_TOKEN` and `APP_SHARED_KEY` in the Vercel dashboard.

### Step 2: Deploy Frontend to Firebase
1. Open `clientConfig.js` in the root directory.
2. Update the `API_BASE` value in `clientConfig.js` with your new Vercel domain:
   ```javascript
   const DEFAULT_API_BASE = 'https://your-proj.vercel.app';
   ```
3. Run in your project directory: `firebase deploy --only hosting`

You're all set! You can now access your free transcription service via your Firebase domain.

## ✅ Post-Deploy Smoke Check (Production Recording Flow)

This repo supports an automated, non-blocking smoke check right after frontend deploy.

### 1. Install Playwright browser once
```bash
npm run smoke:install
```

### 2. Run deploy + production smoke check
```bash
npm run deploy:frontend:prod:verified
```

### 3. What it validates
- Click `#record-btn` to start recording
- Wait a short recording duration
- Click `#record-btn` and confirm `#confirm-ok` to stop
- Click `#start-btn` to submit
- Wait for `#result-area` and assert `#transcript-preview` is non-empty

### 4. Behavior on failure
- The smoke step writes reports to:
  - `reports/smoke/latest.json`
  - `reports/smoke/<timestamp>.json`
- The smoke step is non-blocking by default (deploy stays successful).

### 5. Environment variables (optional)
- `PROD_FRONTEND_URL` (default: `https://flashnotes-ai.web.app`)
- `SMOKE_AUDIO_FIXTURE` (default: `tests/fixtures/smoke-25s.wav`)
- `SMOKE_RECORD_SECONDS` (default: `8`)
- `SMOKE_TIMEOUT_MS` (default: `480000`)
- `SMOKE_HEADLESS` (default: `true`)

<br>

---

<br>

<h2 id="中文">中文</h2>

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
APP_SHARED_KEY=你的共享密钥
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
3. 在 Vercel 后台配置环境变量 `REPLICATE_API_TOKEN` 和 `APP_SHARED_KEY`。

### 第二步：部署前端到 Firebase
1. 打开根目录下的 `clientConfig.js`。
2. 打开根目录 `clientConfig.js`，将 `DEFAULT_API_BASE` 修改为你刚从 Vercel 获取的域名。
   ```javascript
   const DEFAULT_API_BASE = 'https://your-proj.vercel.app';
   ```
3. 在项目目录执行：`firebase deploy --only hosting`

一切就绪！你现在可以通过 Firebase 域名访问完全免费的转写服务。

## ✅ 部署后自动验收（生产录音主流程）

项目已支持“前端部署后自动跑主流程验收”（默认非阻断发布）。

### 1. 首次安装 Playwright 浏览器
```bash
npm run smoke:install
```

### 2. 一键执行“部署 + 验收”
```bash
npm run deploy:frontend:prod:verified
```

### 3. 验收覆盖内容
- 点击 `#record-btn` 开始录音
- 等待短时录音
- 再次点击 `#record-btn` 并在弹窗点击 `#confirm-ok` 结束录音
- 点击 `#start-btn` 发起转写
- 等待 `#result-area` 出现，并断言 `#transcript-preview` 非空

### 4. 失败行为
- 报告落盘到：
  - `reports/smoke/latest.json`
  - `reports/smoke/<timestamp>.json`
- 默认失败不阻断发布（仅输出失败摘要和报告）。

### 5. 可选环境变量
- `PROD_FRONTEND_URL`（默认：`https://flashnotes-ai.web.app`）
- `SMOKE_AUDIO_FIXTURE`（默认：`tests/fixtures/smoke-25s.wav`）
- `SMOKE_RECORD_SECONDS`（默认：`8`）
- `SMOKE_TIMEOUT_MS`（默认：`480000`）
- `SMOKE_HEADLESS`（默认：`true`）

---

## 📄 License
MIT
