/**
 * main.js - App Controller for manual-whisper
 */
import { formatTime, formatBytes, sleep, clampPercent, extractFileBaseName } from './utils.js';
import { t, setAppLang, getCurrentLang, updateDOMTranslations } from './i18n.js';
import { uploadFile, createTranscription, pollTranscriptionStatus } from './apiService.js';
import { AudioRecorder } from './audioRecorder.js';

// --- DOM Elements ---
const inputArea = document.getElementById('input-area');
const fileInput = document.getElementById('file-input');
const pickFileBtn = document.getElementById('pick-file-btn');
const fileInfoBar = document.getElementById('file-info-bar');
const selectedFileName = document.getElementById('selected-file-name');
const removeFileBtn = document.getElementById('remove-file-btn');
const languageSelectTrigger = document.getElementById('language-select-trigger');
const languageSelectLabel = document.getElementById('language-select-label');
const languageOptions = document.getElementById('language-options');
const languageItems = document.querySelectorAll('.dropdown-item');
const startBtn = document.getElementById('start-btn');
const progressArea = document.getElementById('progress-area');
const resultArea = document.getElementById('result-area');
const statusText = document.getElementById('status-text');
const timerDisplay = document.getElementById('timer');
const transcriptPreview = document.getElementById('transcript-preview');
const downloadMdBtn = document.getElementById('download-md');
const downloadJsonBtn = document.getElementById('download-json');
const copyTranscriptBtn = document.getElementById('copy-transcript');
const newUploadBtn = document.getElementById('new-upload-btn');
const resultMeta = document.getElementById('result-meta');
const errorMessage = document.getElementById('error-message');
const uploadStatusLine = document.getElementById('upload-status-line');
const transcribeStatusLine = document.getElementById('transcribe-status-line');
const uploadProgressFill = document.getElementById('upload-progress-fill');
const transcribeProgressFill = document.getElementById('transcribe-progress-fill');
const taskIdLine = document.getElementById('task-id-line');
const transcribeLogLine = document.getElementById('transcribe-log-line');
const recordBtn = document.getElementById('record-btn');
const recordStatus = document.getElementById('record-status');
const volumeMeter = document.getElementById('volume-meter');
const waveBars = document.querySelectorAll('.wave-bar');
const recordPlayback = document.getElementById('record-playback');
const resultPlayback = document.getElementById('result-playback');
const uploadSection = document.getElementById('upload-section');
const recordSection = document.getElementById('record-section');
const recordInfoBar = document.getElementById('record-info-bar');
const removeRecordBtn = document.getElementById('remove-record-btn');

// Custom Player Elements
const cpPlayerUI = document.getElementById('record-playback-ui');
const cpPlayBtn = document.getElementById('cp-play-btn');
const cpIconPlay = document.getElementById('cp-icon-play');
const cpIconPause = document.getElementById('cp-icon-pause');
const cpCurrentTime = document.getElementById('cp-current');
const cpDurationTime = document.getElementById('cp-duration');
const cpSpeedBtn = document.getElementById('cp-speed-btn');
const cpTrack = document.getElementById('cp-track');
const cpFill = document.getElementById('cp-fill');
const cpThumb = document.getElementById('cp-thumb');
const cpDownloadBtn = document.getElementById('cp-download-btn');

// Custom Result Player Elements
const resPlayerUI = document.getElementById('result-playback-ui');
const resPlayBtn = document.getElementById('res-play-btn');
const resIconPlay = document.getElementById('res-icon-play');
const resIconPause = document.getElementById('res-icon-pause');
const resCurrentTime = document.getElementById('res-current');
const resDurationTime = document.getElementById('res-duration');
const resSpeedBtn = document.getElementById('res-speed-btn');
const resTrack = document.getElementById('res-track');
const resFill = document.getElementById('res-fill');
const resThumb = document.getElementById('res-thumb');
const resDownloadBtn = document.getElementById('res-download-btn');

// Confirm Modal Elements
const confirmModal = document.getElementById('confirm-modal');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const modalTitle = document.getElementById('modal-title');

// --- Global State ---
let lastAudioUrl = null;
let recordPlaybackUrl = null;
let startTime;
let timerInterval;
let currentFileBaseName = 'transcript';
let selectedFile = null;
let running = false;
let transcribePercentHint = 0;
let currentTranscriptionLanguage = 'zh+en';
let modalContext = null; // 'stop' or 'remove'

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

let recordStartTime = null;
let recordTimerInterval = null;

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
    const triggerLabel = document.getElementById('app-lang-label');
    const options = document.getElementById('app-lang-options');
    const items = options.querySelectorAll('.dropdown-item');

    triggerLabel.textContent = lang.toUpperCase();
    items.forEach(item => {
        item.classList.toggle('active', item.dataset.value === lang);
    });

    if (!selectedFile && !recordPlaybackUrl) {
        selectedFileName.textContent = t('no-file');
    }

    document.getElementById('record-label').textContent = recorder.isRecording ? t('record-stop') : t('record-start');

    // Refresh transcription language label
    const activeItem = document.querySelector('#language-options .dropdown-item.active');
    if (activeItem) {
        languageSelectLabel.textContent = activeItem.textContent;
    }
}

function updateSelectedFile(file, source = 'upload') {
    selectedFile = file;
    const actionWrapper = document.getElementById('action-wrapper');
    const splitDivider = document.querySelector('.split-divider');

    if (!file) {
        if (selectedFileName) selectedFileName.textContent = '';
        if (fileInfoBar) fileInfoBar.classList.add('hidden');
        if (recordInfoBar) recordInfoBar.classList.add('hidden');
        recordStatus.textContent = '';
        recordSection.classList.remove('dimmed', 'hidden');
        uploadSection.classList.remove('dimmed', 'hidden');
        if (splitDivider) splitDivider.classList.remove('hidden');
        startBtn.disabled = true;
        cpPlayerUI.classList.add('hidden');
        if (recordPlaybackUrl) {
            URL.revokeObjectURL(recordPlaybackUrl);
            recordPlaybackUrl = null;
        }

        if (actionWrapper) actionWrapper.classList.add('hidden');
        return;
    }

    if (source === 'upload') {
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
        uploadSection.classList.add('dimmed');
        recordSection.classList.remove('dimmed');
    }

    currentFileBaseName = extractFileBaseName(file.name);
    startBtn.disabled = false;

    if (actionWrapper) actionWrapper.classList.remove('hidden');

    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
    lastAudioUrl = URL.createObjectURL(file);
}

async function startRecording() {
    try {
        await recorder.start();

        recordStartTime = Date.now();
        updateSelectedFile(null);
        uploadSection.classList.add('dimmed');

        cpPlayerUI.classList.add('hidden');
        recordPlayback.src = '';
        document.getElementById('record-svg-mic').classList.add('hidden');
        document.getElementById('record-svg-stop').classList.remove('hidden');
        document.getElementById('record-label').textContent = t('record-stop');
        recordBtn.classList.add('recording');
        setRecordingControlsDisabled(true);
        recordInfoBar.classList.remove('hidden');
        removeRecordBtn.classList.add('hidden'); // Hide remove button during recording
        recordStatus.textContent = t('recording') + '00:00';
        errorMessage.classList.add('hidden');
        volumeMeter.classList.remove('hidden');
        waveBars.forEach(b => { b.style.height = '8px'; b.style.opacity = '0.4'; });

        recordTimerInterval = setInterval(() => {
            const sec = Math.floor((Date.now() - recordStartTime) / 1000);
            const mm = String(Math.floor(sec / 60)).padStart(2, '0');
            const ss = String(sec % 60).padStart(2, '0');
            recordStatus.textContent = t('recording') + `${mm}:${ss}`;
        }, 500);
    } catch (err) {
        showError(err.message);
    }
}

function stopRecording() {
    const wavBlob = recorder.stop();
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `录音_${ts}.wav`;
    const file = new File([wavBlob], fileName, { type: 'audio/wav' });

    updateSelectedFile(file, 'record');
    recordStatus.textContent = t('record-done') + `${formatBytes(file.size)}`;

    if (recordPlaybackUrl) URL.revokeObjectURL(recordPlaybackUrl);
    recordPlaybackUrl = URL.createObjectURL(wavBlob);
    recordPlayback.src = recordPlaybackUrl;
    cpPlayerUI.classList.remove('hidden');

    // Reset custom UI
    cpFill.style.width = '0%';
    cpThumb.style.left = '0%';
    cpCurrentTime.textContent = '0:00';
    cpIconPlay.classList.remove('hidden');
    cpIconPause.classList.add('hidden');

    cleanupRecordingState();
}

function cleanupRecordingState() {
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;

    document.getElementById('record-svg-mic').classList.remove('hidden');
    document.getElementById('record-svg-stop').classList.add('hidden');
    document.getElementById('record-label').textContent = t('record-start');
    recordBtn.classList.remove('recording');
    volumeMeter.classList.add('hidden');
    waveBars.forEach(b => { b.style.height = '8px'; b.style.opacity = '0.4'; });
    setRecordingControlsDisabled(false);

    if (!selectedFile) {
        uploadSection.classList.remove('dimmed');
    }

    recorder.cleanup();
}

function setRecordingControlsDisabled(disabled) {
    startBtn.disabled = disabled || !selectedFile;
    pickFileBtn.disabled = disabled;
    fileInput.disabled = disabled;
}

async function startTranscriptionTask(file, language) {
    if (running) return;

    if (!file) {
        showError(t('error-select-file'));
        return;
    }
    if (file.size <= 0) {
        showError('文件为空，请重新选择');
        return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        showError('文件过大，当前直传上限约 100MB');
        return;
    }
    if (!SUPPORTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
        showError(`文件格式不支持，仅支持: ${SUPPORTED_EXTENSIONS.join(', ')}`);
        return;
    }

    localStorage.setItem('language', language);
    running = true;
    setControlsDisabled(true);

    inputArea.classList.add('hidden');
    progressArea.classList.remove('hidden');
    resultArea.classList.add('hidden');
    errorMessage.classList.add('hidden');

    startTimer();
    resetRuntimeBox(file);

    try {
        updateStatus('upload', t('status-uploading'));
        const fileUrl = await uploadFile(file, (uploaded, total) => {
            const percent = Math.round((uploaded / total) * 100);
            setUploadProgress(percent, `${t('transfer-progress')}：${percent}% (${formatBytes(uploaded)} / ${formatBytes(total)})`);
        });

        setUploadProgress(100, `${t('transfer-success')} (${formatBytes(file.size)})`);
        updateStatus('transcribe', t('status-creating-task'));
        setTranscribeProgress(5, `${t('transcribe-status').split('：')[0]}：${t('transcribe-creating')}...`);

        const startData = await createTranscription(fileUrl, file.name, language);
        const predictionId = startData.id;
        if (!predictionId) throw new Error('Missing prediction id');
        taskIdLine.textContent = `任务 ID：${predictionId}`;

        updateStatus('transcribe', t('status-transcribing'));
        renderPredictionProgress(startData);

        const finalData = await pollTranscriptionStatus(predictionId, (data) => {
            renderPredictionProgress(data);
        });

        finishProcess(finalData.output);
    } catch (error) {
        console.error(error);
        showError(error.message);
        resetUI();
    }
}

function renderPredictionProgress(data) {
    const status = data.status || 'starting';
    const progress = data.progress || {};

    const mappedStatus = statusToLocalized(status);
    const computedPercent = computeTranscribePercent(status, progress);
    const elapsedSec = typeof progress.elapsedSec === 'number' ? `${getCurrentLang() === 'zh' ? '，已用时 ' : ', elapsed '}${progress.elapsedSec}s` : '';
    setTranscribeProgress(computedPercent, `${t('transcribe-status').split('：')[0]}：${mappedStatus} (${computedPercent}%)${elapsedSec}`);

    if (data.id) {
        taskIdLine.textContent = `任务 ID：${data.id}`;
    }

    const logsTail = Array.isArray(progress.logsTail) ? progress.logsTail : [];
    const extras = [];
    if (logsTail.length > 0) {
        extras.push(`最近日志：${logsTail.join(' | ')}`);
    }
    if (progress.cleanup && typeof progress.cleanup === 'object') {
        const c = progress.cleanup;
        const removed = Number(c.removed_prompt_only_segments || 0) + Number(c.removed_hallucination_segments || 0) + Number(c.removed_noise_segments || 0);
        const cleaned = Number(c.cleaned_prompt_fragments || 0) + Number(c.cleaned_hallucination_fragments || 0);
        extras.push(`后处理：清理 ${cleaned}，删除 ${removed}`);
    }
    if (progress.quality && typeof progress.quality === 'object') {
        const warnings = Array.isArray(progress.quality.warnings) ? progress.quality.warnings : [];
        if (warnings.length > 0) extras.push(`质量告警：${warnings[0]}`);
    }
    if (progress.secondPass && typeof progress.secondPass === 'object') {
        const sp = progress.secondPass;
        const spStatus = statusToLocalized(sp.status || '');
        const spPercent = Number(sp.percent);
        const hasPercent = Number.isFinite(spPercent);
        const rangeCount = Array.isArray(sp.ranges) ? sp.ranges.length : 0;
        const spStatusText = hasPercent ? `${spStatus} (${Math.max(0, Math.min(100, Math.round(spPercent)))}%)` : spStatus;
        if (spStatusText) extras.push(`${getCurrentLang() === 'zh' ? '二次修复' : 'Second Pass'}：${spStatusText}${rangeCount > 0 ? (getCurrentLang() === 'zh' ? `，窗口 ${rangeCount}` : `, window ${rangeCount}`) : ''}`);
    }
    transcribeLogLine.textContent = extras.join(' ｜ ');
}

function computeTranscribePercent(status, progress) {
    const explicit = Number(progress.percent);
    if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 100) {
        transcribePercentHint = Math.max(transcribePercentHint, Math.round(explicit));
        return transcribePercentHint;
    }

    if (status === 'succeeded') return 100;
    if (status === 'failed' || status === 'canceled') return transcribePercentHint;
    if (status === 'starting') {
        transcribePercentHint = Math.max(transcribePercentHint, 8);
        return transcribePercentHint;
    }

    if (status === 'processing') {
        const elapsed = Number(progress.elapsedSec);
        const estimated = Number.isFinite(elapsed) ? Math.min(95, 12 + Math.floor(elapsed / 6)) : 40;
        transcribePercentHint = Math.max(transcribePercentHint, estimated);
        return transcribePercentHint;
    }

    transcribePercentHint = Math.max(transcribePercentHint, 5);
    return transcribePercentHint;
}

function statusToLocalized(status) {
    const key = `status-${status}`;
    const result = t(key);
    if (result === key) return status; // fallback if key missing
    return result;
}

function finishProcess(output) {
    clearInterval(timerInterval);
    updateStatus('process', t('status-done'));
    setTranscribeProgress(100, `${t('transcribe-status').split('：')[0]}：${t('transcribe-finished')} (100%)`);

    let mdContent = '';
    let jsonContent = '{}';

    if (output && output.markdown) {
        mdContent = output.markdown;
        jsonContent = JSON.stringify(output.json, null, 2);
    } else {
        mdContent = '### Raw Output\n\n' + JSON.stringify(output, null, 2);
        jsonContent = JSON.stringify(output, null, 2);
    }

    transcriptPreview.textContent = mdContent;
    setupDownload(downloadMdBtn, mdContent, `${currentFileBaseName}_transcript.md`, 'text/markdown');
    setupDownload(downloadJsonBtn, jsonContent, `${currentFileBaseName}_transcript.json`, 'application/json');

    inputArea.parentNode.classList.add('hidden');
    resultArea.classList.remove('hidden');

    if (selectedFile) {
        resultMeta.textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
    } else {
        resultMeta.textContent = '';
    }

    if (copyTranscriptBtn) {
        copyTranscriptBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(mdContent);
                const originalHtml = copyTranscriptBtn.innerHTML;
                copyTranscriptBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>${getCurrentLang() === 'zh' ? '已复制' : 'Copied'}</span>
                `;
                copyTranscriptBtn.classList.remove('secondary');
                copyTranscriptBtn.classList.add('primary');
                setTimeout(() => {
                    copyTranscriptBtn.innerHTML = originalHtml;
                    copyTranscriptBtn.classList.remove('primary');
                    copyTranscriptBtn.classList.add('secondary');
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
        };
    }

    if (recordPlaybackUrl || lastAudioUrl) {
        resultPlayback.src = recordPlaybackUrl || lastAudioUrl;
        resPlayerUI.classList.remove('hidden');
        resFill.style.width = '0%';
        resThumb.style.left = '0%';
        resCurrentTime.textContent = '0:00';
        resIconPlay.classList.remove('hidden');
        resIconPause.classList.add('hidden');
        resultPlayback.playbackRate = 1;
        resSpeedBtn.textContent = '1×';
    } else {
        resPlayerUI.classList.add('hidden');
    }

    running = false;
    setControlsDisabled(false);
}

function setupDownload(btn, content, filename, type) {
    btn.onclick = () => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
}

function resetRuntimeBox(file) {
    transcribePercentHint = 0;
    taskIdLine.textContent = '';
    transcribeLogLine.textContent = '';
    setUploadProgress(0, `${t('upload-status')} (${formatBytes(file.size)})`);
    setTranscribeProgress(0, t('transcribe-status'));
}

function setUploadProgress(percent, text) {
    uploadProgressFill.style.width = `${clampPercent(percent)}%`;
    uploadStatusLine.textContent = text;
}

function setTranscribeProgress(percent, text) {
    transcribeProgressFill.style.width = `${clampPercent(percent)}%`;
    transcribeStatusLine.textContent = text;
}

function updateStatus(stepMode, text) {
    statusText.textContent = text;
    const order = ['upload', 'transcribe', 'process'];
    const currentIndex = order.indexOf(stepMode);

    document.querySelectorAll('.step').forEach((el) => {
        el.classList.remove('active', 'completed');
    });

    for (let i = 0; i < order.length; i += 1) {
        const el = document.getElementById(`step-${order[i]}`);
        if (!el) continue;
        if (i < currentIndex) {
            el.classList.add('completed');
        } else if (i === currentIndex) {
            el.classList.add('active');
        }
    }
}

function showError(msg) {
    errorMessage.textContent = `错误: ${msg}`;
    errorMessage.classList.remove('hidden');
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

    uploadSection.classList.remove('dimmed');
    recordSection.classList.remove('dimmed');
    if (recordPlaybackUrl) {
        URL.revokeObjectURL(recordPlaybackUrl);
        recordPlaybackUrl = null;
    }
    if (lastAudioUrl) {
        URL.revokeObjectURL(lastAudioUrl);
        lastAudioUrl = null;
    }
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

// --- Initialize App ---
function initialize() {
    // App Language Dropdown
    const appLangTrigger = document.getElementById('app-lang-trigger');
    const appLangOptions = document.getElementById('app-lang-options');
    const appLangItems = appLangOptions.querySelectorAll('.dropdown-item');

    updateAppLanguageUI(getCurrentLang());

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

    const savedLangPreference = localStorage.getItem('language');
    if (savedLangPreference) {
        const item = Array.from(languageItems).find(el => el.dataset.value === savedLangPreference);
        if (item) {
            currentTranscriptionLanguage = savedLangPreference;
            languageSelectLabel.textContent = item.textContent;
            languageItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    }

    languageSelectTrigger.addEventListener('click', (e) => {
        if (languageSelectTrigger.classList.contains('disabled')) return;
        e.stopPropagation();
        languageOptions.classList.toggle('hidden');
        document.getElementById('app-lang-options').classList.add('hidden');
    });

    languageItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            currentTranscriptionLanguage = item.dataset.value;
            languageSelectLabel.textContent = item.textContent;
            languageItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
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
        updateSelectedFile(file || null);
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
        updateSelectedFile(file || null);
    });

    startBtn.addEventListener('click', async () => {
        await startTranscriptionTask(selectedFile, currentTranscriptionLanguage);
    });

    newUploadBtn.addEventListener('click', () => {
        resetUI();
    });

    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        updateSelectedFile(null);
    });

    removeRecordBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        modalContext = 'remove';
        modalTitle.textContent = t('record-remove-confirm');
        confirmOkBtn.textContent = (getCurrentLang() === 'zh' ? '确定移除' : 'Remove');
        confirmModal.classList.remove('hidden');
    });

    recordBtn.addEventListener('click', () => {
        if (recorder.isRecording) {
            modalContext = 'stop';
            modalTitle.textContent = t('record-stop-confirm');
            confirmOkBtn.textContent = t('confirm-ok');
            confirmModal.classList.remove('hidden');
        } else {
            startRecording();
        }
    });

    confirmOkBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        if (modalContext === 'stop') {
            stopRecording();
        } else if (modalContext === 'remove') {
            updateSelectedFile(null);
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
}

// Start the app
initialize();
