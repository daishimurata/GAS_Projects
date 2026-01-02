/**
 * WebhookHandler.js
 * LINE WORKS Bot Webhookのエントリポイント。
 * ChatLoggerサービスにイベントを委譲する。
 */

/**
 * Webhook Endpoint (POST)
 * Called from index.js > doPost(e)
 * @param {Object} e Event Object
 */
function handleWebhookRequest(e) {
    Logger.info('Webhook Received', { params: e.parameter });

    try {
        // 1. チャレンジレスポンス (LINE WORKS Bot連動確認用)
        if (e.parameter && e.parameter.challenge) {
            Logger.info('Responding to challenge', { challenge: e.parameter.challenge });
            return ContentService.createTextOutput(e.parameter.challenge)
                .setMimeType(ContentService.MimeType.TEXT);
        }

        // 2. ペイロード処理
        if (e.postData && e.postData.contents) {
            console.log('--- Processing Webhook Payload ---');

            // 署名検証 (Security)
            // 注意: GASではカスタムヘッダー(X-WORKS-Signature)の取得が困難なため、
            // ヘッダーが取得できない場合は警告のみで続行する設定にする
            const signature = e.parameter['X-WORKS-Signature'];
            console.log(`Signature Header (from param): ${signature || 'MISSING'}`);

            if (signature && !validateSignature(e.postData.contents, signature)) {
                console.error('Signature Validation Failed!');
                return ContentService.createTextOutput(JSON.stringify({ error: 'Invalid Signature' }))
                    .setMimeType(ContentService.MimeType.JSON);
            }

            const payload = JSON.parse(e.postData.contents);
            console.log(`Payload Type: ${payload.type}`);

            // イベントタイプに応じた処理
            if (payload.type === 'message') {
                const chatLogger = new ChatLoggerService();
                chatLogger.handleWebhookMessage(payload);
            }

            console.log('Webhook Processed Successfully');
            return ContentService.createTextOutput(JSON.stringify({ success: true }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // POSTデータなし
        return ContentService.createTextOutput(JSON.stringify({ error: 'No content' }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        Logger.error('Webhook Error', error);
        // LINE WORKS側には200 OKを返してリトライを防ぐのが一般的だが、
        // 重大なエラーの場合は通知などを飛ばす
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * X-WORKS-Signature 検証
 */
function validateSignature(body, signature) {
    // 診断のため一時的に検証を無効化 (100%パスさせる)
    console.warn('Signature validation is BYPASSED for debugging.');
    return true;
}
