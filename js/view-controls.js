(function () {
    'use strict';

    // 右下に「文字の大きさ」「幅」の操作パネルを表示し、回答表示エリアの見た目を調整する。
    // - 文字: 回答本文/プロンプトに CSS zoom を適用（レイアウトは同じ幅の中で再配置される）
    // - 幅  : 回答本文(.markdown 直下の段落・見出し・リスト等)と質問(user-query)は、実測で
    //         「max-width: 708px + 左右 margin:auto」の中央寄せの列になっている。
    //         max-width が px で指定されている要素だけを実行時に見つけて印を付け、
    //         CSS変数の倍率で上書きする（倍率の変更はCSS変数を1つ変えるだけで全要素に反映される）

    const ns = window.GeminiExt;
    const KEY = 'viewSettings';
    // 各項目の設定値は「パーセント」で持つ。刻み(step)と範囲(min/max)はここで決める
    const LIMITS = {
        font: { min: 70, max: 200, step: 5 },
        width: { min: 70, max: 250, step: 5 },
        line: { min: 80, max: 170, step: 10 }
    };
    // 旧バージョンは「段階の番号」で保存していたため、読み込み時にパーセントへ変換する
    const LEGACY_STEPS = {
        font: [70, 80, 90, 100, 110, 120, 135, 150, 170, 200],
        width: [70, 85, 100, 120, 140, 160, 180, 200, 250],
        line: [80, 90, 100, 110, 120, 135, 150, 170]
    };
    const MIN_TARGET_WIDTH = 400; // これより狭い要素は対象外

    let state = { font: 100, width: 100, line: 100 };
    let fontLabel = null;
    let widthLabel = null;
    let lineLabel = null;

    function applyFont() {
        document.documentElement.style.setProperty('--gx-font-zoom', (state.font / 100));
        updateWidthRule();
    }

    // 文字サイズ(zoom)を変えると max-width も一緒に拡大縮小されて見た目の幅が変わるため、
    // CSS側で「元の幅 × 幅倍率 ÷ 文字倍率」にして見た目の幅を保つ。
    // 文字・幅のどちらかが 100% でなければルールを有効にする。
    function updateWidthRule() {
        const root = document.documentElement;
        root.style.setProperty('--gx-width-factor', (state.width / 100));
        const active = state.width !== 100 || state.font !== 100;
        if (active) root.setAttribute('data-gx-wide', '1');
        else root.removeAttribute('data-gx-wide');
    }

    // 幅を制限している要素（max-width が px 指定）。回答本文の直下の要素と、質問そのもの
    const WIDTH_TARGETS = 'chat-window .markdown > *, chat-window user-query';

    // 印(data-gx-lim)と元の max-width(--gx-base)を付ける。force=true で全要素を測り直す（画面幅の変更時）
    function markWidthTargets(force) {
        const targets = [];
        document.querySelectorAll(WIDTH_TARGETS).forEach(el => {
            if (force || !el.dataset.gxChecked) targets.push(el);
        });
        if (targets.length === 0) return;

        // 自分たちの上書きを外した状態の値を読む（まとめて読んでから書く）
        if (force) targets.forEach(el => el.removeAttribute('data-gx-lim'));
        const widths = targets.map(el => {
            const mw = getComputedStyle(el).maxWidth;
            return mw.endsWith('px') ? parseFloat(mw) : 0;
        });
        targets.forEach((el, i) => {
            el.dataset.gxChecked = '1';
            if (widths[i] >= MIN_TARGET_WIDTH) {
                el.dataset.gxLim = '1';
                el.style.setProperty('--gx-base', widths[i] + 'px');
            } else {
                el.removeAttribute('data-gx-lim');
                el.style.removeProperty('--gx-base');
            }
        });
    }

    function applyWidth() {
        updateWidthRule();
        markWidthTargets(false);
    }

    // ---- 行間 ----
    // Gemini の行間は要素ごとに異なる(本文/見出し等)ため、要素種別ごとに元の行間(倍率)を実測し、
    // CSS変数 --gx-lh-<tag> に入れておき、CSS側で「元の行間 × 行間倍率」を適用する。
    const LINE_TAGS = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'blockquote'];

    function measureLineHeights() {
        const root = document.documentElement;
        root.removeAttribute('data-gx-lh'); // 自分たちの上書きを外した状態で測る
        LINE_TAGS.forEach(tag => {
            const el = document.querySelector(`chat-window .markdown ${tag}`);
            if (!el) return;
            const cs = getComputedStyle(el);
            const ratio = parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
            if (ratio > 0 && isFinite(ratio)) root.style.setProperty(`--gx-lh-${tag}`, ratio.toFixed(3));
        });
    }

    function applyLine() {
        const root = document.documentElement;
        root.style.setProperty('--gx-lh-factor', (state.line / 100));
        if (state.line === 100) {
            root.removeAttribute('data-gx-lh');
        } else {
            measureLineHeights();
            root.setAttribute('data-gx-lh', '1');
        }
    }

    function updateLabels() {
        if (fontLabel) fontLabel.textContent = state.font + '%';
        if (widthLabel) widthLabel.textContent = state.width + '%';
        if (lineLabel) lineLabel.textContent = state.line + '%';
    }

    function save() {
        ns.storageSet(KEY, { fontPct: state.font, widthPct: state.width, linePct: state.line });
    }

    function change(kind, delta) {
        const { min, max, step } = LIMITS[kind];
        state[kind] = delta === 0 ? 100 : Math.min(max, Math.max(min, state[kind] + delta * step));
        if (kind === 'font') applyFont();
        else if (kind === 'width') applyWidth();
        else applyLine();
        updateLabels();
        save();
    }

    function makeRow(title, kind, minusTip, plusTip, resetTip) {
        const row = document.createElement('div');
        row.className = 'gx-view-row';

        const name = document.createElement('span');
        name.className = 'gx-view-name';
        name.textContent = title;

        const mkBtn = (text, tip, handler, cls) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'gx-view-btn' + (cls ? ' ' + cls : '');
            b.textContent = text;
            b.title = tip;
            b.addEventListener('click', handler);
            return b;
        };

        const reset = mkBtn('100%', resetTip, () => change(kind, 0), 'gx-view-reset');
        if (kind === 'font') fontLabel = reset;
        else if (kind === 'width') widthLabel = reset;
        else lineLabel = reset;

        row.appendChild(name);
        row.appendChild(mkBtn('−', minusTip, () => change(kind, -1)));
        row.appendChild(reset);
        row.appendChild(mkBtn('＋', plusTip, () => change(kind, +1)));
        return row;
    }

    function createPanel() {
        if (document.getElementById('gemini-view-controls')) return;
        const panel = document.createElement('div');
        panel.id = 'gemini-view-controls';
        panel.appendChild(makeRow('文字', 'font', '文字を小さく', '文字を大きく', '文字サイズをリセット'));
        panel.appendChild(makeRow('幅', 'width', '幅を狭く', '幅を広く', '幅をリセット'));
        panel.appendChild(makeRow('行間', 'line', '行間を狭く', '行間を広く', '行間をリセット'));
        document.body.appendChild(panel);
        updateLabels();
    }

    // 新しい回答の段落は、追加されたらすぐ印を付ける（生成中でも短い待ちで反映）
    let markTimer = null;
    function scheduleMark() {
        clearTimeout(markTimer);
        markTimer = setTimeout(() => markWidthTargets(false), 150);
    }

    let resizeTimer = null;
    function scheduleRemeasure() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            markWidthTargets(true);
            applyLine();
        }, 400);
    }

    const observer = new MutationObserver(mutations => {
        if (document.hidden) return;
        const panel = document.getElementById('gemini-view-controls');
        if (panel && mutations.every(m => panel.contains(m.target))) return;
        scheduleMark();
    });

    (async function init() {
        const saved = await ns.storageGet(KEY, {});
        ['font', 'width', 'line'].forEach(kind => {
            const { min, max } = LIMITS[kind];
            let pct = 100;
            if (Number.isFinite(saved[kind + 'Pct'])) pct = saved[kind + 'Pct'];
            else if (Number.isInteger(saved[kind]) && LEGACY_STEPS[kind][saved[kind]]) pct = LEGACY_STEPS[kind][saved[kind]];
            state[kind] = Math.min(max, Math.max(min, Math.round(pct)));
        });
        createPanel();
        applyFont();
        applyWidth();
        applyLine();
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleRemeasure);
        setTimeout(() => {
            markWidthTargets(true); // 初回描画後に測り直す
            applyLine();
        }, 1500);
    })();
})();
