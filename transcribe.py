#!/usr/bin/env python3
"""
中文会议录音转写工具 (本地版)
使用 WhisperX 模型，支持说话人分离和时间戳
"""

import whisperx
import gc
import torch
import json
import sys
import os
import re
import time
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

# Fix for PyTorch 2.6+ compatibility
_original_load = torch.load
def _safe_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return _original_load(*args, **kwargs)
torch.load = _safe_load

# ==================== 配置 ====================
DEVICE = "cpu"
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "4"))  # CPU 推荐 4-8
COMPUTE_TYPE = "int8"
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "large-v3")

# Hugging Face Token (用于说话人分离)
HF_TOKEN = os.environ.get("HF_TOKEN")

# 引导简体中文输出和标点
INITIAL_PROMPT = "以下是一段中文会议录音的转写。请使用简体中文。"

# VAD 参数（减少幻觉 + 加速）
VAD_OPTIONS = {
    "vad_onset": 0.5,
    "vad_offset": 0.363,
}


def format_timestamp(seconds):
    """将秒数转换为 HH:MM:SS 格式"""
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def remove_hallucination_loops(text, max_repeat=3):
    """移除重复短语幻觉（如 '那个吧 那个吧 那个吧 ...'）"""
    # 匹配连续重复 max_repeat 次以上的短语（2-20 字符）
    pattern = r'(.{2,20}?)\1{' + str(max_repeat) + r',}'
    cleaned = re.sub(pattern, r'\1', text)
    return cleaned


def transcribe_audio(audio_file, hf_token=None):
    """转写音频文件"""
    print(f"🎙️ 正在转写: {audio_file}")
    print(f"📊 配置: 模型={MODEL_SIZE} | 设备={DEVICE} | 精度={COMPUTE_TYPE} | 批大小={BATCH_SIZE}")

    step_start = time.time()

    # 1. 加载 Whisper 模型
    print(f"📝 加载 Whisper {MODEL_SIZE} 模型...")
    model = whisperx.load_model(
        MODEL_SIZE, DEVICE,
        compute_type=COMPUTE_TYPE,
        language="zh",
        asr_options={"initial_prompt": INITIAL_PROMPT},
        vad_options=VAD_OPTIONS,
    )
    print(f"   模型加载耗时: {time.time() - step_start:.1f}s")

    print("🔊 加载音频...")
    audio = whisperx.load_audio(audio_file)
    audio_duration = len(audio) / 16000  # WhisperX 采样率 16kHz
    print(f"   音频时长: {audio_duration:.0f}s ({audio_duration/60:.1f}min)")

    step_start = time.time()
    print("✍️ 转写中 (可能需要几分钟)...")
    result = model.transcribe(audio, batch_size=BATCH_SIZE, language="zh")
    transcribe_time = time.time() - step_start
    print(f"   转写耗时: {transcribe_time:.1f}s (实时比: {transcribe_time/audio_duration:.1f}x)")

    # 2. 对齐时间戳
    step_start = time.time()
    print("🎯 对齐时间戳...")
    model_a, metadata = whisperx.load_align_model(language_code="zh", device=DEVICE)
    result = whisperx.align(result["segments"], model_a, metadata, audio, DEVICE, return_char_alignments=False)
    print(f"   对齐耗时: {time.time() - step_start:.1f}s")

    del model_a
    gc.collect()

    # 3. 说话人分离
    if hf_token:
        step_start = time.time()
        print("👥 识别说话人...")
        try:
            from whisperx.diarize import DiarizationPipeline
            diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=DEVICE)
            diarize_segments = diarize_model(audio)
            result = whisperx.assign_word_speakers(diarize_segments, result)
            print(f"   说话人分离耗时: {time.time() - step_start:.1f}s")
        except Exception as e:
            print(f"⚠️ 说话人分离失败: {e}")
            print("   继续生成不带说话人标签的转写稿...")
    else:
        print("⚠️ 未设置 HF_TOKEN，跳过说话人分离。请在 .env 中设置 HF_TOKEN。")

    del model
    gc.collect()

    # 4. 后处理：移除幻觉重复
    print("🧹 清理幻觉重复...")
    hallucination_count = 0
    for segment in result.get("segments", []):
        original = segment.get("text", "")
        cleaned = remove_hallucination_loops(original)
        if cleaned != original:
            segment["text"] = cleaned
            hallucination_count += 1
    if hallucination_count > 0:
        print(f"   修复了 {hallucination_count} 处幻觉重复")

    return result, audio_duration


def format_transcript(result, audio_file, output_file, audio_duration, total_time):
    """格式化输出为 Markdown"""
    print(f"📄 生成文档: {output_file}")

    lines = []
    lines.append("# 会议录音转写\n\n")
    lines.append(f"**源文件**: {audio_file}  \n")
    lines.append(f"**音频时长**: {audio_duration/60:.1f} 分钟  \n")
    lines.append(f"**模型**: {MODEL_SIZE} | **精度**: {COMPUTE_TYPE} | **设备**: {DEVICE}  \n")
    lines.append(f"**转写总耗时**: {total_time:.0f}s\n\n")
    lines.append("---\n\n")

    current_speaker = None

    for segment in result.get("segments", []):
        start = segment.get("start", 0)
        end = segment.get("end", 0)
        text = segment.get("text", "").strip()
        speaker = segment.get("speaker", "")

        if not text:
            continue

        timestamp = f"[{format_timestamp(start)} - {format_timestamp(end)}]"

        if speaker and speaker != current_speaker:
            lines.append(f"\n### {speaker}\n\n")
            current_speaker = speaker

        lines.append(f"{timestamp} {text}\n\n")

    with open(output_file, "w", encoding="utf-8") as f:
        f.writelines(lines)

    # 保存 JSON
    json_file = output_file.replace(".md", ".json")
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ 转写稿: {output_file}")
    print(f"✅ JSON: {json_file}")


def main():
    total_start = time.time()

    # 默认或命令行参数
    audio_file = sys.argv[1] if len(sys.argv) > 1 else "New Recording 46.m4a"

    if not os.path.exists(audio_file):
        print(f"❌ 文件不存在: {audio_file}")
        sys.exit(1)

    output_file = Path(audio_file).stem + "_transcript.md"

    result, audio_duration = transcribe_audio(audio_file, HF_TOKEN)

    total_time = time.time() - total_start
    format_transcript(result, audio_file, output_file, audio_duration, total_time)

    print(f"\n🎉 转写完成!")
    print(f"⏱️ 总耗时: {total_time:.1f}s | 音频时长: {audio_duration:.0f}s | 实时比: {total_time/audio_duration:.1f}x")


if __name__ == "__main__":
    main()
