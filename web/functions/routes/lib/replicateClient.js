/**
 * Replicate Client and Configuration for manual-whisper
 */
import Replicate from "replicate";
import { getEnv } from "../_localEnv.js";

export const REPLICATE_API_TOKEN = getEnv("REPLICATE_API_TOKEN");
export const APP_SHARED_KEY = getEnv("APP_SHARED_KEY");
export const REPLICATE_MODEL = getEnv("REPLICATE_MODEL") || "victor-upmeet/whisperx";
export const REPLICATE_MODEL_VERSION = getEnv("REPLICATE_MODEL_VERSION");
export const HF_TOKEN = getEnv("HF_TOKEN");
export const ENFORCE_APP_SHARED_KEY = parseBoolean(getEnv("ENFORCE_APP_SHARED_KEY"), false);
export const LANGUAGE_OVERRIDE = (getEnv("LANGUAGE") || "").trim() || null;
export const VALID_LANGUAGES = new Set(["zh", "en", "zh+en"]);

export const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
});

let cachedResolvedVersion = REPLICATE_MODEL_VERSION || null;

export async function resolveModelVersion() {
    if (cachedResolvedVersion) return cachedResolvedVersion;

    const [owner, name] = REPLICATE_MODEL.split("/");
    if (!owner || !name) throw new Error(`Invalid REPLICATE_MODEL: ${REPLICATE_MODEL}`);

    const model = await replicate.models.get(owner, name);
    const latest = model?.latest_version?.id;
    if (!latest) throw new Error(`No latest version found for model ${REPLICATE_MODEL}`);

    cachedResolvedVersion = latest;
    return cachedResolvedVersion;
}

export function buildTranscribeInput(fileUrl, language) {
    const diarizationEnabled = parseBoolean(getEnv("ENABLE_DIARIZATION"), Boolean(HF_TOKEN));
    const isMixed = language === "zh+en";
    const initialPrompt = resolveInitialPrompt();

    const input = {
        audio_file: fileUrl,
        batch_size: 16,
        temperature: Number(getEnv("TEMPERATURE") || 0),
        vad_onset: Number(getEnv("VAD_ONSET") || 0.50),
        vad_offset: Number(getEnv("VAD_OFFSET") || 0.36),
        align_output: diarizationEnabled,
        diarization: diarizationEnabled,
    };

    input.language = (isMixed ? "zh" : language) || "zh";

    if (isMixed) {
        input.initial_prompt = initialPrompt || "这是一段中英文混合的meeting录音。Please保留说话者使用的original language，English部分保持英文，中文部分保持中文。";
    } else if (initialPrompt) {
        input.initial_prompt = initialPrompt;
    }

    if (diarizationEnabled && HF_TOKEN) {
        input.huggingface_access_token = HF_TOKEN;
    }

    return input;
}

function resolveInitialPrompt() {
    const raw = getEnv("INITIAL_PROMPT");
    if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    if (!parseBoolean(getEnv("USE_INITIAL_PROMPT"), false)) return "";
    return "中文会议语音逐字转写，保持口语原文，不补写无关文本。";
}

function parseBoolean(raw, fallback) {
    if (typeof raw !== "string") return fallback;
    const v = raw.trim().toLowerCase();
    return (v === "1" || v === "true" || v === "yes" || v === "on") ? true : (v === "0" || v === "false" || v === "no" || v === "off") ? false : fallback;
}
