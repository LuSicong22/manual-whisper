/**
 * API Service for manual-whisper
 */
import { sleep } from './utils.js';

const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const INITIAL_POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 10000;

// When hosted on Firebase (web.app domain) or testing frontend locally via Firebase emulators, route API calls to Vercel.
// When using vercel dev (typically localhost:3000), use relative paths for local testing.
const VERCEL_API_BASE = typeof window !== 'undefined' && (window.location.hostname.endsWith('.web.app') || window.location.hostname === '127.0.0.1' || window.location.port === '5000')
    ? 'https://whisper-omega.vercel.app'
    : '';

export async function uploadFile(file, onProgress) {
    // On .web.app domains, upload directly to Vercel Blob to bypass Vercel's 4.5MB body limit.
    // On local dev (vercel dev), use the Vercel proxy which has no such limit.
    if (VERCEL_API_BASE) {
        return uploadViaVercelBlob(file, onProgress);
    }
    return uploadViaVercel(file, onProgress);
}

async function uploadViaVercelBlob(file, onProgress) {
    // Step 1: Request a client upload token from our server (tiny request, no body limit)
    const tokenRes = await fetch(`${VERCEL_API_BASE}/api/blob-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: file.name, callbackUrl: `${VERCEL_API_BASE}/api/blob-upload` } }),
    });
    if (!tokenRes.ok) {
        const err = await safeJson(tokenRes);
        throw new Error(`[${tokenRes.status}] ${err.error || '获取上传凭证失败'}`);
    }
    const { clientToken } = await tokenRes.json();
    if (!clientToken) throw new Error('获取上传凭证失败');

    // Step 2: Upload directly to Vercel Blob CDN using the client token
    // The URL format is: https://blob.vercel-storage.com/<pathname>?<params>
    const uploadUrl = `https://blob.vercel-storage.com/${encodeURIComponent(file.name)}`;

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${clientToken}`);
        xhr.setRequestHeader('x-api-version', '7');
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(event.loaded, event.total);
            }
        };

        xhr.onerror = () => reject(new Error('操作失败'));
        xhr.onabort = () => reject(new Error('操作被取消'));

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                let detail = '操作失败';
                try { detail = JSON.parse(xhr.responseText)?.error || detail; } catch { /* ignore */ }
                reject(new Error(`[${xhr.status}] ${detail}`));
                return;
            }
            let data;
            try { data = JSON.parse(xhr.responseText); } catch {
                reject(new Error('网络请求异常'));
                return;
            }
            const fileUrl = data?.url || data?.downloadUrl;
            if (!fileUrl) {
                reject(new Error('解析异常：未获取到文件地址'));
                return;
            }
            resolve(fileUrl);
        };

        xhr.send(file);
    });
}

function uploadViaVercel(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/upload`);
        xhr.responseType = 'json';
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
        xhr.setRequestHeader('x-file-content-type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('content-type', 'application/octet-stream');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && typeof onProgress === 'function') {
                onProgress(event.loaded, event.total);
            }
        };

        xhr.onerror = () => reject(new Error('操作失败'));
        xhr.onabort = () => reject(new Error('操作被取消'));

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                const payload = safeParseXhrJson(xhr);
                reject(new Error(`[${xhr.status}] ${payload.error || '解析失败'}`));
                return;
            }

            let uploadData = xhr.response;
            if (!uploadData) {
                try {
                    uploadData = JSON.parse(xhr.responseText);
                } catch {
                    reject(new Error('网络请求异常'));
                    return;
                }
            }

            if (!uploadData.fileUrl) {
                reject(new Error('解析异常'));
                return;
            }

            resolve(uploadData.fileUrl);
        };

        xhr.send(file);
    });
}

export async function createTranscription(fileUrl, sourceFilename, language, durationSec) {
    const res = await fetch(`${VERCEL_API_BASE}/api/transcribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fileUrl,
            sourceFilename,
            language: language || 'zh+en',
            durationSec
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

        const res = await fetch(`${VERCEL_API_BASE}/api/transcribe?id=${encodeURIComponent(predictionId)}`);

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

export async function getQuota() {
    const res = await fetch(`${VERCEL_API_BASE}/api/transcribe?action=quota`);
    if (!res.ok) return null;
    return await res.json();
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
