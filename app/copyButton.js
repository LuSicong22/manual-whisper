/**
 * Binds unified copy interaction with temporary success feedback.
 */
export function bindCopyTranscriptButton(button, { getText, t, onTracked }) {
    if (!button) return;

    button.onclick = async () => {
        try {
            const content = typeof getText === 'function' ? getText() : '';
            await navigator.clipboard.writeText(content || '');
            if (typeof onTracked === 'function') onTracked();

            const originalHtml = button.innerHTML;
            button.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${t('copied')}</span>
            `;
            button.classList.remove('secondary');
            button.classList.add('primary');
            setTimeout(() => {
                button.innerHTML = originalHtml;
                button.classList.remove('primary');
                button.classList.add('secondary');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };
}

