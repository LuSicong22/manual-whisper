# 🎙️ 中文会议录音转写工具

本地运行的中文会议录音转写工具，基于 [WhisperX](https://github.com/m-bain/whisperX)，支持：

- ✅ 高精度中文转写（WhisperX large-v3 模型）
- ✅ 说话人分离（自动识别不同发言者）
- ✅ 精确时间戳
- ✅ 输出 Markdown + JSON 格式
- ✅ 幻觉去重后处理

## 环境要求

- Python 3.9+
- macOS / Linux / Windows
- 建议内存 ≥ 8GB（使用 `large-v3` 模型）

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/manual-whisper.git
cd manual-whisper
```

### 2. 安装依赖

```bash
# 建议使用虚拟环境
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 3. 配置 Token

说话人分离功能需要 Hugging Face Token：

1. 注册 [Hugging Face](https://huggingface.co/) 账号
2. 前往 [Token 页面](https://huggingface.co/settings/tokens) 创建 Token
3. 同意以下模型的使用条款（点击链接 → Accept）：
   - [pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
   - [pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0)
4. 复制 `.env.example` 为 `.env`，填入你的 Token：

```bash
cp .env.example .env
# 编辑 .env，填入 HF_TOKEN
```

> 💡 如果不配置 Token，工具仍可正常转写，只是不会标注说话人。

### 4. 运行转写

```bash
python transcribe.py 你的录音文件.m4a
```

转写完成后会生成两个文件：
- `你的录音文件_transcript.md` — Markdown 格式转写稿
- `你的录音文件_transcript.json` — JSON 格式完整数据

## 可选配置

在 `.env` 文件中可以调整：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WHISPER_MODEL` | `large-v3` | 模型大小。内存不足可用 `medium` 或 `small` |
| `BATCH_SIZE` | `4` | 批处理大小。CPU 推荐 4-8 |

## 支持的音频格式

m4a, mp3, wav, flac, ogg 等主流音频格式均支持。

## 常见问题

**Q: 首次运行很慢？**
A: 首次运行会自动下载模型文件（large-v3 约 3GB），后续运行会使用缓存。

**Q: 内存不足怎么办？**
A: 在 `.env` 中设置 `WHISPER_MODEL=medium` 或 `WHISPER_MODEL=small`。

**Q: 没有 GPU 可以用吗？**
A: 可以，默认就是 CPU 模式。GPU 用户可修改代码中的 `DEVICE` 为 `"cuda"`。

## License

MIT
