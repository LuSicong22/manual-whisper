export function createHistoryController({
    historyList,
    historyEmpty,
    historyClearBtn,
    getAllHistory,
    getHistoryById,
    requestDeleteHistory,
    resetUI,
    inputArea,
    resultArea,
    transcriptPreview,
    getTranscriptStatsFromJson,
    trackHistoryView,
    trackTranscriptView,
    setupDownload,
    downloadMdBtn,
    extractFileBaseName,
    formatBytes,
    resultMeta,
    copyTranscriptBtn,
    bindCopyTranscriptButton,
    t,
    trackCopyTranscript,
    resultPlayback,
    resPlayerUI,
    resFill,
    resThumb,
    resCurrentTime,
    resIconPlay,
    resIconPause,
    resSpeedBtn,
}) {
    function viewHistoryItem(id) {
        const record = getHistoryById(id);
        if (!record) return;

        resetUI();

        inputArea.parentNode.classList.add('hidden');
        resultArea.classList.remove('hidden');

        transcriptPreview.textContent = record.markdown;

        const mdContent = record.markdown;
        const stats = getTranscriptStatsFromJson(record.json || {});

        trackHistoryView(getAllHistory().length);
        trackTranscriptView('history', {
            input_source: record.inputSource || undefined,
            segments_count: stats.segments_count,
            speakers_count: stats.speakers_count
        });

        setupDownload(downloadMdBtn, mdContent, `${extractFileBaseName(record.fileName)}_transcript.md`, 'text/markdown', { exportFormat: 'md', viewSource: 'history' });

        resultMeta.textContent = `${record.fileName} (${formatBytes(record.fileSize || 0)})`;

        bindCopyTranscriptButton(copyTranscriptBtn, {
            getText: () => mdContent,
            t,
            onTracked: () => trackCopyTranscript('history')
        });

        if (record.audioUrl) {
            resultPlayback.src = record.audioUrl;
            resPlayerUI.classList.remove('hidden');
            resFill.style.width = '0%';
            resThumb.style.left = '0%';
            resCurrentTime.textContent = '0:00';
            resIconPlay.classList.remove('hidden');
            resIconPause.classList.add('hidden');
            resultPlayback.playbackRate = 1;
            resSpeedBtn.textContent = '1×';
        } else {
            resPlayerUI.classList.add('hidden');
        }
    }

    function renderHistoryList() {
        if (!historyList || !historyEmpty || !historyClearBtn) return;

        const records = getAllHistory();
        historyList.innerHTML = '';

        if (records.length === 0) {
            historyEmpty.classList.remove('hidden');
            historyClearBtn.classList.add('hidden');
            return;
        }

        historyEmpty.classList.add('hidden');
        historyClearBtn.classList.remove('hidden');

        records.forEach(record => {
            const itemEl = document.createElement('div');
            itemEl.className = 'history-item';

            const infoEl = document.createElement('div');
            infoEl.className = 'history-info';

            const titleEl = document.createElement('div');
            titleEl.className = 'history-title';
            titleEl.textContent = record.fileName;

            const timeEl = document.createElement('div');
            timeEl.className = 'history-time';
            const d = new Date(record.timestamp);
            timeEl.textContent = `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;

            infoEl.appendChild(titleEl);
            infoEl.appendChild(timeEl);

            const delBtn = document.createElement('button');
            delBtn.className = 'history-del-btn';
            delBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                requestDeleteHistory(record.id);
            });

            itemEl.appendChild(infoEl);
            itemEl.appendChild(delBtn);

            itemEl.addEventListener('click', () => {
                viewHistoryItem(record.id);
            });

            historyList.appendChild(itemEl);
        });
    }

    return {
        renderHistoryList,
        viewHistoryItem,
    };
}
