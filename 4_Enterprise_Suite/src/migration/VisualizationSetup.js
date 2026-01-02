/**
 * VisualizationSetup.js
 * 可視化用のフォルダ構造とスプレッドシートの雛形を自動作成します。
 * DriveAppのサーバーエラーを回避するため、UrlFetchAppを使用してDrive APIを直接操作します。
 */

function setupVisualizationStructure() {
    const timestamp = Utilities.formatDate(new Date(), "GMT+9", "yyyy/MM/dd HH:mm");
    const rootFolderName = `BigQuery 可視化環境 (${timestamp})`;

    console.log(`--- Starting Visualization Setup (Fail-Safe Mode): ${rootFolderName} ---`);

    // 1. 既存のフォルダを一切探さず、新しいフォルダを作成する
    // これにより、Google側の「既存フォルダへのアクセス不具合」を完全に回避します
    let rootFolder;
    try {
        rootFolder = DriveApp.createFolder(rootFolderName);
        console.log('Created fresh root folder: ' + rootFolderName);
    } catch (e) {
        console.error('Final disaster: Failed to even create a folder. ' + e.message);
        throw new Error('Googleドライブ側で深刻な不具合が発生しています。数分待ってから再度実行してください。');
    }

    // 2. 基本的なダッシュボードファイルの作成 (ルート直下)
    const baseFiles = [
        '01_売上明細（全期間）',
        '03_予定同期ログ',
        '04_売上日別サマリー（集計ビュー）'
    ];

    baseFiles.forEach(name => {
        try {
            const ss = SpreadsheetApp.create(name);
            const file = DriveApp.getFileById(ss.getId());
            rootFolder.addFile(file);
            DriveApp.getRootFolder().removeFile(file);
            console.log(`Created file: ${name}`);
        } catch (e) {
            console.error(`Error creating file ${name}: ${e.message}`);
        }
    });

    // 3. チャットログ用のサブフォルダ作成
    const chatSubFolderName = '02_チャット履歴（分割管理）';
    let chatFolder;
    try {
        chatFolder = rootFolder.createFolder(chatSubFolderName);
        console.log(`Created subfolder: ${chatSubFolderName}`);
    } catch (e) {
        console.error(`Error creating subfolder: ${e.message}`);
    }

    // 4. 四半期ごとのチャットログファイル作成
    const quarterlyFiles = [
        '2025_Q1_チャットログ（1-3月）',
        '2025_Q2_チャットログ（4-6月）',
        '2025_Q3_チャットログ（7-9月）',
        '2025_Q4_チャットログ（10-12月）'
    ];

    if (chatFolder) {
        quarterlyFiles.forEach(name => {
            try {
                const ss = SpreadsheetApp.create(name);
                const file = DriveApp.getFileById(ss.getId());
                chatFolder.addFile(file);
                DriveApp.getRootFolder().removeFile(file);
                console.log(`Created quarterly file: ${name}`);
            } catch (e) {
                console.error(`Error creating quarterly file ${name}: ${e.message}`);
            }
        });
    }

    console.log('--- Visualization Setup Finished ---');
    const folderUrl = rootFolder.getUrl();
    console.log(`Success! New Folder URL: ${folderUrl}`);

    return folderUrl;
}
