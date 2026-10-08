(function () {
    'use strict';

    let currentTab = 'prompts';

    function createOrGetSidebar() {
        let sidebar = document.getElementById('gemini-prompt-sidebar');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = 'gemini-prompt-sidebar';

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

            const content = document.createElement('div');
            content.className = 'gemini-sidebar-content';
            content.id = 'gemini-sidebar-content';
            sidebar.appendChild(content);

            const footer = document.createElement('div');
            footer.className = 'gemini-prompt-footer';

            const bottomBtn = document.createElement('button');
            bottomBtn.className = 'gemini-scroll-bottom-btn';
            bottomBtn.innerHTML = '▼ 最下部へ';
            
            bottomBtn.addEventListener('click', () => {
                const chatWindow = document.querySelector('chat-window');
                if (!chatWindow) return;

                const targetElements = chatWindow.querySelectorAll('model-response, response-element, user-query, .user-query-container, hallucination-disclaimer, .conversation-container');
                if (targetElements.length > 0) {
                    const lastEl = targetElements[targetElements.length - 1];
                    lastEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }

                const scrollContainers = chatWindow.querySelectorAll('#chat-history, .chat-history-scroll-container');
                scrollContainers.forEach(container => {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                });
            });

            footer.appendChild(bottomBtn);

            const actionRow = document.createElement('div');
            actionRow.className = 'gemini-footer-row';
            actionRow.appendChild(makeFooterButton('⬇ MD保存', '最新の回答をMarkdownファイルとして保存', saveLatestResponse));
            actionRow.appendChild(makeFooterButton('📋 コピー', '最新の回答をMarkdownでコピー', copyLatestResponse));
            actionRow.appendChild(makeFooterButton('📁', 'コード/回答の保存先フォルダを変更', () => window.GeminiExt.changeSaveDirectory()));
            footer.appendChild(actionRow);
            sidebar.appendChild(footer);

            document.body.appendChild(sidebar);
        }
        return sidebar;
    }

    function makeFooterButton(label, title, handler) {
        const btn = document.createElement('button');
        btn.className = 'gemini-footer-btn';
        btn.textContent = label;
        btn.title = title;
        btn.type = 'button';
        btn.addEventListener('click', handler);
        return btn;
    }

    function getLatestResponseMarkdown() {
        const responses = document.querySelectorAll('chat-window model-response');
        const last = responses[responses.length - 1];
        if (!last) return null;
        const body = last.querySelector('message-content') || last;
        return window.GeminiExt.htmlToMarkdown(body);
    }

    function buildFilename(markdown) {
        const firstLine = (markdown.split('\n').find(l => l.trim()) || 'gemini').replace(/^#+\s*/, '');
        const title = firstLine.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'gemini';
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
        return `${title}_${stamp}.md`;
    }

    function saveLatestResponse(e) {
        const md = getLatestResponseMarkdown();
        if (!md) return window.GeminiExt.toast('保存できる回答がありません', true);
        window.GeminiExt.saveTextFile(buildFilename(md), md, { mime: 'text/markdown', forcePick: e.shiftKey });
    }

    async function copyLatestResponse() {
        const md = getLatestResponseMarkdown();
        if (!md) return window.GeminiExt.toast('コピーできる回答がありません', true);
        try {
            await navigator.clipboard.writeText(md);
            window.GeminiExt.toast('📋 回答をMarkdownでコピーしました');
        } catch (e) {
            window.GeminiExt.toast('コピーに失敗しました', true);
        }
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

    function getTopLevelPromptElements() {
        const chatWindow = document.querySelector('chat-window');
        if (!chatWindow) return [];

        let rawQueries = Array.from(chatWindow.querySelectorAll('user-query'));
        if (rawQueries.length === 0) {
            rawQueries = Array.from(chatWindow.querySelectorAll('.user-query-container'));
        }
        return rawQueries.filter(el => {
            return !rawQueries.some(other => other !== el && other.contains(el));
        });
    }

    function getLastResponseHeadings() {
        const userQueries = getTopLevelPromptElements();
        const lastUserQuery = userQueries.length > 0 ? userQueries[userQueries.length - 1] : null;

        const chatWindow = document.querySelector('chat-window');
        if (!chatWindow) return [];

        const allResponseBlocks = Array.from(chatWindow.querySelectorAll('message-content, model-response, response-element, .message-content'));

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
    // 現在位置ハイライト用: 描画した項目と、対応する本文側の要素
    let itemRefs = [];
    let refElements = [];
    let activeIndex = -1;

    function renderSidebarContent() {
        const sidebar = createOrGetSidebar();
        const contentContainer = document.getElementById('gemini-sidebar-content');
        if (!contentContainer) return;

        const topLevelQueries = getTopLevelPromptElements();
        const headingElements = getLastResponseHeadings();

        const hashStr = currentTab + '_' + topLevelQueries.length + '_' + headingElements.map(h => h.textContent).join('|');
        
        if (hashStr === lastHash && contentContainer.children.length > 0) {
            return;
        }
        lastHash = hashStr;

        contentContainer.innerHTML = '';
        itemRefs = [];
        refElements = [];
        activeIndex = -1;

        if (topLevelQueries.length === 0 && headingElements.length === 0) {
            sidebar.style.display = 'none';
            return;
        }
        sidebar.style.display = 'flex';

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
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });

                itemRefs.push(item);
                refElements.push(topLevelQueries[prompt.index]);
                contentContainer.appendChild(item);
            });
        }
        else if (currentTab === 'headings') {
            if (headingElements.length === 0) {
                contentContainer.innerHTML = '<div class="gemini-empty-msg">見出し（H1〜H6）はありません</div>';
                return;
            }

            headingElements.forEach((headingEl, idx) => {
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
                        const latestHeadings = getLastResponseHeadings();
                        const targetEl = latestHeadings[idx];
                        if (targetEl) {
                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });

                    itemRefs.push(item);
                    refElements.push(headingEl);
                    contentContainer.appendChild(item);
                }
            });
        }
        updateActiveItem();
    }

    // 画面上端付近にある項目を「現在位置」として強調する
    const ACTIVE_OFFSET = 140;
    function updateActiveItem() {
        if (itemRefs.length === 0) return;

        let next = 0;
        for (let i = 0; i < refElements.length; i++) {
            const el = refElements[i];
            if (!el || !el.isConnected) continue;
            if (el.getBoundingClientRect().top <= ACTIVE_OFFSET) next = i;
            else break;
        }
        if (next === activeIndex) return;

        if (itemRefs[activeIndex]) itemRefs[activeIndex].classList.remove('active');
        activeIndex = next;
        itemRefs[next].classList.add('active');
        itemRefs[next].scrollIntoView({ block: 'nearest' });
    }

    let scrollFrame = 0;
    document.addEventListener('scroll', () => {
        if (scrollFrame || document.hidden) return;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = 0;
            updateActiveItem();
        });
    }, { capture: true, passive: true });

    let updateTimer = null;
    function debouncedUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            updateTimer = null;
            renderSidebarContent();
        }, 500);
    }

    // コールバック内は軽い判定だけにして、実際の再描画はデバウンスに任せる
    const observer = new MutationObserver((mutations) => {
        if (document.hidden) return;

        // Markdownエディタ操作中（入力のたびにDOMが変わる）は更新しない
        const modal = document.getElementById('gemini-md-modal-overlay');
        if (modal && modal.style.display === 'flex') return;

        const sidebar = document.getElementById('gemini-prompt-sidebar');
        if (sidebar && mutations.every(m => sidebar.contains(m.target))) return;

        debouncedUpdate();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) debouncedUpdate();
    });
    setTimeout(renderSidebarContent, 1000);
})();
