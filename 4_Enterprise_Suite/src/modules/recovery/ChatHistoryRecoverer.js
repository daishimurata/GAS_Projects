/**
 * ChatHistoryRecoverer.js
 * LINE WORKS APIを使用して、過去のメッセージ履歴を遡及取得し、BigQueryへ保存する。
 */
class ChatHistoryRecoverer {
    constructor() {
        this.lineAuth = new LineWorksAuth();
        this.bq = getBigQueryClient();
        this.botId = Config.LINEWORKS.BOT_ID;
        this.datasetId = Config.BIGQUERY.DATASET_ID;
        this.tableId = Config.BIGQUERY.TABLES.CHAT_LOGS;
    }

    /**
     * 全監視対象チャンネルの履歴をリカバリする
     * @param {string} fromDate 開始日 (YYYY-MM-DD)
     */
    recoverAll(fromDate) {
        const channelIds = Config.LINEWORKS.MONITOR_CHANNEL_IDS;
        if (channelIds.length === 0) {
            console.error('MONITOR_CHANNEL_IDS is empty.');
            return;
        }

        console.log(`--- Starting Chat Recovery from ${fromDate} for ${channelIds.length} channels ---`);

        const startTime = new Date(fromDate).getTime();

        channelIds.forEach(channelId => {
            try {
                this.recoverChannelHistory(channelId, startTime);
            } catch (e) {
                console.error(`Failed to recover history for channel ${channelId}: ${e.message}`);
            }
        });

        console.log('--- Chat Recovery Completed ---');
    }

    /**
     * 特定のチャンネルの履歴を遡及取得する
     */
    recoverChannelHistory(channelId, startTime) {
        const token = this.lineAuth.getAccessToken();
        let messages = [];
        let before = null;
        let hasMore = true;

        console.log(`Recovering: ${channelId}`);

        while (hasMore) {
            let url = `https://www.worksapis.com/v1.0/bots/${this.botId}/channels/${channelId}/messages?count=100`;
            if (before) url += `&before=${before}`;

            const response = UrlFetchApp.fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
                muteHttpExceptions: true
            });

            if (response.getResponseCode() !== 200) {
                console.error(`API Error (${channelId}): ${response.getContentText()}`);
                break;
            }

            const data = JSON.parse(response.getContentText());
            const fetchedMessages = data.messages || [];

            if (fetchedMessages.length === 0) {
                hasMore = false;
                break;
            }

            // 期間フィルタ
            const olderMessages = fetchedMessages.filter(msg => {
                const createdTime = new Date(msg.createdTime).getTime();
                return createdTime >= startTime;
            });

            messages = messages.concat(olderMessages);

            // 取得した全メッセージが指定開始時間より古い場合は終了
            const lastMsgTime = new Date(fetchedMessages[fetchedMessages.length - 1].createdTime).getTime();
            if (lastMsgTime < startTime || fetchedMessages.length < 100) {
                hasMore = false;
            } else {
                before = fetchedMessages[fetchedMessages.length - 1].messageId;
            }

            // API負荷軽減
            Utilities.sleep(500);
        }

        if (messages.length > 0) {
            console.log(`Found ${messages.length} messages for ${channelId}. Saving to BigQuery...`);
            this._saveMessages(channelId, messages);
        } else {
            console.log(`No new messages found for ${channelId} in the given period.`);
        }
    }

    /**
     * メッセージをBigQuery形式に変換して保存
     */
    _saveMessages(channelId, messages) {
        const rows = messages.map(msg => {
            const content = msg.content || {};
            let text = '';
            if (content.type === 'text') text = content.text;
            else if (content.type === 'image') text = '[Image]';
            else text = `[${content.type}]`;

            return {
                message_id: msg.messageId,
                channel_id: channelId,
                user_id: msg.userId || 'system',
                content: text,
                content_type: content.type || 'unknown',
                created_at: new Date(msg.createdTime).toISOString(),
                sentiment_score: 0,
                keywords: [],
                ingested_at: new Date().toISOString()
            };
        });

        // 重複チェックなしでインサート（BQは後でクエリ時に重複排除するのが一般的）
        // もし厳密にやるなら、message_idでフィルタが必要
        this.bq.insertRows(this.datasetId, this.tableId, rows);
    }
}
