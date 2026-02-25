import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_TARGET_URL = 'https://flashnotes-ai.web.app';
const DEFAULT_FIXTURE = 'tests/fixtures/smoke-25s.wav';
const DEFAULT_RECORD_SECONDS = 8;
const DEFAULT_TIMEOUT_MS = 480000;

function readPositiveInt(name, fallback) {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function readBool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const v = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
    return fallback;
}

function toAbsolutePath(filePath) {
    if (!filePath) return path.resolve(process.cwd(), DEFAULT_FIXTURE);
    return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function createResult(config) {
    return {
        status: 'failed',
        targetUrl: config.targetUrl,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationMs: null,
        config: {
            fixturePath: config.fixturePath,
            recordSeconds: config.recordSeconds,
            timeoutMs: config.timeoutMs,
            headless: config.headless,
        },
        steps: [],
        error: null,
    };
}

function addStep(result, name, detail = '') {
    const step = {
        name,
        at: new Date().toISOString(),
    };
    if (detail) step.detail = detail;
    result.steps.push(step);
    console.error(`[smoke] ${name}${detail ? `: ${detail}` : ''}`);
}

async function waitForResult(page, timeoutMs) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
        const state = await page.evaluate(() => {
            const resultArea = document.getElementById('result-area');
            const transcript = document.getElementById('transcript-preview');
            const error = document.getElementById('error-message');
            const transcribeStatus = document.getElementById('transcribe-status-line');
            const uploadStatus = document.getElementById('upload-status-line');

            const resultVisible = !!resultArea && !resultArea.classList.contains('hidden');
            const transcriptText = transcript?.textContent?.trim() || '';
            const errorVisible = !!error && !error.classList.contains('hidden');
            const errorText = error?.textContent?.trim() || '';

            return {
                resultVisible,
                transcriptLength: transcriptText.length,
                errorVisible,
                errorText,
                transcribeStatus: transcribeStatus?.textContent?.trim() || '',
                uploadStatus: uploadStatus?.textContent?.trim() || '',
            };
        });

        if (state.errorVisible && state.errorText) {
            return {
                success: false,
                error: `UI error: ${state.errorText}`,
                snapshot: state,
            };
        }

        if (state.resultVisible && state.transcriptLength > 0) {
            return {
                success: true,
                snapshot: state,
            };
        }

        await page.waitForTimeout(1500);
    }

    const timeoutSnapshot = await page.evaluate(() => {
        const transcribeStatus = document.getElementById('transcribe-status-line');
        const uploadStatus = document.getElementById('upload-status-line');
        const error = document.getElementById('error-message');

        return {
            transcribeStatus: transcribeStatus?.textContent?.trim() || '',
            uploadStatus: uploadStatus?.textContent?.trim() || '',
            errorText: error?.textContent?.trim() || '',
        };
    });

    return {
        success: false,
        error: `Timed out after ${timeoutMs}ms waiting for non-empty transcript`,
        snapshot: timeoutSnapshot,
    };
}

async function run() {
    const targetUrl = (process.env.PROD_FRONTEND_URL || DEFAULT_TARGET_URL).trim();
    const fixturePath = toAbsolutePath(process.env.SMOKE_AUDIO_FIXTURE || DEFAULT_FIXTURE);
    const recordSeconds = readPositiveInt('SMOKE_RECORD_SECONDS', DEFAULT_RECORD_SECONDS);
    const timeoutMs = readPositiveInt('SMOKE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const headless = readBool('SMOKE_HEADLESS', true);

    const result = createResult({ targetUrl, fixturePath, recordSeconds, timeoutMs, headless });

    let browser;
    try {
        if (!fs.existsSync(fixturePath)) {
            throw new Error(`Fixture file not found: ${fixturePath}`);
        }

        addStep(result, 'prepare', `target=${targetUrl}`);

        browser = await chromium.launch({
            headless,
            args: [
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                `--use-file-for-fake-audio-capture=${fixturePath}`,
            ],
        });

        const context = await browser.newContext({ permissions: ['microphone'] });
        const page = await context.newPage();
        page.setDefaultTimeout(Math.min(30000, timeoutMs));

        addStep(result, 'open_page');
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

        addStep(result, 'record_start');
        await page.click('#record-btn');

        addStep(result, 'record_wait', `${recordSeconds}s`);
        await page.waitForTimeout(recordSeconds * 1000);

        addStep(result, 'record_stop_trigger');
        await page.click('#record-btn');

        addStep(result, 'record_stop_confirm');
        await page.waitForFunction(() => {
            const modal = document.getElementById('confirm-modal');
            return !!modal && !modal.classList.contains('hidden');
        }, undefined, { timeout: 15000 });
        await page.click('#confirm-ok');

        addStep(result, 'wait_start_enabled');
        await page.waitForFunction(() => {
            const btn = document.getElementById('start-btn');
            return !!btn && !btn.disabled;
        }, undefined, { timeout: 20000 });

        addStep(result, 'transcribe_start');
        await page.click('#start-btn');

        addStep(result, 'wait_result');
        const outcome = await waitForResult(page, timeoutMs);
        if (!outcome.success) {
            const detail = outcome.snapshot ? ` | snapshot=${JSON.stringify(outcome.snapshot)}` : '';
            throw new Error(`${outcome.error}${detail}`);
        }

        addStep(result, 'assert_transcript_non_empty', `length=${outcome.snapshot?.transcriptLength || 0}`);
        result.status = 'passed';
    } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        result.status = 'failed';
    } finally {
        if (browser) {
            await browser.close();
        }
        result.endedAt = new Date().toISOString();
        result.durationMs = new Date(result.endedAt).getTime() - new Date(result.startedAt).getTime();
    }

    console.log(JSON.stringify(result, null, 2));

    if (result.status !== 'passed') {
        process.exitCode = 1;
    }
}

await run();
