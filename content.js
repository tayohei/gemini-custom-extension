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
    // 2. 右側サイドバー（2タブUI & 直近回答インデックス機能）
    // ----------------------------------------------------
    let currentTab = 'prompts'; // 'prompts' または 'headings'

    function createOrGetSidebar() {
        let sidebar = document.getElementById('gemini-prompt-sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'gemini-prompt-sidebar';

            // タブヘッダー
            const tabsContainer = document.createElement('div');
            tabsContainer.className = 'gemini-sidebar-tabs';

            const tabPrompts = document.createElement('button');
            tabPrompts.className = 'gemini-tab-btn active';
            tabPrompts.id = 'gemini-tab-btn-prompts';
            tabPrompts.innerHTML = '📌 プロンプト';
            tabPrompts.addEventListener('click', () => switchTab('prompts'));

            const tabHeadings = document.createElement('button');
            tabHeadings.className = 'gemini-tab-btn';
            tabHeadings.id = 'gemini-tab-btn-headings';
            tabHeadings.innerHTML = '📖 回答見出し';
            tabHeadings.addEventListener('click', () => switchTab('headings'));

            tabsContainer.appendChild(tabPrompts);
            tabsContainer.appendChild(tabHeadings);
            sidebar.appendChild(tabsContainer);

            // コンテンツ領域
            const content = document.createElement('div');
            content.className = 'gemini-sidebar-content';
            content.id = 'gemini-sidebar-content';
            sidebar.appendChild(content);

            // フッター（▼最下部ボタン）
            const footer = document.createElement('div');
            footer.className = 'gemini-prompt-footer';

            const bottomBtn = document.createElement('button');
            bottomBtn.className = 'gemini-scroll-bottom-btn';
            bottomBtn.innerHTML = '▼ 最下部へ';

            bottomBtn.addEventListener('click', () => {
                const targetElements = document.querySelectorAll('model-response, response-element, user-query, .user-query-container, hallucination-disclaimer, .conversation-container');
                if (targetElements.length > 0) {
                    const lastEl = targetElements[targetElements.length - 1];
                    lastEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }

                const scrollContainers = document.querySelectorAll('#chat-history, .chat-history-scroll-container, infinite-scroller, main');
                scrollContainers.forEach(container => {
                    if (container) {
                        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                        container.scrollTop = container.scrollHeight;
                    }
                });
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            });

            footer.appendChild(bottomBtn);
            sidebar.appendChild(footer);

            document.body.appendChild(sidebar);
        }
        return sidebar;
    }

    function switchTab(tabName) {
        currentTab = tabName;
        const btnPrompts = document.getElementById('gemini-tab-btn-prompts');
        const btnHeadings = document.getElementById('gemini-tab-btn-headings');

        if (tabName === 'prompts') {
            if (btnPrompts) btnPrompts.classList.add('active');
            if (btnHeadings) btnHeadings.classList.remove('active');
        } else {
            if (btnPrompts) btnPrompts.classList.remove('active');
            if (btnHeadings) btnHeadings.classList.add('active');
        }
        renderSidebarContent();
    }

    // 全プロンプト要素を取得
    function getTopLevelPromptElements() {
        let rawQueries = Array.from(document.querySelectorAll('user-query'));
        if (rawQueries.length === 0) {
            rawQueries = Array.from(document.querySelectorAll('.user-query-container'));
        }
        return rawQueries.filter(el => {
            return !rawQueries.some(other => other !== el && other.contains(el));
        });
    }

    // 直近（最後）のプロンプト以降にある回答の見出し(H1〜H6)要素を網羅的に取得
    function getLastResponseHeadings() {
        const userQueries = getTopLevelPromptElements();
        const lastUserQuery = userQueries.length > 0 ? userQueries[userQueries.length - 1] : null;

        const allResponseBlocks = Array.from(document.querySelectorAll('message-content, model-response, response-element, .message-content'));

        let targetBlocks = [];
        if (lastUserQuery) {
            targetBlocks = allResponseBlocks.filter(el => {
                return (lastUserQuery.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
            });
        }

        if (targetBlocks.length === 0 && allResponseBlocks.length > 0) {
            targetBlocks = [allResponseBlocks[allResponseBlocks.length - 1]];
        }

        if (targetBlocks.length === 0) return [];

        const headingElements = [];
        const seenTexts = new Set();

        targetBlocks.forEach(block => {
            const headings = block.querySelectorAll('h1, h2, h3, h4, h5, h6');
            headings.forEach(h => {
                const text = h.textContent.trim();
                if (text && !seenTexts.has(text)) {
                    seenTexts.add(text);
                    headingElements.push(h);
                }
            });
        });

        return headingElements;
    }

    let lastHash = '';

    function renderSidebarContent() {
        const sidebar = createOrGetSidebar();
        const contentContainer = document.getElementById('gemini-sidebar-content');
        if (!contentContainer) return;

        const topLevelQueries = getTopLevelPromptElements();
        const headingElements = getLastResponseHeadings();

        // 状態変化判定ハッシュ
        const hashStr = currentTab + '_' + topLevelQueries.length + '_' + headingElements.map(h => h.textContent).join('|');

        if (hashStr === lastHash && contentContainer.children.length > 0) {
            return;
        }
        lastHash = hashStr;

        contentContainer.innerHTML = '';

        if (topLevelQueries.length === 0 && headingElements.length === 0) {
            sidebar.style.display = 'none';
            return;
        }
        sidebar.style.display = 'flex';

        // ----------------------------------------------------
        // タブ①: プロンプト目次
        // ----------------------------------------------------
        if (currentTab === 'prompts') {
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
                    let displayText = cleanedText.length > 28 ? cleanedText.slice(0, 28) + '…' : cleanedText;
                    promptList.push({
                        index: index,
                        fullText: cleanedText,
                        displayText: displayText
                    });
                }
            });

            if (promptList.length === 0) {
                contentContainer.innerHTML = '<div class="gemini-empty-msg">プロンプトがありません</div>';
                return;
            }

            promptList.forEach(prompt => {
                const item = document.createElement('div');
                item.className = 'gemini-prompt-item';
                item.textContent = prompt.displayText;
                item.title = prompt.fullText;

                item.addEventListener('click', () => {
                    const latestElements = getTopLevelPromptElements();
                    const targetEl = latestElements[prompt.index];
                    if (targetEl) {
                        // 画面上部にスクロール
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });

                contentContainer.appendChild(item);
            });
        }
        // ----------------------------------------------------
        // タブ②: 直近の回答の見出しインデックス (H1〜H6)
        // ----------------------------------------------------
        else if (currentTab === 'headings') {
            if (headingElements.length === 0) {
                contentContainer.innerHTML = '<div class="gemini-empty-msg">見出し（H1〜H6）はありません</div>';
                return;
            }

            headingElements.forEach(headingEl => {
                let rawText = headingEl.textContent.trim();
                let cleanedText = rawText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

                if (cleanedText) {
                    let displayText = cleanedText.length > 25 ? cleanedText.slice(0, 25) + '…' : cleanedText;
                    const tagLevel = headingEl.tagName.toLowerCase();

                    const item = document.createElement('div');
                    item.className = `gemini-heading-item gemini-heading-${tagLevel}`;
                    item.textContent = displayText;
                    item.title = cleanedText;

                    item.addEventListener('click', () => {
                        // 画面上部（block: 'start'）にスクロール
                        headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });

                    contentContainer.appendChild(item);
                }
            });
        }
    }

    // デバウンス処理
    let updateTimer = null;
    function debouncedUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(renderSidebarContent, 300);
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

    setTimeout(renderSidebarContent, 1000);
})();
