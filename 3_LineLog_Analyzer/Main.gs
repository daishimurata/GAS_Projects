/**
 * LINE WORKS ログ解析・Gemini連携システム
 * メインエントリーポイント
 */

/**
 * 定期実行トリガー（1日4回推奨）
 */
function executeLogAnalysis() {
  console.log('📊 ログ解析を開始します...');
  
  try {
    const analyzer = new LogAnalyzer();
    
    // 1. 未処理のログを取得
    const logs = analyzer.fetchUnprocessedLogs();
    console.log(`未処理ログ: ${logs.length}件`);
    
    if (logs.length === 0) {
      console.log('処理対象のログはありません');
      return;
    }
    
    // 2. Geminiで解析・構造化
    const structuredData = analyzer.analyzeWithGemini(logs);
    console.log(`解析完了: ${structuredData.length}件`);
    
    // 3. 結果を保存
    analyzer.saveResults(structuredData);
    console.log('✅ 保存完了');
    
  } catch (error) {
    console.error('ログ解析エラー:', error);
    throw error;
  }
}






