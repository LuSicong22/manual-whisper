/**
 * CORS helper for Vercel API handlers.
 * Allows requests from Firebase Hosting (web.app) and local dev.
 */


export function setCorsHeaders(request, response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
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
