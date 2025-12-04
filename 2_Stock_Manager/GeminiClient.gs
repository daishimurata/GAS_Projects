/**
 * Gemini API クライアント
 * 在庫管理システム用
 */
class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    // v1betaではなくv1を使用（最新のAPIバージョン）
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
  }

  /**
   * 利用可能なモデル一覧を取得（デバッグ用）
   * @return {Array} 利用可能なモデルリスト
   */
  listModels() {
    if (!this.apiKey) {
      throw new Error('Gemini API Key is not set. Please set GEMINI_API_KEY in Script Properties.');
    }

    const url = `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`;
    
    try {
      const response = UrlFetchApp.fetch(url);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      if (responseCode !== 200) {
        logError(`ListModels API Error (${responseCode})`, new Error(responseText));
        return [];
      }

      const data = JSON.parse(responseText);
      return data.models || [];
      
    } catch (error) {
      logError('ListModels API Request Failed', error);
      return [];
    }
  }

  /**
   * テキスト生成リクエスト
   * @param {string} prompt プロンプト
   * @param {string} model モデル名（デフォルト: gemini-2.5-pro）
   * @return {string} 生成されたテキスト
   */
  generateContent(prompt, model = 'gemini-2.5-pro') {
    if (!this.apiKey) {
      throw new Error('Gemini API Key is not set. Please set GEMINI_API_KEY in Script Properties.');
    }

    // モデル名からmodels/プレフィックスを除去（ある場合）
    const modelName = model.replace(/^models\//, '');
    const url = `${this.baseUrl}/${modelName}:generateContent?key=${this.apiKey}`;
    
    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      if (responseCode !== 200) {
        logError(`Gemini API Error (${responseCode})`, new Error(responseText));
        throw new Error(`Gemini API Error (${responseCode}): ${responseText}`);
      }

      const data = JSON.parse(responseText);
      
      if (data.candidates && data.candidates.length > 0) {
        return data.candidates[0].content.parts[0].text;
      } else {
        logWarning('Gemini API returned no candidates');
        return '';
      }
      
    } catch (error) {
      logError('Gemini API Request Failed', error);
      throw error;
    }
  }
}

