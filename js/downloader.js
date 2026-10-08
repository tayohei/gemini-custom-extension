(function () {
    'use strict';

    // コードダウンロードボタンの横取り（「名前を付けて保存」を強制）
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
})();
