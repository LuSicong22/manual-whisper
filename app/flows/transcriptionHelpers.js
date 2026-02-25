/**
 * Pure helpers for transcription flow/state rendering.
 */

export function getFileExt(name) {
    if (!name || typeof name !== 'string') return '';
    const idx = name.lastIndexOf('.');
    if (idx < 0 || idx === name.length - 1) return '';
    return name.slice(idx + 1).toLowerCase();
}

function uniqueSpeakerCount(segments) {
    if (!Array.isArray(segments)) return 0;
    const set = new Set();
    for (const seg of segments) {
        const s = seg && typeof seg.speaker === 'string' ? seg.speaker.trim() : '';
        if (s) set.add(s);
    }
    return set.size;
}

export function getTranscriptStatsFromJson(json) {
    const segments = Array.isArray(json && json.segments) ? json.segments : [];
    const speakersCount = uniqueSpeakerCount(segments);
    const cleanup = json && json.cleanup_stats ? json.cleanup_stats : null;
    const removedTotal = cleanup
        ? Number(cleanup.removed_prompt_only_segments || 0) + Number(cleanup.removed_hallucination_segments || 0) + Number(cleanup.removed_noise_segments || 0)
        : 0;
    const warnings = json && json.quality_report && Array.isArray(json.quality_report.warnings) ? json.quality_report.warnings : [];

    return {
        segments_count: segments.length,
        speakers_count: speakersCount,
        removed_segments_count: removedTotal,
        quality_warning_count: warnings.length
    };
}

export function statusToLocalized(status, t) {
    const key = `status-${status}`;
    const result = t(key);
    if (result === key) return status;
    return result;
}

export function computeTranscribePercent(status, progress, currentHint) {
    let hint = Number.isFinite(Number(currentHint)) ? Number(currentHint) : 0;
    const explicit = (progress.percent !== undefined && progress.percent !== null) ? Number(progress.percent) : NaN;
    if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 100) {
        hint = Math.max(hint, Math.round(explicit));
        return { percent: hint, nextHint: hint };
    }

    if (status === 'succeeded') return { percent: 100, nextHint: hint };
    if (status === 'failed' || status === 'canceled') return { percent: hint, nextHint: hint };
    if (status === 'starting') {
        hint = Math.max(hint, 8);
        return { percent: hint, nextHint: hint };
    }

    if (status === 'processing') {
        const elapsed = Number(progress.elapsedSec);
        const estimated = Number.isFinite(elapsed) ? Math.min(95, 12 + Math.floor(elapsed / 6)) : 40;
        hint = Math.max(hint, estimated);
        return { percent: hint, nextHint: hint };
    }

    hint = Math.max(hint, 5);
    return { percent: hint, nextHint: hint };
}

