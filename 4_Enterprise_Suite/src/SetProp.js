function setReportChannel() {
    PropertiesService.getScriptProperties().setProperty('REPORT_CHANNEL_ID', '2ddfe141-b9d5-6c2a-8027-43e009a916bc');
    console.log('✅ REPORT_CHANNEL_ID updated to 2ddfe141-b9d5-6c2a-8027-43e009a916bc');
}

/**
 * 新しいGemini APIキーを設定する
 */
function setGeminiKey() {
    const newKey = 'AIzaSyA71N8Tr5x4w6S6gMo5EiQGfd2cHHfumxE';
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', newKey);
    console.log('✅ GEMINI_API_KEY has been updated to the new key.');
}
