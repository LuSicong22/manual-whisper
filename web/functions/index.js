import { onRequest } from "firebase-functions/v2/https";
import express from "express";
import uploadHandler from "./routes/upload.js";
import transcribeHandler from "./routes/transcribe.js";

const app = express();

// Firebase Functions always parses the request body.
// To ensure upload.js handles the body correctly, we pass the rawBuffer to req.body.
app.post("/api/upload", (req, res) => {
    if (req.rawBody) {
        req.body = req.rawBody;
    }
    return uploadHandler(req, res);
});

// For transcribe, we ensure JSON parsing is available
app.use("/api/transcribe", express.json());
app.all("/api/transcribe", (req, res) => {
    return transcribeHandler(req, res);
});

// Create the exported "api" function as defined in firebase.json rewrites
export const api = onRequest(
    {
        region: "asia-east1", // Or any suitable region
        timeoutSeconds: 300,
        memory: "512MiB",
        maxInstances: 10,
    },
    app
);
