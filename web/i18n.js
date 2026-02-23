/**
 * I18n module for manual-whisper
 */

export const appI18n = {
    zh: {
        'app-title': '闪记',
        'hero-title': 'AI 录音转写',
        'app-desc': '自动转写为带时间戳和说话人标签的文字稿',
        'upload-title': '导入音频进行分析',
        'upload-subtitle': '支持 m4a, mp3, wav, flac, ogg, wma, webm, aac',
        'no-file': '未选择文件',
        'or': '或',
        'record-start': '点击开始实时录音',
        'record-stop': '点击停止录音',
        'btn-start': '准备就绪，开始转写',
        'lang-zh': '转写语言: 简体中文',
        'lang-en': '转写语言: English',
        'lang-mix': '转写语言: 中英混合',
        'step-upload': '准备数据',
        'step-transcribe': 'AI 转写中',
        'step-process': '后处理',
        'status-ready': '准备就绪...',
        'upload-status': '传输状态：待开始',
        'transfer-progress': '传输进度',
        'transfer-success': '传输成功',
        'transcribe-status': '转写状态：待开始',
        'transcribe-creating': '正在启动',
        'transcribe-finished': '已完成',
        'status-starting': '排队/启动中',
        'status-processing': '分析中',
        'status-failed': '失败',
        'status-canceled': '已取消',
        'result-title': '转写完成',
        'btn-md': '下载 Markdown',
        'btn-json': '下载 JSON',
        'btn-copy': '复制文字',
        'btn-new': '开始新转写',
        'status-uploading': '正在将音频提交给 AI 分析...',
        'status-transcribing': 'AI 正在转写 (通常需要 2-5 分钟)...',
        'status-creating-task': '数据传输完毕，正在启动 AI 任务...',
        'status-done': '处理完成！',
        'error-select-file': '请先选择音频文件',
        'recording': '录音中 — ',
        'record-done': '录音完成 — 大小',
        'feedback': '意见反馈',
        'lang-tip': '💡 指定语言可大幅提升转写准确率，减少“幻听”现象。',
        'tab-upload': '导入文件',
        'tab-record': '实时录音',
        'record-stop-confirm': '确认结束录音吗？',
        'record-remove-confirm': '确认移除这段录音吗？',
        'btn-cancel': '取消',
        'confirm-ok': '确定结束',
        'nav-github': '开源项目',
        'open-source-hint': '代码完全开源，支持私人部署以确保 100% 隐私',
    },
    en: {
        'app-title': 'FlashNotes',
        'hero-title': 'AI Audio Transcription',
        'app-desc': 'Auto-transcribe audio with timestamps & speaker tags',
        'upload-title': 'Import Audio for Analysis',
        'upload-subtitle': 'Supports m4a, mp3, wav, flac, ogg, wma, webm, aac',
        'no-file': 'No file selected',
        'or': 'OR',
        'record-start': 'Click to start recording',
        'record-stop': 'Click to stop recording',
        'btn-start': 'Ready to Transcribe',
        'lang-zh': 'Language: Simplified Chinese',
        'lang-en': 'Language: English',
        'lang-mix': 'Language: Mixed (ZH/EN)',
        'step-upload': 'Prepare Data',
        'step-transcribe': 'Transcribing',
        'step-process': 'Process',
        'status-ready': 'Ready...',
        'upload-status': 'Transfer Status: Pending',
        'transfer-progress': 'Transfer Progress',
        'transfer-success': 'Transfer Success',
        'transcribe-status': 'Transcribe Status: Pending',
        'transcribe-creating': 'Starting',
        'transcribe-finished': 'Finished',
        'status-starting': 'Queued/Starting',
        'status-processing': 'Analyzing',
        'status-failed': 'Failed',
        'status-canceled': 'Canceled',
        'result-title': 'Transcription Complete',
        'btn-md': 'Download Markdown',
        'btn-json': 'Download JSON',
        'btn-copy': 'Copy Text',
        'btn-new': 'New Transcription',
        'status-uploading': 'Handing audio to AI for analysis...',
        'status-transcribing': 'AI is transcribing (usually 2-5 mins)...',
        'status-creating-task': 'Transfer complete, starting AI task...',
        'status-done': 'Processing complete!',
        'error-select-file': 'Please select an audio file first',
        'recording': 'Recording — ',
        'record-done': 'Recording complete — Size',
        'feedback': 'Feedback',
        'lang-tip': '💡 Specifying a language significantly improves accuracy and reduces hallucinations.',
        'tab-upload': 'Import File',
        'tab-record': 'Record Audio',
        'record-stop-confirm': 'Are you sure you want to stop recording?',
        'record-remove-confirm': 'Are you sure you want to remove this recording?',
        'btn-cancel': 'Cancel',
        'confirm-ok': 'Stop Recording',
        'nav-github': 'Open Source',
        'open-source-hint': 'Fully open source. Support self-hosting for 100% privacy.',
    }
};

let currentAppLang = localStorage.getItem('appLang') || 'en';

export function getCurrentLang() {
    return currentAppLang;
}

export function setAppLang(lang) {
    if (appI18n[lang]) {
        currentAppLang = lang;
        localStorage.setItem('appLang', lang);
    }
}

export function t(key) {
    return appI18n[currentAppLang][key] || key;
}

export function updateDOMTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });
}
