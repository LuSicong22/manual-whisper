/**
 * historyStore.js - LocalStorage based persistence for transcription history
 */

const HISTORY_KEY = 'manual_whisper_history';
const MAX_HISTORY_ITEMS = 50;

export function getAllHistory() {
    try {
        const stored = localStorage.getItem(HISTORY_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse history from localStorage', e);
        return [];
    }
}

export function getHistoryById(id) {
    const list = getAllHistory();
    return list.find(item => item.id === id) || null;
}

export function saveHistory(record) {
    try {
        const list = getAllHistory();
        // Remove object with same ID if exists (update scenario)
        const filteredList = list.filter(item => item.id !== record.id);

        // Add to beginning
        filteredList.unshift(record);

        // Trim to max length
        if (filteredList.length > MAX_HISTORY_ITEMS) {
            filteredList.length = MAX_HISTORY_ITEMS;
        }

        localStorage.setItem(HISTORY_KEY, JSON.stringify(filteredList));
        return true;
    } catch (e) {
        console.error('Failed to save history to localStorage. Storage might be full.', e);
        return false;
    }
}

export function deleteHistoryById(id) {
    try {
        const list = getAllHistory();
        const filteredList = list.filter(item => item.id !== id);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(filteredList));
        return true;
    } catch (e) {
        console.error('Failed to delete history', e);
        return false;
    }
}

export function clearAllHistory() {
    try {
        localStorage.removeItem(HISTORY_KEY);
        return true;
    } catch (e) {
        console.error('Failed to clear history', e);
        return false;
    }
}
