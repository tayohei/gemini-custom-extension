(function () {
    'use strict';

    // ----------------------------------------------------
    // 1. キーバインド変更 (Enterで改行 / Ctrl+Enterで送信)
    // ----------------------------------------------------
    document.addEventListener('keydown', function (e) {
        const target = e.target;
        const isInputElement = target.closest('rich-textarea') || target.matches('.ql-editor, textarea, [contenteditable="true"]');
        if (!isInputElement) return;

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

    // ----------------------------------------------------
    // 2. コードダウンロードボタンの横取り（「名前を付けて保存」強制）
    // ----------------------------------------------------
    document.addEventListener('click', function (e) {
        const downloadBtn = e.target.closest('code-block button[aria-label*="ダウンロード"], code-block button[aria-label*="Download"], code-block .download-button');
        if (!downloadBtn) return;

        const codeBlock = downloadBtn.closest('code-block');
        if (!codeBlock) return;

        e.preventDefault();
        e.stopPropagation();

        const codeElement = codeBlock.querySelector('code, .code-container');
        const codeText = codeElement ? codeElement.innerText : '';
        if (!codeText) return;

        const langHeader = codeBlock.querySelector('.code-block-decoration, .filename, .lang-name');
        let lang = langHeader ? langHeader.textContent.trim().toLowerCase() : '';

        let ext = 'txt';
        if (lang.includes('javascript') || lang.includes('js')) ext = 'js';
        else if (lang.includes('python') || lang.includes('py')) ext = 'py';
        else if (lang.includes('html')) ext = 'html';
        else if (lang.includes('css')) ext = 'css';
        else if (lang.includes('json')) ext = 'json';
        else if (lang.includes('typescript') || lang.includes('ts')) ext = 'ts';
        else if (lang.includes('sh') || lang.includes('bash')) ext = 'sh';
        else if (lang.includes('sql')) ext = 'sql';

        const defaultFilename = `code_snippet.${ext}`;
        const blobUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(codeText);

        chrome.runtime.sendMessage({
            action: 'download_code',
            url: blobUrl,
            filename: defaultFilename
        });
    }, true);

    // ----------------------------------------------------
    // 3. インライン Markdown シンタックスハイライト処理
    // ----------------------------------------------------

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function renderMarkdownSyntaxHighlight(text) {
        if (!text) return '';

        const lines = text.split('\n');
        let inCodeBlock = false;

        const highlightedLines = lines.map(line => {
            const escapedLine = escapeHtml(line);

            if (escapedLine.startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                return `<span class="md-hl-code-fence">${escapedLine}</span>`;
            }

            if (inCodeBlock) {
                return escapedLine;
            }

            if (escapedLine.startsWith('# ')) {
                return `<span class="md-hl-h1">${escapedLine}</span>`;
            } else if (escapedLine.startsWith('## ')) {
                return `<span class="md-hl-h2">${escapedLine}</span>`;
            } else if (escapedLine.startsWith('### ')) {
                return `<span class="md-hl-h3">${escapedLine}</span>`;
            }

            let lineFormatted = escapedLine;
            if (lineFormatted.startsWith('&gt; ')) {
                return `<span class="md-hl-quote">${lineFormatted}</span>`;
            }
            if (lineFormatted.match(/^(\s*)(-|\*|\d+\.)\s+/)) {
                lineFormatted = lineFormatted.replace(/^(\s*)(-|\*|\d+\.)\s+/, '<span class="md-hl-bullet">$&</span>');
            }

            lineFormatted = lineFormatted
                .replace(/\*\*(.*?)\*\*/g, '<span class="md-hl-bold">**$1**</span>')
                .replace(/\*(.*?)\*/g, '<span class="md-hl-italic">*$1*</span>')
                .replace(/~~(.*?)~~/g, '<span class="md-hl-strike">~~$1~~</span>')
                .replace(/`([^`]+)`/g, '<span class="md-hl-code-inline">`$1`</span>');

            return lineFormatted;
        });

        let resultHtml = highlightedLines.join('\n');
        if (text.endsWith('\n')) {
            resultHtml += '\n';
        }
        return resultHtml;
    }

    function createOrGetMarkdownModal() {
        let overlay = document.getElementById('gemini-md-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'gemini-md-modal-overlay';
            overlay.addEventListener('click', (e) => e.stopPropagation());

            const modal = document.createElement('div');
            modal.id = 'gemini-md-modal';
            modal.addEventListener('click', (e) => e.stopPropagation());

            // ヘッダー
            const header = document.createElement('div');
            header.className = 'gemini-md-header';

            const title = document.createElement('div');
            title.className = 'gemini-md-title';
            title.innerHTML = '📝 Markdown エディタ <span class="gemini-md-badge">Syntax Highlight</span>';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'gemini-md-close-btn';
            closeBtn.innerHTML = '✕';
            closeBtn.title = '閉じる';
            closeBtn.addEventListener('click', closeMarkdownModal);

            header.appendChild(title);
            header.appendChild(closeBtn);
            modal.appendChild(header);

            // ツールバー
            const toolbar = document.createElement('div');
            toolbar.className = 'gemini-md-toolbar';

            const tools = [
                { label: 'H1', prefix: '# ', suffix: '', def: '見出し1' },
                { label: 'H2', prefix: '## ', suffix: '', def: '見出し2' },
                { label: 'H3', prefix: '### ', suffix: '', def: '見出し3' },
                { type: 'divider' },
                { label: 'B', prefix: '**', suffix: '**', def: '太字' },
                { label: 'I', prefix: '*', suffix: '*', def: '斜体' },
                { label: 'S', prefix: '~~', suffix: '~~', def: '打ち消し' },
                { type: 'divider' },
                { label: '• リスト', prefix: '- ', suffix: '', def: '項目' },
                { label: '1. リスト', prefix: '1. ', suffix: '', def: '項目' },
                { label: '“ 引用', prefix: '> ', suffix: '', def: '引用文' },
                { type: 'divider' },
                { label: '</> コード', prefix: '```\n', suffix: '\n```', def: '// code here' }
            ];

            tools.forEach(tool => {
                if (tool.type === 'divider') {
                    const div = document.createElement('div');
                    div.className = 'gemini-md-tool-divider';
                    toolbar.appendChild(div);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'gemini-md-tool-btn';
                    btn.textContent = tool.label;
                    btn.type = 'button';
                    btn.addEventListener('click', () => {
                        const textarea = document.getElementById('gemini-md-textarea-input');
                        if (textarea) insertFormatting(textarea, tool.prefix, tool.suffix, tool.def);
                    });
                    toolbar.appendChild(btn);
                }
            });

            modal.appendChild(toolbar);

            // ボディ
            const body = document.createElement('div');
            body.className = 'gemini-md-body';

            const container = document.createElement('div');
            container.className = 'gemini-md-editor-container';

            const previewLayer = document.createElement('div');
            previewLayer.className = 'gemini-md-preview-layer';
            previewLayer.id = 'gemini-md-preview-layer';

            const textarea = document.createElement('textarea');
            textarea.className = 'gemini-md-textarea-input';
            textarea.id = 'gemini-md-textarea-input';
            textarea.placeholder = 'ここにMarkdownテキストを入力...';

            textarea.addEventListener('scroll', () => {
                previewLayer.scrollTop = textarea.scrollTop;
                previewLayer.scrollLeft = textarea.scrollLeft;
            });

            textarea.addEventListener('input', () => {
                syncTextToHighlight();
            });

            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    return;
                }

                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const val = textarea.value;

                    if (!e.shiftKey) {
                        textarea.value = val.substring(0, start) + '  ' + val.substring(end);
                        textarea.selectionStart = textarea.selectionEnd = start + 2;
                    } else {
                        if (val.substring(start - 2, start) === '  ') {
                            textarea.value = val.substring(0, start - 2) + val.substring(start);
                            textarea.selectionStart = textarea.selectionEnd = start - 2;
                        }
                    }
                    syncTextToHighlight();
                    return;
                }

                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    const start = textarea.selectionStart;
                    const val = textarea.value;
                    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                    const currentLine = val.substring(lineStart, start);

                    const bulletMatch = currentLine.match(/^(\s*)(-|\*|\+)\s+(.*)$/);
                    const numMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);

                    if (bulletMatch) {
                        e.preventDefault();
                        const indent = bulletMatch[1];
                        const symbol = bulletMatch[2];
                        const content = bulletMatch[3].trim();

                        if (content === '') {
                            textarea.value = val.substring(0, lineStart) + val.substring(start);
                            textarea.selectionStart = textarea.selectionEnd = lineStart;
                        } else {
                            const insertText = `\n${indent}${symbol} `;
                            textarea.value = val.substring(0, start) + insertText + val.substring(start);
                            textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
                        }
                        syncTextToHighlight();
                        return;
                    } else if (numMatch) {
                        e.preventDefault();
                        const indent = numMatch[1];
                        const num = parseInt(numMatch[2], 10);
                        const content = numMatch[3].trim();

                        if (content === '') {
                            textarea.value = val.substring(0, lineStart) + val.substring(start);
                            textarea.selectionStart = textarea.selectionEnd = lineStart;
                        } else {
                            const insertText = `\n${indent}${num + 1}. `;
                            textarea.value = val.substring(0, start) + insertText + val.substring(start);
                            textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
                        }
                        syncTextToHighlight();
                        return;
                    }
                }

                if (e.ctrlKey || e.metaKey) {
                    if (e.key.toLowerCase() === 'b') {
                        e.preventDefault();
                        insertFormatting(textarea, '**', '**', '太字');
                    } else if (e.key.toLowerCase() === 'i') {
                        e.preventDefault();
                        insertFormatting(textarea, '*', '*', '斜体');
                    }
                }
            });

            container.appendChild(previewLayer);
            container.appendChild(textarea);
            body.appendChild(container);
            modal.appendChild(body);

            // フッター
            const footer = document.createElement('div');
            footer.className = 'gemini-md-footer';

            const counter = document.createElement('div');
            counter.className = 'gemini-md-counter';
            counter.id = 'gemini-md-counter-text';
            counter.textContent = '文字数: 0 | 行数: 1';

            const actions = document.createElement('div');
            actions.className = 'gemini-md-actions';

            const applyBtn = document.createElement('button');
            applyBtn.className = 'gemini-md-btn-apply';
            applyBtn.textContent = '反映して閉じる';
            applyBtn.addEventListener('click', () => applyMarkdownToGemini(false));

            const sendBtn = document.createElement('button');
            sendBtn.className = 'gemini-md-btn-send';
            sendBtn.textContent = '反映してそのまま送信';
            sendBtn.addEventListener('click', () => applyMarkdownToGemini(true));

            actions.appendChild(applyBtn);
            actions.appendChild(sendBtn);
            footer.appendChild(counter);
            footer.appendChild(actions);
            modal.appendChild(footer);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    function syncTextToHighlight() {
        const textarea = document.getElementById('gemini-md-textarea-input');
        const previewLayer = document.getElementById('gemini-md-preview-layer');
        const counter = document.getElementById('gemini-md-counter-text');

        if (textarea && previewLayer) {
            const text = textarea.value;
            previewLayer.innerHTML = renderMarkdownSyntaxHighlight(text);

            if (counter) {
                const lines = text ? text.split('\n').length : 1;
                counter.textContent = `文字数: ${text.length} | 行数: ${lines}`;
            }
        }
    }

    function insertFormatting(textarea, prefix, suffix, defaultText) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selectedText = text.substring(start, end);

        const replacement = selectedText ? (prefix + selectedText + suffix) : (prefix + defaultText + suffix);

        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.focus();

        if (selectedText) {
            textarea.selectionStart = start;
            textarea.selectionEnd = start + replacement.length;
        } else {
            textarea.selectionStart = start + prefix.length;
            textarea.selectionEnd = start + prefix.length + defaultText.length;
        }
        syncTextToHighlight();
    }

    function openMarkdownModal() {
        const overlay = createOrGetMarkdownModal();
        const textarea = document.getElementById('gemini-md-textarea-input');

        const geminiEditor = document.querySelector('rich-textarea .ql-editor');
        if (geminiEditor && textarea) {
            textarea.value = geminiEditor.innerText.trim();
        }

        overlay.style.display = 'flex';
        if (textarea) {
            textarea.focus();
            syncTextToHighlight();
        }
    }

    function closeMarkdownModal() {
        const overlay = document.getElementById('gemini-md-modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    function applyMarkdownToGemini(shouldSend = false) {
        const textarea = document.getElementById('gemini-md-textarea-input');
        const geminiEditor = document.querySelector('rich-textarea .ql-editor');

        if (textarea && geminiEditor) {
            const mdText = textarea.value;

            geminiEditor.focus();

            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(geminiEditor);
            selection.removeAllRanges();
            selection.addRange(range);

            if (document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, mdText);
            } else {
                geminiEditor.innerText = mdText;
            }

            geminiEditor.dispatchEvent(new Event('input', { bubbles: true }));
            geminiEditor.dispatchEvent(new Event('change', { bubbles: true }));

            closeMarkdownModal();

            if (shouldSend) {
                setTimeout(() => {
                    const sendButton = document.querySelector('button[aria-label*="送信"], button[aria-label*="Send"]');
                    if (sendButton) {
                        sendButton.click();
                    }
                }, 100);
            }
        }
    }

    function injectMarkdownButton() {
        if (document.getElementById('gemini-md-trigger-btn')) return;

        const anchor = document.querySelector('simplified-input-menu, .leading-actions-wrapper, button[aria-label*="アップロード"], button[aria-label*="Upload"], .upload-icon');
        if (!anchor) return;

        const btn = document.createElement('button');
        btn.id = 'gemini-md-trigger-btn';
        btn.type = 'button';
        btn.title = 'Markdownで編集';
        btn.innerHTML = '📝';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMarkdownModal();
        });

        anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    }

    // ----------------------------------------------------
    // 4. 右側サイドバー（2タブUI & 直近回答インデックス機能）
    // ----------------------------------------------------
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

                    contentContainer.appendChild(item);
                }
            });
        }
    }

    let updateTimer = null;
    function debouncedUpdate() {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
            injectMarkdownButton();
            renderSidebarContent();
        }, 300);
    }

    const observer = new MutationObserver((mutations) => {
        const isOnlySidebarChange = mutations.every(m => m.target.closest('#gemini-prompt-sidebar, #gemini-md-modal-overlay'));
        if (isOnlySidebarChange) return;

        debouncedUpdate();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setTimeout(() => {
        injectMarkdownButton();
        renderSidebarContent();
    }, 1000);
})();
