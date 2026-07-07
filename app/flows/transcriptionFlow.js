export function createTranscriptionController(deps) {
    const {
        t,
        formatBytes,
        getAudioDuration,
        bucketizeSeconds,
        uploadFile,
        createTranscription,
        pollTranscriptionStatus,
        getAllHistory,
        getFileExt,
        getTranscriptStatsFromJson,
        computeTranscribePercent,
        statusToLocalized,
        trackTranscriptionBlocked,
        trackTranscriptionStart,
        trackTranscriptionComplete,
        trackTranscriptView,
        trackCopyTranscript,
        saveHistory,
        bindCopyTranscriptButton,
        setupDownload,
        updateTranscriptionLanguageUI,
        setControlsDisabled,
        startTimer,
        stopTimer,
        resetRuntimeBox,
        updateStatus,
        setUploadProgress,
        setTranscribeProgress,
        resetUI,
        showError,
        checkAndDisplayQuota,
        setRunning,
        getRunning,
        getSelectedFile,
        getCurrentFileBaseName,
        getLastSelectedSource,
        getLastTranscriptionInputSource,
        setLastTranscriptionInputSource,
        getLastTranscriptionAudioDurationSec,
        setLastTranscriptionAudioDurationSec,
        getLastTranscriptionAudioDurationBucket,
        setLastTranscriptionAudioDurationBucket,
        getCurrentAudioUrl,
        setCurrentAudioUrl,
        getRecordPlaybackUrl,
        getLastAudioUrl,
        getStartTime,
        getTranscribePercentHint,
        setTranscribePercentHint,
        MAX_UPLOAD_BYTES,
        SUPPORTED_EXTENSIONS,
        ui,
    } = deps;

    async function startTranscriptionTask(file, language) {
        if (getRunning()) return;

        if (!file) {
            showError(t('error-select-file'));
            return;
        }

        const inputSource = getRecordPlaybackUrl() ? 'record' : 'upload';
        if (file.size <= 0) {
            trackTranscriptionBlocked('empty_file', { input_source: inputSource });
            showError(t('error-file-empty'));
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            trackTranscriptionBlocked('file_too_large', {
                input_source: inputSource,
                file_size_mb: Math.round(file.size / 1024 / 1024 * 10) / 10
            });
            showError(t('error-file-too-large'));
            return;
        }
        if (!SUPPORTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
            trackTranscriptionBlocked('unsupported_format', {
                input_source: inputSource,
                file_ext: getFileExt(file.name)
            });
            showError(`${t('error-file-format')}${t('colon')}${SUPPORTED_EXTENSIONS.join(', ')}`);
            return;
        }

        updateTranscriptionLanguageUI(language);
        setRunning(true);
        setControlsDisabled(true);

        setLastTranscriptionInputSource(inputSource);
        const fileSizeMB = Math.round(file.size / 1024 / 1024 * 10) / 10;
        const hasHistory = getAllHistory().length > 0 ? '1' : '0';

        const adminSecret = new URLSearchParams(window.location.search).get('admin');
        let durationSec = await getAudioDuration(file);
        if ((!Number.isFinite(durationSec) || durationSec <= 0) && Number(file.recordDurationSec) > 0) {
            durationSec = file.recordDurationSec;
        }
        if (!Number.isFinite(durationSec) || durationSec <= 0) {
            trackTranscriptionBlocked('invalid_duration', { input_source: inputSource });
            setRunning(false);
            setControlsDisabled(false);
            showError(t('error-file-empty'));
            return;
        }
        setLastTranscriptionAudioDurationSec(Math.round(Number(durationSec) || 0));
        setLastTranscriptionAudioDurationBucket(bucketizeSeconds(durationSec));

        if (!adminSecret && durationSec > 60 * 60) {
            trackTranscriptionBlocked('duration_limit', {
                input_source: inputSource,
                audio_duration_sec: getLastTranscriptionAudioDurationSec(),
                audio_duration_bucket: getLastTranscriptionAudioDurationBucket()
            });
            setRunning(false);
            setControlsDisabled(false);
            showError(t('error-duration-limit'));
            return;
        }

        trackTranscriptionStart(language, inputSource, fileSizeMB, {
            audio_duration_sec: getLastTranscriptionAudioDurationSec(),
            audio_duration_bucket: getLastTranscriptionAudioDurationBucket(),
            has_history: hasHistory
        });

        ui.inputArea.classList.add('hidden');
        ui.progressArea.classList.remove('hidden');
        ui.resultArea.classList.add('hidden');
        ui.errorMessage.classList.add('hidden');

        startTimer();
        resetRuntimeBox(file, setTranscribePercentHint);

        try {
            updateStatus('upload', t('status-uploading'));
            const fileUrl = await uploadFile(file, (uploaded, total) => {
                const percent = Math.round((uploaded / total) * 100);
                setUploadProgress(percent, `${t('transfer-progress')}：${percent}% (${formatBytes(uploaded)} / ${formatBytes(total)})`);
            });
            setCurrentAudioUrl(fileUrl);

            setUploadProgress(100, `${t('transfer-success')} (${formatBytes(file.size)})`);
            updateStatus('transcribe', t('status-creating-task'));
            setTranscribeProgress(5, `${t('transcribe-status').split('：')[0]}：${t('transcribe-creating')}...`);

            const startData = await createTranscription({
                fileUrl,
                sourceFilename: file.name,
                language,
                durationSec
            });
            const predictionId = startData.id;
            if (!predictionId) throw new Error('Missing prediction id');

            updateStatus('transcribe', t('status-transcribing'));
            renderPredictionProgress(startData);

            const finalData = await pollTranscriptionStatus(predictionId, (data) => {
                renderPredictionProgress(data);
            });

            finishProcess(finalData.output);
        } catch (error) {
            console.error(error);
            const elapsedSec = Math.round((Date.now() - getStartTime()) / 1000);
            trackTranscriptionComplete(elapsedSec, false);
            showError(error.message);
            resetUI();
        }
    }

    function renderPredictionProgress(data) {
        const status = data.status || 'starting';
        const progress = data.progress || {};

        const mappedStatus = statusToLocalized(status, t);
        const percentState = computeTranscribePercent(status, progress, getTranscribePercentHint());
        setTranscribePercentHint(percentState.nextHint);
        const computedPercent = percentState.percent;
        const currentElapsed = Math.round((Date.now() - getStartTime()) / 1000);
        const elapsedValue = (typeof progress.elapsedSec === 'number' && progress.elapsedSec > 0) ? progress.elapsedSec : currentElapsed;
        const elapsedSec = `${t('elapsed')}${elapsedValue}s`;
        setTranscribeProgress(computedPercent, `${t('transcribe-status').split(t('colon'))[0]}${t('colon')}${mappedStatus} (${computedPercent}%)${elapsedSec}`);

        const logsTail = Array.isArray(progress.logsTail) ? progress.logsTail : [];
        const extras = [];
        if (logsTail.length > 0) {
            extras.push(`${t('logs-recent')}${t('colon')}${logsTail.join(' | ')}`);
        }
        if (progress.cleanup && typeof progress.cleanup === 'object') {
            const c = progress.cleanup;
            const removed = Number(c.removed_prompt_only_segments || 0) + Number(c.removed_hallucination_segments || 0) + Number(c.removed_noise_segments || 0);
            const cleaned = Number(c.cleaned_prompt_fragments || 0) + Number(c.cleaned_hallucination_fragments || 0);
            extras.push(t('process-cleanup', { cleaned, removed }));
        }
        if (progress.quality && typeof progress.quality === 'object') {
            const warnings = Array.isArray(progress.quality.warnings) ? progress.quality.warnings : [];
            if (warnings.length > 0) extras.push(`${t('quality-warning')}${t('colon')}${warnings[0]}`);
        }
        if (progress.secondPass && typeof progress.secondPass === 'object') {
            const sp = progress.secondPass;
            const spStatus = statusToLocalized(sp.status || '', t);
            const spPercent = Number(sp.percent);
            const hasPercent = Number.isFinite(spPercent);
            const rangeCount = Array.isArray(sp.ranges) ? sp.ranges.length : 0;
            const spStatusText = hasPercent ? `${spStatus} (${Math.max(0, Math.min(100, Math.round(spPercent)))}%)` : spStatus;
            if (spStatusText) extras.push(`${t('second-pass')}${t('colon')}${spStatusText}${rangeCount > 0 ? `${t('second-pass-window')}${rangeCount}` : ''}`);
        }
    }

    function finishProcess(output) {
        stopTimer();
        const elapsedSec = Math.round((Date.now() - getStartTime()) / 1000);
        updateStatus('process', t('status-done'));
        setTranscribeProgress(100, `${t('transcribe-status').split(t('colon'))[0]}${t('colon')}${t('transcribe-finished')} (100%)`);

        let mdContent = '';
        const outputJson = output && output.json ? output.json : output;
        const transcriptStats = getTranscriptStatsFromJson(outputJson || {});
        trackTranscriptionComplete(elapsedSec, true, transcriptStats);

        if (output && output.markdown) {
            mdContent = output.markdown;
        } else {
            mdContent = '### Raw Output\n\n' + JSON.stringify(output, null, 2);
        }

        ui.transcriptPreview.textContent = mdContent;
        setupDownload(ui.downloadMdBtn, mdContent, `${getCurrentFileBaseName()}_transcript.md`, 'text/markdown', { exportFormat: 'md', viewSource: 'fresh' });

        const selectedFile = getSelectedFile();
        const historyRecord = {
            id: `ts_${Date.now()}`,
            fileName: selectedFile ? selectedFile.name : getCurrentFileBaseName(),
            fileSize: selectedFile ? selectedFile.size : 0,
            timestamp: Date.now(),
            markdown: mdContent,
            json: output && output.json ? output.json : output,
            inputSource: getLastTranscriptionInputSource() || getLastSelectedSource() || undefined,
            audioDurationSec: getLastTranscriptionAudioDurationSec() || undefined,
            audioUrl: getCurrentAudioUrl()
        };
        saveHistory(historyRecord);

        ui.inputArea.parentNode.classList.add('hidden');
        ui.resultArea.classList.remove('hidden');
        trackTranscriptView('fresh', {
            input_source: getLastTranscriptionInputSource() || undefined,
            segments_count: transcriptStats.segments_count,
            speakers_count: transcriptStats.speakers_count
        });

        checkAndDisplayQuota();

        if (selectedFile) {
            ui.resultMeta.textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
        } else {
            ui.resultMeta.textContent = '';
        }

        bindCopyTranscriptButton(ui.copyTranscriptBtn, {
            getText: () => mdContent,
            t,
            onTracked: () => trackCopyTranscript('fresh')
        });

        if (getRecordPlaybackUrl() || getLastAudioUrl()) {
            ui.resultPlayback.src = getRecordPlaybackUrl() || getLastAudioUrl();
            ui.resPlayerUI.classList.remove('hidden');
            ui.resFill.style.width = '0%';
            ui.resThumb.style.left = '0%';
            ui.resCurrentTime.textContent = '0:00';
            ui.resIconPlay.classList.remove('hidden');
            ui.resIconPause.classList.add('hidden');
            ui.resultPlayback.playbackRate = 1;
            ui.resSpeedBtn.textContent = '1×';
        } else {
            ui.resPlayerUI.classList.add('hidden');
        }

        setRunning(false);
        setControlsDisabled(false);

        // Show feedback modal on first transcription, after giving the user time to view the result
        if (!localStorage.getItem('feedback_shown')) {
            setTimeout(() => showFeedbackModal(t), 10000);
        }
    }

    function showFeedbackModal(t) {
        const modal = document.getElementById('feedback-modal');
        if (!modal) return;

        let selectedRating = 0;

        const stars = modal.querySelectorAll('.star-btn');
        const submitBtn = document.getElementById('feedback-submit');
        const skipBtn = document.getElementById('feedback-skip');
        const closeBtn = document.getElementById('feedback-close');
        const textarea = document.getElementById('feedback-text');

        // Reset state
        stars.forEach(s => s.classList.remove('selected'));
        if (textarea) textarea.value = '';
        if (submitBtn) submitBtn.disabled = true;
        selectedRating = 0;

        // Update translations
        modal.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        modal.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
        });

        stars.forEach(star => {
            star.addEventListener('click', () => {
                selectedRating = parseInt(star.dataset.rating, 10);
                stars.forEach(s => s.classList.toggle('selected', parseInt(s.dataset.rating, 10) === selectedRating));
                if (submitBtn) submitBtn.disabled = false;
            });
        });

        const dismiss = (submitted) => {
            localStorage.setItem('feedback_shown', '1');
            modal.classList.add('hidden');
            if (submitted && selectedRating > 0) {
                // Show thanks briefly
                const content = modal.querySelector('.feedback-modal-content');
                if (content) {
                    content.innerHTML = `<div class="feedback-emoji-header">🙏</div><p class="feedback-thanks-msg">${t('feedback-thanks')}</p>`;
                }
                setTimeout(() => modal.classList.add('hidden'), 1800);
            }
        };

        if (submitBtn) {
            submitBtn.onclick = () => {
                const comment = textarea ? textarea.value.trim() : '';
                if (typeof window.gtag === 'function') {
                    window.gtag('event', 'user_feedback', { rating: selectedRating, comment: comment.substring(0, 100) });
                }
                dismiss(true);
            };
        }
        if (skipBtn) skipBtn.onclick = () => dismiss(false);
        if (closeBtn) closeBtn.onclick = () => dismiss(false);

        // Close on backdrop click
        modal.onclick = (e) => { if (e.target === modal) dismiss(false); };

        modal.classList.remove('hidden');
    }

    return {
        startTranscriptionTask,
    };
}
