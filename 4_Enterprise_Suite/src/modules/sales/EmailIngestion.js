/**
 * EmailIngestion.js
 * 売上報告メールを取得し、解析して構造化データを返すモジュール。
 */
class SalesEmailIngestionService {
    constructor() {
        this.gemini = getGeminiClient();
        // 検索クエリ: Gmailラベル「直売所売上」配下を指定
        this.searchQuery = Config.GMAIL.SEARCH_QUERY;
        // 重複はBigQueryへの保存時に insertId または excludedIds によって制御される
    }

    /**
     * 未処理の売上メールを処理する
     * @param {string} customQuery 省略時はデフォルトのクエリを使用
     * @param {Array<string>} excludedIds 既に処理済みとしてスキップするメールIDのリスト
     * @param {number} maxThreads 走査する最大スレッド数 (デフォルト2000)
     * @param {number} maxSuccessCount 1回の実行で解析する最大数 (デフォルト50) -> 重すぎて止まるのを防ぐ
     * @return {Array<Object>} 解析された売上データの配列
     */
    processNewEmails(customQuery = null, excludedIds = [], maxThreads = 2000, maxSuccessCount = 50) {
        const query = customQuery || this.searchQuery;
        Logger.info(`Starting email ingestion with query: ${query} (limitThreads: ${maxThreads}, limitAI: ${maxSuccessCount})`);

        let start = 0;
        const batchSize = 100;
        const results = [];
        const excludedSet = new Set(excludedIds);
        let skippedCount = 0;

        while (start < maxThreads && results.length < maxSuccessCount) {
            const threads = GmailApp.search(query, start, batchSize);
            if (!threads || threads.length === 0) break;

            Logger.info(`Scanning threads ${start} to ${start + threads.length}... (Processed: ${results.length}, Skipped: ${skippedCount})`);

            try {
                for (let i = 0; i < threads.length; i++) {
                    if (results.length >= maxSuccessCount) break;

                    const messages = threads[i].getMessages();
                    for (let j = 0; j < messages.length; j++) {
                        const message = messages[j];
                        const messageId = message.getId();

                        // 1. 指定された除外リストにある場合はスキップ
                        if (excludedSet.has(messageId)) {
                            skippedCount++;
                            continue;
                        }

                        // 2. 通常時は未読のみ
                        if (!customQuery && !message.isUnread() && excludedIds.length === 0) continue;

                        const emailData = {
                            id: messageId,
                            date: message.getDate(),
                            email_time: message.getDate().toISOString(),
                            subject: message.getSubject(),
                            from: message.getFrom(),
                            body: message.getPlainBody()
                        };

                        // Geminiで解析 (ここが重いため、小刻みに処理)
                        Logger.info(`[AI Analyze] Parsing email: ${emailData.subject} (${emailData.date})`);
                        const salesData = this._analyzeEmailWithGemini(emailData);
                        if (salesData && salesData.reports && salesData.reports.length > 0) {
                            results.push({
                                source: emailData,
                                data: salesData
                            });
                        }

                        message.markRead();
                        if (results.length >= maxSuccessCount) break;
                    }
                }
            } catch (e) {
                Logger.error(`Error during email processing at start index ${start}`, e);
                if (e.message.includes('Limit exceeded')) break;
            }

            start += batchSize;
            if (threads.length < batchSize) break;
        }

        Logger.info(`Scan finished. Found ${results.length} new entries. (Scanned threads: ${start}, Total skipped: ${skippedCount})`);
        return results;
    }

    /**
     * 指定された日付以降のメールを再取得して取り込む（バックフィル）
     * @param {string} dateStr 'YYYY/MM/DD' 形式
     */
    runBackfill(dateStr) {
        // ラベル絞り込み ＋ 日付指定のバックフィル用クエリ
        const backfillQuery = `(${Config.GMAIL.SEARCH_QUERY}) after:${dateStr}`;
        return this.processNewEmails(backfillQuery);
    }

    /**
     * Geminiを使用してメール本文から売上情報を抽出する
     */
    _analyzeEmailWithGemini(emailData) {
        const prompt = `
You are a sales data extractor specializing in agricultural sales reports from multiple Japanese supermarkets.
Extract all store names, sales dates, sales amounts, and item breakdowns from the following email.

Email Context:
Subject: ${emailData.subject}
From: ${emailData.from}
Timestamp: ${emailData.date}
Body Content:
${emailData.body.substring(0, 4000)}

Requirements:
1. Identify ALL stores mentioned. Some emails (like "Shikisai") may contain reports for multiple locations (e.g., Oayachi, Seibu, Obira) in one message.
2. For each store, extract the date (YYYY-MM-DD), item names, quantities, and amounts.
3. Handle various formats:
   - "Midori no Daichi": Items listed with quantity (点) and amount (円).
   - "Ichigokan": Table format with "単価", "点数", "売上金額".
   - "Shikisai": List format with "@Price Quantity Amount".
   - **"A-Coop" (Aコープ/エーコープ)**: Often sent as a simple text summary or attached PDF context. If you find text like "売上報告" and "Aコープ", extract the "売上金額" as 'total_sales_amount' even if item details are missing. Store name should be "Aコープ [Branch Name]" or just "Aコープ".
4. If an item total is mentioned as "小計" or "合計", use it as 'total_sales_amount' for that store if individual items are missing, or as a validation check.

Output ONLY a JSON object with this structure:
{
  "reports": [
    {
      "date": "YYYY-MM-DD",
      "store_name": "Full Store Name (including branch)",
      "total_sales_amount": 12345,
      "items": [
        { "item_name": "Item Name", "quantity": 10, "amount": 2000 }
      ],
      "note": "Optional context"
    }
  ]
}
`;
        const result = this.gemini.generateJson(prompt);
        // 後方互換性のため、reportsがない場合は空配列を返すか、古い形式をラップする
        if (result && result.reports) return result;
        if (result && result.store_name) return { reports: [result] }; // 旧形式対応
        return result;
    }
}
