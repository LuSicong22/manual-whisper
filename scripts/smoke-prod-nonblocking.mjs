import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const REPORT_DIR = path.resolve(process.cwd(), 'reports/smoke');
const STRICT_SCRIPT = path.resolve(process.cwd(), 'scripts/smoke-prod-recording.mjs');

function parseJsonSafely(text) {
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        // Fallback: try to parse from the last JSON object in stdout.
        const idx = text.lastIndexOf('{');
        if (idx >= 0) {
            const candidate = text.slice(idx);
            try {
                return JSON.parse(candidate);
            } catch {
                return null;
            }
        }
        return null;
    }
}

function buildFallbackReport({ stdout, stderr, exitCode, startedAt }) {
    const endedAt = new Date().toISOString();
    const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    const lines = (stderr || '').trim().split('\n').filter(Boolean);
    const head = lines.slice(0, 2).join('\n');
    const tail = lines.slice(-8).join('\n');
    const errText = [head, tail].filter(Boolean).join('\n...\n');

    return {
        status: 'failed',
        targetUrl: process.env.PROD_FRONTEND_URL || 'https://flashnotes-ai.web.app',
        startedAt,
        endedAt,
        durationMs,
        steps: [],
        error: errText || `Smoke script exited with code ${exitCode ?? 'unknown'}`,
        runner: {
            strictScriptExitCode: exitCode,
            parseFromStdoutFailed: true,
            stdoutBytes: Buffer.byteLength(stdout || ''),
            stderrBytes: Buffer.byteLength(stderr || ''),
        },
    };
}

function runStrictScript() {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [STRICT_SCRIPT], {
            cwd: process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });

        child.stderr.on('data', (chunk) => {
            const text = String(chunk);
            stderr += text;
            process.stderr.write(text);
        });

        child.on('close', (exitCode, signal) => {
            resolve({ stdout, stderr, exitCode, signal });
        });
    });
}

async function writeReports(report) {
    await fs.mkdir(REPORT_DIR, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const latestPath = path.join(REPORT_DIR, 'latest.json');
    const tsPath = path.join(REPORT_DIR, `${ts}.json`);

    const payload = JSON.stringify(report, null, 2);
    await Promise.all([
        fs.writeFile(latestPath, payload, 'utf8'),
        fs.writeFile(tsPath, payload, 'utf8'),
    ]);

    return { latestPath, tsPath };
}

async function main() {
    const startedAt = new Date().toISOString();
    const { stdout, stderr, exitCode, signal } = await runStrictScript();
    const parsed = parseJsonSafely(stdout.trim());

    const report = parsed || buildFallbackReport({ stdout, stderr, exitCode, startedAt });
    report.runner = {
        ...(report.runner || {}),
        strictScriptExitCode: exitCode,
        strictScriptSignal: signal || null,
        wrappedAt: new Date().toISOString(),
        nonBlocking: true,
    };

    const { latestPath, tsPath } = await writeReports(report);

    if (report.status === 'passed') {
        console.log('[smoke] PASS (non-blocking)');
        console.log(`[smoke] report: ${latestPath}`);
        console.log(`[smoke] archive: ${tsPath}`);
        return;
    }

    console.error('============================================================');
    console.error('[smoke] FAIL (non-blocking): production recording flow failed');
    console.error(`- target: ${report.targetUrl || 'unknown'}`);
    console.error(`- durationMs: ${report.durationMs ?? 'unknown'}`);
    console.error(`- error: ${report.error || 'unknown error'}`);
    console.error(`- report: ${latestPath}`);
    console.error(`- archive: ${tsPath}`);
    console.error('============================================================');
}

try {
    await main();
} catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('[smoke] non-blocking wrapper internal error');
    console.error(message);
}
process.exitCode = 0;
