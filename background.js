chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'download_code') {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename,
            saveAs: true // 必ず「保存場所の選択ダイアログ」を表示
        });
    }
});
