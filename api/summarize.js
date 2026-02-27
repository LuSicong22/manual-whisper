/**
 * summarize.js - API Handler for generating meeting minutes
 */
import { replicate, REPLICATE_API_TOKEN } from "./lib/replicateClient.js";
import { getEnv, validateAppKey } from "./_localEnv.js";
import { handlePreflight, setCorsHeaders } from "./_cors.js";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const POST_RATE_LIMIT_PER_MIN = Number(getEnv("POST_RATE_LIMIT_PER_MIN") || 6);

const globalState = globalThis.__summarizeState || {
    rateLimits: new Map(),
};
globalThis.__summarizeState = globalState;

export default async function handler(request, response) {
    if (handlePreflight(request, response)) return;
    setCorsHeaders(request, response);
    pruneState();

    if (!validateAppKey(request)) {
        return response.status(403).json({ error: "Unauthorized access" });
    }

    if (!REPLICATE_API_TOKEN) {
        return response.status(500).json({ error: "Missing REPLICATE_API_TOKEN" });
    }

    if (request.method !== "POST") {
        return response.status(405).json({ error: "Method not allowed" });
    }

    const clientIp = getClientIp(request);
    const postRate = checkRateLimit(clientIp, "post", POST_RATE_LIMIT_PER_MIN);
    if (!postRate.ok) return response.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });

    try {
        const { transcript } = request.body || {};
        if (!transcript || typeof transcript !== 'string') {
            return response.status(400).json({ error: "Missing or invalid transcript" });
        }

        const system_prompt = `你是一名专业的会议记录助手。请根据以下会议转写内容，生成结构化的会议纪要。

要求输出格式（Markdown，严格遵守以下标题结构）：
## 📌 会议摘要
一段简要概述

## 🔑 关键要点
- 要点1
- 要点2
（根据实际内容列出）

## ✅ 行动项
- [ ] 行动项1（负责人：如果有，截止日期：如果有）
- [ ] 行动项2
（如果没有行动项，请写“本次会议无明确行动项”）

## 📋 详细记录
按主题分段总结讨论过程

注意事项：
- 准确识别并归纳发言者的核心观点
- 保留原文中的关键数字、专有名词、时间节点
- 行动项必须具体、可执行
- 始终用中文输出结果
`;

        const prompt = `这是会议的转写内容：\n\n${transcript}\n\n请生成会议纪要。`;

        // Use Replicate's official meta-llama-3-70b-instruct model
        // replicate.run returns an array of strings strings representing the output stream
        const output = await replicate.run(
            "meta/meta-llama-3-70b-instruct",
            {
                input: {
                    system_prompt,
                    prompt,
                    max_tokens: 2048,
                    temperature: 0.2, // Low temp for more factual summary
                } // Remove the comment for system_prompt inside input object
            }
        );

        let summaryText;
        if (typeof output === 'string') {
            summaryText = output;
        } else if (Array.isArray(output)) {
            // Check if it's an array of objects ({ event, data }) or strings
            if (output.length > 0 && typeof output[0] === 'string') {
                summaryText = output.join("").trim();
            } else if (output.length > 0 && typeof output[0] === 'object' && output[0].data !== undefined) {
                // E.g., OpenAI format or similar
                summaryText = output.map(item => item.data || '').join("").trim();
            } else {
                summaryText = JSON.stringify(output);
            }
        } else if (output && typeof output === 'object') {
            summaryText = output.output ? output.output : JSON.stringify(output);
        } else {
            summaryText = String(output);
        }

        return response.status(200).json({ summary: summaryText });
    } catch (e) {
        console.error("Summarize Error:", e);
        return response.status(500).json({ error: "Failed to generate meeting summary" });
    }
}

// --- Rate Limiting Helpers ---

function pruneState() {
    const now = Date.now();
    for (const [key, state] of globalState.rateLimits.entries()) {
        if (now - state.start > RATE_LIMIT_WINDOW_MS) {
            globalState.rateLimits.delete(key);
        }
    }
}

function checkRateLimit(ip, type, limit) {
    const now = Date.now();
    const key = `${ip}:${type}`;
    let state = globalState.rateLimits.get(key);
    if (!state || now - state.start > RATE_LIMIT_WINDOW_MS) {
        state = { start: now, count: 0 };
    }
    state.count += 1;
    globalState.rateLimits.set(key, state);
    return { ok: state.count <= limit };
}

function getClientIp(req) {
    const fwd = req.headers["x-forwarded-for"];
    if (fwd) return fwd.split(",")[0].trim();
    return req.socket.remoteAddress || "127.0.0.1";
}
