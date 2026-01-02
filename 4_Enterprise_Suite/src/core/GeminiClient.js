/**
 * GeminiClient.js
 * Google Gemini APIへのアクセスを提供するクラス。
 * Vertex AIではなく、Generative Language API (API Key) を使用する想定。
 */
class GeminiClient {
    constructor(apiKey) {
        this.apiKey = apiKey || Config.GEMINI.API_KEY;
        this.model = Config.GEMINI.MODEL;
        this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    /**
     * テキストプロンプトからコンテンツを生成する
     * @param {string} prompt プロンプト
     * @return {string} 生成されたテキスト
     */
    generate(prompt) {
        if (!this.apiKey) {
            throw new Error('Gemini API Key is not configured.');
        }

        const payload = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const url = `${this.baseUrl}?key=${this.apiKey}`;

        try {
            const response = UrlFetchApp.fetch(url, options);
            const statusCode = response.getResponseCode();
            const result = JSON.parse(response.getContentText());

            if (statusCode !== 200) {
                throw new Error(`Gemini API Error: ${result.error?.message || 'Unknown error'}`);
            }

            if (!result.candidates || result.candidates.length === 0) {
                return '';
            }

            return result.candidates[0].content.parts[0].text;
        } catch (e) {
            Logger.error('Gemini Generation Failed', e);
            throw e;
        }
    }

    /**
     * テキストとメディア（PDF/画像）からコンテンツを生成する
     * @param {string} prompt プロンプト
     * @param {Blob[]} blobs メディアファイルのBlob配列
     * @return {string} 生成されたテキスト
     */
    generateWithMedia(prompt, blobs) {
        if (!this.apiKey) throw new Error('Gemini API Key is not configured.');

        const parts = [{ text: prompt }];

        blobs.forEach(blob => {
            const base64 = Utilities.base64Encode(blob.getBytes());
            parts.push({
                inline_data: {
                    mime_type: blob.getContentType(),
                    data: base64
                }
            });
        });

        const payload = {
            contents: [{ parts: parts }]
        };

        const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const url = `${this.baseUrl}?key=${this.apiKey}`;

        try {
            const response = UrlFetchApp.fetch(url, options);
            const result = JSON.parse(response.getContentText());
            if (response.getResponseCode() !== 200) {
                throw new Error(`Gemini API Error: ${result.error?.message}`);
            }
            return result.candidates[0].content.parts[0].text;
        } catch (e) {
            Logger.error('Gemini Media Generation Failed', e);
            throw e;
        }
    }

    /**
     * JSONフォーマットでの出力を期待してパースする
     * @param {string} prompt プロンプト
     * @param {Blob[]} blobs メディアファイルのBlob配列 (Optional)
     * @return {Object} パースされたJSONオブジェクト
     */
    generateJson(prompt, blobs = []) {
        // JSON出力を強制するインストラクションを追加
        const jsonPrompt = `${prompt}\n\nOutput strictly in valid JSON format without Markdown code blocks. Ensure all keys and string values are enclosed in double quotes. Do not include trailing commas. Escape newlines in strings.`;

        let text;
        if (blobs && blobs.length > 0) {
            text = this.generateWithMedia(jsonPrompt, blobs);
        } else {
            text = this.generate(jsonPrompt);
        }

        try {
            // Markdownブロック記号の除去
            let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            // よくあるエラー: 末尾のカンマ削除 (簡易的)
            cleanText = cleanText.replace(/,(\s*[\}\]])/g, '$1');
            // 閉じカッコ補完 (簡易的 - 末尾が } で終わってなければつける)
            if (!cleanText.endsWith('}')) {
                const openBraces = (cleanText.match(/\{/g) || []).length;
                const closeBraces = (cleanText.match(/\}/g) || []).length;
                if (openBraces > closeBraces) {
                    cleanText += '}'.repeat(openBraces - closeBraces);
                }
            }

            return JSON.parse(cleanText);
        } catch (e) {
            Logger.error('Failed to parse Gemini JSON output', { text: text, error: e });
            return null;
        }
    }

    /**
     * 利用可能なモデル一覧を取得する
     */
    listModels() {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
        const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        return JSON.parse(res.getContentText());
    }
}

function getGeminiClient() {
    return new GeminiClient();
}
