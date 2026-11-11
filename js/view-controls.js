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
    const FONT_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7, 2];
    const WIDTH_STEPS = [0.7, 0.85, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.5];
    const FONT_DEFAULT = FONT_STEPS.indexOf(1);
    const WIDTH_DEFAULT = WIDTH_STEPS.indexOf(1);
    const MIN_TARGET_WIDTH = 400; // これより狭い要素は対象外

    let state = { font: FONT_DEFAULT, width: WIDTH_DEFAULT };
    let fontLabel = null;
    let widthLabel = null;

    function applyFont() {
        document.documentElement.style.setProperty('--gx-font-zoom', FONT_STEPS[state.font]);
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
        const factor = WIDTH_STEPS[state.width];
        const root = document.documentElement;
        root.style.setProperty('--gx-width-factor', factor);
        if (factor === 1) root.removeAttribute('data-gx-wide');
        else root.setAttribute('data-gx-wide', '1');
        markWidthTargets(false);
    }

    function updateLabels() {
        if (fontLabel) fontLabel.textContent = Math.round(FONT_STEPS[state.font] * 100) + '%';
        if (widthLabel) widthLabel.textContent = Math.round(WIDTH_STEPS[state.width] * 100) + '%';
    }

    function save() {
        ns.storageSet(KEY, state);
    }

    function change(kind, delta) {
        const steps = kind === 'font' ? FONT_STEPS : WIDTH_STEPS;
        const def = kind === 'font' ? FONT_DEFAULT : WIDTH_DEFAULT;
        state[kind] = delta === 0 ? def : Math.min(steps.length - 1, Math.max(0, state[kind] + delta));
        if (kind === 'font') applyFont();
        else applyWidth();
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
        else widthLabel = reset;

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
        resizeTimer = setTimeout(() => markWidthTargets(true), 400);
    }

    const observer = new MutationObserver(mutations => {
        if (document.hidden) return;
        const panel = document.getElementById('gemini-view-controls');
        if (panel && mutations.every(m => panel.contains(m.target))) return;
        scheduleMark();
    });

    (async function init() {
        const saved = await ns.storageGet(KEY, {});
        state.font = Number.isInteger(saved.font) && FONT_STEPS[saved.font] ? saved.font : FONT_DEFAULT;
        state.width = Number.isInteger(saved.width) && WIDTH_STEPS[saved.width] ? saved.width : WIDTH_DEFAULT;
        createPanel();
        applyFont();
        applyWidth();
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleRemeasure);
        setTimeout(() => markWidthTargets(true), 1500); // 初回描画後に測り直す
    })();
})();
