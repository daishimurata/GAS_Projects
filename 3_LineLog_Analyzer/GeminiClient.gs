/**
 * Gemini API クライアント
 */
class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey || PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  /**
   * テキスト生成リクエスト
   * @param {string} prompt プロンプト
   * @param {string} model モデル名
   * @return {string} 生成されたテキスト
   */
  generateContent(prompt, model = 'gemini-1.5-pro-latest') {
    if (!this.apiKey) {
      throw new Error('Gemini API Key is not set.');
    }

    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;
    
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
        throw new Error(`Gemini API Error (${responseCode}): ${responseText}`);
      }

      const data = JSON.parse(responseText);
      
      if (data.candidates && data.candidates.length > 0) {
        return data.candidates[0].content.parts[0].text;
      } else {
        return '';
      }
      
    } catch (error) {
      console.error('Gemini API Request Failed:', error);
      throw error;
    }
  }
}






