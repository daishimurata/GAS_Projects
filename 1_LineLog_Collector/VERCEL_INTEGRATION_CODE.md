# Vercel既存システムへの追加コード

## 📋 概要
既存システム（`api/lineworks-callback-redis-v2.js`）にGAS転送機能を追加します。

---

## 🔧 追加するコード

### ステップ1: GAS_WEBHOOK_URLを環境変数に追加

Vercelプロジェクトの環境変数に以下を追加：

```
GAS_WEBHOOK_URL=（GASのデプロイURLをここに設定）
```

---

### ステップ2: `api/lineworks-callback-redis-v2.js` に転送処理を追加

以下のコードを **229行目付近（「日报」メッセージ保存後）** に追加：

```javascript
    // 「日报」トークルームからのメッセージのみ保存
    if (messageData.isFromReportRoom && messageData.sender.type === 'user') {
      await saveMessageToRedis(messageData);
      
      console.log('日報メッセージ保存完了 (Redis v2):', {
        messageId: messageData.messageId,
        sender: messageData.sender.displayName,
        text: messageData.content.text?.substring(0, 50) + '...'
      });
      
      // ===== ここから追加 =====
      // GASへの転送（バックアップ＋Google統合）
      if (process.env.GAS_WEBHOOK_URL) {
        try {
          const gasResponse = await fetch(process.env.GAS_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              source: 'vercel',
              messageData: messageData,
              timestamp: new Date().toISOString()
            })
          });
          
          if (gasResponse.ok) {
            console.log('✅ GAS転送成功:', messageData.messageId);
          } else {
            console.log('⚠️ GAS転送失敗:', gasResponse.status, await gasResponse.text());
          }
        } catch (gasError) {
          console.log('⚠️ GAS転送エラー（継続）:', gasError.message);
          // エラーでも処理は継続（GAS障害時もRedis保存は維持）
        }
      }
      // ===== ここまで追加 =====
    }
```

---

## 📝 完全な修正版コード（参考）

```javascript
    // 「日报」トークルームからのメッセージのみ保存
    if (messageData.isFromReportRoom && messageData.sender.type === 'user') {
      await saveMessageToRedis(messageData);
      
      console.log('日報メッセージ保存完了 (Redis v2):', {
        messageId: messageData.messageId,
        sender: messageData.sender.displayName,
        text: messageData.content.text?.substring(0, 50) + '...'
      });
      
      // GASへの転送（バックアップ＋Google統合）
      if (process.env.GAS_WEBHOOK_URL) {
        try {
          const gasResponse = await fetch(process.env.GAS_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              source: 'vercel',
              messageData: messageData,
              timestamp: new Date().toISOString()
            })
          });
          
          if (gasResponse.ok) {
            console.log('✅ GAS転送成功:', messageData.messageId);
          } else {
            console.log('⚠️ GAS転送失敗:', gasResponse.status, await gasResponse.text());
          }
        } catch (gasError) {
          console.log('⚠️ GAS転送エラー（継続）:', gasError.message);
          // エラーでも処理は継続（GAS障害時もRedis保存は維持）
        }
      }
    }

    // Webhook応答（LINE WORKS公式仕様: 常に200 OKを返す）
    res.status(200).end();
```

---

## 🚀 デプロイ手順

### 1. GAS側の準備

```bash
# Apps Scriptで実行
getGASWebhookUrl()
```

表示されたURLをコピー

### 2. Vercel環境変数設定

```bash
cd /Users/muratafutoshishi/Documents/DaishiVault/shift-lineworks-api

# 環境変数を追加
vercel env add GAS_WEBHOOK_URL
# プロンプトでURLを入力
# Environment: Production

# または.env.productionファイルに追加
echo "GAS_WEBHOOK_URL=（GASのURL）" >> .env.production
```

### 3. コード修正

```bash
# api/lineworks-callback-redis-v2.js を編集
# 上記のコードを追加
```

### 4. デプロイ

```bash
# 本番環境にデプロイ
vercel --prod

# デプロイ完了後、URLが表示される
# 動作確認
curl https://shift-lineworks-k2wo299u6-daishimuratas-projects.vercel.app/api/health
```

---

## ✅ 動作確認

### 1. GAS側でテスト

```javascript
testVercelIntegration()
```

### 2. 実際のメッセージで確認

LINE WORKSの「日报」ルームにメッセージを送信：
```
テスト: Vercel-GAS統合確認
```

### 3. ログ確認

**Vercel側:**
```bash
vercel logs
# ✅ GAS転送成功: msg_xxx が表示されればOK
```

**GAS側:**
```
Apps Script実行ログ
# ✅ メッセージ保存: が表示されればOK
```

---

## 🎯 期待される結果

```
LINE WORKS「日报」にメッセージ
      ↓
Vercel (Redis保存)
      ↓
GAS (スプレッドシート保存)
      ↓
両方に保存完了！
```

---

## 🔧 トラブルシューティング

### エラー: `GAS_WEBHOOK_URL is not defined`
→ Vercel環境変数を設定してください

### エラー: `GAS転送失敗: 403`
→ GASのデプロイ設定で「アクセス権限: 全員」を確認

### エラー: `fetch is not defined`
→ Node.js 18以上を使用しているか確認（vercel.jsonで指定）

---

## 📊 監視・メンテナンス

### 定期確認コマンド

```javascript
// GAS側で統計確認
getVercelIntegrationStats()

// 結果例:
// 総メッセージ数: 150件
// Vercel経由: 150件
// 直接保存: 0件
```

### 過去データ移行

```javascript
// 過去7日分のデータを一括取得
fetchHistoricalDataFromVercel(7)
```

---

## 🎉 完成！

これで以下が実現します：

✅ 既存システム（Vercel + Redis）はそのまま動作  
✅ 新しいメッセージは自動的に両方に保存  
✅ 過去データもGoogleに移行可能  
✅ Google側で一元管理・Gemini連携  
✅ 既存システムはバックアップとして機能  

完璧な二重化システムの完成です！ 🌻

