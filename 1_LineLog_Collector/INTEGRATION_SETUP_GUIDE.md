# 🌻 おひさま農園 LINE WORKS完全統合システム セットアップガイド

## 🎯 システム構成

```
LINE WORKS Bot「日向」
        ↓
【既存システム（Vercel + Redis）】← メインハブ
        ├─→ Redis保存（既存機能）
        └─→ GAS転送（新規）
             ↓
     【Google Apps Script】
             ↓
     Googleスプレッドシート
             ↓
         Gemini AI
```

---

## ✅ 実装完了機能

### 1. カレンダー同期 ✅
- 全メンバー10名のカレンダー自動同期
- 1日4回自動実行（5:00, 10:00, 16:00, 21:00）
- 過去7日 + 未来60日

### 2. チャット統合 ✅（設定のみ必要）
- 既存システム（Vercel）経由でGoogle保存
- 過去データ取得API
- リアルタイム二重保存

---

## 🚀 セットアップ手順

### Phase 1: GAS側の準備（完了済み）

#### 1-1. Web Appデプロイ

Apps Scriptエディタで：
1. **「デプロイ」→「新しいデプロイ」**
2. 種類: **「ウェブアプリ」**
3. 説明: `LINE WORKS統合システム`
4. 実行ユーザー: **「自分」**
5. アクセス権限: **「全員」**（Vercelからアクセス可能にするため）
6. **「デプロイ」**をクリック
7. URLをコピー

#### 1-2. Webhook URLを取得

Apps Scriptで実行：

```javascript
getGASWebhookUrl()
```

または

```javascript
getWebhookUrl()
```

表示されたURLを**必ずメモ**してください。

---

### Phase 2: 過去データの移行

Apps Scriptで実行：

```javascript
// 過去7日分のデータを取得
fetchHistoricalDataFromVercel(7)
```

**期待される結果：**
```
📥 既存システムから過去データ取得開始
取得メッセージ数: XX件
✅ 保存完了: XX件
```

---

### Phase 3: Vercel側の設定

#### 3-1. 環境変数の追加

```bash
cd /Users/muratafutoshishi/Documents/DaishiVault/shift-lineworks-api

# GAS Webhook URLを環境変数に設定
vercel env add GAS_WEBHOOK_URL production
# プロンプトで Phase 1-2 でメモしたURLを入力
```

または、Vercel Webダッシュボードで：
1. Project Settings → Environment Variables
2. 新しい変数を追加:
   - Key: `GAS_WEBHOOK_URL`
   - Value: （Phase 1-2のURL）
   - Environment: `Production`

#### 3-2. コード修正

`api/lineworks-callback-redis-v2.js` の **229行目付近** に以下を追加：

```javascript
    // 「日报」トークルームからのメッセージのみ保存
    if (messageData.isFromReportRoom && messageData.sender.type === 'user') {
      await saveMessageToRedis(messageData);
      
      console.log('日報メッセージ保存完了 (Redis v2):', {
        messageId: messageData.messageId,
        sender: messageData.sender.displayName,
        text: messageData.content.text?.substring(0, 50) + '...'
      });
      
      // ===== GAS転送処理（追加）=====
      if (process.env.GAS_WEBHOOK_URL) {
        try {
          const gasResponse = await fetch(process.env.GAS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: 'vercel',
              messageData: messageData,
              timestamp: new Date().toISOString()
            })
          });
          
          if (gasResponse.ok) {
            console.log('✅ GAS転送成功:', messageData.messageId);
          } else {
            console.log('⚠️ GAS転送失敗:', gasResponse.status);
          }
        } catch (gasError) {
          console.log('⚠️ GAS転送エラー（継続）:', gasError.message);
        }
      }
      // ===== ここまで =====
    }
```

詳細は `VERCEL_INTEGRATION_CODE.md` を参照。

#### 3-3. Vercelへデプロイ

```bash
cd /Users/muratafutoshishi/Documents/DaishiVault/shift-lineworks-api

# 本番環境にデプロイ
vercel --prod
```

---

### Phase 4: 動作確認

#### 4-1. GAS側テスト

Apps Scriptで実行：

```javascript
testVercelIntegration()
```

**期待される結果：**
```
🧪 Vercel統合テスト
[テスト1] 過去データ取得（1日分）
結果: 取得X件、保存X件
[テスト2] Webhook受信テスト
結果: 成功
✅ 統合テスト完了
```

#### 4-2. 実際のメッセージで確認

LINE WORKSアプリで：
1. 「日报」トークルームを開く
2. テストメッセージを送信：
   ```
   テスト: システム統合確認
   ```

#### 4-3. 確認方法

**Vercelログ確認：**
```bash
cd /Users/muratafutoshishi/Documents/DaishiVault/shift-lineworks-api
vercel logs --follow
```

表示されるべきログ：
```
✅ GAS転送成功: msg_xxxxx
```

**GAS側確認：**

Apps Scriptで実行：
```javascript
getVercelIntegrationStats()
```

**期待される結果：**
```
📊 Vercel統合統計
総メッセージ数: XX件
Vercel経由: XX件
```

**スプレッドシート確認：**

Googleドライブ → `LINE WORKS統合ログ/チャットログ/マスターログ`

最新行に「テスト: システム統合確認」が表示されていればOK！

---

## 📊 運用開始後

### 定期実行（自動）

カレンダー同期は既に設定済み：
- 毎日 5:00, 10:00, 16:00, 21:00

確認：
```javascript
showNextExecution()
```

### 手動同期

必要に応じて手動実行：

```javascript
// カレンダー同期
executeCalendarSync()

// チャット同期（既存システムから取得）
fetchHistoricalDataFromVercel(1)  // 過去1日分

// 統計確認
getVercelIntegrationStats()
```

### 統計確認

```javascript
// システム全体の統計
getSystemStatistics()

// Vercel統合の統計
getVercelIntegrationStats()

// カレンダー同期状況
getCalendarSyncStatus()
```

---

## 🎯 Gemini活用

スプレッドシートURL：
```
Google Drive → LINE WORKS統合ログ/チャットログ/マスターログ
```

Geminiに共有して質問：
- 「今週の日報をまとめて」
- 「村田さんの報告内容は？」
- 「明日誰が休みですか？」

---

## 🔧 トラブルシューティング

### エラー: `GAS転送失敗: 403`

**原因:** GASのアクセス権限設定

**解決:**
1. Apps Script → デプロイ → デプロイを管理
2. アクセス権限を **「全員」** に変更
3. 再デプロイ

### エラー: `Vercel経由: 0件`

**原因:** Vercel側の転送処理が動いていない

**解決:**
1. Vercelログを確認: `vercel logs`
2. 環境変数 `GAS_WEBHOOK_URL` を確認
3. コード修正が反映されているか確認

### エラー: `メッセージが重複して保存される`

**原因:** LINE WORKS Webhook URLとVercel転送が両方動いている

**解決:**
- LINE WORKS Developer Consoleで、Bot「日向」のCallback URLが
  **Vercel URL**（`https://shift-lineworks-...vercel.app/api/lineworks-callback-redis-v2`）
  になっていることを確認
- GAS URLには設定**しない**

---

## ✅ 最終チェックリスト

- [ ] GAS Web App デプロイ完了
- [ ] GAS Webhook URL取得・メモ
- [ ] 過去データ移行完了
- [ ] Vercel環境変数設定完了
- [ ] Vercelコード修正完了
- [ ] Vercelデプロイ完了
- [ ] テストメッセージで動作確認
- [ ] Vercelログで転送成功確認
- [ ] スプレッドシートにデータ表示確認
- [ ] カレンダー同期動作確認

---

## 🎉 完成！

これで以下が実現しました：

✅ **カレンダー自動同期**（全メンバー10名）  
✅ **チャット二重保存**（Vercel + Google）  
✅ **過去データ移行**（既存システムから取得）  
✅ **Gemini連携**（スプレッドシート経由）  
✅ **自動実行**（1日4回）  
✅ **バックアップ体制**（既存システム継続）  

完璧な統合システムの完成です！ 🌻

---

**最終更新:** 2025年10月19日  
**システムバージョン:** v2.0  
**統合完了:** カレンダー + チャット（Vercel統合）

