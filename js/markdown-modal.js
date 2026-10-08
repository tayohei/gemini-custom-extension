(function () {
    'use strict';

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
                // IME変換中は独自処理をしない
                if (e.isComposing || e.keyCode === 229) return;

                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    applyMarkdownToGemini(true);
                    return;
                }

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
                        replaceRange(textarea, start, end, '  ');
                    } else if (val.substring(start - 2, start) === '  ') {
                        replaceRange(textarea, start - 2, start, '');
                    }
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
                            replaceRange(textarea, lineStart, start, '');
                        } else {
                            replaceRange(textarea, start, start, `\n${indent}${symbol} `);
                        }
                        return;
                    } else if (numMatch) {
                        e.preventDefault();
                        const indent = numMatch[1];
                        const num = parseInt(numMatch[2], 10);
                        const content = numMatch[3].trim();

                        if (content === '') {
                            replaceRange(textarea, lineStart, start, '');
                        } else {
                            replaceRange(textarea, start, start, `\n${indent}${num + 1}. `);
                        }
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

    // 範囲を置換する。execCommand経由にしてブラウザのUndo履歴を保つ
    function replaceRange(textarea, start, end, text, selStart, selEnd) {
        textarea.focus();
        textarea.setSelectionRange(start, end);
        if (!document.execCommand('insertText', false, text)) {
            textarea.setRangeText(text, start, end, 'end');
        }
        const pos = start + text.length;
        textarea.setSelectionRange(selStart ?? pos, selEnd ?? pos);
        syncTextToHighlight();
    }

    let syncFrame = 0;
    function syncTextToHighlight() {
        if (syncFrame) return;
        syncFrame = requestAnimationFrame(() => {
            syncFrame = 0;
            doSyncTextToHighlight();
        });
    }

    function doSyncTextToHighlight() {
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

        if (selectedText) {
            replaceRange(textarea, start, end, replacement, start, start + replacement.length);
        } else {
            replaceRange(textarea, start, end, replacement,
                start + prefix.length, start + prefix.length + defaultText.length);
        }
    }

    function openMarkdownModal() {
        const overlay = createOrGetMarkdownModal();
        const textarea = document.getElementById('gemini-md-textarea-input');

        const geminiEditor = document.querySelector('rich-textarea .ql-editor');
        if (geminiEditor && textarea) {
            const current = geminiEditor.innerText.trim();
            // Gemini側が空で、閉じる前の下書きがあれば復元する
            textarea.value = current || draft;
        }

        overlay.style.display = 'flex';
        if (textarea) {
            textarea.focus();
            syncTextToHighlight();
        }
    }

    let draft = '';

    function closeMarkdownModal() {
        const textarea = document.getElementById('gemini-md-textarea-input');
        if (textarea) draft = textarea.value;
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
            draft = '';

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

    // DOM変更のたびに走らないよう、フレームごとに1回へまとめる
    let injectScheduled = false;
    const observer = new MutationObserver(() => {
        if (injectScheduled || document.getElementById('gemini-md-trigger-btn')) return;
        injectScheduled = true;
        requestAnimationFrame(() => {
            injectScheduled = false;
            injectMarkdownButton();
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectMarkdownButton, 1000);
})();
