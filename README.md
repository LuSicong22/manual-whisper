# 🎙️ Manual Whisper

高精度、隐私友好的中文录音转写工具。基于 WhisperX 和 Replicate，支持说话人分离、幻觉去重与自动化质量修复。

## 🌟 核心特性

- **高精度转写**：采用 WhisperX `large-v3` 模型，针对中文会议与讨论进行优化。
- **说话人分离**：自动识别并标注不同的发言者（Diarization）。
- **质量修复**：内置幻觉清理、重复短句去重及提示词过滤，生成更清爽的文本。
- **多端支持**：提供网页版（支持直接录音）与本地 CLI 工具。
- **隐私保护**：音频仅在转写时上传至专用云端 GPU（Replicate），不存储原文。

---

## 🚀 网页版 (推荐)

直接在浏览器中使用，支持电脑与手机。

**访问地址**: [https://flashnotes.web.app/](https://flashnotes.web.app/)

### 快速开始
1. 打开网页，允许麦克风权限。
2. **直接录音** 或 **导入本地音频**（m4a, mp3, wav等）。
3. 点击“开始转写”，稍等片刻即可获得结果。
4. 支持导出 Markdown 和 JSON 格式。

### 网页版私有化部署
如果你想自己托管：
1. 进入 `web` 目录并安装依赖：`npm install`
2. 配置 `REPLICATE_API_TOKEN`（在 `.env.local`）。
3. 使用 `vercel dev` 本地预览，或 `vercel --prod` 部署至 Vercel。
4. 详见 [web/README.md](web/README.md)。

---

## 💻 本地 CLI 版 (高级)

适合需要在大规模本地文件上运行或不希望使用云端 API 的用户。

### 环境要求
- Python 3.9+ 
- 建议内存 ≥ 8GB

### 安装与运行
1. **克隆仓库**:
   ```bash
   git clone https://github.com/LuSicong22/manual-whisper.git
   cd manual-whisper
   ```
2. **安装依赖**:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. **设置 Token (可选但推荐)**:
   复制 `.env.example` 为 `.env`，填入 `HF_TOKEN` 以启用说话人分离。
4. **执行转写**:
   ```bash
   python transcribe.py 你的音频文件.m4a
   ```

---

## 🛠️ 配置说明

无论使用哪个版本，你都可以通过环境变量控制行为：

| 变量 | 说明 |
|------|------|
| `HF_TOKEN` | Hugging Face Token，用于说话人分离。 |
| `WHISPER_MODEL` | 模型大小（large-v3, medium, small）。 |
| `DOMAIN_TERMS` | 会议常见术语表，用于减少识别误差。 |

## ❓ 常见问题

**Q: 网页版收费吗？**
A: 本工具核心代码开源，自托管需要 Replicate API 额度。官方演示站取决于维护者的余额。

**Q: 为什么说话人显示为 SPEAKER_00, SPEAKER_01？**
A: 这是自动识别的编号，你可以根据上下文在导出的 Markdown 中自行查找替换。

**Q: 幻觉（Hallucination）是什么？**
A: 当音频中有长时间静音或背景噪音时，Whisper 有可能产生无意义的重复短语。本项目已内置算法自动检测并剔除此类内容。

## 📄 License

MIT
