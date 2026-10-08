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
            modal.addEventListener('click', (e) => {
                e.stopPropagation();
                const panel = document.getElementById('gemini-md-template-panel');
                if (panel && !e.target.closest('.gemini-md-template-panel')) panel.style.display = 'none';
            });

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
                { label: '</> コード', prefix: '```\n', suffix: '\n```', def: '// code here' },
                { label: '🔗 リンク', prefix: '[', suffix: '](https://)', def: 'リンク文字' },
                { label: '⊞ 表', insertBlock: '| 見出し1 | 見出し2 |\n| --- | --- |\n| 内容 | 内容 |\n' }
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
                        if (!textarea) return;
                        if (tool.insertBlock) insertBlock(textarea, tool.insertBlock);
                        else insertFormatting(textarea, tool.prefix, tool.suffix, tool.def);
                    });
                    toolbar.appendChild(btn);
                }
            });

            toolbar.appendChild(createTemplateMenu());

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
                scheduleDraftSave();
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
                    indentSelection(textarea, e.shiftKey);
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

    // Tab / Shift+Tab: 複数行選択時は行単位でインデント・解除する
    function indentSelection(textarea, outdent) {
        const val = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const multiLine = val.substring(start, end).includes('\n');

        if (!outdent && !multiLine) {
            replaceRange(textarea, start, end, '  ');
            return;
        }

        const blockStart = val.lastIndexOf('\n', start - 1) + 1;
        let blockEnd = val.indexOf('\n', end);
        if (blockEnd === -1) blockEnd = val.length;

        const lines = val.substring(blockStart, blockEnd).split('\n');
        const changed = lines.map(line => outdent ? line.replace(/^( {1,2}|\t)/, '') : '  ' + line);
        const newBlock = changed.join('\n');

        if (newBlock === val.substring(blockStart, blockEnd)) return;
        replaceRange(textarea, blockStart, blockEnd, newBlock, blockStart, blockStart + newBlock.length);
    }

    // 表などのブロックは新しい行から挿入する
    function insertBlock(textarea, block) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const needsBreak = start > 0 && textarea.value[start - 1] !== '\n';
        replaceRange(textarea, start, end, (needsBreak ? '\n' : '') + block);
    }

    // ---------- テンプレート ----------
    const TEMPLATE_KEY = 'mdTemplates';
    const DEFAULT_TEMPLATES = [
        { name: '要約', text: '以下の内容を、要点を箇条書きで3〜5行に要約してください。\n\n' },
        { name: 'コードレビュー', text: '以下のコードをレビューし、バグ・可読性・性能の観点で改善点を指摘してください。\n\n```\n\n```\n' },
        { name: '翻訳(日→英)', text: '以下の文章を自然な英語に翻訳してください。\n\n' }
    ];

    async function loadTemplates() {
        return window.GeminiExt.storageGet(TEMPLATE_KEY, DEFAULT_TEMPLATES);
    }

    function createTemplateMenu() {
        const wrap = document.createElement('div');
        wrap.className = 'gemini-md-template-wrap';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'gemini-md-tool-btn';
        toggle.textContent = '📄 テンプレート ▾';

        const panel = document.createElement('div');
        panel.className = 'gemini-md-template-panel';
        panel.id = 'gemini-md-template-panel';

        async function renderPanel() {
            const templates = await loadTemplates();
            panel.innerHTML = '';

            templates.forEach(tpl => {
                const row = document.createElement('div');
                row.className = 'gemini-md-template-row';

                const name = document.createElement('span');
                name.className = 'gemini-md-template-name';
                name.textContent = tpl.name;
                name.title = tpl.text;
                name.addEventListener('click', () => {
                    const textarea = document.getElementById('gemini-md-textarea-input');
                    if (textarea) replaceRange(textarea, textarea.selectionStart, textarea.selectionEnd, tpl.text);
                    panel.style.display = 'none';
                });

                const del = document.createElement('span');
                del.className = 'gemini-md-template-del';
                del.textContent = '×';
                del.title = '削除';
                del.addEventListener('click', async () => {
                    if (!confirm(`テンプレート「${tpl.name}」を削除しますか？`)) return;
                    await window.GeminiExt.storageSet(TEMPLATE_KEY, templates.filter(t => t !== tpl));
                    renderPanel();
                });

                row.appendChild(name);
                row.appendChild(del);
                panel.appendChild(row);
            });

            const add = document.createElement('div');
            add.className = 'gemini-md-template-add';
            add.textContent = '＋ 選択範囲（なければ全文）を保存';
            add.addEventListener('click', async () => {
                const textarea = document.getElementById('gemini-md-textarea-input');
                if (!textarea) return;
                const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
                const text = selected || textarea.value;
                if (!text.trim()) return window.GeminiExt.toast('保存する内容がありません', true);

                const name = (prompt('テンプレート名を入力してください') || '').trim();
                if (!name) return;
                const next = templates.filter(t => t.name !== name).concat({ name, text });
                await window.GeminiExt.storageSet(TEMPLATE_KEY, next);
                window.GeminiExt.toast(`📄 テンプレート「${name}」を保存しました`);
                renderPanel();
            });
            panel.appendChild(add);
        }

        toggle.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (panel.style.display === 'block') {
                panel.style.display = 'none';
                return;
            }
            await renderPanel();
            panel.style.display = 'block';
        });

        wrap.appendChild(toggle);
        wrap.appendChild(panel);
        return wrap;
    }

    // ---------- 下書きの永続化 ----------
    const DRAFT_KEY = 'mdDraft';
    let draftTimer = null;
    function scheduleDraftSave() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraftNow, 600);
    }
    function saveDraftNow() {
        clearTimeout(draftTimer);
        const textarea = document.getElementById('gemini-md-textarea-input');
        if (textarea) window.GeminiExt.storageSet(DRAFT_KEY, textarea.value);
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
                // 日本語などの全角文字は約1文字=1トークン、それ以外は約4文字=1トークンで概算
                const wide = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
                const tokens = Math.ceil(wide + (text.length - wide) / 4);
                counter.textContent = `文字数: ${text.length} | 行数: ${lines} | 約${tokens}トークン（目安）`;
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

    async function openMarkdownModal() {
        const overlay = createOrGetMarkdownModal();
        const textarea = document.getElementById('gemini-md-textarea-input');

        overlay.style.display = 'flex';
        if (!textarea) return;

        const geminiEditor = document.querySelector('rich-textarea .ql-editor');
        const current = geminiEditor ? geminiEditor.innerText.trim() : '';
        // Gemini側が空なら、前回の下書き（閉じた/リロード前の内容）を復元する
        textarea.value = current || await window.GeminiExt.storageGet(DRAFT_KEY, '');
        textarea.focus();
        syncTextToHighlight();
    }

    function closeMarkdownModal() {
        saveDraftNow();
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
            // 反映済みの内容は下書きから消す
            window.GeminiExt.storageSet(DRAFT_KEY, '');

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
