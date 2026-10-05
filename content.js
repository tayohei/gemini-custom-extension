(function () {
    'use strict';

    document.addEventListener('keydown', function (e) {
        // 入力エリア内でのみ処理
        const target = e.target;
        const isInputElement = target.matches('.ql-editor, textarea, [contenteditable="true"]');
        if (!isInputElement) return;

        if (e.key === 'Enter') {
            // ① Ctrl + Enter または Cmd + Enter 押下時 -> 送信実行
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();

                // 送信ボタンを取得してクリック
                const sendButton = document.querySelector(
                    '.send-icon, button[aria-label*="送信"], button[aria-label*="Send"]'
                );
                if (sendButton) {
                    sendButton.click();
                }
            }
            // ② Enter のみ（Shiftなし・Ctrlなし） -> 改行を挿入
            else if (!e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();

                // 編集エリアに改行コードを挿入
                if (document.queryCommandSupported('insertLineBreak')) {
                    document.execCommand('insertLineBreak');
                } else if (document.queryCommandSupported('insertText')) {
                    document.execCommand('insertText', false, '\n');
                } else {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        range.deleteContents();
                        const textNode = document.createTextNode('\n');
                        range.insertNode(textNode);
                        range.setStartAfter(textNode);
                        range.setEndAfter(textNode);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
        }
    }, true); // useCapture を true にしてGemini側のキーイベントより先に捕捉
})();
