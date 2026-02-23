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

## 📄 License
MIT
