/**
 * analytics.js - Google Analytics 4 Integration for FlashNotes
 * Measurement ID: G-X7VZ3BYVZM
 */

const GA_ID = 'G-X7VZ3BYVZM';

/**
 * Initialize GA4.
 * The gtag.js script is loaded in index.html. This function is kept as a
 * no-op entry point in case future initialization logic is needed.
 */
export function initAnalytics() {
    // GA4 is initialized via script tags in index.html.
    // Nothing to do here — gtag is already available globally.
}

/**
 * Track a custom event.
 * @param {string} eventName - GA4 event name (snake_case recommended)
 * @param {Object} [params] - Optional event parameters
 */
export function trackEvent(eventName, params = {}) {
    if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
    }
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

/**
 * Track transcription start.
 * @param {string} language - Transcription language setting
 * @param {string} source - Input source ('upload' or 'record')
 * @param {number} fileSizeMB - File size in MB
 */
export function trackTranscriptionStart(language, source, fileSizeMB) {
    trackEvent('transcription_start', {
        language,
        input_source: source,
        file_size_mb: fileSizeMB
    });
}

/**
 * Track transcription completion.
 * @param {number} durationSec - Total process duration in seconds
 * @param {boolean} success - Whether it succeeded
 */
export function trackTranscriptionComplete(durationSec, success = true) {
    trackEvent('transcription_complete', {
        duration_seconds: durationSec,
        success
    });
}
