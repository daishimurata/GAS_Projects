/**
 * ログ解析ロジッククラス
 */
class LogAnalyzer {
  constructor() {
    this.gemini = new GeminiClient();
  }

  /**
   * 未処理のログを取得
   * @return {Array} ログデータの配列
   */
  fetchUnprocessedLogs() {
    // TODO: ログ蓄積スプレッドシートからデータを取得する処理を実装
    // ここではモックデータを返す
    return [];
  }

  /**
   * Geminiを使ってログを解析
   * @param {Array} logs ログデータの配列
   * @return {Array} 解析結果（構造化データ）
   */
  analyzeWithGemini(logs) {
    if (!logs || logs.length === 0) return [];

    const results = [];
    
    // バッチ処理（Geminiの入力制限を考慮して分割）
    const batchSize = CONFIG.ANALYSIS.BATCH_SIZE || 20;
    
    for (let i = 0; i < logs.length; i += batchSize) {
      const batch = logs.slice(i, i + batchSize);
      const prompt = this._buildPrompt(batch);
      
      try {
        const responseText = this.gemini.generateContent(prompt);
        const parsedData = this._parseResponse(responseText);
        results.push(...parsedData);
      } catch (e) {
        console.error('Batch analysis failed:', e);
      }
    }

    return results;
  }

  /**
   * 解析結果を保存
   * @param {Array} data 構造化データ
   */
  saveResults(data) {
    // TODO: 結果保存用スプレッドシートへの書き込み処理を実装
    console.log('Saving results:', data);
  }

  /**
   * プロンプト構築（内部メソッド）
   */
  _buildPrompt(logs) {
    // Geminiへの指示書を作成
    return `
あなたは介護記録の専門家です。以下のチャットログから、利用者ごとの記録を抽出してください。
出力はJSON形式でお願いします。

【ログデータ】
${JSON.stringify(logs)}

【出力フォーマット】
[
  {
    "date": "YYYY-MM-DD",
    "user_name": "利用者名",
    "category": "体調|食事|活動|予定|その他",
    "content": "詳細内容",
    "staff_name": "記録者名"
  }
]
`;
  }

  /**
   * レスポンス解析（内部メソッド）
   */
  _parseResponse(responseText) {
    try {
      // コードブロック記号(```json ... ```)を除去してJSONパース
      const jsonStr = responseText.replace(/```json\n|\n```/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('JSON Parse Error:', e);
      console.log('Raw Response:', responseText);
      return [];
    }
  }
}






