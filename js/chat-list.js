(function () {
    'use strict';

    // 左サイドバー「最近」のチャット履歴を、タイトルの接頭辞 (【カテゴリ】/ ■カテゴリ / 雑_) で絞り込みやすくする。
    // チャット自体は削除・並べ替えせず、表示/非表示だけを切り替える（Angular管理のDOMを壊さないため）。

    const ns = window.GeminiExt;
    const STATE_KEY = 'chatFilterState';
    const PREFIX_KEY = 'chatJunkPrefixes';
    const DEFAULT_JUNK_PREFIXES = ['雑_'];
    const UNCATEGORIZED = '__none__';

    const LIST_LINK_SELECTOR = 'conversations-list a[href*="/app/"]';
    const FALLBACK_LINK_SELECTOR = 'side-navigation-content a[href*="/app/"], bard-sidenav a[href*="/app/"]';
    const ROW_SELECTOR = 'gem-nav-list-item[data-test-id="conversation"], [data-test-id="conversation"]';

    let junkPrefixes = DEFAULT_JUNK_PREFIXES;
    let state = { showJunk: false, category: null };
    let query = '';
    let lastBarKey = '';
    let warned = false;

    function classify(title) {
        const t = title.trim();
        const junk = junkPrefixes.find(p => p && t.startsWith(p));
        if (junk) return { category: junk.replace(/[_\s　]+$/, '') || '雑', junk: true, prefix: junk };

        let m = t.match(/^[【\[［]([^】\]］]{1,20})[】\]］]/);
        if (m) return { category: m[1].trim(), junk: false, prefix: m[0] };
        m = t.match(/^[■□●◆▼▲★]\s*([^\s　]{1,20})/);
        if (m) return { category: m[1], junk: false, prefix: m[0] };
        return { category: null, junk: false };
    }

    // 名前変更ダイアログ用: 現在の履歴から使われているラベル(接頭辞)を使用頻度順に返す
    ns.getLabelPrefixes = function () {
        const map = new Map();
        getRows().forEach(({ title }) => {
            const info = classify(title);
            if (!info.prefix) return;
            const entry = map.get(info.prefix) || { prefix: info.prefix, category: info.category, junk: info.junk, count: 0 };
            entry.count++;
            map.set(info.prefix, entry);
        });
        // 設定済みの「雑」接頭辞は、現在1件もなくても選べるようにする
        junkPrefixes.forEach(p => {
            if (p && !map.has(p)) map.set(p, { prefix: p, category: p.replace(/[_\s\u3000]+$/, '') || '雑', junk: true, count: 0 });
        });
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
    };

    // タイトルから先頭のラベルを取り除く
    ns.stripLabelPrefix = function (title) {
        const info = classify(title);
        return info.prefix ? title.slice(info.prefix.length).replace(/^[\s\u3000]+/, '') : title;
    };

    // Okabe-Ito カラーユニバーサルデザインパレット（黒を除く7色）。fg はその色を背景にしたときの文字色。
    const OKABE_ITO = [
        { color: '#E69F00', fg: '#000' }, // orange
        { color: '#56B4E9', fg: '#000' }, // sky blue
        { color: '#009E73', fg: '#fff' }, // bluish green
        { color: '#F0E442', fg: '#000' }, // yellow
        { color: '#0072B2', fg: '#fff' }, // blue
        { color: '#D55E00', fg: '#fff' }, // vermillion
        { color: '#CC79A7', fg: '#000' }  // reddish purple
    ];
    const JUNK_COLOR = { color: '#767676', fg: '#fff' };
    const COLOR_KEY = 'chatLabelColors';
    let colorMap = {};

    // カテゴリ→パレット番号を記憶して固定する。新しいカテゴリには「現在最も使われていない色」を割り当てる
    function assignColors(categories) {
        const usage = OKABE_ITO.map(() => 0);
        categories.forEach(c => { if (colorMap[c] !== undefined) usage[colorMap[c]]++; });

        let changed = false;
        categories.forEach(c => {
            if (colorMap[c] !== undefined) return;
            const idx = usage.indexOf(Math.min(...usage));
            colorMap[c] = idx;
            usage[idx]++;
            changed = true;
        });
        if (changed) ns.storageSet(COLOR_KEY, colorMap);
    }

    function colorOf(category, junk) {
        if (junk) return JUNK_COLOR;
        const idx = colorMap[category];
        return idx === undefined ? OKABE_ITO[0] : OKABE_ITO[idx];
    }

    function applyColor(el, entry) {
        el.style.setProperty('--gx-color', entry.color);
        el.style.setProperty('--gx-fg', entry.fg);
    }

    ns.colorOfLabel = colorOf;
    ns.applyLabelColor = applyColor;

    function getRows() {
        let links = document.querySelectorAll(LIST_LINK_SELECTOR);
        if (links.length === 0) links = document.querySelectorAll(FALLBACK_LINK_SELECTOR);
        return Array.from(links).map(link => {
            // 実DOM: <a href="/app/…" aria-label="タイトル"><span class="title-text">タイトル</span></a>
            const titleEl = link.querySelector('.title-text');
            const title = (titleEl ? titleEl.textContent : (link.getAttribute('aria-label') || link.textContent))
                .replace(/\s+/g, ' ').trim();
            return { row: link.closest(ROW_SELECTOR) || link, title };
        });
    }

    function getBar() {
        let bar = document.getElementById('gemini-chat-filter');
        if (bar) return bar;

        const firstList = document.querySelector('conversations-list');
        if (!firstList || !firstList.parentNode) return null;

        bar = document.createElement('div');
        bar.id = 'gemini-chat-filter';

        const inputRow = document.createElement('div');
        inputRow.className = 'gx-input-row';

        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'gx-search';
        input.placeholder = '履歴を絞り込み…';
        input.addEventListener('input', () => {
            query = input.value.trim().toLowerCase();
            apply();
        });
        // Geminiのショートカットキーに奪われないようにする
        input.addEventListener('keydown', e => e.stopPropagation());

        const gear = document.createElement('button');
        gear.type = 'button';
        gear.className = 'gx-gear';
        gear.textContent = '⚙';
        gear.title = '「雑」扱いにする接頭辞を設定';
        gear.addEventListener('click', editJunkPrefixes);

        inputRow.appendChild(input);
        inputRow.appendChild(gear);

        const chips = document.createElement('div');
        chips.className = 'gx-chips';
        chips.id = 'gemini-chat-filter-chips';

        bar.appendChild(inputRow);
        bar.appendChild(chips);
        firstList.parentNode.insertBefore(bar, firstList);
        lastBarKey = '';
        return bar;
    }

    async function editJunkPrefixes() {
        const input = prompt('「雑」扱い（既定で非表示）にするタイトルの接頭辞をカンマ区切りで入力してください', junkPrefixes.join(','));
        if (input === null) return;
        junkPrefixes = input.split(/[,、]/).map(s => s.trim()).filter(Boolean);
        await ns.storageSet(PREFIX_KEY, junkPrefixes);
        apply();
    }

    function saveState() {
        ns.storageSet(STATE_KEY, state);
    }

    function renderChips(counts, junkCount, total) {
        const chipsEl = document.getElementById('gemini-chat-filter-chips');
        if (!chipsEl) return;

        const key = JSON.stringify([counts, junkCount, total, state, junkPrefixes]);
        if (key === lastBarKey) return;
        lastBarKey = key;

        chipsEl.innerHTML = '';
        const addChip = (label, value, count, entry) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'gx-chip' + (state.category === value ? ' active' : '');
            chip.textContent = `${label} ${count}`;
            if (entry) applyColor(chip, entry);
            chip.addEventListener('click', () => {
                state.category = state.category === value ? null : value;
                saveState();
                apply();
            });
            chipsEl.appendChild(chip);
        };

        addChip('すべて', null, total);
        Object.keys(counts)
            .sort((a, b) => counts[b] - counts[a])
            .forEach(cat => {
                const label = cat === UNCATEGORIZED ? 'その他' : cat;
                addChip(label, cat, counts[cat], cat === UNCATEGORIZED ? undefined : colorOf(cat, false));
            });

        if (junkCount > 0) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'gx-chip gx-junk-toggle';
            toggle.textContent = state.showJunk ? `雑 ${junkCount}件を隠す` : `雑 ${junkCount}件を表示`;
            toggle.addEventListener('click', () => {
                state.showJunk = !state.showJunk;
                saveState();
                apply();
            });
            chipsEl.appendChild(toggle);
        }
    }

    function apply() {
        const rows = getRows();
        if (rows.length === 0) {
            if (!warned && document.querySelector('side-navigation-content, bard-sidenav, conversations-list')) {
                console.warn('[Gemini Ext] チャット履歴の要素が見つかりません。Geminiの画面構造が変わった可能性があります。');
                warned = true;
            }
            return;
        }
        if (!getBar()) return;

        const counts = {};
        let junkCount = 0;
        const infos = rows.map(r => classify(r.title));

        // 選択中のカテゴリが無くなっていたら解除する（全件が隠れたままになるのを防ぐ）
        if (state.category) {
            const exists = infos.some(i => (i.junk ? i.category : (i.category || UNCATEGORIZED)) === state.category);
            if (!exists) {
                state.category = null;
                saveState();
            }
        }

        // 使用頻度の高いカテゴリから順に色を割り当てる（上位ほど色が被りにくい）
        const freq = {};
        infos.forEach(i => { if (i.category && !i.junk) freq[i.category] = (freq[i.category] || 0) + 1; });
        assignColors(Object.keys(freq).sort((a, b) => freq[b] - freq[a]));

        rows.forEach(({ row, title }, idx) => {
            const info = infos[idx];
            const catKey = info.junk ? null : (info.category || UNCATEGORIZED);

            if (info.junk) junkCount++;
            else counts[catKey] = (counts[catKey] || 0) + 1;

            let hide = false;
            if (query) {
                // 検索中は「雑」も含めて全体から探す
                hide = !title.toLowerCase().includes(query);
            } else if (info.junk) {
                hide = !state.showJunk;
            }
            if (!hide && state.category) {
                const rowCat = info.junk ? info.category : catKey;
                hide = rowCat !== state.category;
            }

            row.dataset.gxHide = hide ? '1' : '';
            row.dataset.gxJunk = info.junk ? '1' : '';
            if (info.category) applyColor(row, colorOf(info.category, info.junk));
            else {
                row.style.removeProperty('--gx-color');
                row.style.removeProperty('--gx-fg');
            }
            row.dataset.gxCat = info.category ? '1' : '';
        });

        renderChips(counts, junkCount, rows.length);
    }

    let timer = null;
    function scheduleApply() {
        clearTimeout(timer);
        timer = setTimeout(apply, 300);
    }

    const observer = new MutationObserver(mutations => {
        if (document.hidden) return;
        const bar = document.getElementById('gemini-chat-filter');
        if (bar && mutations.every(m => bar.contains(m.target))) return;
        scheduleApply();
    });

    (async function init() {
        junkPrefixes = await ns.storageGet(PREFIX_KEY, DEFAULT_JUNK_PREFIXES);
        colorMap = await ns.storageGet(COLOR_KEY, {});
        state = Object.assign(state, await ns.storageGet(STATE_KEY, {}));
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(apply, 1000);
    })();
})();
