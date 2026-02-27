/**
 * main.js - App Controller for manual-whisper
 */
import { formatTime, formatBytes, sleep, extractFileBaseName, getAudioDuration } from './utils.js';
import { t, setAppLang, getCurrentLang, updateDOMTranslations } from './i18n.js';
import { uploadFile, createTranscription, pollTranscriptionStatus, getQuota } from './apiService.js';
import { AudioRecorder } from './audioRecorder.js';
import { saveHistory, getAllHistory, getHistoryById, deleteHistoryById, clearAllHistory } from './historyStore.js';
import { dom } from './app/domRefs.js';
import { bindCopyTranscriptButton } from './app/copyButton.js';
import { createProgressController } from './app/flows/progressController.js';
import { createHistoryController } from './app/flows/historyFlow.js';
import { createRecordingController } from './app/flows/recordingFlow.js';
import { createTranscriptionController } from './app/flows/transcriptionFlow.js';
import { createRealtimeTranscriptionController } from './app/flows/realtimeTranscriptionFlow.js';
import {
    getFileExt,
    getTranscriptStatsFromJson,
    statusToLocalized,
    computeTranscribePercent
} from './app/flows/transcriptionHelpers.js';
import {
    initAnalytics,
    bucketizeSeconds,
    trackError,
    trackRecordStart,
    trackRecordStartFailed,
    trackRecordStop,
    trackFileSelect,
    trackSelectionClear,
    trackTranscriptionBlocked,
    trackTranscriptionStart,
    trackTranscriptionComplete,
    trackTranscriptView,
    trackCopyTranscript,
    trackExportTranscript,
    trackAudioDownload,
    trackHistoryView,
    trackHistoryDelete,
    trackHistoryClear
} from './analytics.js';

const {
    inputArea,
    fileInput,
    pickFileBtn,
    fileInfoBar,
    selectedFileName,
    removeFileBtn,
    languageSelectTrigger,
    languageSelectLabel,
    languageOptions,
    languageItems,
    startBtn,
    progressArea,
    resultArea,
    statusText,
    timerDisplay,
    transcriptPreview,
    downloadMdBtn,
    copyTranscriptBtn,
    newUploadBtn,
    resultMeta,
    errorMessage,
    uploadStatusLine,
    transcribeStatusLine,
    uploadProgressFill,
    transcribeProgressFill,
    recordBtn,
    recordStatus,
    volumeMeter,
    waveBars,
    recordPlayback,
    resultPlayback,
    uploadSection,
    recordSection,
    recordInfoBar,
    removeRecordBtn,
    quotaDisplay,
    quotaText,
    cpPlayerUI,
    cpPlayBtn,
    cpIconPlay,
    cpIconPause,
    cpCurrentTime,
    cpDurationTime,
    cpSpeedBtn,
    cpTrack,
    cpFill,
    cpThumb,
    cpDownloadBtn,
    resPlayerUI,
    resPlayBtn,
    resIconPlay,
    resIconPause,
    resCurrentTime,
    resDurationTime,
    resSpeedBtn,
    resTrack,
    resFill,
    resThumb,
    resDownloadBtn,
    confirmModal,
    confirmOkBtn,
    confirmCancelBtn,
    modalTitle,
    historyList,
    historyClearBtn,
    historyEmpty,
    appLangTrigger,
    appLangLabel,
    appLangOptions,
    recordLabel,
    recordSvgMic,
    recordSvgStop,
    actionWrapper,
    historyPanel,
    realtimeToggleInput,
    realtimePanel,
    realtimeChunksContainer,
    recordingSidebar,
    resultsSidebar,
    transcriptPreviewBox,
    resultTabs,
    tabTranscript,
    tabMinutes,
    tabMinutesStatus,
    minutesPreviewBox,
    minutesLoading,
    minutesErrorView,
    retryMinutesBtn,
    minutesPreview,
} = dom;

// --- Global State ---
let lastAudioUrl = null;
let recordPlaybackUrl = null;
let currentAudioUrl = null; // Stored Replicate file URL
let startTime;
let timerInterval;
let currentFileBaseName = 'transcript';
let selectedFile = null;
let running = false;
let transcribePercentHint = 0;
let currentTranscriptionLanguage = getCurrentLang(); // Default to app language
let modalContext = null; // 'stop' or 'remove'
let lastQuotaData = null;
let lastSelectedSource = null; // 'upload' | 'record' | null
let lastTranscriptionInputSource = null; // 'upload' | 'record' | null
let lastTranscriptionAudioDurationSec = 0;
let lastTranscriptionAudioDurationBucket = 'unknown';

// --- Initialize Components ---
const recorder = new AudioRecorder();
recorder.onVolumeChange = (rms) => {
    const level = Math.min(1, rms * 6);
    waveBars.forEach((bar, i) => {
        const variance = 0.7 + Math.random() * 0.7;
        const h = Math.max(8, Math.round(level * 40 * variance));
        bar.style.height = `${h}px`;
        bar.style.opacity = level < 0.05 ? '0.3' : '1';
    });
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.flac', '.ogg', '.wma', '.webm', '.aac'];

const progressController = createProgressController({
    uploadProgressFill,
    uploadStatusLine,
    transcribeProgressFill,
    transcribeStatusLine,
    statusText,
    t
});
const {
    setUploadProgress,
    setTranscribeProgress,
    updateStatus,
    resetRuntimeBox,
} = progressController;

const historyController = createHistoryController({
    historyList,
    historyEmpty,
    historyClearBtn,
    getAllHistory,
    getHistoryById,
    requestDeleteHistory: (id) => {
        modalContext = 'delete-history';
        modalTitle.textContent = t('record-remove-confirm');
        confirmOkBtn.textContent = t('confirm-ok-label');
        confirmModal.dataset.deleteId = id;
        confirmModal.classList.remove('hidden');
    },
    resetUI,
    inputArea,
    resultArea,
    transcriptPreview,
    getTranscriptStatsFromJson,
    trackHistoryView,
    trackTranscriptView,
    setupDownload,
    downloadMdBtn,
    extractFileBaseName,
    formatBytes,
    resultMeta,
    copyTranscriptBtn,
    bindCopyTranscriptButton,
    t,
    trackCopyTranscript,
    resultPlayback,
    resPlayerUI,
    resFill,
    resThumb,
    resCurrentTime,
    resIconPlay,
    resIconPause,
    resSpeedBtn,
});
const { renderHistoryList } = historyController;

const recordingController = createRecordingController({
    recorder,
    t,
    formatBytes,
    trackRecordStart,
    trackRecordStartFailed,
    trackRecordStop,
    updateSelectedFile,
    showError,
    getSelectedFile: () => selectedFile,
    getRecordPlaybackUrl: () => recordPlaybackUrl,
    setRecordPlaybackUrl: (nextUrl) => {
        recordPlaybackUrl = nextUrl;
    },
    ui: {
        startBtn,
        pickFileBtn,
        fileInput,
        uploadSection,
        cpPlayerUI,
        recordPlayback,
        recordSvgMic,
        recordSvgStop,
        recordLabel,
        recordBtn,
        recordInfoBar,
        removeRecordBtn,
        recordStatus,
        errorMessage,
        volumeMeter,
        waveBars,
        cpFill,
        cpThumb,
        cpCurrentTime,
        cpIconPlay,
        cpIconPause,
    }
});

const transcriptionController = createTranscriptionController({
    t,
    formatBytes,
    getAudioDuration,
    bucketizeSeconds,
    uploadFile,
    createTranscription,
    pollTranscriptionStatus,
    getAllHistory,
    getFileExt,
    getTranscriptStatsFromJson,
    computeTranscribePercent,
    statusToLocalized,
    trackTranscriptionBlocked,
    trackTranscriptionStart,
    trackTranscriptionComplete,
    trackTranscriptView,
    trackCopyTranscript,
    saveHistory,
    bindCopyTranscriptButton,
    setupDownload,
    updateTranscriptionLanguageUI,
    setControlsDisabled,
    startTimer,
    stopTimer,
    resetRuntimeBox,
    updateStatus,
    setUploadProgress,
    setTranscribeProgress,
    resetUI,
    showError,
    checkAndDisplayQuota,
    setRunning: (next) => {
        running = next;
    },
    getRunning: () => running,
    getSelectedFile: () => selectedFile,
    getCurrentFileBaseName: () => currentFileBaseName,
    getLastSelectedSource: () => lastSelectedSource,
    getLastTranscriptionInputSource: () => lastTranscriptionInputSource,
    setLastTranscriptionInputSource: (next) => {
        lastTranscriptionInputSource = next;
    },
    getLastTranscriptionAudioDurationSec: () => lastTranscriptionAudioDurationSec,
    setLastTranscriptionAudioDurationSec: (next) => {
        lastTranscriptionAudioDurationSec = next;
    },
    getLastTranscriptionAudioDurationBucket: () => lastTranscriptionAudioDurationBucket,
    setLastTranscriptionAudioDurationBucket: (next) => {
        lastTranscriptionAudioDurationBucket = next;
    },
    getCurrentAudioUrl: () => currentAudioUrl,
    setCurrentAudioUrl: (next) => {
        currentAudioUrl = next;
    },
    getRecordPlaybackUrl: () => recordPlaybackUrl,
    getLastAudioUrl: () => lastAudioUrl,
    getStartTime: () => startTime,
    getTranscribePercentHint: () => transcribePercentHint,
    setTranscribePercentHint: (next) => {
        transcribePercentHint = next;
    },
    MAX_UPLOAD_BYTES,
    SUPPORTED_EXTENSIONS,
    ui: {
        inputArea,
        progressArea,
        resultArea,
        errorMessage,
        transcriptPreview,
        downloadMdBtn,
        resultMeta,
        copyTranscriptBtn,
        resultPlayback,
        resPlayerUI,
        resFill,
        resThumb,
        resCurrentTime,
        resIconPlay,
        resIconPause,
        resSpeedBtn,
    }
});

const realtimeTranscriptionController = createRealtimeTranscriptionController({
    recorder,
    uploadFile,
    createTranscription,
    pollTranscriptionStatus,
    renderRealtimeProgress: (status, chunks) => {
        realtimeChunksContainer.innerHTML = '';
        if (chunks.length === 0) return;

        chunks.forEach(chunk => {
            const el = document.createElement('div');
            el.className = 'realtime-chunk';

            const header = document.createElement('div');
            header.className = 'chunk-header';

            const title = document.createElement('span');
            title.textContent = `${t('realtime-chunk')} ${chunk.index + 1} (${formatTime(chunk.startTime)} - ${formatTime(chunk.endTime)})`;

            const st = document.createElement('div');
            st.className = `chunk-status ${chunk.status === 'succeeded' ? 'success' : chunk.status === 'failed' ? 'error' : 'processing'}`;
            if (chunk.status === 'succeeded') st.textContent = '✅ ' + t('status-done');
            else if (chunk.status === 'failed') st.textContent = '❌ ' + t('status-error');
            else if (chunk.status === 'waiting') st.textContent = '⏳ ' + t('transcribe-creating');
            else st.textContent = '⏳ ' + t('status-processing');

            header.appendChild(title);
            header.appendChild(st);
            el.appendChild(header);

            if (chunk.status === 'waiting') {
                const waitingTxt = document.createElement('div');
                waitingTxt.className = 'chunk-text waiting-pulse';
                waitingTxt.textContent = t('realtime-waiting');
                el.appendChild(waitingTxt);
            } else if (chunk.text || (chunk.output && chunk.output.markdown)) {
                const txt = document.createElement('div');
                txt.className = 'chunk-text';
                txt.textContent = chunk.text || chunk.output.markdown;
                el.appendChild(txt);
            }
            realtimeChunksContainer.appendChild(el);
        });

        realtimeChunksContainer.scrollTop = realtimeChunksContainer.scrollHeight;
    }
});

// --- Functions ---

function setupCustomPlayer(audio, playBtn, iconPlay, iconPause, currentTime, durationTime, speedBtn, track, fill, thumb, downloadBtn) {
    playBtn.addEventListener('click', () => {
        if (audio.paused) audio.play();
        else audio.pause();
    });

    audio.addEventListener('play', () => {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    });

    audio.addEventListener('pause', () => {
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
    });

    audio.addEventListener('timeupdate', () => {
        if (durationTime.textContent === '0:00' && audio.duration) {
            durationTime.textContent = formatTime(audio.duration);
        }
        const p = (audio.currentTime / audio.duration) * 100;
        fill.style.width = `${p}%`;
        thumb.style.left = `${p}%`;
        currentTime.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
        durationTime.textContent = formatTime(audio.duration);
    });

    track.addEventListener('click', (e) => {
        const rect = track.getBoundingClientRect();
        const p = (e.clientX - rect.left) / rect.width;
        audio.currentTime = p * audio.duration;
    });

    const speeds = [1, 1.25, 1.5, 2, 0.75];
    let speedIdx = 0;
    speedBtn.addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        const s = speeds[speedIdx];
        audio.playbackRate = s;
        speedBtn.textContent = `${s}×`;
    });

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!audio.src) return;
            trackAudioDownload(audio.id === 'record-playback' ? 'record_preview' : 'result_audio');
            const a = document.createElement('a');
            a.href = audio.src;
            // Determine extension from original filename if possible, otherwise .wav for recordings
            let ext = '.wav';
            if (audio.id === 'result-playback' && selectedFile) {
                const parts = selectedFile.name.split('.');
                if (parts.length > 1) ext = '.' + parts.pop();
            }
            a.download = currentFileBaseName + ext;
            a.click();
        });
    }
}

function updateAppLanguageUI(lang) {
    setAppLang(lang);
    updateDOMTranslations();

    // Update Dropdown UI
    const items = appLangOptions.querySelectorAll('.dropdown-item');

    appLangLabel.textContent = lang.toUpperCase();
    items.forEach(item => {
        item.classList.toggle('active', item.dataset.value === lang);
    });

    if (!selectedFile && !recordPlaybackUrl) {
        selectedFileName.textContent = t('no-file');
    }

    recordLabel.textContent = recordingController.isRecording() ? t('record-stop') : t('record-start');

    // Sync transcription language if no manual choice has been saved yet
    const savedTransLang = localStorage.getItem('trans_lang');
    if (!savedTransLang) {
        updateTranscriptionLanguageUI(lang, false);
    } else {
        updateTranscriptionLanguageUI(currentTranscriptionLanguage, false);
    }
    renderQuota(lastQuotaData);
}

function updateTranscriptionLanguageUI(langValue, save = true) {
    currentTranscriptionLanguage = langValue;
    if (save) {
        localStorage.setItem('trans_lang', langValue);
    }
    languageItems.forEach(item => {
        const isActive = item.dataset.value === langValue;
        item.classList.toggle('active', isActive);
        if (isActive) {
            languageSelectLabel.textContent = item.textContent;
        }
    });
}

function updateSelectedFile(file, source = 'upload', meta = {}) {
    selectedFile = file;
    const splitDivider = document.querySelector('.split-divider');

    if (!file) {
        lastSelectedSource = null;
        if (selectedFileName) selectedFileName.textContent = '';
        if (fileInfoBar) fileInfoBar.classList.add('hidden');
        if (recordInfoBar) recordInfoBar.classList.add('hidden');
        recordStatus.textContent = '';
        recordSection.classList.remove('dimmed', 'hidden');

        // If real-time transcription is active, keep uploadSection hidden
        if (realtimeTranscriptionController && realtimeTranscriptionController.getIsActive()) {
            uploadSection.classList.add('hidden');
        } else {
            uploadSection.classList.remove('dimmed', 'hidden');
        }

        if (realtimePanel && !(realtimeTranscriptionController && realtimeTranscriptionController.getIsActive())) {
            realtimePanel.classList.add('hidden');
        }
        if (splitDivider) splitDivider.classList.remove('hidden');

        recordBtn.classList.remove('hidden');
        recordLabel.classList.remove('hidden');

        startBtn.disabled = true;
        cpPlayerUI.classList.add('hidden');
        if (recordPlaybackUrl) {
            URL.revokeObjectURL(recordPlaybackUrl);
            recordPlaybackUrl = null;
        }

        if (actionWrapper) actionWrapper.classList.add('hidden');
        return;
    }

    lastSelectedSource = source;

    if (source === 'upload') {
        const fileSizeMB = Math.round(file.size / 1024 / 1024 * 10) / 10;
        trackFileSelect(meta.selectMethod || 'unknown', getFileExt(file.name), fileSizeMB);
        selectedFileName.textContent = `${file.name} (${formatBytes(file.size)})`;
        if (fileInfoBar) fileInfoBar.classList.remove('hidden');
        if (recordInfoBar) recordInfoBar.classList.add('hidden');
        recordStatus.textContent = '';
        recordSection.classList.add('hidden');
        if (splitDivider) splitDivider.classList.add('hidden');
        uploadSection.classList.remove('dimmed');
    } else {
        if (fileInfoBar) fileInfoBar.classList.add('hidden');
        if (recordInfoBar) recordInfoBar.classList.remove('hidden');
        if (removeRecordBtn) removeRecordBtn.classList.remove('hidden'); // Show remove button when done

        uploadSection.classList.add('hidden');
        if (splitDivider) splitDivider.classList.add('hidden');
        recordSection.classList.remove('dimmed');

        recordBtn.classList.add('hidden');
        recordLabel.classList.add('hidden');
    }

    currentFileBaseName = extractFileBaseName(file.name);
    startBtn.disabled = false;

    if (actionWrapper) actionWrapper.classList.remove('hidden');

    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
    lastAudioUrl = URL.createObjectURL(file);
}

function setupDownload(btn, content, filename, type, meta = {}) {
    btn.onclick = () => {
        if (meta && meta.exportFormat && meta.viewSource) {
            trackExportTranscript(meta.exportFormat, meta.viewSource);
        }
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
}

function showError(msg) {
    errorMessage.textContent = `${t('error-prefix')}${msg}`;
    errorMessage.classList.remove('hidden');
    trackError(msg, 'ui');
}

function resetUI() {
    clearInterval(timerInterval);
    inputArea.parentNode.classList.remove('hidden');
    inputArea.classList.remove('hidden');
    progressArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    errorMessage.classList.add('hidden');
    running = false;
    setControlsDisabled(false);
    selectedFile = null;
    fileInput.value = '';
    selectedFileName.textContent = t('no-file');
    currentFileBaseName = 'transcript';
    transcriptPreview.textContent = '';
    recordStatus.textContent = '';
    cpPlayerUI.classList.add('hidden');
    recordPlayback.src = '';
    recordPlayback.playbackRate = 1;
    cpSpeedBtn.textContent = '1×';
    resPlayerUI.classList.add('hidden');
    resultPlayback.src = '';
    currentAudioUrl = null;

    if (realtimePanel) {
        realtimePanel.classList.add('hidden');
        const realtimeHeaderTitle = realtimePanel.querySelector('#realtime-panel-title-result');
        if (realtimeHeaderTitle) {
            realtimeHeaderTitle.textContent = t('realtime-panel-title');
        }
    }
    if (realtimeChunksContainer) realtimeChunksContainer.innerHTML = '';
    if (recordingSidebar) {
        recordingSidebar.classList.add('hidden');
        // Move record-module back to its original location in record-section
        const recordModule = recordingSidebar.querySelector('.record-module');
        if (recordModule) {
            recordModule.classList.remove('record-module-sidebar');
            recordSection.appendChild(recordModule);
        }
    }
    if (resultsSidebar) resultsSidebar.classList.remove('hidden');
    if (transcriptPreviewBox) transcriptPreviewBox.classList.remove('hidden');

    // 还原上传区与录音区的完整初始可见状态
    uploadSection.classList.remove('dimmed', 'hidden');
    recordSection.classList.remove('dimmed', 'hidden');

    // 还原 hero subtitle（录音实时模式下会隐藏）
    const heroDesc = document.querySelector('.hero-desc');
    if (heroDesc) heroDesc.classList.remove('hidden');

    const splitDivider = document.querySelector('.split-divider');
    if (splitDivider) splitDivider.classList.remove('hidden');

    if (historyPanel) historyPanel.classList.remove('hidden');

    // 还原录音按钮与标签
    recordBtn.classList.remove('hidden', 'recording');
    if (recordLabel) {
        recordLabel.classList.remove('hidden');
        recordLabel.textContent = t('record-start');
    }
    recordSvgMic.classList.remove('hidden');
    recordSvgStop.classList.add('hidden');
    volumeMeter.classList.add('hidden');

    // 隐藏录音/上传信息栏及移除按钮
    if (fileInfoBar) fileInfoBar.classList.add('hidden');
    if (recordInfoBar) recordInfoBar.classList.add('hidden');
    if (removeRecordBtn) removeRecordBtn.classList.add('hidden');

    // 隐藏 action-wrapper（无文件时不显示语言选择和开始按钮）
    if (actionWrapper) actionWrapper.classList.add('hidden');

    if (recordPlaybackUrl) {
        URL.revokeObjectURL(recordPlaybackUrl);
        recordPlaybackUrl = null;
    }
    if (lastAudioUrl) {
        URL.revokeObjectURL(lastAudioUrl);
        lastAudioUrl = null;
    }

    renderHistoryList();
}

function setControlsDisabled(disabled) {
    startBtn.disabled = disabled || !selectedFile;
    pickFileBtn.disabled = disabled;
    fileInput.disabled = disabled;
    if (disabled) {
        languageSelectTrigger.classList.add('disabled');
        languageSelectTrigger.style.opacity = '0.5';
        languageSelectTrigger.style.pointerEvents = 'none';
    } else {
        languageSelectTrigger.classList.remove('disabled');
        languageSelectTrigger.style.opacity = '1';
        languageSelectTrigger.style.pointerEvents = 'auto';
    }
    recordBtn.disabled = disabled;
}

function startTimer() {
    clearInterval(timerInterval);
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        timerDisplay.textContent = `${diff}s`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

async function checkAndDisplayQuota() {
    try {
        const adminSecret = new URLSearchParams(window.location.search).get('admin');
        if (adminSecret) {
            renderQuota({ admin: true });
            return;
        }

        const data = await getQuota();
        if (data) {
            lastQuotaData = data;
            renderQuota(data);
        }
    } catch (err) {
        // fail silently
    }
}

function renderQuota(data) {
    if (!data) return;

    const adminSecret = new URLSearchParams(window.location.search).get('admin');
    if (data.admin || adminSecret) {
        quotaDisplay.classList.remove('hidden');
        quotaText.textContent = t('quota-admin');
        return;
    }

    if (data && typeof data.limit === 'number') {
        quotaDisplay.classList.remove('hidden');
        const usedMin = Math.round(data.used / 60);
        const totalMin = Math.round(data.limit / 60);
        const remainingMin = Math.max(0, totalMin - usedMin);

        const label = window.innerWidth < 480 ? '' : t('quota-label');
        quotaText.textContent = `${label}${remainingMin} / ${totalMin} ${t('quota-unit')}`;

        if (remainingMin <= 0) {
            quotaDisplay.style.color = '#ef4444';
            quotaDisplay.style.borderColor = '#ef4444';
            quotaDisplay.style.backgroundColor = 'rgba(254, 226, 226, 0.9)';
        } else if (remainingMin < 30) {
            quotaDisplay.style.color = '#f59e0b';
            quotaDisplay.style.borderColor = '#f59e0b';
            quotaDisplay.style.backgroundColor = 'var(--card-bg)';
        } else {
            quotaDisplay.style.color = 'var(--text-muted)';
            quotaDisplay.style.borderColor = 'var(--glass-border)';
            quotaDisplay.style.backgroundColor = 'var(--card-bg)';
        }
    }
}

// --- Initialize App ---
function initialize() {
    initAnalytics();
    // App Language Dropdown
    const appLangItems = appLangOptions.querySelectorAll('.dropdown-item');

    updateAppLanguageUI(getCurrentLang());
    document.documentElement.classList.remove('lang-loading');

    appLangTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        appLangOptions.classList.toggle('hidden');
        languageOptions.classList.add('hidden');
    });

    appLangItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            updateAppLanguageUI(item.dataset.value);
            appLangOptions.classList.add('hidden');
        });
    });

    const savedTransLang = localStorage.getItem('trans_lang');
    if (savedTransLang) {
        updateTranscriptionLanguageUI(savedTransLang, false);
    } else {
        updateTranscriptionLanguageUI(getCurrentLang(), false);
    }

    languageSelectTrigger.addEventListener('click', (e) => {
        if (languageSelectTrigger.classList.contains('disabled')) return;
        e.stopPropagation();
        languageOptions.classList.toggle('hidden');
        appLangOptions.classList.add('hidden');
    });

    languageItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            updateTranscriptionLanguageUI(item.dataset.value);
            languageOptions.classList.add('hidden');
        });
    });

    document.addEventListener('click', (e) => {
        if (!languageSelectTrigger.contains(e.target)) {
            languageOptions.classList.add('hidden');
        }
        if (!appLangTrigger.contains(e.target)) {
            appLangOptions.classList.add('hidden');
        }
    });

    pickFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        updateSelectedFile(file || null, 'upload', { selectMethod: 'picker' });
    });

    inputArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        inputArea.classList.add('dragover');
    });
    inputArea.addEventListener('dragleave', () => {
        inputArea.classList.remove('dragover');
    });
    inputArea.addEventListener('drop', (e) => {
        e.preventDefault();
        inputArea.classList.remove('dragover');
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        updateSelectedFile(file || null, 'upload', { selectMethod: 'drop' });
    });

    startBtn.addEventListener('click', async () => {
        await transcriptionController.startTranscriptionTask(selectedFile, currentTranscriptionLanguage);
    });

    newUploadBtn.addEventListener('click', () => {
        resetUI();
    });


    if (historyClearBtn) {
        historyClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            modalContext = 'clear-history';
            modalTitle.textContent = t('history-clear-confirm');
            confirmOkBtn.textContent = t('confirm-ok-label');
            confirmModal.classList.remove('hidden');
        });
    }

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        if (selectedFile) trackSelectionClear(lastSelectedSource || 'upload');
        updateSelectedFile(null);
    });

    removeRecordBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modalContext = 'remove';
        modalTitle.textContent = t('record-remove-confirm');
        confirmOkBtn.textContent = t('confirm-remove-label');
        confirmModal.classList.remove('hidden');
    });

    recordBtn.addEventListener('click', () => {
        if (recordingController.isRecording()) {
            modalContext = 'stop';
            modalTitle.textContent = t('record-stop-confirm');
            confirmOkBtn.textContent = t('confirm-ok');
            confirmModal.classList.remove('hidden');
        } else {
            recordingController.startRecording();

            // Start realtime transcription if enabled
            if (realtimeToggleInput.checked) {
                realtimeTranscriptionController.setIsActive(true);

                // Move the existing record-module into the result-area sidebar (no duplicate IDs)
                const recordModule = recordSection.querySelector('.record-module');
                if (recordModule && recordingSidebar) {
                    recordModule.classList.add('record-module-sidebar');
                    recordingSidebar.appendChild(recordModule);
                }

                // Switch to result-area layout (left=live transcript, right=recording controls)
                inputArea.parentNode.classList.add('hidden');
                resultArea.classList.remove('hidden');
                if (transcriptPreviewBox) transcriptPreviewBox.classList.add('hidden');
                realtimePanel.classList.remove('hidden');
                if (recordingSidebar) recordingSidebar.classList.remove('hidden');
                if (resultsSidebar) resultsSidebar.classList.add('hidden');
                if (historyPanel) historyPanel.classList.add('hidden');
                if (dom.quotaDisplay) dom.quotaDisplay.classList.add('hidden');

                realtimeTranscriptionController.start(currentTranscriptionLanguage);
            } else {
                realtimeTranscriptionController.setIsActive(false);
                realtimePanel.classList.add('hidden');
            }
        }
    });

    confirmOkBtn.addEventListener('click', async () => {
        confirmModal.classList.add('hidden');
        if (modalContext === 'stop') {
            recordingController.stopRecording();

            if (realtimeToggleInput.checked && realtimeTranscriptionController.getIsActive()) {
                // Update live panel header to show merging state
                const realtimeHeaderTitle = realtimePanel.querySelector('#realtime-panel-title-result');
                if (realtimeHeaderTitle) {
                    realtimeHeaderTitle.textContent = t('realtime-merging');
                }

                // Hide the recording sidebar and move record-module back
                if (recordingSidebar) {
                    const recordModule = recordingSidebar.querySelector('.record-module');
                    if (recordModule) {
                        recordModule.classList.remove('record-module-sidebar');
                        recordSection.appendChild(recordModule);
                    }
                    recordingSidebar.classList.add('hidden');
                }

                try {
                    const finalOutput = await realtimeTranscriptionController.stop(currentTranscriptionLanguage);
                    // finishProcess will: hide inputArea.parentNode, show resultArea, populate transcript
                    // We're already in resultArea, so we just need to swap left/right content
                    if (transcriptPreviewBox) transcriptPreviewBox.classList.remove('hidden');
                    realtimePanel.classList.add('hidden');
                    if (resultsSidebar) resultsSidebar.classList.remove('hidden');
                    if (dom.quotaDisplay) dom.quotaDisplay.classList.remove('hidden');
                    transcriptionController.finishProcess(finalOutput);
                } catch (err) {
                    showError(err.message || 'Error processing realtime chunks');
                    resetUI();
                }
            }
        } else if (modalContext === 'remove') {
            trackSelectionClear(lastSelectedSource || (recordPlaybackUrl ? 'record' : (selectedFile ? 'upload' : 'unknown')));
            updateSelectedFile(null);
        } else if (modalContext === 'delete-history') {
            const id = confirmModal.dataset.deleteId;
            if (id) {
                trackHistoryDelete(getAllHistory().length);
                deleteHistoryById(id);
                renderHistoryList();
            }
        } else if (modalContext === 'clear-history') {
            trackHistoryClear(getAllHistory().length);
            clearAllHistory();
            renderHistoryList();
        }
    });

    confirmCancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    // Close modal on overlay click
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.add('hidden');
        }
    });

    setupCustomPlayer(recordPlayback, cpPlayBtn, cpIconPlay, cpIconPause, cpCurrentTime, cpDurationTime, cpSpeedBtn, cpTrack, cpFill, cpThumb, cpDownloadBtn);
    setupCustomPlayer(resultPlayback, resPlayBtn, resIconPlay, resIconPause, resCurrentTime, resDurationTime, resSpeedBtn, resTrack, resFill, resThumb, resDownloadBtn);

    renderHistoryList();
    checkAndDisplayQuota();
}

// Start the app
initialize();
