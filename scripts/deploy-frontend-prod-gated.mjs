import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_PROJECT_ID = 'manual-whisper-test';
const DEFAULT_SITE_ID = 'flashnotes-ai';
const PREVIEW_EXPIRES = '1d';

function hasArg(flag) {
    return process.argv.includes(flag);
}

function escapeRegExp(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function buildChannelId(now = new Date()) {
    const y = now.getFullYear();
    const m = pad2(now.getMonth() + 1);
    const d = pad2(now.getDate());
    const hh = pad2(now.getHours());
    const mm = pad2(now.getMinutes());
    const ss = pad2(now.getSeconds());
    return `gate-${y}${m}${d}-${hh}${mm}${ss}`;
}

function resolveSiteId() {
    const fromEnv = (process.env.FIREBASE_HOSTING_SITE || '').trim();
    if (fromEnv) return fromEnv;

    const configPath = path.resolve(process.cwd(), 'firebase.json');
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
            if (parsed.hosting && typeof parsed.hosting === 'object' && typeof parsed.hosting.site === 'string' && parsed.hosting.site.trim()) {
                return parsed.hosting.site.trim();
            }
            if (Array.isArray(parsed.hosting)) {
                const withSite = parsed.hosting.find((item) => item && typeof item.site === 'string' && item.site.trim());
                if (withSite) return withSite.site.trim();
            }
        }
    } catch {
        // Ignore parsing errors and fall back to default.
    }

    return DEFAULT_SITE_ID;
}

function runCommand({ label, cmd, args, env, dryRun = false }) {
    return new Promise((resolve) => {
        const rendered = `${cmd} ${args.join(' ')}`;
        console.log(`[gate] ${label}: ${rendered}`);

        if (dryRun) {
            console.log(`[gate] dry-run skip: ${rendered}`);
            resolve({ ok: true, code: 0, signal: null, error: null, dryRun: true, stdout: '', stderr: '' });
            return;
        }

        const child = spawn(cmd, args, {
            cwd: process.cwd(),
            env: env || process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            const text = String(chunk);
            stdout += text;
            process.stdout.write(text);
        });

        child.stderr.on('data', (chunk) => {
            const text = String(chunk);
            stderr += text;
            process.stderr.write(text);
        });

        child.on('error', (error) => {
            resolve({ ok: false, code: 1, signal: null, error, stdout, stderr });
        });

        child.on('close', (code, signal) => {
            resolve({ ok: code === 0, code: code ?? 1, signal: signal ?? null, error: null, stdout, stderr });
        });
    });
}

function extractPreviewUrl(previewOutput, channelId) {
    const escapedChannel = escapeRegExp(channelId);
    const channelSpecific = new RegExp(`https://[^\\s]*--${escapedChannel}[^\\s]*\\.web\\.app`, 'ig');
    const channelMatches = previewOutput.match(channelSpecific) || [];
    if (channelMatches.length > 0) return channelMatches[channelMatches.length - 1];

    const generic = previewOutput.match(/https:\/\/[^\s]*--[^\s]*\.web\.app/ig) || [];
    if (generic.length > 0) return generic[generic.length - 1];

    return '';
}

function buildDryRunPreviewUrl(siteId, channelId) {
    return `https://${siteId}--${channelId}-dryrun.web.app`;
}

async function main() {
    const projectId = (process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID).trim();
    const siteId = resolveSiteId();
    const channelId = buildChannelId();
    const dryRun = hasArg('--dry-run') || hasArg('-n') || String(process.env.GATE_DRY_RUN || '').trim() === '1';

    console.log('[gate] start: preview deploy -> smoke -> production deploy');
    console.log(`[gate] project=${projectId} site=${siteId} channel=${channelId}`);
    if (dryRun) {
        console.log('[gate] mode=dry-run (no real deployment/test commands will execute)');
    }

    const preview = await runCommand({
        label: 'preview deploy',
        cmd: 'firebase',
        args: [
            'hosting:channel:deploy',
            channelId,
            '--expires',
            PREVIEW_EXPIRES,
            '--project',
            projectId,
        ],
        dryRun,
    });

    if (!preview.ok) {
        console.error('[gate] preview deploy failed. production deploy skipped.');
        if (preview.error) console.error(`[gate] preview deploy error: ${preview.error.message}`);
        process.exit(preview.code || 1);
    }

    const previewOutput = `${preview.stdout || ''}\n${preview.stderr || ''}`;
    let previewUrl = extractPreviewUrl(previewOutput, channelId);
    if (!previewUrl && dryRun) {
        previewUrl = buildDryRunPreviewUrl(siteId, channelId);
    }

    if (!previewUrl) {
        console.error('[gate] could not determine preview URL from firebase output.');
        console.error('[gate] smoke skipped. production deploy blocked for safety.');
        process.exit(1);
    }

    console.log(`[gate] preview url: ${previewUrl}`);

    const smoke = await runCommand({
        label: 'smoke',
        cmd: process.execPath,
        args: ['scripts/smoke-prod-recording.mjs'],
        env: {
            ...process.env,
            PROD_FRONTEND_URL: previewUrl,
        },
        dryRun,
    });

    if (!smoke.ok) {
        console.error('[gate] smoke failed. production deploy skipped.');
        console.error(`[gate] preview for debugging (expires in ${PREVIEW_EXPIRES}): ${previewUrl}`);
        if (smoke.error) console.error(`[gate] smoke error: ${smoke.error.message}`);
        process.exit(smoke.code || 1);
    }

    const production = await runCommand({
        label: 'production deploy',
        cmd: 'firebase',
        args: [
            'deploy',
            '--only',
            'hosting',
            '--project',
            projectId,
        ],
        dryRun,
    });

    if (!production.ok) {
        console.error('[gate] production deploy failed after smoke pass.');
        if (production.error) console.error(`[gate] production deploy error: ${production.error.message}`);
        process.exit(production.code || 1);
    }

    console.log('[gate] success: smoke passed and production deploy completed.');
}

await main();
