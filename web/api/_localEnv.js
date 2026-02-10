import fs from "node:fs";
import path from "node:path";

let cachedLocalEnv;

export function getEnv(name) {
    const direct = normalizeValue(cleanEnvValue(process.env[name], name));
    if (direct) return direct;

    if (cachedLocalEnv === undefined) {
        cachedLocalEnv = loadLocalEnv();
    }

    return normalizeValue(cleanEnvValue(cachedLocalEnv[name], name));
}

function loadLocalEnv() {
    const result = {};
    const candidates = [
        path.join(process.cwd(), ".env.local"),
        path.join(process.cwd(), ".env"),
        path.join(process.cwd(), "..", ".env.local"),
        path.join(process.cwd(), "..", ".env"),
    ];

    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        const parsed = parseDotEnv(fs.readFileSync(file, "utf8"));
        Object.assign(result, parsed);
    }

    return result;
}

function parseDotEnv(content) {
    const out = {};
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;

        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        out[key] = value;
    }

    return out;
}

function normalizeValue(value) {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function cleanEnvValue(value, keyName) {
    if (typeof value !== "string") return value;
    let out = value.trim();

    const prefix = `${keyName}=`;
    if (out.startsWith(prefix)) {
        out = out.slice(prefix.length).trim();
    }

    if (
        (out.startsWith('"') && out.endsWith('"')) ||
        (out.startsWith("'") && out.endsWith("'"))
    ) {
        out = out.slice(1, -1);
    }

    return out;
}
