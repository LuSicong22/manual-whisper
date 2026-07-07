/**
 * cleanup-blobs.js - Scheduled deletion of old Vercel Blob uploads.
 * Triggered by Vercel Cron (see vercel.json). Deletes blobs older than
 * RETENTION_DAYS to keep storage usage under the plan quota.
 */
import { list, del } from '@vercel/blob';
import { getEnv } from './_localEnv.js';

const RETENTION_DAYS = 7;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export default async function handler(request, response) {
    if (!isAuthorizedCronRequest(request)) {
        return response.status(401).json({ error: 'Unauthorized' });
    }

    const cutoff = Date.now() - RETENTION_MS;
    let deleted = 0;
    let scanned = 0;
    let cursor;

    try {
        do {
            const page = await list({ cursor, limit: 1000 });
            cursor = page.cursor;

            const stale = page.blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoff);
            scanned += page.blobs.length;

            if (stale.length > 0) {
                await del(stale.map(b => b.url));
                deleted += stale.length;
            }
        } while (cursor);

        return response.status(200).json({ scanned, deleted, retentionDays: RETENTION_DAYS });
    } catch (error) {
        console.error('Blob cleanup error:', error);
        return response.status(500).json({ error: error.message });
    }
}

function isAuthorizedCronRequest(request) {
    const cronSecret = getEnv('CRON_SECRET');
    if (!cronSecret) return false;
    const auth = request.headers['authorization'] || '';
    return auth === `Bearer ${cronSecret}`;
}
