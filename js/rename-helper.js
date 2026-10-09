(function () {
    'use strict';

    // 「このチャットの名前を変更する」ダイアログに、既存ラベルのボタンを表示する。
    // ボタンを押すと、入力欄の先頭ラベルを置き換える（ラベルなし＝ラベル削除）。

    const ns = window.GeminiExt;
    const DIALOG_SELECTOR = '[role="dialog"], mat-dialog-container, .cdk-overlay-pane';
    const INPUT_SELECTOR = 'input[type="text"], input:not([type]), textarea';

    function setInputValue(input, value) {
        const proto = Object.getPrototypeOf(input);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
        // Angular(Material)のフォームに変更を伝える
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(value.length, value.length);
    }

    function buildChips(input) {
        const box = document.createElement('div');
        box.className = 'gx-rename-chips';

        const label = document.createElement('div');
        label.className = 'gx-rename-label';
        label.textContent = 'ラベルを選択（タイトル先頭に付けます）';
        box.appendChild(label);

        const row = document.createElement('div');
        row.className = 'gx-chips';

        const apply = prefix => {
            const rest = ns.stripLabelPrefix(input.value.trim());
            setInputValue(input, prefix ? prefix + rest : rest);
        };

        const addChip = (text, prefix, hue, title) => {
            const chip = document.createElement('button');
            chip.type = 'button'; // ダイアログのsubmitにならないように
            chip.className = 'gx-chip';
            chip.textContent = text;
            if (title) chip.title = title;
            if (hue !== undefined) chip.style.setProperty('--gx-hue', hue);
            chip.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                apply(prefix);
            });
            row.appendChild(chip);
        };

        const labels = ns.getLabelPrefixes ? ns.getLabelPrefixes() : [];
        labels.forEach(l => addChip(l.prefix, l.prefix, ns.hueOfLabel(l.category), `${l.count}件で使用中`));
        addChip('ラベルなし', '', undefined, 'ラベルを外す');

        box.appendChild(row);
        return box;
    }

    function tryInject(dialog, attempt = 0) {
        const input = dialog.querySelector(INPUT_SELECTOR);
        // 外側のdialog/overlay要素が複数ヒットしても1回だけ挿入するよう、入力欄側で重複を判定する
        if (input && input.dataset.gxRename) return;
        const isRename = /名前を変更|Rename/i.test(dialog.textContent || '');
        if (!input || !isRename) {
            // 入力欄の描画待ち（最大 ~0.5秒）
            if (attempt < 10) setTimeout(() => tryInject(dialog, attempt + 1), 50);
            return;
        }

        input.dataset.gxRename = '1';
        const chips = buildChips(input);
        // 入力欄は横並び(flex)の行に入っているため、その行の外側（次の行）に挿入する
        const anchor = input.closest('.title-input-row')
            || input.closest('mat-form-field, .mat-mdc-form-field')
            || input;
        anchor.insertAdjacentElement('afterend', chips);
    }

    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.matches(DIALOG_SELECTOR)) tryInject(node);
                else node.querySelectorAll(DIALOG_SELECTOR).forEach(d => tryInject(d));
            }
        }
    });

    // ダイアログは body 直下の overlay に追加されるため、直下の追加だけを見れば足りる
    observer.observe(document.body, { childList: true, subtree: true });
})();
