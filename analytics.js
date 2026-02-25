/**
 * analytics.js - Google Analytics 4 Integration for FlashNotes
 * Measurement ID: G-X7VZ3BYVZM
 */

const GA_ID = 'G-X7VZ3BYVZM';
const ATTR_KEY = 'flashnotes_attribution_v1';

/**
 * Initialize GA4.
 * The gtag.js script is loaded in index.html. This function is kept as a
 * no-op entry point in case future initialization logic is needed.
 */
export function initAnalytics() {
    // GA4 is initialized via script tags in index.html.
    // Nothing to do here — gtag is already available globally.
    // However, we capture attribution once so subsequent events can reuse it.
    getAttribution();
}

export function bucketizeSeconds(sec) {
    const s = Number(sec);
    if (!Number.isFinite(s) || s <= 0) return 'unknown';
    if (s < 30) return 'lt_30s';
    if (s < 120) return '30_120s';
    if (s < 10 * 60) return '2_10m';
    if (s < 30 * 60) return '10_30m';
    if (s < 60 * 60) return '30_60m';
    return 'gt_60m';
}

function safeHostnameFromReferrer(ref) {
    if (!ref || typeof ref !== 'string') return '';
    try {
        const u = new URL(ref);
        return u.hostname || '';
    } catch {
        return '';
    }
}

function readJsonSession(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeJsonSession(key, value) {
    try {
        sessionStorage.setItem(key, JSON.stringify(value || {}));
    } catch {
        // ignore
    }
}

function parseUtmFromSearch(search) {
    const out = {};
    try {
        const params = new URLSearchParams(search || '');
        const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
        for (const k of keys) {
            const v = (params.get(k) || '').trim();
            if (v) out[k] = v;
        }
    } catch {
        // ignore
    }
    return out;
}

export function getAttribution() {
    const existing = readJsonSession(ATTR_KEY) || {};
    const fromUrl = parseUtmFromSearch(typeof window !== 'undefined' ? window.location.search : '');
    const merged = { ...existing, ...fromUrl };

    // Capture referrer host once per session if available.
    if (!merged.referrer_host) {
        const ref = (typeof document !== 'undefined') ? document.referrer : '';
        const host = safeHostnameFromReferrer(ref);
        if (host) merged.referrer_host = host;
    }

    writeJsonSession(ATTR_KEY, merged);
    return merged;
}

function cleanParams(params) {
    const out = {};
    for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && v.trim() === '') continue;
        out[k] = v;
    }
    return out;
}

/**
 * Track a custom event.
 * @param {string} eventName - GA4 event name (snake_case recommended)
 * @param {Object} [params] - Optional event parameters
 */
export function trackEvent(eventName, params = {}) {
    if (typeof window.gtag === 'function') {
        const attribution = getAttribution();
        const merged = cleanParams({ ...attribution, ...params });
        window.gtag('event', eventName, merged);
    }
}

function classifyErrorKind(errorMsg) {
    const m = (errorMsg || '').toLowerCase();
    if (!m) return 'unknown';
    if (m.includes('permission') || m.includes('denied') || m.includes('notallowed') || m.includes('not allowed')) return 'permission';
    if (m.includes('notfound') || m.includes('not found') || m.includes('device') || m.includes('hardware') || m.includes('overconstrained')) return 'device';
    return 'unknown';
}

/**
 * Track an error occurrence.
 * @param {string} errorMsg - Error message
 * @param {string} [context] - Where the error occurred (e.g. 'upload', 'transcribe', 'record')
 */
export function trackError(errorMsg, context = 'unknown') {
    trackEvent('app_error', {
        error_message: errorMsg?.substring(0, 100) || 'unknown',
        error_context: context
    });
}

export function trackRecordStart() {
    trackEvent('record_start', { input_source: 'record' });
}

export function trackRecordStartFailed(errorMsg) {
    const msg = (errorMsg || 'unknown').toString().slice(0, 100);
    trackEvent('record_start_failed', {
        input_source: 'record',
        error_message_short: msg,
        error_kind: classifyErrorKind(msg)
    });
}

export function trackRecordStop(durationSec, sizeMB) {
    const s = Number(durationSec);
    trackEvent('record_stop', {
        input_source: 'record',
        record_duration_sec: Number.isFinite(s) ? Math.max(0, Math.round(s)) : undefined,
        record_duration_bucket: bucketizeSeconds(s),
        record_over_120s: Number.isFinite(s) ? (s >= 120 ? '1' : '0') : undefined,
        record_size_mb: Number.isFinite(sizeMB) ? Math.max(0, Math.round(sizeMB * 10) / 10) : undefined
    });
}

export function trackFileSelect(selectMethod, fileExt, fileSizeMB) {
    trackEvent('file_select', {
        input_source: 'upload',
        select_method: selectMethod || 'unknown',
        file_ext: fileExt || undefined,
        file_size_mb: Number.isFinite(Number(fileSizeMB)) ? Math.max(0, Math.round(Number(fileSizeMB) * 10) / 10) : undefined
    });
}

export function trackSelectionClear(clearedSource) {
    trackEvent('selection_clear', {
        cleared_source: clearedSource || 'unknown'
    });
}

export function trackTranscriptionBlocked(blockReason, params = {}) {
    trackEvent('transcription_blocked', {
        block_reason: blockReason,
        ...params
    });
}

/**
 * Track transcription start.
 * @param {string} language - Transcription language setting
 * @param {string} source - Input source ('upload' or 'record')
 * @param {number} fileSizeMB - File size in MB
 * @param {Object} [extras] - Optional extra parameters
 */
export function trackTranscriptionStart(language, source, fileSizeMB, extras = {}) {
    trackEvent('transcription_start', {
        language,
        input_source: source,
        file_size_mb: fileSizeMB,
        ...extras
    });
}

/**
 * Track transcription completion.
 * @param {number} durationSec - Total process duration in seconds
 * @param {boolean} success - Whether it succeeded
 * @param {Object} [extras] - Optional extra parameters
 */
export function trackTranscriptionComplete(durationSec, success = true, extras = {}) {
    trackEvent('transcription_complete', {
        duration_seconds: durationSec,
        success,
        ...extras
    });
}

export function trackTranscriptView(viewSource, extras = {}) {
    trackEvent('transcript_view', { view_source: viewSource, ...extras });
}

export function trackCopyTranscript(viewSource) {
    trackEvent('copy_transcript', { view_source: viewSource });
}

export function trackExportTranscript(exportFormat, viewSource) {
    trackEvent('export_transcript', { export_format: exportFormat, view_source: viewSource });
}

export function trackAudioDownload(audioContext) {
    trackEvent('audio_download', { audio_context: audioContext });
}

export function trackHistoryView(historyCountBefore) {
    trackEvent('history_view', { history_count_before: Number.isFinite(Number(historyCountBefore)) ? Number(historyCountBefore) : undefined });
}

export function trackHistoryDelete(historyCountBefore) {
    trackEvent('history_delete', { history_count_before: Number.isFinite(Number(historyCountBefore)) ? Number(historyCountBefore) : undefined });
}

export function trackHistoryClear(historyCountBefore) {
    trackEvent('history_clear', { history_count_before: Number.isFinite(Number(historyCountBefore)) ? Number(historyCountBefore) : undefined });
}
