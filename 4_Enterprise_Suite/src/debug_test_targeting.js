/**
 * debug_test_targeting.js
 * ターゲティング改善（AI版）の動作を検証するためのスクリプト。
 */

function debug_runTargetingTest() {
    const enricher = new ChatDataEnricher();
    const logger = new ChatLoggerService();
    const channelId = 'debug_channel_001';
    const staffId = 'staff_001';

    // テスト1: 複数名が登場する長文
    console.log('=== Test 1: Multiple Mentions (Long Message) ===');
    const text1 = `おひさま工房は、ちえさんは今日娘さんと一緒だった。
ゆりかさん、ちえさん、しゅうたくんがすごく楽しそうに話していた。
さゆりちゃんの血圧計の件、ご自宅へ配達完了しました！`;

    const result1 = enricher.analyzeMention(text1, channelId);
    console.log('Detected Names:', result1.all_mentions.map(m => `${m.name_in_text} -> ${m.identified_name} (${m.status})`));
    console.log('Needs Asking:', result1.needs_asking);

    // テスト2: コンテキスト推論（名前なしメッセージ）
    console.log('\n=== Test 2: Contextual Inference (No Name) ===');
    // 直前が「ちえさん」の話だったと仮定
    PropertiesService.getScriptProperties().setProperty(`last_target_${channelId}`, '一号舘ちえ');
    const text2 = "娘さんと会えたからかすごく明るく楽しそうだった。終始テンションが高かった。";

    const result2 = enricher.analyzeMention(text2, channelId);
    console.log('Identified Name (from context):', result2.all_mentions.map(m => m.identified_name));

    // テスト3: スタッフによる訂正メッセージの解析
    console.log('\n=== Test 3: Correction Reply Analysis ===');
    // 「恭平」の件で問いかけ中と仮定
    PropertiesService.getScriptProperties().setProperty(`question_pending_${staffId}`, 'msg_id_999');
    const replyText = "恭平は佐藤恭平のことだよ。あ、あと秀太も一緒だった。";

    console.log('Processing staff reply:', replyText);
    // 注意: 実際にBigQueryを叩くため、テスト環境のデータセット/テーブルが存在することを確認してください
    try {
        logger._handleConfirmationResponse(replyText, staffId, channelId);
    } catch (e) {
        console.log('Note: BigQuery Update skipped or failed in debug (as expected if table missing):', e.message);
    }
}

/**
 * 名簿の取得状況を確認
 */
function debug_checkRegistry() {
    const registry = new UserRegistry();
    const people = registry.getAllPeople();
    console.log(`Users: ${people.users.length}`);
    console.log(`Staff: ${people.staff.length}`);
    if (people.staff.length > 0) {
        console.log('Staff Sample:', people.staff[0]);
    }
}
