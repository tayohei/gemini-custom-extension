(function () {
    'use strict';

    const EXT_MAP = {
        javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
        python: 'py', py: 'py', html: 'html', css: 'css', json: 'json',
        bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', sql: 'sql',
        markdown: 'md', md: 'md', yaml: 'yaml', yml: 'yml', xml: 'xml',
        java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go',
        rust: 'rs', ruby: 'rb', php: 'php', kotlin: 'kt', swift: 'swift'
    };

    function detectExtension(lang) {
        const key = (lang.match(/[a-z0-9#+]+/) || [''])[0]
            .replace('c#', 'csharp')
            .replace('c++', 'cpp');
        return EXT_MAP[key] || 'txt';
    }

    // コードダウンロードボタンの横取り。
    // 初回のみ保存先フォルダを選び、以降は同じフォルダへ直接保存する（Shift+クリックで保存先を選び直し）。
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
        const lang = langHeader ? langHeader.textContent.trim().toLowerCase() : '';

        window.GeminiExt.saveTextFile(`code_snippet.${detectExtension(lang)}`, codeText, {
            forcePick: e.shiftKey
        });
    }, true);
})();
