/**
 * カレンダー取得のデバッグ
 */

function debugCalendarOwnership() {
  Logger.log('===== カレンダー所有者情報デバッグ =====');
  
  try {
    const users = getLineWorksUserList();
    Logger.log(`メンバー数: ${users.length}`);
    
    const calendarMap = {}; // calendarId -> [所有者リスト]
    
    users.slice(0, 3).forEach((user, index) => {
      const displayName = `${user.userName.lastName || ''} ${user.userName.firstName || ''}`.trim();
      Logger.log(`\n[${index + 1}] ${displayName} (${user.userId})`);
      
      try {
        const calendars = getLineWorksUserCalendars(user.userId);
        Logger.log(`  カレンダー数: ${calendars.length}`);
        
        calendars.forEach((cal, idx) => {
          Logger.log(`  [${idx + 1}] カレンダーID: ${cal.calendarId}`);
          Logger.log(`      名前: ${cal.name || cal.summary || '(名前なし)'}`);
          Logger.log(`      タイプ: ${cal.type || '不明'}`);
          Logger.log(`      所有者: ${cal.ownerId || '不明'}`);
          Logger.log(`      primary: ${cal.primary || false}`);
          Logger.log(`      プロパティ: ${Object.keys(cal).join(', ')}`);
          
          // 重複チェック
          if (!calendarMap[cal.calendarId]) {
            calendarMap[cal.calendarId] = [];
          }
          calendarMap[cal.calendarId].push(displayName);
        });
      } catch (error) {
        Logger.log(`  ❌ エラー: ${error.message}`);
      }
    });
    
    Logger.log('\n===== 重複カレンダー検出 =====');
    Object.keys(calendarMap).forEach(calId => {
      const owners = calendarMap[calId];
      if (owners.length > 1) {
        Logger.log(`⚠️ カレンダーID: ${calId}`);
        Logger.log(`   複数のユーザーで取得: ${owners.join(', ')}`);
      }
    });
    
  } catch (error) {
    Logger.log(`❌ エラー: ${error.message}`);
    Logger.log(`スタック: ${error.stack}`);
  }
  
  Logger.log('\n===== デバッグ終了 =====');
}

/**
 * 1人のカレンダー情報を詳細表示
 */
function debugSingleUserCalendars() {
  Logger.log('===== 単一ユーザーのカレンダー詳細 =====');
  
  try {
    const userId = CONFIG.NOTIFICATION.ADMIN_USER_ID;
    Logger.log(`ユーザーID: ${userId}`);
    
    const token = getAccessToken();
    const url = `${CONFIG.ENDPOINTS.CALENDAR_BASE}/users/${encodeURIComponent(userId)}/calendar-personals`;
    
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    Logger.log(`レスポンスコード: ${responseCode}`);
    Logger.log(`レスポンスボディ:\n${responseBody}`);
    
    if (responseCode === 200) {
      const data = JSON.parse(responseBody);
      Logger.log('\n===== パース結果 =====');
      Logger.log(JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    Logger.log(`❌ エラー: ${error.message}`);
  }
  
  Logger.log('\n===== デバッグ終了 =====');
}






