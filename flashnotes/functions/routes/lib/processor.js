/**
 * Transcript Processor for manual-whisper
 */
import { getEnv } from "../_localEnv.js";

const STRIP_PROMPT_LEAK = parseBoolean(getEnv("STRIP_PROMPT_LEAK"), true);
const STRIP_HALLUCINATION = parseBoolean(getEnv("STRIP_HALLUCINATION"), true);
const MERGE_ADJACENT_SEGMENTS = parseBoolean(getEnv("MERGE_ADJACENT_SEGMENTS"), true);
const DROP_SHORT_NOISE = parseBoolean(getEnv("DROP_SHORT_NOISE"), true);
const MAX_MERGE_GAP_SEC = Number(getEnv("MAX_MERGE_GAP_SEC") || 0.6);
const DROP_NOISE_MAX_SEC = Number(getEnv("DROP_NOISE_MAX_SEC") || 1.2);
const DROP_NOISE_MAX_CHARS = Number(getEnv("DROP_NOISE_MAX_CHARS") || 2);
const MIN_WARN_REMOVED_SPAN_SEC = Number(getEnv("MIN_WARN_REMOVED_SPAN_SEC") || 10);
const MIN_WARN_COVERAGE_RATIO = Number(getEnv("MIN_WARN_COVERAGE_RATIO") || 0.85);

const PROMPT_LEAK_REGEXES = [
    /请使用简体中文[。.!！?？]*/g,
    /请用简体中文[。.!！?？]*/g,
    /术语参考[:：][^。!?！？\n]*/g,
    /中文会议讨论记录[:：]?/g,
    /语文会议讨论记录[:：]?/g,
];

const HALLUCINATION_FRAGMENT_REGEXES = [
    /请不吝点赞\s*订阅\s*转发\s*打赏支持[^。!?！？\n]*/g,
    /点赞\s*订阅\s*转发\s*打赏支持[^。!?！？\n]*/g,
    /明镜与点点栏目/g,
];

const HALLUCINATION_ONLY_REGEXES = [
    /^(术语参考|中文会议讨论记录|语文会议讨论记录)/,
    /^请不吝点赞/,
    /^点赞订阅转发打赏支持/,
    /明镜与点点栏目/,
];

const NOISE_FILLERS = new Set(["嗯", "啊", "哦", "呃", "额", "哈", "哎"]);

const DEFAULT_TERM_REPLACEMENTS = {
    "搜码二维码": "收款二维码",
    "收码二维码": "收款二维码",
    "文艺标识": "唯一标识",
    "唯一表识": "唯一标识",
    "AAP": "APP",
    "AP里面": "APP里面",
    "AP里": "APP里",
    "不信支付法": "支付宝支付法",
};

const TERM_REPLACEMENTS = resolveTermReplacements();

export function postProcessSegments(segments) {
    const stats = {
        input_segments: segments.length,
        output_segments: 0,
        removed_prompt_only_segments: 0,
        removed_hallucination_segments: 0,
        removed_noise_segments: 0,
        cleaned_prompt_fragments: 0,
        cleaned_hallucination_fragments: 0,
        merged_segments: 0,
    };

    const removedRanges = [];
    const cleaned = [];

    for (const seg of segments) {
        const textInfo = cleanSegmentText(seg?.text);
        let text = textInfo.text;
        stats.cleaned_prompt_fragments += textInfo.promptFragmentsRemoved;
        stats.cleaned_hallucination_fragments += textInfo.hallucinationFragmentsRemoved;

        const start = toFiniteNumber(seg?.start, 0);
        const end = toFiniteNumber(seg?.end, start);
        const duration = Math.max(0, end - start);

        if (!text || isPromptLeakText(text)) {
            if (!text && textInfo.hallucinationFragmentsRemoved > 0) {
                stats.removed_hallucination_segments += 1;
                pushRemovedRange(removedRanges, start, end, "hallucination");
            } else {
                stats.removed_prompt_only_segments += 1;
                pushRemovedRange(removedRanges, start, end, "prompt");
            }
            continue;
        }

        if (isHallucinationText(text)) {
            stats.removed_hallucination_segments += 1;
            pushRemovedRange(removedRanges, start, end, "hallucination");
            continue;
        }

        if (shouldDropNoiseSegment(text, duration)) {
            stats.removed_noise_segments += 1;
            pushRemovedRange(removedRanges, start, end, "noise");
            continue;
        }

        cleaned.push({ ...seg, text, start, end });
    }

    let finalSegments = cleaned;
    if (MERGE_ADJACENT_SEGMENTS) {
        const merged = mergeAdjacentSegments(cleaned, MAX_MERGE_GAP_SEC);
        finalSegments = merged.segments;
        stats.merged_segments = merged.mergedCount;
    }

    stats.output_segments = finalSegments.length;
    const qualityReport = buildQualityReport(segments, finalSegments, removedRanges, stats);
    return { segments: finalSegments, stats, qualityReport, removedRanges };
}

export function formatToMarkdown(segments) {
    let md = `# 录音转写\n\n`;
    let currentSpeaker = null;

    for (const seg of segments) {
        const text = seg.text.trim();
        if (!text) continue;

        const start = formatTimestamp(seg.start);
        const end = formatTimestamp(seg.end);

        if (seg.speaker && seg.speaker !== currentSpeaker) {
            md += `\n### ${seg.speaker}\n\n`;
            currentSpeaker = seg.speaker;
        }

        md += `[${start} - ${end}] ${text}\n\n`;
    }
    return md;
}

// --- Internal Helpers ---

function cleanSegmentText(rawText) {
    let text = typeof rawText === "string" ? rawText : "";
    let promptFragmentsRemoved = 0;
    let hallucinationFragmentsRemoved = 0;

    text = text.replace(/\s+/g, " ").trim();
    text = removeHallucinationLoops(text).trim();

    if (STRIP_PROMPT_LEAK) {
        for (const re of PROMPT_LEAK_REGEXES) {
            const before = text;
            text = text.replace(re, "");
            if (text !== before) promptFragmentsRemoved += 1;
        }
    }

    if (STRIP_HALLUCINATION) {
        for (const re of HALLUCINATION_FRAGMENT_REGEXES) {
            const before = text;
            text = text.replace(re, "");
            if (text !== before) hallucinationFragmentsRemoved += 1;
        }
    }

    text = applyTermReplacements(text);
    text = text.replace(/([，。！？,.!?])\1{1,}/g, "$1");
    text = text.replace(/^[，。！？,.!?、\s]+|[，。！？,.!?、\s]+$/g, "");
    text = text.replace(/\s+/g, " ").trim();

    return { text, promptFragmentsRemoved, hallucinationFragmentsRemoved };
}

function removeHallucinationLoops(text) {
    if (!text) return "";
    const pattern = /(.{2,20}?)\1{3,}/g;
    return text.replace(pattern, "$1");
}

function applyTermReplacements(text) {
    let out = text;
    for (const [from, to] of Object.entries(TERM_REPLACEMENTS)) {
        if (!from || !to) continue;
        out = out.split(from).join(to);
    }
    return out;
}

function isPromptLeakText(text) {
    const compact = text.replace(/[，。！？,.!?、\s]/g, "");
    if (compact === "请使用简体中文" || compact === "请用简体中文") return true;
    return /^(术语参考|中文会议讨论记录|语文会议讨论记录)/.test(compact);
}

function isHallucinationText(text) {
    if (!STRIP_HALLUCINATION) return false;
    const compact = text.replace(/[，。！？,.!?、\s]/g, "");
    if (compact.length === 0) return true;
    for (const re of HALLUCINATION_ONLY_REGEXES) {
        if (re.test(compact) || re.test(text)) return true;
    }
    return false;
}

function shouldDropNoiseSegment(text, duration) {
    if (!DROP_SHORT_NOISE) return false;
    const compact = text.replace(/[，。！？,.!?、\s]/g, "");
    if (compact.length === 0) return true;
    if (duration <= DROP_NOISE_MAX_SEC && compact.length <= DROP_NOISE_MAX_CHARS && NOISE_FILLERS.has(compact)) return true;
    if (duration <= 0.3 && compact.length <= 1) return true;
    return false;
}

function mergeAdjacentSegments(segments, maxGapSec) {
    if (segments.length <= 1) return { segments, mergedCount: 0 };
    const result = [];
    let current = segments[0];
    let mergedCount = 0;

    for (let i = 1; i < segments.length; i++) {
        const next = segments[i];
        const gap = next.start - current.end;
        const sameSpeaker = current.speaker === next.speaker;

        if (sameSpeaker && gap <= maxGapSec) {
            current.text += " " + next.text;
            current.end = next.end;
            mergedCount++;
        } else {
            result.push(current);
            current = next;
        }
    }
    result.push(current);
    return { segments: result, mergedCount };
}

function buildQualityReport(inputSegments, outputSegments, removedRanges, stats) {
    const inputSpeechSec = sumSpeechSeconds(inputSegments);
    const outputSpeechSec = sumSpeechSeconds(outputSegments);
    const removedSpeechSec = Math.max(0, inputSpeechSec - outputSpeechSec);
    const coverageRatio = inputSpeechSec > 0 ? outputSpeechSec / inputSpeechSec : 1;

    const suspiciousRanges = mergeRanges(
        removedRanges.filter((item) => item.reason === "hallucination" || item.reason === "prompt"),
        1.2
    ).filter((item) => item.duration >= MIN_WARN_REMOVED_SPAN_SEC);

    const warnings = [];
    if (stats.removed_hallucination_segments > 0) warnings.push(`检测并移除了 ${stats.removed_hallucination_segments} 条疑似幻觉片段`);
    if (coverageRatio < MIN_WARN_COVERAGE_RATIO) warnings.push(`清理后语音覆盖率偏低 (${(coverageRatio * 100).toFixed(1)}%)，建议人工复核`);
    if (suspiciousRanges.length > 0) {
        const spans = suspiciousRanges.slice(0, 4).map((item) => `${formatTimestamp(item.start)}-${formatTimestamp(item.end)}`).join(", ");
        warnings.push(`检测到可疑丢失时间段：${spans}`);
    }

    return {
        input_speech_sec: round2(inputSpeechSec),
        output_speech_sec: round2(outputSpeechSec),
        removed_speech_sec: round2(removedSpeechSec),
        coverage_ratio: round4(coverageRatio),
        suspicious_ranges: suspiciousRanges.map((item) => ({
            start: item.start,
            end: item.end,
            duration: round2(item.duration),
            reason: item.reasons.join("+"),
        })),
        warnings,
    };
}

function sumSpeechSeconds(segments) {
    if (!Array.isArray(segments)) return 0;
    let total = 0;
    for (const seg of segments) {
        const start = toFiniteNumber(seg?.start, 0);
        const end = toFiniteNumber(seg?.end, start);
        total += Math.max(0, end - start);
    }
    return total;
}

function mergeRanges(ranges, maxGapSec) {
    if (!Array.isArray(ranges) || ranges.length === 0) return [];
    const sorted = ranges.map((item) => ({
        start: toFiniteNumber(item.start, 0),
        end: Math.max(toFiniteNumber(item.start, 0), toFiniteNumber(item.end, item.start)),
        reasons: [item.reason || "unknown"],
    })).sort((a, b) => a.start - b.start);

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const cur = sorted[i];
        const prev = merged[merged.length - 1];
        if (cur.start - prev.end <= maxGapSec) {
            prev.end = Math.max(prev.end, cur.end);
            for (const reason of cur.reasons) if (!prev.reasons.includes(reason)) prev.reasons.push(reason);
            continue;
        }
        merged.push(cur);
    }
    return merged.map((item) => ({ ...item, duration: Math.max(0, item.end - item.start) }));
}

function formatTimestamp(seconds) {
    const date = new Date(seconds * 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function pushRemovedRange(collector, start, end, reason) {
    const s = toFiniteNumber(start, 0);
    const e = Math.max(s, toFiniteNumber(end, s));
    collector.push({ start: s, end: e, duration: Math.max(0, e - s), reason });
}

function toFiniteNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

function parseBoolean(raw, fallback) {
    if (typeof raw !== "string") return fallback;
    const v = raw.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    if (v === "0" || v === "false" || v === "no" || v === "off") return false;
    return fallback;
}

function resolveTermReplacements() {
    const merged = { ...DEFAULT_TERM_REPLACEMENTS };
    const fromJson = parseReplacementMapFromJson(getEnv("TERM_REPLACEMENTS_JSON"));
    Object.assign(merged, fromJson);
    const fromPairs = parseReplacementMapFromPairs(getEnv("TERM_REPLACEMENTS"));
    Object.assign(merged, fromPairs);
    return merged;
}

function parseReplacementMapFromJson(raw) {
    if (typeof raw !== "string" || raw.trim().length === 0) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const result = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof key !== "string" || typeof value !== "string") continue;
            const from = key.trim();
            const to = value.trim();
            if (from && to) result[from] = to;
        }
        return result;
    } catch { return {}; }
}

function parseReplacementMapFromPairs(raw) {
    if (typeof raw !== "string" || raw.trim().length === 0) return {};
    const result = {};
    const pairs = raw.split(";").map((s) => s.trim()).filter(Boolean);
    for (const pair of pairs) {
        const idx = pair.indexOf("=");
        if (idx <= 0) continue;
        const from = pair.slice(0, idx).trim();
        const to = pair.slice(idx + 1).trim();
        if (from && to) result[from] = to;
    }
    return result;
}
