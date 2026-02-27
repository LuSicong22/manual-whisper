export function createRealtimeTranscriptionController(deps) {
    const {
        recorder,
        uploadFile,
        createTranscription,
        pollTranscriptionStatus,
        renderRealtimeProgress,
    } = deps;

    const CHUNK_INTERVAL_MS = 30000; // 30 seconds for subsequent chunks
    const FIRST_CHUNK_INTERVAL_MS = 10000; // 10 seconds for the first chunk

    let isRealtimeActive = true;
    let timer = null;
    let chunks = []; // { id, index, startTime, endTime, predictionId, status, output, text }
    let lastChunkTime = null;
    let currentIndex = 0;

    /** Convert seconds to HH:MM:SS string */
    function secToHms(totalSeconds) {
        const s = Math.floor(totalSeconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    /** Parse HH:MM:SS or MM:SS to seconds */
    function hmsToSec(hms) {
        const parts = hms.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return Number(hms);
    }

    /** Shift all [HH:MM:SS - HH:MM:SS] timestamps in a markdown string by offsetSec */
    function shiftMarkdownTimestamps(md, offsetSec) {
        if (!offsetSec || offsetSec <= 0) return md;
        return md.replace(/\[(\d{2}:\d{2}:\d{2})\s*-\s*(\d{2}:\d{2}:\d{2})\]/g, (_, start, end) => {
            return `[${secToHms(hmsToSec(start) + offsetSec)} - ${secToHms(hmsToSec(end) + offsetSec)}]`;
        });
    }

    // We do NOT want to start intervals if not recording.
    // The main flow will call start() when recording begins.

    function setIsActive(active) {
        isRealtimeActive = active;
    }

    function getIsActive() {
        return isRealtimeActive;
    }

    function start(language) {
        if (!isRealtimeActive) return;

        // Reset state
        chunks = [];
        currentIndex = 0;
        lastChunkTime = Date.now();

        // Create a placeholder chunk immediately so the UI isn't blank
        chunks.push({
            id: 'placeholder',
            index: 0,
            startTime: 0,
            endTime: FIRST_CHUNK_INTERVAL_MS / 1000,
            status: 'waiting',
            text: ''
        });
        renderRealtimeProgress('processing', chunks);

        // Fire the first chunk after 10s, then switch to 30s intervals
        let firstChunkFired = false;
        const firstChunkTimeout = setTimeout(() => {
            firstChunkFired = true;
            processNextChunk(language, false);
            // Start regular 30s interval for subsequent chunks
            timer = setInterval(() => {
                processNextChunk(language, false);
            }, CHUNK_INTERVAL_MS);
        }, FIRST_CHUNK_INTERVAL_MS);

        // Store the timeout so stop() can cancel it if recording ends before 10s
        timer = { isTimeout: true, id: firstChunkTimeout };
    }

    async function stop(language) {
        if (!isRealtimeActive) return;

        // Cancel pending timer/interval
        if (timer) {
            if (timer.isTimeout) {
                clearTimeout(timer.id);
            } else {
                clearInterval(timer);
            }
            timer = null;
        }

        // Process the final chunk (always send remaining audio)
        const CHUNK_MIN_INTERVAL_MS = 5000;
        const timeSinceLastChunk = Date.now() - (lastChunkTime || 0);
        if (timeSinceLastChunk > CHUNK_MIN_INTERVAL_MS) {
            processNextChunk(language, true);
        }

        // Wait for all active chunks to complete
        renderRealtimeProgress('merging', chunks);

        await Promise.all(
            chunks.filter(c => c.status === 'processing' || c.status === 'starting' || c.status === 'uploading').map(async (c) => {
                // Wait up to some reasonable time, we're relying on the poll loop internal to the job
                // Actually, the processNextChunk handles polling. We just need to wait until the status changes.
                // A simple polling loop here to wait for completion:
                while (c.status === 'processing' || c.status === 'starting' || c.status === 'uploading') {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            })
        );

        // Combine text (strip redundant headers, then shift timestamps by chunk offset)
        const combinedMarkdown = chunks
            .filter(c => c.status === 'succeeded' && c.output && c.output.markdown)
            .map(c => {
                let md = c.output.markdown;
                // Remove "# 录音转写" header if it exists to avoid repetition
                md = md.replace(/^# .*[\r\n]+/, '');
                // Shift embedded timestamps by the chunk's start offset
                md = shiftMarkdownTimestamps(md.trim(), c.offset || 0);
                return md;
            })
            .filter(md => md.length > 0)
            .join('\n\n');

        // Collect all JSON segments with an offset
        let allSegments = [];
        chunks.filter(c => c.status === 'succeeded' && c.output && c.output.json && Array.isArray(c.output.json.segments))
            .forEach(c => {
                const offset = c.offset || 0;
                const shiftedSegments = c.output.json.segments.map(seg => ({
                    ...seg,
                    start: seg.start + offset,
                    end: seg.end + offset
                }));
                allSegments.push(...shiftedSegments);
            });

        renderRealtimeProgress('complete', chunks);

        return {
            markdown: combinedMarkdown,
            json: { segments: allSegments }
        };
    }

    async function processNextChunk(language, isFinal = false) {
        const chunkData = recorder.extractChunk();
        if (!chunkData) return;

        const { blob, durationSec, startTimeSec } = chunkData;
        const chunkIndex = currentIndex++;
        lastChunkTime = Date.now();

        // Remove placeholder if it's the first real chunk
        if (chunks.length === 1 && chunks[0].id === 'placeholder') {
            chunks = [];
        }

        const chunk = {
            id: `chunk_${chunkIndex}`,
            index: chunkIndex,
            startTime: startTimeSec,
            offset: startTimeSec,
            endTime: startTimeSec + durationSec,
            status: 'uploading',
            output: null,
            text: ''
        };
        chunks.push(chunk);

        renderRealtimeProgress('processing', chunks);

        try {
            // Upload
            const fileUrl = await uploadFile(new File([blob], `chunk_${chunkIndex}.wav`, { type: 'audio/wav' }));

            chunk.status = 'starting';
            renderRealtimeProgress('processing', chunks);

            // Transcribe
            const startData = await createTranscription({
                fileUrl,
                sourceFilename: `chunk_${chunkIndex}.wav`,
                language,
                durationSec: 30 // hardcoded estimate for quota, realistically it's durationSec but the chunk overlaps
            });

            chunk.predictionId = startData.id;
            chunk.status = 'processing';
            renderRealtimeProgress('processing', chunks);

            // Poll
            const finalData = await pollTranscriptionStatus(chunk.predictionId);

            if (finalData.status === 'succeeded') {
                chunk.status = 'succeeded';
                chunk.output = finalData.output;

                // Strip redundant header from markdown immediately for clean display and merging
                if (chunk.output && chunk.output.markdown) {
                    chunk.output.markdown = chunk.output.markdown.replace(/^# .*[\r\n]+/, '').trim();
                }
            } else {
                chunk.status = 'failed';
            }

            renderRealtimeProgress('processing', chunks);

        } catch (err) {
            console.error(`Chunk ${chunkIndex} failed:`, err);
            chunk.status = 'failed';
            renderRealtimeProgress('processing', chunks);
        }
    }

    return {
        setIsActive,
        getIsActive,
        start,
        stop
    };
}
