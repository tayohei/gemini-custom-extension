(function () {
    'use strict';

    // 右下に「文字の大きさ」「幅」の操作パネルを表示し、回答表示エリアの見た目を調整する。
    // - 文字: 回答本文/プロンプトに CSS zoom を適用（レイアウトは同じ幅の中で再配置される）
    // - 幅  : 回答を包む親要素のうち「max-width が px 指定のもの」を、実行時に探して倍率をかける
    //         （Geminiのクラス名に依存しないため、画面構造が変わっても動きやすい）

    const ns = window.GeminiExt;
    const KEY = 'viewSettings';
    const FONT_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.7, 2];
    const WIDTH_STEPS = [0.7, 0.85, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.5];
    const FONT_DEFAULT = FONT_STEPS.indexOf(1);
    const WIDTH_DEFAULT = WIDTH_STEPS.indexOf(1);
    const MIN_TARGET_WIDTH = 400; // これより狭い要素（アイコン等）は対象外

    let state = { font: FONT_DEFAULT, width: WIDTH_DEFAULT };
    let fontLabel = null;
    let widthLabel = null;

    function applyFont() {
        document.documentElement.style.setProperty('--gx-font-zoom', FONT_STEPS[state.font]);
    }

    // 回答/プロンプトとその祖先のうち、max-width が px 指定のものを集めて倍率を適用する
    function applyWidth() {
        const factor = WIDTH_STEPS[state.width];
        const seeds = document.querySelectorAll('chat-window user-query, chat-window model-response');
        const targets = new Set();
        seeds.forEach(seed => {
            for (let el = seed; el && el !== document.body && el.tagName !== 'CHAT-WINDOW'; el = el.parentElement) {
                targets.add(el);
            }
        });

        // 1) 以前の上書きだけを元に戻して元の max-width を読み、2) まとめて書き込む（レイアウト計算を最小限にする）
        const list = Array.from(targets);
        list.forEach(restoreMaxWidth);
        const originals = list.map(el => {
            const mw = getComputedStyle(el).maxWidth;
            return mw.endsWith('px') ? parseFloat(mw) : 0;
        });
        if (factor !== 1) {
            list.forEach((el, i) => {
                if (originals[i] >= MIN_TARGET_WIDTH) {
                    overrideMaxWidth(el, `min(${Math.round(originals[i] * factor)}px, 100%)`);
                }
            });
        }
    }

    // 要素にもともとあったインライン max-width を壊さないよう、上書き前の値を記録して復元する
    function overrideMaxWidth(el, value) {
        if (!el.dataset.gxOver) {
            el.dataset.gxOver = '1';
            el.dataset.gxInline = el.style.getPropertyValue('max-width');
            el.dataset.gxInlinePrio = el.style.getPropertyPriority('max-width');
        }
        el.style.setProperty('max-width', value, 'important');
    }

    function restoreMaxWidth(el) {
        if (!el.dataset.gxOver) return;
        if (el.dataset.gxInline) el.style.setProperty('max-width', el.dataset.gxInline, el.dataset.gxInlinePrio);
        else el.style.removeProperty('max-width');
        delete el.dataset.gxOver;
        delete el.dataset.gxInline;
        delete el.dataset.gxInlinePrio;
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

    // 幅の調整中は、新しい回答が追加されたり画面サイズが変わったときに再適用する
    let timer = null;
    function scheduleWidth() {
        if (state.width === WIDTH_DEFAULT) return;
        clearTimeout(timer);
        timer = setTimeout(applyWidth, 800);
    }

    const observer = new MutationObserver(mutations => {
        if (document.hidden || state.width === WIDTH_DEFAULT) return;
        const panel = document.getElementById('gemini-view-controls');
        if (panel && mutations.every(m => panel.contains(m.target))) return;
        scheduleWidth();
    });

    (async function init() {
        const saved = await ns.storageGet(KEY, {});
        state.font = Number.isInteger(saved.font) && FONT_STEPS[saved.font] ? saved.font : FONT_DEFAULT;
        state.width = Number.isInteger(saved.width) && WIDTH_STEPS[saved.width] ? saved.width : WIDTH_DEFAULT;
        createPanel();
        applyFont();
        applyWidth();
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', scheduleWidth);
        setTimeout(applyWidth, 1500); // 初回描画後にもう一度
    })();
})();
