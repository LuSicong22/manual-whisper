export function createRecordingController({
    recorder,
    t,
    formatBytes,
    trackRecordStart,
    trackRecordStartFailed,
    trackRecordStop,
    updateSelectedFile,
    showError,
    getSelectedFile,
    getRecordPlaybackUrl,
    setRecordPlaybackUrl,
    ui,
}) {
    let recordStartTime = null;
    let recordTimerInterval = null;

    function setRecordingControlsDisabled(disabled) {
        ui.startBtn.disabled = disabled || !getSelectedFile();
        ui.pickFileBtn.disabled = disabled;
        ui.fileInput.disabled = disabled;
    }

    async function startRecording() {
        try {
            await recorder.start();

            recordStartTime = Date.now();
            trackRecordStart();
            updateSelectedFile(null);
            ui.uploadSection.classList.add('dimmed');

            ui.cpPlayerUI.classList.add('hidden');
            ui.recordPlayback.src = '';
            ui.recordSvgMic.classList.add('hidden');
            ui.recordSvgStop.classList.remove('hidden');
            ui.recordLabel.textContent = t('record-stop');
            ui.recordBtn.classList.add('recording');
            setRecordingControlsDisabled(true);
            ui.recordInfoBar.classList.remove('hidden');
            ui.removeRecordBtn.classList.add('hidden');
            ui.recordStatus.textContent = t('recording') + '00:00';
            ui.errorMessage.classList.add('hidden');
            ui.volumeMeter.classList.remove('hidden');
            ui.waveBars.forEach(b => { b.style.height = '8px'; b.style.opacity = '0.4'; });

            recordTimerInterval = setInterval(() => {
                const sec = Math.floor((Date.now() - recordStartTime) / 1000);
                const mm = String(Math.floor(sec / 60)).padStart(2, '0');
                const ss = String(sec % 60).padStart(2, '0');
                ui.recordStatus.textContent = t('recording') + `${mm}:${ss}`;
            }, 500);
        } catch (err) {
            trackRecordStartFailed(err && err.message ? err.message : String(err));
            showError(err.message);
        }
    }

    function stopRecording() {
        const wavBlob = recorder.stop();
        const recordDurationSec = recordStartTime ? Math.max(0, Math.round((Date.now() - recordStartTime) / 1000)) : 0;
        const now = new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `${t('recording-name-prefix')}${ts}.wav`;
        const file = new File([wavBlob], fileName, { type: 'audio/wav' });

        trackRecordStop(recordDurationSec, Math.round(file.size / 1024 / 1024 * 10) / 10);
        recordStartTime = null;

        updateSelectedFile(file, 'record');
        ui.recordStatus.textContent = t('record-done') + `${formatBytes(file.size)}`;

        const currentPlaybackUrl = getRecordPlaybackUrl();
        if (currentPlaybackUrl) URL.revokeObjectURL(currentPlaybackUrl);
        const nextPlaybackUrl = URL.createObjectURL(wavBlob);
        setRecordPlaybackUrl(nextPlaybackUrl);
        ui.recordPlayback.src = nextPlaybackUrl;
        ui.cpPlayerUI.classList.remove('hidden');

        ui.cpFill.style.width = '0%';
        ui.cpThumb.style.left = '0%';
        ui.cpCurrentTime.textContent = '0:00';
        ui.cpIconPlay.classList.remove('hidden');
        ui.cpIconPause.classList.add('hidden');

        cleanupRecordingState();
    }

    function cleanupRecordingState() {
        clearInterval(recordTimerInterval);
        recordTimerInterval = null;

        ui.recordSvgMic.classList.remove('hidden');
        ui.recordSvgStop.classList.add('hidden');
        ui.recordLabel.textContent = t('record-start');
        ui.recordBtn.classList.remove('recording');
        ui.volumeMeter.classList.add('hidden');
        ui.waveBars.forEach(b => { b.style.height = '8px'; b.style.opacity = '0.4'; });
        setRecordingControlsDisabled(false);

        if (!getSelectedFile()) {
            ui.uploadSection.classList.remove('dimmed');
        }

        recorder.cleanup();
    }

    return {
        isRecording: () => recorder.isRecording,
        startRecording,
        stopRecording,
    };
}

