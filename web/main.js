const inputArea = document.getElementById('input-area');
const fileInput = document.getElementById('file-input');
const pickFileBtn = document.getElementById('pick-file-btn');
const selectedFileName = document.getElementById('selected-file-name');
const appKeyInput = document.getElementById('app-key-input');
const languageSelect = document.getElementById('language-select');
const startBtn = document.getElementById('start-btn');
const progressArea = document.getElementById('progress-area');
const resultArea = document.getElementById('result-area');
const statusText = document.getElementById('status-text');
const timerDisplay = document.getElementById('timer');
const transcriptPreview = document.getElementById('transcript-preview');
const downloadMdBtn = document.getElementById('download-md');
const downloadJsonBtn = document.getElementById('download-json');
const newUploadBtn = document.getElementById('new-upload-btn');
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
const volumeMeterFill = document.getElementById('volume-meter-fill');
const recordPlayback = document.getElementById('record-playback');
const resultPlayback = document.getElementById('result-playback');

let lastAudioUrl = null;

let recordPlaybackUrl = null;

let startTime;
let timerInterval;
let currentFileBaseName = 'transcript';
let selectedFile = null;
let running = false;
let transcribePercentHint = 0;

// Recording state
let audioContext = null;
let scriptProcessor = null;
let mediaStreamSource = null;
let recordingStream = null;
let recordStartTime = null;
let recordTimerInterval = null;
let isRecording = false;
let audioBuffers = [];
let recordingLength = 0;
const targetSampleRate = 16000;

const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const INITIAL_POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 10000;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['.m4a', '.mp3', '.wav', '.flac', '.ogg', '.wma', '.webm', '.aac'];

initialize();

function initialize() {
    const savedKey = localStorage.getItem('appKey') || '';
    appKeyInput.value = savedKey;

    const savedLang = localStorage.getItem('language');
    if (savedLang && [...languageSelect.options].some(o => o.value === savedLang)) {
        languageSelect.value = savedLang;
    }

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
        const appKey = appKeyInput.value.trim();
        const language = languageSelect.value;
        await startTranscription(selectedFile, appKey, language);
    });

    appKeyInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const appKey = appKeyInput.value.trim();
            const language = languageSelect.value;
            await startTranscription(selectedFile, appKey, language);
        }
    });

    newUploadBtn.addEventListener('click', () => {
        resetUI();
    });

    recordBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
}

function updateSelectedFile(file) {
    selectedFile = file;
    if (!file) {
        selectedFileName.textContent = '未选择文件';
        return;
    }

    selectedFileName.textContent = `${file.name} (${formatBytes(file.size)})`;
    currentFileBaseName = extractFileBaseName(file.name);

    // Create a URL for result-page playback
    if (lastAudioUrl) URL.revokeObjectURL(lastAudioUrl);
    lastAudioUrl = URL.createObjectURL(file);
}

async function startRecording() {
    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: targetSampleRate
            }
        });
    } catch (err) {
        console.error('Microphone access denied:', err);
        showError('无法访问麦克风，请在浏览器中允许麦克风权限。');
        return;
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: targetSampleRate });
    mediaStreamSource = audioContext.createMediaStreamSource(recordingStream);

    // Use ScriptProcessorNode (deprecated but widely supported and reliable for raw PCM extraction)
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

    audioBuffers = [];
    recordingLength = 0;

    scriptProcessor.onaudioprocess = (e) => {
        if (!isRecording) return;
        const channelData = e.inputBuffer.getChannelData(0);
        // Copy data to avoid mutation
        const buffer = new Float32Array(channelData.length);
        buffer.set(channelData);
        audioBuffers.push(buffer);
        recordingLength += buffer.length;

        // Compute RMS volume for the visual meter
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
            sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / channelData.length);
        // Map RMS (0..~0.5) to percentage (0..100), with amplification for quiet sources
        const level = Math.min(100, Math.round(rms * 300));
        volumeMeterFill.style.width = `${level}%`;
    };

    mediaStreamSource.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    isRecording = true;
    recordStartTime = Date.now();

    recordPlayback.classList.add('hidden');
    recordPlayback.src = '';
    recordBtn.textContent = '⏹ 停止录音';
    recordBtn.classList.add('recording');
    setRecordingControlsDisabled(true);
    recordStatus.textContent = '🔴 录音中 — 00:00';
    errorMessage.classList.add('hidden');
    volumeMeter.classList.remove('hidden');
    volumeMeterFill.style.width = '0%';

    recordTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartTime) / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        recordStatus.textContent = `🔴 录音中 — ${mm}:${ss}`;
    }, 500);
}

async function stopRecording() {
    isRecording = false;

    if (scriptProcessor) {
        scriptProcessor.disconnect();
        mediaStreamSource.disconnect();
    }

    // Construct the WAV file
    const audioData = mergeAudioBuffers(audioBuffers, recordingLength);
    const wavBlob = encodeWAV(audioData, audioContext.sampleRate);

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `录音_${ts}.wav`;
    const file = new File([wavBlob], fileName, { type: 'audio/wav' });

    updateSelectedFile(file);
    recordStatus.textContent = `✅ 录音完成 — ${formatBytes(file.size)}`;

    // Enable playback
    if (recordPlaybackUrl) URL.revokeObjectURL(recordPlaybackUrl);
    recordPlaybackUrl = URL.createObjectURL(wavBlob);
    recordPlayback.src = recordPlaybackUrl;
    recordPlayback.classList.remove('hidden');

    cleanupRecording();
}

function cleanupRecording() {
    isRecording = false;
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;

    recordBtn.textContent = '🎤 录音';
    recordBtn.classList.remove('recording');
    volumeMeter.classList.add('hidden');
    volumeMeterFill.style.width = '0%';
    // Keep playback visible — only hide on new recording or resetUI
    setRecordingControlsDisabled(false);

    if (recordingStream) {
        recordingStream.getTracks().forEach((t) => t.stop());
        recordingStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }

    audioBuffers = [];
    recordingLength = 0;
    audioContext = null;
    scriptProcessor = null;
    mediaStreamSource = null;
}

function mergeAudioBuffers(channelBuffer, recordingLength) {
    const result = new Float32Array(recordingLength);
    let offset = 0;
    for (let i = 0; i < channelBuffer.length; i++) {
        const buffer = channelBuffer[i];
        result.set(buffer, offset);
        offset += buffer.length;
    }
    return result;
}

function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, 1, true); // NumChannels (1 channel)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // BitsPerSample

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function setRecordingControlsDisabled(disabled) {
    startBtn.disabled = disabled;
    pickFileBtn.disabled = disabled;
    fileInput.disabled = disabled;
}

async function startTranscription(file, appKey, language) {
    if (running) return;

    if (!file) {
        showError('请先选择音频文件');
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
    if (!hasSupportedExtension(file.name)) {
        showError(`文件格式不支持，仅支持: ${SUPPORTED_EXTENSIONS.join(', ')}`);
        return;
    }

    if (appKey) {
        localStorage.setItem('appKey', appKey);
    } else {
        localStorage.removeItem('appKey');
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
        updateStatus('upload', '正在上传文件到 Replicate...');
        const fileUrl = await uploadFileToTempStorage(file, appKey, (uploaded, total) => {
            const percent = Math.round((uploaded / total) * 100);
            setUploadProgress(percent, `上传状态：${percent}% (${formatBytes(uploaded)} / ${formatBytes(total)})`);
        });

        setUploadProgress(100, `上传状态：成功 (${formatBytes(file.size)})`);
        updateStatus('transcribe', '文件上传成功，正在创建转写任务...');
        setTranscribeProgress(5, '转写状态：创建任务中...');

        const transcribeHeaders = {
            'Content-Type': 'application/json'
        };
        if (appKey) {
            transcribeHeaders['x-app-key'] = appKey;
        }

        const startRes = await fetch('/api/transcribe', {
            method: 'POST',
            headers: transcribeHeaders,
            body: JSON.stringify({
                fileUrl,
                sourceFilename: file.name,
                language: language || 'zh+en'
            })
        });

        if (!startRes.ok) {
            const err = await safeJson(startRes);
            throw new Error(`[${startRes.status}] ${err.error || 'Prediction failed to start'}`);
        }

        const startData = await startRes.json();
        const predictionId = startData.id;
        if (!predictionId) throw new Error('Missing prediction id');
        taskIdLine.textContent = `任务 ID：${predictionId}`;

        updateStatus('transcribe', 'AI 正在转写 (通常需要 2-5 分钟)...');
        renderPredictionProgress(startData);

        await pollStatus(predictionId, appKey);
    } catch (error) {
        console.error(error);
        showError(error.message);
        resetUI();
    }
}

function uploadFileToTempStorage(file, appKey, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.responseType = 'json';
        if (appKey) {
            xhr.setRequestHeader('x-app-key', appKey);
        }
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
        xhr.setRequestHeader('x-file-content-type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('content-type', 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(event.loaded, event.total);
            }
        };

        xhr.onerror = () => reject(new Error('上传失败'));
        xhr.onabort = () => reject(new Error('上传被取消'));

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                const payload = safeParseXhrJson(xhr);
                reject(new Error(`[${xhr.status}] ${payload.error || '上传失败'}`));
                return;
            }

            let uploadData = xhr.response;
            if (!uploadData) {
                try {
                    uploadData = JSON.parse(xhr.responseText);
                } catch {
                    reject(new Error('上传服务返回异常'));
                    return;
                }
            }

            if (!uploadData.fileUrl) {
                reject(new Error('上传服务返回异常'));
                return;
            }

            resolve(uploadData.fileUrl);
        };

        xhr.send(file);
    });
}

function safeParseXhrJson(xhr) {
    if (xhr.response && typeof xhr.response === 'object') {
        return xhr.response;
    }
    if (typeof xhr.responseText === 'string' && xhr.responseText.length > 0) {
        try {
            return JSON.parse(xhr.responseText);
        } catch {
            return {};
        }
    }
    return {};
}

async function pollStatus(predictionId, appKey) {
    const start = Date.now();
    let interval = INITIAL_POLL_INTERVAL_MS;

    while (true) {
        if (Date.now() - start > POLL_TIMEOUT_MS) {
            throw new Error('转写超时，请稍后重试');
        }

        const pollHeaders = {};
        if (appKey) {
            pollHeaders['x-app-key'] = appKey;
        }
        const res = await fetch(`/api/transcribe?id=${encodeURIComponent(predictionId)}`, {
            headers: pollHeaders
        });

        if (!res.ok) {
            const err = await safeJson(res);
            throw new Error(`[${res.status}] ${err.error || 'Failed to fetch prediction status'}`);
        }

        const data = await res.json();
        renderPredictionProgress(data);

        if (data.status === 'succeeded') {
            finishProcess(data.output);
            break;
        }
        if (data.status === 'failed' || data.status === 'canceled') {
            throw new Error(`Task ${data.status}: ${data.error || 'Unknown error'}`);
        }

        await sleep(interval);
        interval = Math.min(MAX_POLL_INTERVAL_MS, interval + 1000);
    }
}

function renderPredictionProgress(data) {
    const status = data.status || 'starting';
    const progress = data.progress || {};

    const mappedStatus = statusToChinese(status);
    const computedPercent = computeTranscribePercent(status, progress);
    const elapsedSec = typeof progress.elapsedSec === 'number' ? `，已用时 ${progress.elapsedSec}s` : '';
    setTranscribeProgress(computedPercent, `转写状态：${mappedStatus} (${computedPercent}%)${elapsedSec}`);

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
        const removed =
            Number(c.removed_prompt_only_segments || 0) +
            Number(c.removed_hallucination_segments || 0) +
            Number(c.removed_noise_segments || 0);
        const cleaned = Number(c.cleaned_prompt_fragments || 0) + Number(c.cleaned_hallucination_fragments || 0);
        extras.push(`后处理：清理 ${cleaned}，删除 ${removed}`);
    }
    if (progress.quality && typeof progress.quality === 'object') {
        const warnings = Array.isArray(progress.quality.warnings) ? progress.quality.warnings : [];
        if (warnings.length > 0) {
            extras.push(`质量告警：${warnings[0]}`);
        }
    }
    if (progress.secondPass && typeof progress.secondPass === 'object') {
        const sp = progress.secondPass;
        const spStatus = statusToChinese(sp.status || '');
        const spPercent = Number(sp.percent);
        const hasPercent = Number.isFinite(spPercent);
        const rangeCount = Array.isArray(sp.ranges) ? sp.ranges.length : 0;
        const statusText = hasPercent ? `${spStatus} (${Math.max(0, Math.min(100, Math.round(spPercent)))}%)` : spStatus;
        if (statusText) {
            extras.push(`二次修复：${statusText}${rangeCount > 0 ? `，窗口 ${rangeCount}` : ''}`);
        }
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

function statusToChinese(status) {
    if (status === 'starting') return '排队/启动中';
    if (status === 'processing') return '处理中';
    if (status === 'succeeded') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'canceled') return '已取消';
    return status;
}

function finishProcess(output) {
    clearInterval(timerInterval);
    updateStatus('process', '处理完成！');
    setTranscribeProgress(100, '转写状态：已完成 (100%)');

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

    progressArea.classList.add('hidden');
    resultArea.classList.remove('hidden');

    // Show audio playback in result area if we have a recording/file URL
    if (recordPlaybackUrl || lastAudioUrl) {
        resultPlayback.src = recordPlaybackUrl || lastAudioUrl;
        resultPlayback.classList.remove('hidden');
    } else {
        resultPlayback.classList.add('hidden');
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
    setUploadProgress(0, `上传状态：待开始 (${formatBytes(file.size)})`);
    setTranscribeProgress(0, '转写状态：待开始');
}

function setUploadProgress(percent, text) {
    uploadProgressFill.style.width = `${clampPercent(percent)}%`;
    uploadStatusLine.textContent = text;
}

function setTranscribeProgress(percent, text) {
    transcribeProgressFill.style.width = `${clampPercent(percent)}%`;
    transcribeStatusLine.textContent = text;
}

function clampPercent(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
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
    errorMessage.textContent = `❌ 错误: ${msg}`;
    errorMessage.classList.remove('hidden');
}

function resetUI() {
    clearInterval(timerInterval);
    inputArea.classList.remove('hidden');
    progressArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    errorMessage.classList.add('hidden');
    running = false;
    setControlsDisabled(false);
    selectedFile = null;
    fileInput.value = '';
    selectedFileName.textContent = '未选择文件';
    currentFileBaseName = 'transcript';
    transcriptPreview.textContent = '';
    recordStatus.textContent = '';
    recordPlayback.classList.add('hidden');
    recordPlayback.src = '';
    resultPlayback.classList.add('hidden');
    resultPlayback.src = '';
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
    startBtn.disabled = disabled;
    pickFileBtn.disabled = disabled;
    fileInput.disabled = disabled;
    appKeyInput.disabled = disabled;
    languageSelect.disabled = disabled;
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

function extractFileBaseName(filename) {
    if (!filename) return 'transcript';
    const dot = filename.lastIndexOf('.');
    if (dot <= 0) return filename;
    return filename.slice(0, dot);
}

function hasSupportedExtension(filename) {
    const lower = filename.toLowerCase();
    return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res) {
    try {
        return await res.json();
    } catch {
        return {};
    }
}
