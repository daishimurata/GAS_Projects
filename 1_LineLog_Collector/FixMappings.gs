/**
 * イベントマッピングの修正
 */

/**
 * イベントマッピングを全削除
 */
function clearAllEventMappings() {
  Logger.log('===== イベントマッピングクリア開始 =====');
  
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  let count = 0;
  
  Object.keys(allProps).forEach(key => {
    if (key.startsWith('eventMapping_')) {
      props.deleteProperty(key);
      count++;
    }
  });
  
  Logger.log(`✅ ${count}件のイベントマッピングを削除しました`);
  Logger.log('===== クリア完了 =====');
}

/**
 * イベントマッピングの状態を確認
 */
function checkEventMappings() {
  Logger.log('===== イベントマッピング確認 =====');
  
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const mappings = {};
  
  Object.keys(allProps).forEach(key => {
    if (key.startsWith('eventMapping_')) {
      mappings[key] = allProps[key];
    }
  });
  
  Logger.log(`マッピング数: ${Object.keys(mappings).length}`);
  
  if (Object.keys(mappings).length > 0) {
    Logger.log('\n最初の10件:');
    Object.keys(mappings).slice(0, 10).forEach(key => {
      Logger.log(`  ${key}: ${mappings[key]}`);
    });
  }
  
  Logger.log('===== 確認完了 =====');
}

