import { clampPercent, formatBytes } from '../../utils.js';

export function createProgressController({
    uploadProgressFill,
    uploadStatusLine,
    transcribeProgressFill,
    transcribeStatusLine,
    statusText,
    t
}) {
    function setUploadProgress(percent, text) {
        uploadProgressFill.style.width = `${clampPercent(percent)}%`;
        uploadStatusLine.textContent = text;
    }

    function setTranscribeProgress(percent, text) {
        transcribeProgressFill.style.width = `${clampPercent(percent)}%`;
        transcribeStatusLine.textContent = text;
    }

    function updateStatus(stepMode, text) {
        statusText.textContent = text;
        const order = ['upload', 'transcribe', 'process'];
        const currentIndex = order.indexOf(stepMode);

        document.querySelectorAll('.step').forEach((el) => {
            el.classList.remove('active', 'completed');
        });

        for (let i = 0; i < order.length; i += 1) {
            const el = document.getElementById(`step-${order[i]}`);
            if (!el) continue;
            if (i < currentIndex) {
                el.classList.add('completed');
            } else if (i === currentIndex) {
                el.classList.add('active');
            }
        }
    }

    function resetRuntimeBox(file, setHint) {
        if (typeof setHint === 'function') setHint(0);
        setUploadProgress(0, `${t('upload-status')} (${formatBytes(file.size)})`);
        setTranscribeProgress(0, t('transcribe-status'));
    }

    return {
        setUploadProgress,
        setTranscribeProgress,
        updateStatus,
        resetRuntimeBox,
    };
}

