/**
 * I18n module for manual-whisper
 */

export const appI18n = {
    zh: {
        'app-title': '闪记',
        'hero-title': 'AI 录音转写',
        'app-desc': '基于 OpenAI Whisper 与 WhisperX · 自动生成带时间戳和说话人标签的文字稿',
        'upload-title': '导入音频',
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
        'upload-status': '状态：待开始',
        'transfer-progress': '进度',
        'transfer-success': '准备就绪',
        'transcribe-status': '转写状态：待开始',
        'transcribe-creating': '正在启动',
        'transcribe-finished': '已完成',
        'status-starting': '排队/启动中',
        'status-processing': '分析中',
        'status-failed': '失败',
        'status-canceled': '已取消',
        'result-title': '转写完成',
        'btn-md': '下载 Markdown',
        'btn-copy': '复制文字',
        'btn-new': '开始新转写',
        'status-uploading': '正在准备音频并启动分析...',
        'status-transcribing': 'AI 正在转写 (通常需要 2-5 分钟)...',
        'status-creating-task': '准备就绪，正在启动 AI 任务...',
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
        'history-title': '历史记录',
        'history-empty': '暂无转写记录',
        'history-clear': '清空全部',
        'history-clear-confirm': '确定要清空所有历史记录吗？',
        'history-deleted': '已删除',
        'quota-admin': '⭐ 管理员模式已开启',
        'quota-label': '本周剩余可转写：',
        'quota-unit': '分钟',
        'app-lang-zh': '简体中文 (ZH)',
        'app-lang-en': 'English (EN)',
        'recording-name-prefix': '录音_',
        'error-file-empty': '文件为空，请重新选择',
        'error-file-too-large': '文件过大，当前直传上限约 100MB',
        'error-file-format': '文件格式不支持',
        'error-duration-limit': '音频长度超过 60 分钟限制。',
        'elapsed': '，已用时 ',
        'logs-recent': '最近日志',
        'process-cleanup': '后处理：清理 {cleaned}，删除 {removed}',
        'quality-warning': '质量告警',
        'second-pass': '二次修复',
        'second-pass-window': '，窗口 ',
        'copied': '已复制',
        'error-prefix': '错误: ',
        'confirm-ok-label': '确定',
        'confirm-remove-label': '确定移除',
        'error-timeout': '转写超时，请稍后重试',
        'colon': '：',
        'play': '播放',
        'download-audio': '下载音频',
        'error-api-token': '获取上传凭证失败',
        'error-op-failed': '操作失败',
        'error-op-canceled': '操作被取消',
        'error-network': '网络请求异常',
        'error-parse': '解析异常',
        'error-no-url': '未获取到文件地址',
        'feedback-title': '转写完成！体验如何？',
        'feedback-subtitle': '你的反馈帮助我们持续改进',
        'feedback-placeholder': '有什么想告诉我们的？（可选）',
        'feedback-submit': '提交反馈',
        'feedback-skip': '跳过',
        'feedback-thanks': '感谢你的反馈！ 🙏',

        // Real-time transcription 
        'realtime-toggle-title': '实时转写',
        'realtime-toggle-desc': '录音时自动转写，无需等待',
        'realtime-panel-title': '实时转写中...',
        'realtime-chunk-uploading': '上传中...',
        'realtime-chunk-transcribing': '解析中...',
        'realtime-chunk-merging': '合并 1/1 个片段... ',
        'realtime-chunk-merging-n': '合并 {n} 个片段... ',
        'realtime-chunk': '片段',
        'realtime-merging': '正在合并实时转写结果...',
        'realtime-waiting': '等待首个音频片段生成...',

        // AI Meeting Minutes
        'tab-transcript': '转写原文',
        'tab-minutes': '会议纪要',
        'minutes-generating': '正在生成会议纪要...',
        'minutes-error': '生成失败，请重试',
        'btn-retry': '重试',
    },
    en: {
        'app-title': 'FlashNotes',
        'hero-title': 'AI Audio Transcription',
        'app-desc': 'Powered by OpenAI Whisper & WhisperX · Auto-transcribe with timestamps & speaker tags',
        'upload-title': 'Import Audio',
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
        'upload-status': 'Status: Pending',
        'transfer-progress': 'Progress',
        'transfer-success': 'Ready',
        'transcribe-status': 'Transcribe Status: Pending',
        'transcribe-creating': 'Starting',
        'transcribe-finished': 'Finished',
        'status-starting': 'Queued/Starting',
        'status-processing': 'Analyzing',
        'status-failed': 'Failed',
        'status-canceled': 'Canceled',
        'result-title': 'Transcription Complete',
        'btn-md': 'Download Markdown',
        'btn-copy': 'Copy Text',
        'btn-new': 'New Transcription',
        'status-uploading': 'Preparing audio for AI analysis...',
        'status-transcribing': 'AI is transcribing (usually 2-5 mins)...',
        'status-creating-task': 'Ready, starting AI task...',
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
        'history-title': 'History',
        'history-empty': 'No transcription history yet',
        'history-clear': 'Clear All',
        'history-clear-confirm': 'Are you sure you want to clear all history?',
        'history-deleted': 'Deleted',
        'quota-admin': '⭐ Admin bypass active',
        'quota-label': 'Weekly unused: ',
        'quota-unit': 'mins',
        'app-lang-zh': '简体中文 (ZH)',
        'app-lang-en': 'English (EN)',
        'recording-name-prefix': 'Record_',
        'error-file-empty': 'File is empty, please select again',
        'error-file-too-large': 'File too large, limit is 100MB',
        'error-file-format': 'Unsupported file format',
        'error-duration-limit': 'Audio length exceeds 60 minutes limit.',
        'elapsed': ', elapsed ',
        'logs-recent': 'Recent logs',
        'process-cleanup': 'Cleanup: {cleaned} cleaned, {removed} removed',
        'quality-warning': 'Quality warning',
        'second-pass': 'Second Pass',
        'second-pass-window': ', window ',
        'copied': 'Copied',
        'error-prefix': 'Error: ',
        'confirm-ok-label': 'OK',
        'confirm-remove-label': 'Remove',
        'error-timeout': 'Transcription timed out, please try again later',
        'colon': ': ',
        'play': 'Play',
        'download-audio': 'Download Audio',
        'error-api-token': 'Failed to get upload token',
        'error-op-failed': 'Operation failed',
        'error-op-canceled': 'Operation canceled',
        'error-network': 'Network request error',
        'error-parse': 'Parse error',
        'error-no-url': 'File URL not found',
        'feedback-title': 'Transcription done! How was it?',
        'feedback-subtitle': 'Your feedback helps us improve',
        'feedback-placeholder': 'Anything you want to share? (optional)',
        'feedback-submit': 'Submit',
        'feedback-skip': 'Skip',
        'feedback-thanks': 'Thanks for your feedback! 🙏',

        // Real-time transcription
        'realtime-toggle-title': 'Real-time Transcription',
        'realtime-toggle-desc': 'Auto-transcribe while recording',
        'realtime-panel-title': 'Real-time transcribing...',
        'realtime-chunk-uploading': 'Uploading...',
        'realtime-chunk-transcribing': 'Transcribing...',
        'realtime-chunk-merging': 'Merging 1 segment... ',
        'realtime-chunk-merging-n': 'Merging {n} segments... ',
        'realtime-chunk': 'Segment',
        'realtime-merging': 'Merging real-time results...',
        'realtime-waiting': 'Waiting for the first audio segment...',

        // AI Meeting Minutes
        'tab-transcript': 'Transcript',
        'tab-minutes': 'AI Minutes',
        'minutes-generating': 'Generating meeting minutes...',
        'minutes-error': 'Failed to generate, please retry',
        'btn-retry': 'Retry',
    }
};

const normalizeLang = (lang) => {
    if (!lang) return 'en';
    const base = lang.split('-')[0].toLowerCase();
    return appI18n[base] ? base : 'en';
};

const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
const storedLang = localStorage.getItem('appLang');
let currentAppLang = storedLang
    ? normalizeLang(storedLang)
    : (isWeChat ? 'zh' : normalizeLang(null));

export function getCurrentLang() {
    return currentAppLang;
}

export function setAppLang(lang) {
    const normalized = normalizeLang(lang);
    currentAppLang = normalized;
    localStorage.setItem('appLang', normalized);
}

export function t(key, params = {}) {
    if (!key) return '';
    const k = String(key).trim();
    let text = k;
    if (appI18n[currentAppLang] && appI18n[currentAppLang][k]) {
        text = appI18n[currentAppLang][k];
    } else if (appI18n['en'] && appI18n['en'][k]) {
        text = appI18n['en'][k];
    }

    if (params && typeof params === 'object') {
        Object.keys(params).forEach(p => {
            text = text.replace(new RegExp(`\\{${p}\\}`, 'g'), params[p]);
        });
    }
    return text;
}

export function updateDOMTranslations() {
    // textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    // title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.setAttribute('title', t(key));
    });
    // placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.setAttribute('placeholder', t(key));
    });
}
