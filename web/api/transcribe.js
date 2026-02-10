import Replicate from "replicate";
import crypto from "node:crypto";
import net from "node:net";
import { getEnv } from "./_localEnv.js";

const REPLICATE_API_TOKEN = getEnv("REPLICATE_API_TOKEN");
const APP_SHARED_KEY = getEnv("APP_SHARED_KEY");
const REPLICATE_MODEL = getEnv("REPLICATE_MODEL") || "victor-upmeet/whisperx";
const REPLICATE_MODEL_VERSION = getEnv("REPLICATE_MODEL_VERSION");
const HF_TOKEN = getEnv("HF_TOKEN");
const ENFORCE_APP_SHARED_KEY = parseBoolean(getEnv("ENFORCE_APP_SHARED_KEY"), false);
const DOMAIN_TERMS = (getEnv("DOMAIN_TERMS") || "微信,支付宝,二维码,收款码,小程序,公众号,NFC,Node ID,UID,UIA,ADNA,APP,H5")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
});

// Safer defaults: avoid glossary-style prompt text that may leak into transcript.
const USE_INITIAL_PROMPT = parseBoolean(getEnv("USE_INITIAL_PROMPT"), false);
const DEFAULT_INITIAL_PROMPT = "中文会议语音逐字转写，保持口语原文，不补写无关文本。";
const INITIAL_PROMPT = resolveInitialPrompt();
const VAD_OPTIONS = {
    vad_onset: Number(getEnv("VAD_ONSET") || 0.50),
    vad_offset: Number(getEnv("VAD_OFFSET") || 0.36),
};
const TEMPERATURE = Number(getEnv("TEMPERATURE") || 0);

const STRIP_PROMPT_LEAK = parseBoolean(getEnv("STRIP_PROMPT_LEAK"), true);
const STRIP_HALLUCINATION = parseBoolean(getEnv("STRIP_HALLUCINATION"), true);
const MERGE_ADJACENT_SEGMENTS = parseBoolean(getEnv("MERGE_ADJACENT_SEGMENTS"), true);
const DROP_SHORT_NOISE = parseBoolean(getEnv("DROP_SHORT_NOISE"), true);
const MAX_MERGE_GAP_SEC = Number(getEnv("MAX_MERGE_GAP_SEC") || 0.6);
const DROP_NOISE_MAX_SEC = Number(getEnv("DROP_NOISE_MAX_SEC") || 1.2);
const DROP_NOISE_MAX_CHARS = Number(getEnv("DROP_NOISE_MAX_CHARS") || 2);
const MIN_WARN_REMOVED_SPAN_SEC = Number(getEnv("MIN_WARN_REMOVED_SPAN_SEC") || 10);
const MIN_WARN_COVERAGE_RATIO = Number(getEnv("MIN_WARN_COVERAGE_RATIO") || 0.85);
const ENABLE_SECOND_PASS = parseBoolean(getEnv("ENABLE_SECOND_PASS"), true);
const SECOND_PASS_MAX_RANGES = Number(getEnv("SECOND_PASS_MAX_RANGES") || 4);
const SECOND_PASS_MIN_RANGE_SEC = Number(getEnv("SECOND_PASS_MIN_RANGE_SEC") || 1.5);
const SECOND_PASS_RANGE_PAD_SEC = Number(getEnv("SECOND_PASS_RANGE_PAD_SEC") || 1.2);
const SECOND_PASS_BATCH_SIZE = Number(getEnv("SECOND_PASS_BATCH_SIZE") || 16);
const SECOND_PASS_TEMPERATURE = Number(getEnv("SECOND_PASS_TEMPERATURE") || 0);
const SECOND_PASS_VAD_ONSET = Number(getEnv("SECOND_PASS_VAD_ONSET") || 0.60);
const SECOND_PASS_VAD_OFFSET = Number(getEnv("SECOND_PASS_VAD_OFFSET") || 0.42);
const SECOND_PASS_DIARIZATION = parseBoolean(getEnv("SECOND_PASS_DIARIZATION"), false);
const SECOND_PASS_USE_INITIAL_PROMPT = parseBoolean(getEnv("SECOND_PASS_USE_INITIAL_PROMPT"), false);

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

const AUDIO_EXTENSIONS = new Set([".m4a", ".mp3", ".wav", ".flac", ".ogg", ".wma", ".webm", ".aac"]);
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const POST_RATE_LIMIT_PER_MIN = Number(getEnv("POST_RATE_LIMIT_PER_MIN") || 6);
const GET_RATE_LIMIT_PER_MIN = Number(getEnv("GET_RATE_LIMIT_PER_MIN") || 60);
const MAX_ACTIVE_JOBS_PER_IP = Number(getEnv("MAX_ACTIVE_JOBS_PER_IP") || 2);
const META_TTL_MS = 24 * 60 * 60 * 1000;

let cachedResolvedVersion = REPLICATE_MODEL_VERSION || null;

const globalState = globalThis.__transcribeState || {
    rateLimits: new Map(),
    jobOwners: new Map(), // predictionId -> { ip, createdAt }
    activeJobsByIp: new Map(), // ip -> Set(predictionId)
    secondPassByPrimary: new Map(), // primaryPredictionId -> second-pass state
};
globalThis.__transcribeState = globalState;

// Regex for removing hallucinations (ported from Python)
function removeHallucinationLoops(text) {
    if (!text) return "";
    const pattern = /(.{2,20}?)\1{3,}/g;
    return text.replace(pattern, "$1");
}

export default async function handler(request, response) {
    pruneState();

    if (!REPLICATE_API_TOKEN) {
        return response.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });
    }

    const auth = requireSharedKey(request);
    if (!auth.ok) {
        return response.status(auth.status).json({ error: auth.error });
    }

    const { method, query, body } = request;
    const clientIp = getClientIp(request);

    // 1. Check Status (GET)
    if (method === "GET") {
        const getRate = checkRateLimit(clientIp, "get", GET_RATE_LIMIT_PER_MIN);
        if (!getRate.ok) {
            return response.status(429).json({ error: "Too many polling requests. Slow down and retry." });
        }

        const { id } = query;
        if (!id) return response.status(400).json({ error: "Missing id" });

        const owner = globalState.jobOwners.get(id);
        if (owner && owner.ip !== clientIp) {
            return response.status(404).json({ error: "Prediction not found" });
        }

        try {
            const prediction = await replicate.predictions.get(id);
            releaseIfDone(clientIp, id, prediction.status);
            const progress = buildProgressPayload(prediction);

            if (prediction.status === "succeeded") {
                let output = prediction.output;

                // Post-processing: reduce prompt leak and noisy fragments.
                if (output && Array.isArray(output.segments)) {
                    const primaryCleanup = postProcessSegments(output.segments);
                    const secondPassResult = await maybeResolveSecondPass({
                        clientIp,
                        primaryPrediction: prediction,
                        primaryOutput: output,
                        primaryCleanup,
                        progress,
                    });

                    if (secondPassResult.pendingResponse) {
                        return response.status(200).json(secondPassResult.pendingResponse);
                    }

                    output = secondPassResult.output;
                    progress.cleanup = output.cleanup_stats;
                    progress.quality = output.quality_report;
                    if (output.second_pass) {
                        progress.secondPass = output.second_pass;
                    }
                }

                // Format to Markdown (ported from Python)
                let md = `# 会议录音转写\n\n`;
                if (output?.quality_report?.warnings?.length) {
                    md += `## 质量告警\n\n`;
                    for (const warning of output.quality_report.warnings) {
                        md += `- ${warning}\n`;
                    }
                    md += `\n`;
                }

                if (output.segments) {
                    let currentSpeaker = null;

                    for (const seg of output.segments) {
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
                }

                return response.status(200).json({
                    status: "succeeded",
                    id: prediction.id,
                    progress,
                    output: {
                        markdown: md,
                        json: output
                    }
                });
            } else if (prediction.status === "failed") {
                return response.status(200).json({
                    status: "failed",
                    id: prediction.id,
                    error: prediction.error,
                    progress
                });
            }

            return response.status(200).json({
                status: prediction.status,
                id: prediction.id,
                progress
            });
        } catch (e) {
            console.error("Get Prediction Error:", e);
            return response.status(500).json({ error: "Failed to get prediction status" });
        }
    }

    // 2. Create Prediction (POST)
    if (method === "POST") {
        const postRate = checkRateLimit(clientIp, "post", POST_RATE_LIMIT_PER_MIN);
        if (!postRate.ok) {
            return response.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
        }

        const activeCount = (globalState.activeJobsByIp.get(clientIp) || new Set()).size;
        if (activeCount >= MAX_ACTIVE_JOBS_PER_IP) {
            return response.status(429).json({
                error: `Too many active jobs. Wait until one completes (max ${MAX_ACTIVE_JOBS_PER_IP}).`,
            });
        }

        try {
            const fileUrl = body && typeof body === "object" ? body.fileUrl : undefined;
            const sourceFilename = body && typeof body === "object" ? body.sourceFilename : undefined;

            if (!fileUrl) return response.status(400).json({ error: "Missing fileUrl" });
            const validationError = validateFileUrl(fileUrl, sourceFilename);
            if (validationError) {
                return response.status(400).json({ error: validationError });
            }

            const version = await resolveModelVersion();
            const prediction = await replicate.predictions.create({
                version,
                input: buildTranscribeInput(fileUrl),
            });

            trackNewJob(clientIp, prediction.id);

            return response.status(201).json({
                id: prediction.id,
                status: prediction.status,
                progress: buildProgressPayload(prediction)
            });

        } catch (e) {
            const mapped = mapPredictionStartError(e);
            console.error("Prediction Error:", e);
            return response.status(mapped.status).json({ error: mapped.message });
        }
    }

    return response.status(405).json({ error: "Method not allowed" });
}

function formatTimestamp(seconds) {
    const date = new Date(seconds * 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

async function resolveModelVersion() {
    if (cachedResolvedVersion) {
        return cachedResolvedVersion;
    }

    const [owner, name] = REPLICATE_MODEL.split("/");
    if (!owner || !name) {
        throw new Error(`Invalid REPLICATE_MODEL: ${REPLICATE_MODEL}`);
    }

    const model = await replicate.models.get(owner, name);
    const latest = model?.latest_version?.id;
    if (!latest) {
        throw new Error(`No latest version found for model ${REPLICATE_MODEL}`);
    }

    cachedResolvedVersion = latest;
    return cachedResolvedVersion;
}

function buildTranscribeInput(fileUrl) {
    const diarizationEnabled = parseBoolean(getEnv("ENABLE_DIARIZATION"), Boolean(HF_TOKEN));

    const input = {
        audio_file: fileUrl,
        language: "zh",
        batch_size: 16,
        temperature: TEMPERATURE,
        vad_onset: VAD_OPTIONS.vad_onset,
        vad_offset: VAD_OPTIONS.vad_offset,
        align_output: true,
        diarization: diarizationEnabled,
    };

    if (INITIAL_PROMPT) {
        input.initial_prompt = INITIAL_PROMPT;
    }

    if (diarizationEnabled && HF_TOKEN) {
        input.huggingface_access_token = HF_TOKEN;
    }

    return input;
}

function resolveInitialPrompt() {
    const raw = getEnv("INITIAL_PROMPT");
    if (typeof raw === "string" && raw.trim().length > 0) {
        return raw.trim();
    }
    if (!USE_INITIAL_PROMPT) {
        return "";
    }
    return DEFAULT_INITIAL_PROMPT;
}

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
            if (!from || !to) continue;
            result[from] = to;
        }
        return result;
    } catch {
        return {};
    }
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
        if (!from || !to) continue;
        result[from] = to;
    }
    return result;
}

function postProcessSegments(segments) {
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

        cleaned.push({
            ...seg,
            text,
            start,
            end,
        });
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
            if (text !== before) {
                promptFragmentsRemoved += 1;
            }
        }
    }

    if (STRIP_HALLUCINATION) {
        for (const re of HALLUCINATION_FRAGMENT_REGEXES) {
            const before = text;
            text = text.replace(re, "");
            if (text !== before) {
                hallucinationFragmentsRemoved += 1;
            }
        }
    }

    text = applyTermReplacements(text);
    text = text.replace(/([，。！？,.!?])\1{1,}/g, "$1");
    text = text.replace(/^[，。！？,.!?、\s]+|[，。！？,.!?、\s]+$/g, "");
    text = text.replace(/\s+/g, " ").trim();

    return { text, promptFragmentsRemoved, hallucinationFragmentsRemoved };
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
    if (compact === "请使用简体中文" || compact === "请用简体中文") {
        return true;
    }
    return /^(术语参考|中文会议讨论记录|语文会议讨论记录)/.test(compact);
}

function isHallucinationText(text) {
    if (!STRIP_HALLUCINATION) return false;

    const compact = text.replace(/[，。！？,.!?、\s]/g, "");
    if (compact.length === 0) return true;

    for (const re of HALLUCINATION_ONLY_REGEXES) {
        if (re.test(compact) || re.test(text)) {
            return true;
        }
    }

    return false;
}

function shouldDropNoiseSegment(text, duration) {
    if (!DROP_SHORT_NOISE) return false;

    const compact = text.replace(/[，。！？,.!?、\s]/g, "");
    if (compact.length === 0) return true;

    if (duration <= DROP_NOISE_MAX_SEC && compact.length <= DROP_NOISE_MAX_CHARS && NOISE_FILLERS.has(compact)) {
        return true;
    }

    if (duration <= 0.3 && compact.length <= 1) {
        return true;
    }

    return false;
}

function pushRemovedRange(collector, start, end, reason) {
    const s = toFiniteNumber(start, 0);
    const e = Math.max(s, toFiniteNumber(end, s));
    collector.push({ start: s, end: e, duration: Math.max(0, e - s), reason });
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
    if (stats.removed_hallucination_segments > 0) {
        warnings.push(`检测并移除了 ${stats.removed_hallucination_segments} 条疑似幻觉片段`);
    }
    if (coverageRatio < MIN_WARN_COVERAGE_RATIO) {
        warnings.push(`清理后语音覆盖率偏低 (${(coverageRatio * 100).toFixed(1)}%)，建议人工复核`);
    }
    if (suspiciousRanges.length > 0) {
        const spans = suspiciousRanges
            .slice(0, 4)
            .map((item) => `${formatTimestamp(item.start)}-${formatTimestamp(item.end)}`)
            .join(", ");
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
    if (!Array.isArray(ranges) || ranges.length === 0) {
        return [];
    }

    const sorted = ranges
        .map((item) => ({
            start: toFiniteNumber(item.start, 0),
            end: Math.max(toFiniteNumber(item.start, 0), toFiniteNumber(item.end, item.start)),
            reasons: [item.reason || "unknown"],
        }))
        .sort((a, b) => a.start - b.start);

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
        const cur = sorted[i];
        const prev = merged[merged.length - 1];
        if (cur.start - prev.end <= maxGapSec) {
            prev.end = Math.max(prev.end, cur.end);
            for (const reason of cur.reasons) {
                if (!prev.reasons.includes(reason)) prev.reasons.push(reason);
            }
            continue;
        }
        merged.push(cur);
    }

    return merged.map((item) => ({
        ...item,
        duration: Math.max(0, item.end - item.start),
    }));
}

function round2(v) {
    return Math.round(v * 100) / 100;
}

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

function mergeAdjacentSegments(segments, maxGapSec) {
    if (!Array.isArray(segments) || segments.length === 0) {
        return { segments: [], mergedCount: 0 };
    }

    const merged = [{ ...segments[0] }];
    let mergedCount = 0;

    for (let i = 1; i < segments.length; i += 1) {
        const cur = segments[i];
        const prev = merged[merged.length - 1];
        if (canMergeSegments(prev, cur, maxGapSec)) {
            const mergedSeg = { ...prev };
            mergedSeg.end = Math.max(toFiniteNumber(prev.end, 0), toFiniteNumber(cur.end, 0));
            mergedSeg.text = joinSegmentText(prev.text, cur.text);
            merged[merged.length - 1] = mergedSeg;
            mergedCount += 1;
            continue;
        }
        merged.push({ ...cur });
    }

    return { segments: merged, mergedCount };
}

function canMergeSegments(prev, cur, maxGapSec) {
    const prevEnd = toFiniteNumber(prev?.end, NaN);
    const curStart = toFiniteNumber(cur?.start, NaN);
    if (!Number.isFinite(prevEnd) || !Number.isFinite(curStart)) {
        return false;
    }

    const gap = curStart - prevEnd;
    if (gap < -0.2 || gap > maxGapSec) {
        return false;
    }

    const prevSpeaker = typeof prev?.speaker === "string" ? prev.speaker : "";
    const curSpeaker = typeof cur?.speaker === "string" ? cur.speaker : "";
    if (prevSpeaker && curSpeaker && prevSpeaker !== curSpeaker) {
        return false;
    }

    return true;
}

function joinSegmentText(a, b) {
    const left = typeof a === "string" ? a.trim() : "";
    const right = typeof b === "string" ? b.trim() : "";
    if (!left) return right;
    if (!right) return left;
    if (/[，。！？,.!?]$/.test(left) || /^[，。！？,.!?]/.test(right)) {
        return `${left}${right}`;
    }
    return `${left}，${right}`;
}

function toFiniteNumber(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function mapPredictionStartError(error) {
    const context = extractPredictionStartErrorContext(error);
    const status = context.status;
    const detail = context.detail;

    if (status === 402) {
        return { status: 402, message: "Replicate 余额不足，请充值后重试" };
    }
    if (status === 401) {
        return { status: 401, message: "REPLICATE_API_TOKEN 无效或已过期" };
    }
    if (status === 403) {
        return { status: 403, message: "无权限访问模型或文件，请检查 Token 权限" };
    }
    if (status === 404) {
        return { status: 404, message: "模型或版本不存在，请检查 REPLICATE_MODEL/REPLICATE_MODEL_VERSION" };
    }
    if (status === 422) {
        const suffix = detail ? `：${truncateText(detail, 140)}` : "";
        return { status: 422, message: `模型版本或输入参数无效，请检查 REPLICATE_MODEL/REPLICATE_MODEL_VERSION 配置${suffix}` };
    }
    if (status === 429) {
        const retryHint = Number.isFinite(context.retryAfterSec) && context.retryAfterSec > 0
            ? `，请约 ${context.retryAfterSec}s 后重试`
            : "，请稍后重试";
        return { status: 429, message: `请求过于频繁或账户额度受限${retryHint}` };
    }
    if (status === 408) {
        return { status: 408, message: "请求超时，请重试" };
    }
    if (status >= 500 && status < 600) {
        return { status, message: "Replicate 服务暂时不可用，请稍后重试" };
    }
    if (status >= 400 && status < 600) {
        const suffix = detail ? `：${truncateText(detail, 140)}` : "";
        return { status, message: `Replicate 请求失败，请稍后重试${suffix}` };
    }

    if (/invalid replicate_model/i.test(context.message)) {
        return { status: 500, message: "REPLICATE_MODEL 配置格式错误，应为 owner/name" };
    }
    if (/no latest version found/i.test(context.message)) {
        return { status: 500, message: "无法解析模型最新版本，请设置 REPLICATE_MODEL_VERSION 后重试" };
    }
    if (/either model or version must be specified/i.test(context.message)) {
        return { status: 500, message: "模型配置缺失，请检查 REPLICATE_MODEL 或 REPLICATE_MODEL_VERSION" };
    }
    if (/request was throttled/i.test(context.message)) {
        return { status: 429, message: "请求过于频繁或账户额度受限，请稍后重试" };
    }

    if (detail) {
        return { status: 500, message: `Failed to start transcription job: ${truncateText(detail, 180)}` };
    }

    return { status: 500, message: "Failed to start transcription job" };
}

function extractPredictionStartErrorContext(error) {
    const message = typeof error?.message === "string" ? error.message : "";
    const statusFromObject = Number(error?.response?.status ?? error?.status ?? error?.statusCode);
    let status = Number.isFinite(statusFromObject) ? statusFromObject : null;
    let detail = "";
    let retryAfterSec = null;

    const body = parseJsonObjectFromErrorMessage(message);
    if (body) {
        const bodyStatus = Number(body.status);
        if (!status && Number.isFinite(bodyStatus)) {
            status = bodyStatus;
        }
        if (typeof body.detail === "string") {
            detail = body.detail.trim();
        } else if (typeof body.error === "string") {
            detail = body.error.trim();
        } else if (typeof body.message === "string") {
            detail = body.message.trim();
        }

        const bodyRetry = Number(body.retry_after ?? body.retryAfter);
        if (Number.isFinite(bodyRetry) && bodyRetry > 0) {
            retryAfterSec = bodyRetry;
        }
    }

    if (!status && message) {
        const match = message.match(/\bstatus\s+(\d{3})\b/i);
        if (match) {
            status = Number(match[1]);
        }
    }

    if (!Number.isFinite(retryAfterSec) && typeof error?.response?.headers?.get === "function") {
        const headerRetry = Number(error.response.headers.get("retry-after"));
        if (Number.isFinite(headerRetry) && headerRetry > 0) {
            retryAfterSec = headerRetry;
        }
    }

    return {
        status: Number.isFinite(status) ? status : null,
        detail,
        retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : null,
        message,
    };
}

function parseJsonObjectFromErrorMessage(message) {
    if (typeof message !== "string" || message.length === 0) {
        return null;
    }
    const start = message.lastIndexOf("{");
    const end = message.lastIndexOf("}");
    if (start < 0 || end <= start) {
        return null;
    }
    const candidate = message.slice(start, end + 1);
    try {
        const parsed = JSON.parse(candidate);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function truncateText(text, maxLen) {
    if (typeof text !== "string" || text.length <= maxLen) {
        return text || "";
    }
    return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

function buildProgressPayload(prediction) {
    return {
        percent: extractPercentFromLogs(prediction.logs),
        logsTail: extractLogsTail(prediction.logs, 3),
        createdAt: prediction.created_at || null,
        startedAt: prediction.started_at || null,
        completedAt: prediction.completed_at || null,
        elapsedSec: computeElapsedSec(prediction.started_at, prediction.completed_at),
    };
}

function extractLogsTail(logs, maxLines) {
    if (typeof logs !== "string" || logs.length === 0) {
        return [];
    }

    const lines = logs
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) {
        return [];
    }
    return lines.slice(-maxLines);
}

function extractPercentFromLogs(logs) {
    if (typeof logs !== "string" || logs.length === 0) {
        return null;
    }

    const pattern = /\b(\d{1,3})(?:\.\d+)?\s*%/g;
    let match;
    let max = null;

    while ((match = pattern.exec(logs)) !== null) {
        const value = Number(match[1]);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
            continue;
        }
        max = max === null ? value : Math.max(max, value);
    }

    return max;
}

function computeElapsedSec(startedAt, completedAt) {
    if (!startedAt) {
        return null;
    }

    const started = Date.parse(startedAt);
    if (!Number.isFinite(started)) {
        return null;
    }

    const completed = completedAt ? Date.parse(completedAt) : Date.now();
    if (!Number.isFinite(completed)) {
        return null;
    }

    return Math.max(0, Math.floor((completed - started) / 1000));
}

function requireSharedKey(request) {
    if (!ENFORCE_APP_SHARED_KEY) {
        return { ok: true, status: 200 };
    }

    if (!APP_SHARED_KEY) {
        return { ok: false, status: 500, error: "Missing APP_SHARED_KEY while ENFORCE_APP_SHARED_KEY=true" };
    }

    const incomingKey = request.headers["x-app-key"];
    if (!incomingKey || typeof incomingKey !== "string") {
        return { ok: false, status: 401, error: "Missing app key" };
    }

    const a = Buffer.from(incomingKey);
    const b = Buffer.from(APP_SHARED_KEY);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, status: 401, error: "Invalid app key" };
    }

    return { ok: true, status: 200 };
}

function getClientIp(request) {
    const xff = request.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
        return xff.split(",")[0].trim();
    }
    return request.socket?.remoteAddress || "unknown";
}

function checkRateLimit(ip, bucket, limit) {
    const now = Date.now();
    const key = `${bucket}:${ip}`;
    const item = globalState.rateLimits.get(key);

    if (!item || now - item.windowStart >= RATE_LIMIT_WINDOW_MS) {
        globalState.rateLimits.set(key, { windowStart: now, count: 1 });
        return { ok: true };
    }

    if (item.count >= limit) {
        return { ok: false };
    }

    item.count += 1;
    globalState.rateLimits.set(key, item);
    return { ok: true };
}

function trackNewJob(ip, predictionId) {
    globalState.jobOwners.set(predictionId, { ip, createdAt: Date.now() });
    const jobs = globalState.activeJobsByIp.get(ip) || new Set();
    jobs.add(predictionId);
    globalState.activeJobsByIp.set(ip, jobs);
}

function releaseIfDone(ip, predictionId, status) {
    if (status !== "succeeded" && status !== "failed" && status !== "canceled") {
        return;
    }

    const owner = globalState.jobOwners.get(predictionId);
    const ownerIp = owner?.ip || ip;

    globalState.jobOwners.delete(predictionId);
    const jobs = globalState.activeJobsByIp.get(ownerIp);
    if (!jobs) return;

    jobs.delete(predictionId);
    if (jobs.size === 0) {
        globalState.activeJobsByIp.delete(ownerIp);
    } else {
        globalState.activeJobsByIp.set(ownerIp, jobs);
    }
}

function pruneState() {
    const now = Date.now();

    for (const [key, item] of globalState.rateLimits.entries()) {
        if (now - item.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            globalState.rateLimits.delete(key);
        }
    }

    for (const [id, meta] of globalState.jobOwners.entries()) {
        if (now - meta.createdAt > META_TTL_MS) {
            globalState.jobOwners.delete(id);
            const jobs = globalState.activeJobsByIp.get(meta.ip);
            if (!jobs) continue;
            jobs.delete(id);
            if (jobs.size === 0) {
                globalState.activeJobsByIp.delete(meta.ip);
            } else {
                globalState.activeJobsByIp.set(meta.ip, jobs);
            }
        }
    }
}

function validateFileUrl(fileUrl, sourceFilename) {
    if (typeof fileUrl !== "string" || fileUrl.length === 0 || fileUrl.length > 2048) {
        return "Invalid fileUrl";
    }

    let parsed;
    try {
        parsed = new URL(fileUrl);
    } catch {
        return "fileUrl must be a valid URL";
    }

    if (parsed.protocol !== "https:") {
        return "fileUrl must use https";
    }

    const hostname = parsed.hostname.toLowerCase();

    if (isBlockedHost(hostname)) {
        return "fileUrl host is not allowed";
    }

    const allowlist = (getEnv("AUDIO_URL_ALLOWLIST") || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

    if (allowlist.length > 0 && !isReplicateFilesHost(hostname) && !hostMatchesAllowlist(hostname, allowlist)) {
        return "fileUrl host is not in AUDIO_URL_ALLOWLIST";
    }

    const pathname = parsed.pathname.toLowerCase();
    const hasValidUrlExt = Array.from(AUDIO_EXTENSIONS).some((ext) => pathname.endsWith(ext));
    const hasValidSourceExt =
        typeof sourceFilename === "string" &&
        Array.from(AUDIO_EXTENSIONS).some((ext) => sourceFilename.toLowerCase().endsWith(ext));
    const hasValidExt = hasValidUrlExt || hasValidSourceExt;
    if (!hasValidExt) {
        return "fileUrl must end with a supported audio extension";
    }

    return null;
}

function hostMatchesAllowlist(hostname, allowlist) {
    for (const allowed of allowlist) {
        if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
            return true;
        }
    }
    return false;
}

function isReplicateFilesHost(hostname) {
    return hostname === "api.replicate.com";
}

function isBlockedHost(hostname) {
    const lower = hostname.toLowerCase();
    if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) {
        return true;
    }

    const ipType = net.isIP(hostname);
    if (ipType === 4) {
        return isPrivateIPv4(hostname);
    }
    if (ipType === 6) {
        return hostname === "::1";
    }
    return false;
}

function isPrivateIPv4(ip) {
    const [a, b] = ip.split(".").map((x) => Number(x));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}
