/**
 * CORS helper for Vercel API handlers.
 * Allows requests from Firebase Hosting (web.app) and local dev.
 */

const ALLOWED_ORIGINS = [
    'https://flashnotes-ai.web.app',
    'https://flashnotes.web.app',
    'https://manual-whisper-test.web.app',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
];

function isAllowedWebAppOrigin(origin) {
    if (typeof origin !== 'string') return false;
    // Allow Firebase Hosting preview channels and standard web.app domains.
    // Example: https://flashnotes-ai--gate-20260225-125018-r49skz9u.web.app
    return /^https:\/\/[a-z0-9-]+\.web\.app$/i.test(origin);
}

function isAllowedOrigin(origin) {
    return ALLOWED_ORIGINS.includes(origin) || isAllowedWebAppOrigin(origin);
}

export function setCorsHeaders(request, response) {
    const origin = request.headers.origin;
    if (isAllowedOrigin(origin)) {
        response.setHeader("Access-Control-Allow-Origin", origin);
    }
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-app-key, x-file-name, x-file-content-type");
}

/** Returns true if the request was a preflight that has been handled. */
export function handlePreflight(request, response) {
    setCorsHeaders(request, response);
    if (request.method === "OPTIONS") {
        response.status(204).end();
        return true;
    }
    return false;
}
