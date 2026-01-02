/**
 * FixStoreMaster.js
 * 一号館の店舗名を「ときわ店」（ひらがな）に統一し、古いデータをクレンジングする。
 */
function fixStoreMasterUnification() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const storeTable = 'store_master';
    const salesTable = Config.BIGQUERY.TABLES.SALES;

    console.log('--- Starting Store Master Unification ---');

    // 1. 旧マスタ（漢字）の削除
    const deleteSql = `DELETE FROM \`${datasetId}.${storeTable}\` WHERE store_name = '一号舘 常盤店'`;
    try {
        bq.runQuery(deleteSql);
        console.log('✅ Deleted old store master: 一号舘 常盤店');
    } catch (e) {
        console.error('Delete failed:', e);
    }

    // 2. 新マスタ（ひらがな）のキーワード更新
    // 旧マスタのキーワードも含めて統合する
    const allKeywords = [
        '一号舘', '一号館', '1号館', '桑名ひだまり', '桑名ひだまり店',
        '一号舘PLUS', '一号舘PLUS桑名ひだまり店', '㈱一号舘', '(株)一号舘', '（株）一号舘',
        '一号舘常盤店', '一号舘 ときわ', '一号館 ときわ', 'ときわ店',
        '一号舘PLUSときわ店', '㈱一号舘　ときわ店', '1号館ときわ', '1号館ときわ店'
    ];
    const updateMasterSql = `
    UPDATE \`${datasetId}.${storeTable}\`
    SET keywords = [${allKeywords.map(k => `'${k}'`).join(',')}]
    WHERE store_name = '一号舘 ときわ店'
  `;
    try {
        bq.runQuery(updateMasterSql);
        console.log('✅ Updated keywords for: 一号舘 ときわ店');
    } catch (e) {
        console.error('Update master failed:', e);
    }

    // 3. 既存売上データの名称変更（名寄せ）
    const updateSalesSql = `
    UPDATE \`${datasetId}.${salesTable}\`
    SET store_name = '一号舘 ときわ店'
    WHERE store_name = '一号舘 常盤店' 
       OR store_name LIKE '一号舘%' 
       OR store_name LIKE '一号館%' 
       OR store_name LIKE '1号館%'
  `;
    try {
        bq.runQuery(updateSalesSql);
        console.log('✅ Normalized existing sales transactions to: 一号舘 ときわ店');
    } catch (e) {
        console.error('Update sales failed:', e);
    }

    console.log('--- Unification Finished ---');
}
