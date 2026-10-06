(function () {
    'use strict';

    // ----------------------------------------------------
    // 1. キーバインド変更 (Enterで改行 / Ctrl+Enterで送信)
    // ----------------------------------------------------
    document.addEventListener('keydown', function (e) {
        const target = e.target;
        const isInputElement = target.closest('rich-textarea') || target.matches('.ql-editor, textarea, [contenteditable="true"]');
        if (!isInputElement) return;

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

    // ----------------------------------------------------
    // 2. 右側プロンプト履歴サイドバー + ▼最下部移動ボタン
    // ----------------------------------------------------
    function createOrGetSidebar() {
        let sidebar = document.getElementById('gemini-prompt-sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'gemini-prompt-sidebar';

            // ヘッダー
            const title = document.createElement('div');
            title.className = 'gemini-prompt-sidebar-title';
            title.textContent = '📌 プロンプト目次';
            sidebar.appendChild(title);

            // プロンプト一覧コンテナ
            const list = document.createElement('div');
            list.className = 'gemini-prompt-list';
            sidebar.appendChild(list);

            // フッター（▼最下部ボタン）
            const footer = document.createElement('div');
            footer.className = 'gemini-prompt-footer';

            const bottomBtn = document.createElement('button');
            bottomBtn.className = 'gemini-scroll-bottom-btn';
            bottomBtn.innerHTML = '▼ 最下部へ';

            // 最下部へのスクロール処理（複数アプローチで確実に実行）
            bottomBtn.addEventListener('click', () => {
                // 1. チャット履歴のスクロールコンテナを特定してスクロール位置を最下部に指定
                const scrollContainers = document.querySelectorAll('#chat-history, .chat-history-scroll-container, infinite-scroller');
                scrollContainers.forEach(container => {
                    container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                    });
                });

                // 2. チャット履歴内の最後の要素を取得してスクロール位置を追従させる
                const historyContainer = document.querySelector('#chat-history, .chat-history-scroll-container');
                if (historyContainer) {
                    const lastChild = historyContainer.lastElementChild || historyContainer.querySelector('infinite-scroller')?.lastElementChild;
                    if (lastChild) {
                        lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                }
            });

            footer.appendChild(bottomBtn);
            sidebar.appendChild(footer);

            document.body.appendChild(sidebar);
        }
        return sidebar;
    }

    // 画面上の全プロンプト要素を最新の状態で再取得するヘルパー関数
    function getTopLevelPromptElements() {
        let rawQueries = Array.from(document.querySelectorAll('user-query'));
        if (rawQueries.length === 0) {
            rawQueries = Array.from(document.querySelectorAll('.user-query-container'));
        }
        return rawQueries.filter(el => {
            return !rawQueries.some(other => other !== el && other.contains(el));
        });
    }

    let lastPromptHash = '';

    function updatePromptSidebar() {
        const topLevelQueries = getTopLevelPromptElements();

        const promptList = [];
        topLevelQueries.forEach((queryEl, index) => {
            let rawText = queryEl.textContent.trim();

            let cleanedText = rawText
                .replace(/^(MHTML|Google Gemini|あなたのプロンプト|\s)+/gi, '')
                .replace(/^(Google Gemini|あなたのプロンプト|\s)+/gi, '')
                .replace(/[\r\n]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (cleanedText) {
                let displayHtmlText = cleanedText;
                if (cleanedText.length > 32) {
                    displayHtmlText = cleanedText.slice(0, 32) + '…';
                }

                promptList.push({
                    index: index,
                    fullText: cleanedText,
                    displayText: displayHtmlText
                });
            }
        });

        const currentHash = promptList.map(p => p.fullText).join('||');
        if (currentHash === lastPromptHash) {
            return;
        }
        lastPromptHash = currentHash;

        const sidebar = createOrGetSidebar();
        const listContainer = sidebar.querySelector('.gemini-prompt-list');

        listContainer.innerHTML = '';

        if (promptList.length === 0) {
            sidebar.style.display = 'none';
            return;
        }

        sidebar.style.display = 'flex';

        promptList.forEach(prompt => {
            const item = document.createElement('div');
            item.className = 'gemini-prompt-item';
            item.textContent = prompt.displayText;
            item.title = prompt.fullText;

            item.addEventListener('click', () => {
                const latestElements = getTopLevelPromptElements();
                const targetEl = latestElements[prompt.index];
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            listContainer.appendChild(item);
        });
    }

    // デバウンス処理
    let updateTimer = null;
    function debouncedUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(updatePromptSidebar, 300);
    }

    // DOM監視
    const observer = new MutationObserver((mutations) => {
        const isOnlySidebarChange = mutations.every(m => m.target.closest('#gemini-prompt-sidebar'));
        if (isOnlySidebarChange) return;

        debouncedUpdate();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(updatePromptSidebar, 1000);
})();
