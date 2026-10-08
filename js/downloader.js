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

        const extMap = {
            javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
            python: 'py', py: 'py', html: 'html', css: 'css', json: 'json',
            bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', sql: 'sql',
            markdown: 'md', md: 'md', yaml: 'yaml', yml: 'yml', xml: 'xml',
            java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', go: 'go',
            rust: 'rs', ruby: 'rb', php: 'php', kotlin: 'kt', swift: 'swift'
        };
        const langKey = (lang.match(/[a-z0-9#+]+/) || [''])[0].replace('c#', 'csharp').replace('c++', 'cpp');
        const ext = extMap[langKey] || 'txt';

        const defaultFilename = `code_snippet.${ext}`;
        const blobUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(codeText);

        chrome.runtime.sendMessage({
            action: 'download_code',
            url: blobUrl,
            filename: defaultFilename
        });
    }, true);
})();
