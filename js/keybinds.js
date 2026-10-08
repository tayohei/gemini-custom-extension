(function () {
    'use strict';

    // Enterで改行 / Ctrl+Enter(Cmd+Enter)で送信
    document.addEventListener('keydown', function (e) {
        const target = e.target;
        const isInputElement = target.closest('rich-textarea') || target.matches('.ql-editor, textarea, [contenteditable="true"]');
        if (!isInputElement) return;

        // モーダルオープン時はモーダル内のキー制御を優先
        if (document.getElementById('gemini-md-modal-overlay')?.style.display === 'flex') {
            return;
        }

        if (e.key === 'Enter') {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();

                const sendButton = document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');
                if (sendButton) {
                    sendButton.click();
                }
            } else if (!e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();

                if (document.queryCommandSupported('insertLineBreak')) {
                    document.execCommand('insertLineBreak');
                } else {
                    document.execCommand('insertText', false, '\n');
                }
            }
        }
    }, true);
})();
