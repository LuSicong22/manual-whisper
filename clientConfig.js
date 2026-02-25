/**
 * Client runtime configuration for FlashNotes frontend.
 * Keep deployment-specific values in one place to reduce accidental drift.
 */

const DEFAULT_APP_SHARED_KEY = 'r8_L2Gy7Kf3Q';

const DEFAULT_API_BASE = typeof window !== 'undefined' && (
    window.location.hostname.endsWith('.web.app') ||
    window.location.hostname === '127.0.0.1' ||
    window.location.port === '5000'
)
    ? 'https://whisper-omega.vercel.app'
    : '';

function readRuntimeConfig() {
    if (typeof window === 'undefined') return {};
    const cfg = window.__FLASHNOTES_CONFIG;
    if (!cfg || typeof cfg !== 'object') return {};
    return cfg;
}

const runtimeConfig = readRuntimeConfig();

export const API_BASE = typeof runtimeConfig.apiBase === 'string'
    ? runtimeConfig.apiBase.trim()
    : DEFAULT_API_BASE;

export const APP_SHARED_KEY = typeof runtimeConfig.appSharedKey === 'string'
    ? runtimeConfig.appSharedKey.trim()
    : DEFAULT_APP_SHARED_KEY;

