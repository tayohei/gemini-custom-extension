(function () {
    'use strict';

    // 各機能ファイルから共有する小さなユーティリティ群 (window.GeminiExt)
    const ns = (window.GeminiExt = window.GeminiExt || {});

    // ---------- トースト通知 ----------
    let toastTimer = null;
    ns.toast = function (message, isError = false) {
        let el = document.getElementById('gemini-ext-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'gemini-ext-toast';
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.classList.toggle('is-error', isError);
        el.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3500);
    };

    // ---------- chrome.storage (拡張機能のリロード後などで失敗しても落とさない) ----------
    ns.storageGet = async function (key, fallback) {
        try {
            const result = await chrome.storage.local.get(key);
            return result[key] === undefined ? fallback : result[key];
        } catch (e) {
            return fallback;
        }
    };

    ns.storageSet = async function (key, value) {
        try {
            await chrome.storage.local.set({ [key]: value });
        } catch (e) {
            // 保存失敗は致命的ではないので無視
        }
    };

    // ---------- 保存先フォルダの記憶 (File System Access API + IndexedDB) ----------
    const DB_NAME = 'gemini-ext';
    const STORE = 'handles';
    const HANDLE_KEY = 'saveDir';

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function loadHandle() {
        try {
            const db = await openDb();
            return await new Promise((resolve, reject) => {
                const req = db.transaction(STORE).objectStore(STORE).get(HANDLE_KEY);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            return null;
        }
    }

    async function storeHandle(handle) {
        try {
            const db = await openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE, 'readwrite');
                tx.objectStore(STORE).put(handle, HANDLE_KEY);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            // 記憶できなくても今回の保存は続行する
        }
    }

    async function ensureDirectory(forcePick) {
        const saved = forcePick ? null : await loadHandle();
        if (saved) {
            let perm = await saved.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted') perm = await saved.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') return saved;
        }
        const picked = await window.showDirectoryPicker({ id: 'gemini-ext-save', mode: 'readwrite' });
        await storeHandle(picked);
        return picked;
    }

    // 同名ファイルを上書きしないよう「name (1).ext」の形で空き名を探す
    async function uniqueName(dir, filename) {
        const dot = filename.lastIndexOf('.');
        const base = dot > 0 ? filename.slice(0, dot) : filename;
        const ext = dot > 0 ? filename.slice(dot) : '';
        for (let i = 0; ; i++) {
            const candidate = i === 0 ? filename : `${base} (${i})${ext}`;
            try {
                await dir.getFileHandle(candidate);
            } catch (e) {
                if (e.name === 'NotFoundError') return candidate;
                throw e;
            }
        }
    }

    function fallbackDownload(filename, text, mime) {
        chrome.runtime.sendMessage({
            action: 'download_code',
            url: `data:${mime};charset=utf-8,` + encodeURIComponent(text),
            filename: filename
        });
    }

    // テキストを保存する。初回(または forcePick)のみフォルダを選択し、以降は同じフォルダに保存する。
    ns.saveTextFile = async function (filename, text, options = {}) {
        const mime = options.mime || 'text/plain';

        if (!window.showDirectoryPicker) {
            fallbackDownload(filename, text, mime);
            return;
        }

        try {
            const dir = await ensureDirectory(!!options.forcePick);
            const name = await uniqueName(dir, filename);
            const fileHandle = await dir.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            ns.toast(`💾 保存しました: ${dir.name}/${name}`);
        } catch (e) {
            if (e.name === 'AbortError') return; // フォルダ選択のキャンセル
            console.warn('[Gemini Ext] フォルダ保存に失敗したため通常のダウンロードに切り替えます:', e);
            fallbackDownload(filename, text, mime);
        }
    };

    ns.changeSaveDirectory = async function () {
        if (!window.showDirectoryPicker) {
            ns.toast('このブラウザではフォルダ指定に対応していません', true);
            return;
        }
        try {
            const dir = await ensureDirectory(true);
            ns.toast(`📁 保存先を「${dir.name}」に変更しました`);
        } catch (e) {
            if (e.name !== 'AbortError') ns.toast('保存先を変更できませんでした', true);
        }
    };

    // ---------- HTML → Markdown 変換 ----------
    const SKIP_SELECTOR = 'script, style, button, mat-icon, svg, .code-block-decoration, .sr-only, source-footnote, sources-carousel-inline';

    function cellText(cell) {
        return convert(cell).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
    }

    function tableToMd(table) {
        const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
            Array.from(tr.children).map(cellText));
        if (rows.length === 0) return '';
        const cols = Math.max(...rows.map(r => r.length));
        const pad = r => Array.from({ length: cols }, (_, i) => r[i] || '');
        const line = r => '| ' + pad(r).join(' | ') + ' |';
        const out = [line(rows[0]), '| ' + Array(cols).fill('---').join(' | ') + ' |'];
        rows.slice(1).forEach(r => out.push(line(r)));
        return '\n\n' + out.join('\n') + '\n\n';
    }

    function listToMd(list) {
        const ordered = list.tagName.toLowerCase() === 'ol';
        const items = Array.from(list.children).filter(li => li.tagName.toLowerCase() === 'li');
        const lines = items.map((li, i) => {
            const body = convert(li).trim().replace(/\n{2,}/g, '\n').replace(/\n/g, '\n  ');
            return `${ordered ? i + 1 + '.' : '-'} ${body}`;
        });
        return '\n\n' + lines.join('\n') + '\n\n';
    }

    function convert(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.replace(/\s+/g, ' ');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        if (node.matches(SKIP_SELECTOR)) return '';

        const tag = node.tagName.toLowerCase();

        // 数式 (Gemini は data-math 属性に LaTeX を保持している)
        if (node.dataset && node.dataset.math) {
            return node.classList.contains('math-block')
                ? `\n\n$$\n${node.dataset.math}\n$$\n\n`
                : `$${node.dataset.math}$`;
        }

        if (tag === 'pre') {
            const codeEl = node.querySelector('code') || node;
            const wrapper = node.closest('code-block');
            const langLabel = wrapper && wrapper.querySelector('.code-block-decoration span');
            const classLang = (codeEl.className.match(/language-([\w+#-]+)/) || [])[1];
            const lang = (classLang || (langLabel ? langLabel.textContent : '') || '').trim().toLowerCase();
            return `\n\n\`\`\`${lang}\n${codeEl.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
        }
        if (tag === 'table') return tableToMd(node);
        if (tag === 'ul' || tag === 'ol') return listToMd(node);

        const inner = () => Array.from(node.childNodes).map(convert).join('');

        if (/^h[1-6]$/.test(tag)) {
            return `\n\n${'#'.repeat(Number(tag[1]))} ${inner().replace(/\s+/g, ' ').trim()}\n\n`;
        }
        switch (tag) {
            case 'p': return `\n\n${inner().trim()}\n\n`;
            case 'br': return '  \n';
            case 'hr': return '\n\n---\n\n';
            case 'strong':
            case 'b': { const t = inner().trim(); return t ? `**${t}**` : ''; }
            case 'em':
            case 'i': { const t = inner().trim(); return t ? `*${t}*` : ''; }
            case 'del':
            case 's': { const t = inner().trim(); return t ? `~~${t}~~` : ''; }
            case 'code': return `\`${node.textContent}\``;
            case 'a': {
                const t = inner().trim();
                const href = node.getAttribute('href');
                return href && t ? `[${t}](${href})` : t;
            }
            case 'blockquote':
                return '\n\n' + inner().trim().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
            default: return inner();
        }
    }

    ns.htmlToMarkdown = function (element) {
        return convert(element).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    };
})();
