// content.js からのダウンロード要求を受け取り、「名前を付けて保存」ウィンドウを表示
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'download_code') {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename,
            saveAs: true // ★ これで必ず「保存場所の選択ダイアログ」が表示されます
        });
    }
});
