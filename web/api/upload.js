import Replicate from "replicate";
import crypto from "node:crypto";
import { getEnv } from "./_localEnv.js";

const REPLICATE_API_TOKEN = getEnv("REPLICATE_API_TOKEN");
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ENFORCE_APP_SHARED_KEY = parseBoolean(getEnv("ENFORCE_APP_SHARED_KEY"), false);

const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
});

export default async function handler(request, response) {
    if (request.method !== "POST") {
        return response.status(405).json({ error: "Method not allowed" });
    }

    if (!REPLICATE_API_TOKEN) {
        return response.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });
    }

    const auth = requireSharedKey(request);
    if (!auth.ok) {
        return response.status(auth.status).json({ error: auth.error });
    }

    try {
        const bodyBuffer = await readRequestBody(request, MAX_UPLOAD_BYTES);
        if (bodyBuffer.length === 0) {
            return response.status(400).json({ error: "Empty upload body" });
        }

        const uploaded = await replicate.files.create(bodyBuffer, {
            source: "manual-whisper-web",
            original_filename: getSourceFilename(request),
            content_type: getContentType(request),
        });

        const fileUrl = uploaded?.urls?.get;
        if (typeof fileUrl !== "string" || !fileUrl.startsWith("https://")) {
            console.error("Unexpected replicate file payload:", uploaded);
            return response.status(502).json({ error: "Replicate upload response invalid" });
        }

        return response.status(200).json({ fileUrl });
    } catch (e) {
        if (e && e.message === "UPLOAD_TOO_LARGE") {
            return response.status(413).json({ error: "Upload too large (max 100MB)" });
        }
        const mapped = mapUploadError(e);
        console.error("Upload proxy error:", e);
        return response.status(mapped.status).json({ error: mapped.message });
    }
}

function requireSharedKey(request) {
    if (!ENFORCE_APP_SHARED_KEY) {
        return { ok: true, status: 200 };
    }

    const sharedKey = getEnv("APP_SHARED_KEY");
    if (!sharedKey) {
        return { ok: false, status: 500, error: "Missing APP_SHARED_KEY while ENFORCE_APP_SHARED_KEY=true" };
    }

    const incomingKey = request.headers["x-app-key"];
    if (!incomingKey || typeof incomingKey !== "string") {
        return { ok: false, status: 401, error: "Missing app key" };
    }

    const a = Buffer.from(incomingKey);
    const b = Buffer.from(sharedKey);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, status: 401, error: "Invalid app key" };
    }

    return { ok: true, status: 200 };
}

function getSourceFilename(request) {
    const raw = request.headers["x-file-name"];
    if (typeof raw !== "string" || raw.length === 0) {
        return "audio_upload";
    }
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

function getContentType(request) {
    const contentType = request.headers["x-file-content-type"];
    if (typeof contentType !== "string" || contentType.length === 0) {
        return "application/octet-stream";
    }
    return contentType;
}

async function readRequestBody(request, maxBytes) {
    const parsedBody = request.body;
    if (Buffer.isBuffer(parsedBody)) {
        if (parsedBody.length > maxBytes) {
            throw new Error("UPLOAD_TOO_LARGE");
        }
        return parsedBody;
    }
    if (parsedBody instanceof Uint8Array) {
        const buf = Buffer.from(parsedBody);
        if (buf.length > maxBytes) {
            throw new Error("UPLOAD_TOO_LARGE");
        }
        return buf;
    }
    if (typeof parsedBody === "string") {
        const buf = Buffer.from(parsedBody);
        if (buf.length > maxBytes) {
            throw new Error("UPLOAD_TOO_LARGE");
        }
        return buf;
    }

    const chunks = [];
    let total = 0;

    for await (const chunk of request) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > maxBytes) {
            throw new Error("UPLOAD_TOO_LARGE");
        }
        chunks.push(buf);
    }

    return Buffer.concat(chunks);
}

function mapUploadError(error) {
    const status = Number(error?.response?.status ?? error?.status ?? error?.statusCode);
    const detail = extractErrorDetail(error);

    if (status === 401) {
        return { status: 401, message: "REPLICATE_API_TOKEN 无效或已过期" };
    }
    if (status === 402) {
        return { status: 402, message: "Replicate 余额不足，请充值后重试" };
    }
    if (status === 413) {
        return { status: 413, message: "上传文件过大（当前上限约 100MB）" };
    }
    if (status === 429) {
        return { status: 429, message: "上传请求过于频繁，请稍后重试" };
    }
    if (status >= 500 && status < 600) {
        return { status, message: "Replicate 上传服务暂时不可用，请稍后重试" };
    }
    if (status >= 400 && status < 600) {
        if (detail) {
            return { status, message: `上传到 Replicate 失败：${truncateText(detail, 140)}` };
        }
        return { status, message: "上传到 Replicate 失败，请稍后重试" };
    }

    if (detail) {
        return { status: 500, message: `Upload failed: ${truncateText(detail, 180)}` };
    }
    return { status: 500, message: "Upload failed" };
}

function extractErrorDetail(error) {
    const message = typeof error?.message === "string" ? error.message : "";
    const parsed = parseJsonObjectFromErrorMessage(message);
    if (parsed) {
        if (typeof parsed.detail === "string") return parsed.detail.trim();
        if (typeof parsed.error === "string") return parsed.error.trim();
        if (typeof parsed.message === "string") return parsed.message.trim();
    }
    return message;
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

function parseBoolean(raw, fallback) {
    if (typeof raw !== "string") return fallback;
    const v = raw.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    if (v === "0" || v === "false" || v === "no" || v === "off") return false;
    return fallback;
}
