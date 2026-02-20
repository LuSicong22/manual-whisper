/**
 * Utility functions for manual-whisper
 */

export function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i += 1;
    }
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clampPercent(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
}

export function extractFileBaseName(filename) {
    if (!filename) return 'transcript';
    const dot = filename.lastIndexOf('.');
    if (dot <= 0) return filename;
    return filename.slice(0, dot);
}
