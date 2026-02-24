/**
 * blob-upload.js - Vercel Blob client upload token handler.
 * Generates client tokens for direct browser-to-Blob uploads,
 * bypassing Vercel's 4.5MB serverless function body limit.
 */
import { handleUpload } from '@vercel/blob/client';
import { handlePreflight, setCorsHeaders } from './_cors.js';
import { validateAppKey } from './_localEnv.js';

const ALLOWED_CONTENT_TYPES = [
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav',
    'audio/flac', 'audio/ogg', 'audio/webm', 'audio/aac',
    'audio/x-m4a', 'audio/x-ms-wma',
    'video/webm', // some browsers record webm as video/webm
    'application/octet-stream', // fallback for some audio formats
];

export default async function handler(request, response) {
    if (handlePreflight(request, response)) return;
    setCorsHeaders(request, response);

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    if (!validateAppKey(request)) {
        return response.status(403).json({ error: "Unauthorized access" });
    }

    try {
        const body = request.body;
        const jsonResponse = await handleUpload({
            body,
            request: {
                headers: request.headers,
                url: `https://${request.headers.host}${request.url}`,
            },
            onBeforeGenerateToken: async (pathname) => {
                // Allow audio file uploads up to 200MB
                return {
                    allowedContentTypes: ALLOWED_CONTENT_TYPES,
                    maximumSizeInBytes: 200 * 1024 * 1024, // 200MB
                    addRandomSuffix: true,
                    validFor: 300, // token valid for 5 minutes
                };
            },
            onUploadCompleted: async ({ blob }) => {
                // File uploaded successfully - nothing to store server-side
                console.log('Blob upload completed:', blob.url);
            },
        });

        return response.status(200).json(jsonResponse);
    } catch (error) {
        console.error('Blob upload handler error:', error);
        return response.status(400).json({ error: error.message });
    }
}
