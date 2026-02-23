/**
 * CORS helper for Vercel API handlers.
 * Allows requests from Firebase Hosting (web.app) and local dev.
 */

const ALLOWED_ORIGINS = new Set([
    "https://manual-whisper-test.web.app",
    "https://manual-whisper-test.firebaseapp.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]);

export function setCorsHeaders(request, response) {
    const origin = request.headers["origin"] || "";
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0];

    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-app-key, x-file-name, x-file-content-type");
    response.setHeader("Vary", "Origin");
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
