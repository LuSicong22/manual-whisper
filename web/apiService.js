/**
 * API Service for manual-whisper
 */
import { sleep } from './utils.js';

const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const INITIAL_POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 10000;

export async function uploadFile(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.responseType = 'json';
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
        xhr.setRequestHeader('x-file-content-type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('content-type', 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(event.loaded, event.total);
            }
        };

        xhr.onerror = () => reject(new Error('传输失败'));
        xhr.onabort = () => reject(new Error('传输被取消'));

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                const payload = safeParseXhrJson(xhr);
                reject(new Error(`[${xhr.status}] ${payload.error || '传输失败'}`));
                return;
            }

            let uploadData = xhr.response;
            if (!uploadData) {
                try {
                    uploadData = JSON.parse(xhr.responseText);
                } catch {
                    reject(new Error('数据传输异常'));
                    return;
                }
            }

            if (!uploadData.fileUrl) {
                reject(new Error('数据传输异常'));
                return;
            }

            resolve(uploadData.fileUrl);
        };

        xhr.send(file);
    });
}

export async function createTranscription(fileUrl, sourceFilename, language) {
    const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fileUrl,
            sourceFilename,
            language: language || 'zh+en'
        })
    });

    if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(`[${res.status}] ${err.error || 'Prediction failed to start'}`);
    }

    return await res.json();
}

export async function pollTranscriptionStatus(predictionId, onUpdate) {
    const start = Date.now();
    let interval = INITIAL_POLL_INTERVAL_MS;

    while (true) {
        if (Date.now() - start > POLL_TIMEOUT_MS) {
            throw new Error('转写超时，请稍后重试');
        }

        const res = await fetch(`/api/transcribe?id=${encodeURIComponent(predictionId)}`);

        if (!res.ok) {
            const err = await safeJson(res);
            throw new Error(`[${res.status}] ${err.error || 'Failed to fetch prediction status'}`);
        }

        const data = await res.json();
        if (typeof onUpdate === 'function') {
            onUpdate(data);
        }

        if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
            return data;
        }

        await sleep(interval);
        interval = Math.min(MAX_POLL_INTERVAL_MS, interval + 1000);
    }
}

function safeParseXhrJson(xhr) {
    if (xhr.response && typeof xhr.response === 'object') return xhr.response;
    try {
        return JSON.parse(xhr.responseText);
    } catch {
        return {};
    }
}

async function safeJson(res) {
    try {
        return await res.json();
    } catch {
        return {};
    }
}
