/**
 * LineWorksAuth.js
 * LINE WORKS API v2.0 (JWT) 認証を管理するクラス。
 */
class LineWorksAuth {
    constructor() {
        this.clientId = Config.LINEWORKS.CLIENT_ID;
        this.clientSecret = Config.LINEWORKS.CLIENT_SECRET;
        this.serviceAccount = Config.LINEWORKS.SERVICE_ACCOUNT;
        this.privateKey = Config.LINEWORKS.PRIVATE_KEY;
        this.tokenEndpoint = 'https://auth.worksmobile.com/oauth2/v2.0/token';
    }

    /**
     * アクセストークンを取得する（キャッシュ対応）
     * @param {string} scope 必要なスコープ (bot, calendarなど)
     * @return {string} Access Token
     */
    getAccessToken(scope = 'bot') {
        const cacheKey = `lw_token_${scope}`; // Scopeごとにキャッシュ
        const cache = CacheService.getScriptCache();
        const cachedToken = cache.get(cacheKey);

        if (cachedToken) {
            return cachedToken;
        }

        // 新規取得
        const jwt = this.generateJWT();
        const token = this.fetchNewToken(jwt, scope);

        // キャッシュ保存 (有効期限より少し短く設定)
        cache.put(cacheKey, token, 3500); // 3600秒 - バッファ

        return token;
    }

    /**
     * JWT (JSON Web Token) を生成する
     */
    generateJWT() {
        const header = {
            alg: 'RS256',
            typ: 'JWT'
        };

        const now = Math.floor(Date.now() / 1000);
        const claim = {
            iss: this.clientId,
            sub: this.serviceAccount,
            iat: now,
            exp: now + 3600
        };

        // 秘密鍵の整形 (インデントや余計な空白を除去)
        const cleanKey = this.privateKey
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');

        const encodedHeader = this._base64Url(JSON.stringify(header));
        const encodedClaim = this._base64Url(JSON.stringify(claim));

        // 署名対象文字列
        const toSign = `${encodedHeader}.${encodedClaim}`;

        // 秘密鍵で署名 (RSA-SHA256)
        const signature = Utilities.computeRsaSha256Signature(toSign, cleanKey);
        const encodedSignature = this._base64Url(signature);

        return `${toSign}.${encodedSignature}`;
    }

    /**
     * Base64URL Encoding helper
     * @param {string|byte[]} data
     */
    _base64Url(data) {
        let base64;
        if (typeof data === 'string') {
            base64 = Utilities.base64Encode(data, Utilities.Charset.UTF_8);
        } else {
            base64 = Utilities.base64Encode(data);
        }
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /**
     * APIを叩いてトークンを取得
     */
    fetchNewToken(jwt, scope) {
        const payload = {
            assertion: jwt,
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            scope: scope
        };

        const options = {
            method: 'post',
            payload: payload,
            muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(this.tokenEndpoint, options);
        const result = JSON.parse(response.getContentText());

        if (result.error) {
            console.error('Token Fetch Error:', result);
            throw new Error(`LINE WORKS Auth Failed: ${result.error_description}`);
        }

        return result.access_token;
    }
}

/**
 * 簡易アクセサ
 */
function getLineWorksToken(scope) {
    return new LineWorksAuth().getAccessToken(scope);
}
