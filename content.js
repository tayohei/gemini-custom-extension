(function () {
    'use strict';

    document.addEventListener('keydown', function (e) {
        const target = e.target;
        // 入力エリア (rich-textarea や contenteditable) 内でのキー入力のみ処理
        const isInputElement = target.closest('rich-textarea') || target.matches('.ql-editor, textarea, [contenteditable="true"]');
        if (!isInputElement) return;

        if (e.key === 'Enter') {
            // ① Ctrl + Enter または Cmd + Enter 押下時 -> チャット送信
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();

                const sendButton = document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');
                if (sendButton) {
                    sendButton.click();
                }
            }
            // ② Enter のみ (Shiftなし・Ctrlなし) -> 改行を挿入
            else if (!e.shiftKey) {
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
