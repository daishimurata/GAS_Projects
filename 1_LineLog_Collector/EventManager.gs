/**
 * イベント管理機能
 * LINE WORKSイベントとGoogleカレンダーイベントの同期管理
 * 重複チェック、更新、削除処理
 */

/**
 * LINE WORKSイベントIDを管理用プロパティキーに変換
 * @param {string} lwEventId LINE WORKSイベントID
 * @return {string} プロパティキー
 */
function getEventMappingKey(lwEventId) {
  return `eventMapping_${lwEventId}`;
}

/**
 * LINE WORKSイベントIDとGoogleイベントIDのマッピングを保存
 * @param {string} lwEventId LINE WORKSイベントID
 * @param {string} googleEventId GoogleカレンダーイベントID
 */
function saveEventMapping(lwEventId, googleEventId) {
  setProperty(getEventMappingKey(lwEventId), googleEventId);
}

/**
 * LINE WORKSイベントIDに対応するGoogleイベントIDを取得
 * @param {string} lwEventId LINE WORKSイベントID
 * @return {string|null} GoogleイベントID
 */
function getGoogleEventId(lwEventId) {
  return getProperty(getEventMappingKey(lwEventId));
}

/**
 * イベントマッピングを削除
 * @param {string} lwEventId LINE WORKSイベントID
 */
function deleteEventMapping(lwEventId) {
  deleteProperty(getEventMappingKey(lwEventId));
}

/**
 * Googleカレンダーでイベントを検索
 * @param {GoogleAppsScript.Calendar.Calendar} calendar カレンダーオブジェクト
 * @param {string} lwEventId LINE WORKSイベントID
 * @param {Date} startTime 検索開始時刻
 * @param {Date} endTime 検索終了時刻
 * @return {GoogleAppsScript.Calendar.CalendarEvent|null} イベント
 */
function findGoogleEventByLwId(calendar, lwEventId, startTime, endTime) {
  // まずマッピングから検索
  const googleEventId = getGoogleEventId(lwEventId);
  if (googleEventId) {
    try {
      const event = calendar.getEventById(googleEventId);
      if (event) return event;
    } catch (e) {
      // イベントが削除されている場合
      logDebug(`マッピングされたイベントが見つかりません: ${googleEventId}`);
      deleteEventMapping(lwEventId);
    }
  }
  
  // マッピングが見つからない場合は説明文から検索
  const searchStart = addDays(startTime, -1);
  const searchEnd = addDays(endTime, 1);
  const events = calendar.getEvents(searchStart, searchEnd);
  
  for (let event of events) {
    const description = event.getDescription();
    if (description && description.includes(`LW_EVENT_ID:${lwEventId}`)) {
      // マッピングを更新
      saveEventMapping(lwEventId, event.getId());
      return event;
    }
  }
  
  return null;
}

/**
 * LINE WORKSイベントをGoogleカレンダーイベントに変換
 * @param {Object} lwEvent LINE WORKSイベント
 * @param {string} ownerName カレンダー所有者名
 * @return {Object} Googleカレンダーイベント情報
 */
function convertLwEventToGoogle(lwEvent, ownerName) {
  // デバッグ：イベント構造を確認
  if (!lwEvent.start) {
    logDebug(`イベント構造: ${JSON.stringify(lwEvent).substring(0, 500)}`);
  }
  
  // タイトルに所有者名をプレフィックス
  const title = `[${ownerName}] ${lwEvent.summary || lwEvent.subject || '(タイトルなし)'}`;
  
  // 開始・終了時刻（LINE WORKS API構造に対応）
  const start = lwEvent.start || {};
  const end = lwEvent.end || {};
  
  // 終日イベント判定
  const isAllDay = !start.dateTime;
  
  let startTime, endTime;
  
  if (isAllDay) {
    // 終日イベントの場合：dateフィールドを使用（YYYY-MM-DD形式）
    // タイムゾーンのずれを防ぐため、日付文字列から年月日を抽出してローカル日付を作成
    if (start.date) {
      const [year, month, day] = start.date.split('-').map(Number);
      startTime = new Date(year, month - 1, day, 0, 0, 0); // JST 00:00
    } else {
      startTime = new Date();
    }
    
    if (end.date) {
      const [year, month, day] = end.date.split('-').map(Number);
      endTime = new Date(year, month - 1, day, 0, 0, 0); // JST 00:00
    } else {
      // 終了日がない場合、開始日の翌日
      endTime = new Date(startTime);
      endTime.setDate(endTime.getDate() + 1);
    }
  } else {
    // 時刻指定イベントの場合：dateTimeフィールドを使用
    startTime = start.dateTime ? new Date(start.dateTime) : new Date();
    endTime = end.dateTime ? new Date(end.dateTime) : new Date(startTime.getTime() + 3600000);
  }
  
  // 説明文生成
  let description = `【LINE WORKSカレンダー同期】\n`;
  description += `カレンダー所有者: ${ownerName}\n`;
  description += `LW_EVENT_ID:${lwEvent.eventId}\n`;
  description += `最終更新: ${formatDateTime(new Date())}\n`;
  description += `\n--- 詳細 ---\n`;
  description += lwEvent.body || '';
  
  // 参加者情報
  if (lwEvent.attendees && lwEvent.attendees.length > 0) {
    description += `\n\n【参加者】\n`;
    lwEvent.attendees.forEach(att => {
      const name = att.displayName || att.email || att.userId;
      const status = att.status || '';
      description += `- ${name} ${status}\n`;
    });
  }
  
  // リマインダー情報
  if (lwEvent.reminders && lwEvent.reminders.length > 0) {
    description += `\n【リマインダー】\n`;
    lwEvent.reminders.forEach(rem => {
      description += `- ${rem.method}: ${rem.minutes}分前\n`;
    });
  }
  
  return {
    title: title,
    startTime: startTime,
    endTime: endTime,
    isAllDay: isAllDay,
    description: description,
    location: lwEvent.location || '',
    lwEventId: lwEvent.eventId
  };
}

/**
 * Googleカレンダーにイベントを作成
 * @param {GoogleAppsScript.Calendar.Calendar} calendar カレンダー
 * @param {Object} eventData イベントデータ
 * @return {GoogleAppsScript.Calendar.CalendarEvent} 作成されたイベント
 */
function createGoogleEvent(calendar, eventData) {
  let event;
  
  if (eventData.isAllDay) {
    // 終日イベント
    event = calendar.createAllDayEvent(
      eventData.title,
      eventData.startTime,
      eventData.endTime,
      {
        description: eventData.description,
        location: eventData.location
      }
    );
  } else {
    // 時刻指定イベント
    event = calendar.createEvent(
      eventData.title,
      eventData.startTime,
      eventData.endTime,
      {
        description: eventData.description,
        location: eventData.location
      }
    );
  }
  
  // マッピングを保存
  saveEventMapping(eventData.lwEventId, event.getId());
  
  logDebug(`イベント作成: ${eventData.title}`);
  return event;
}

/**
 * Googleカレンダーのイベントを更新
 * @param {GoogleAppsScript.Calendar.CalendarEvent} event 既存のイベント
 * @param {Object} eventData 新しいイベントデータ
 */
function updateGoogleEvent(event, eventData) {
  event.setTitle(eventData.title);
  event.setDescription(eventData.description);
  event.setLocation(eventData.location);
  event.setTime(eventData.startTime, eventData.endTime);
  
  logDebug(`イベント更新: ${eventData.title}`);
}

/**
 * イベントが変更されているかチェック
 * @param {GoogleAppsScript.Calendar.CalendarEvent} googleEvent Googleイベント
 * @param {Object} eventData 新しいイベントデータ
 * @return {boolean} 変更があればtrue
 */
function hasEventChanged(googleEvent, eventData) {
  // タイトルチェック
  if (googleEvent.getTitle() !== eventData.title) return true;
  
  // 場所チェック
  if ((googleEvent.getLocation() || '') !== eventData.location) return true;
  
  // 開始時刻チェック
  const currentStart = googleEvent.getStartTime().getTime();
  const newStart = eventData.startTime.getTime();
  if (Math.abs(currentStart - newStart) > 60000) return true;  // 1分以上の差
  
  // 終了時刻チェック
  const currentEnd = googleEvent.getEndTime().getTime();
  const newEnd = eventData.endTime.getTime();
  if (Math.abs(currentEnd - newEnd) > 60000) return true;
  
  return false;
}

/**
 * LINE WORKSイベントを同期（作成または更新）
 * @param {GoogleAppsScript.Calendar.Calendar} calendar Googleカレンダー
 * @param {Object} lwEvent LINE WORKSイベント
 * @param {string} ownerName カレンダー所有者名
 * @return {Object} 同期結果 {action: 'created'|'updated'|'skipped', event: CalendarEvent}
 */
function syncEventToGoogle(calendar, lwEvent, ownerName) {
  const eventData = convertLwEventToGoogle(lwEvent, ownerName);
  
  // 既存イベントを検索
  const existingEvent = findGoogleEventByLwId(
    calendar,
    lwEvent.eventId,
    eventData.startTime,
    eventData.endTime
  );
  
  if (existingEvent) {
    // 既存イベントを更新
    if (hasEventChanged(existingEvent, eventData)) {
      updateGoogleEvent(existingEvent, eventData);
      return { action: 'updated', event: existingEvent };
    } else {
      return { action: 'skipped', event: existingEvent };
    }
  } else {
    // 新規イベント作成
    const newEvent = createGoogleEvent(calendar, eventData);
    return { action: 'created', event: newEvent };
  }
}

/**
 * Googleカレンダーから削除されたLINE WORKSイベントを削除
 * @param {GoogleAppsScript.Calendar.Calendar} calendar Googleカレンダー
 * @param {Array} currentLwEventIds 現在のLINE WORKSイベントIDリスト
 * @param {string} ownerName カレンダー所有者名
 * @param {Date} startTime 検索開始時刻
 * @param {Date} endTime 検索終了時刻
 * @return {number} 削除されたイベント数
 */
function deleteRemovedEvents(calendar, currentLwEventIds, ownerName, startTime, endTime) {
  const events = calendar.getEvents(startTime, endTime);
  let deletedCount = 0;
  
  // この所有者のイベントのみを対象にするための接頭辞
  const ownerPrefix = `[${ownerName}]`;
  
  events.forEach(event => {
    const title = event.getTitle();
    const description = event.getDescription();
    
    // この所有者のイベントかチェック
    if (!title.startsWith(ownerPrefix)) {
      // 他の所有者のイベントはスキップ
      return;
    }
    
    // LINE WORKS同期イベントかチェック
    if (description && description.includes('LW_EVENT_ID:')) {
      // イベントIDを抽出
      const match = description.match(/LW_EVENT_ID:([^\n]+)/);
      if (match) {
        const lwEventId = match[1].trim();
        
        // 現在のイベントリストに存在しないイベントは削除
        if (!currentLwEventIds.includes(lwEventId)) {
          event.deleteEvent();
          deleteEventMapping(lwEventId);
          deletedCount++;
          logInfo(`削除されたイベントを同期: ${title}`);
        }
      }
    }
  });
  
  return deletedCount;
}

/**
 * カレンダーの全イベントを同期
 * @param {GoogleAppsScript.Calendar.Calendar} googleCalendar Googleカレンダー
 * @param {Array} lwEvents LINE WORKSイベントリスト
 * @param {string} ownerName カレンダー所有者名
 * @param {Date} startTime 同期期間開始
 * @param {Date} endTime 同期期間終了
 * @return {Object} 同期結果 {created, updated, skipped, deleted}
 */
function syncCalendarEvents(googleCalendar, lwEvents, ownerName, startTime, endTime) {
  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0
  };
  
  // 各イベントを同期
  lwEvents.forEach((lwEvent, index) => {
    try {
      const syncResult = syncEventToGoogle(googleCalendar, lwEvent, ownerName);
      result[syncResult.action]++;
      
      // レート制限対策
      handleRateLimit(index);
    } catch (error) {
      logError(`イベント同期エラー: ${lwEvent.subject}`, error);
    }
  });
  
  // 削除されたイベントを検出して削除（この所有者のイベントのみ）
  try {
    const currentEventIds = lwEvents.map(e => e.eventId);
    result.deleted = deleteRemovedEvents(googleCalendar, currentEventIds, ownerName, startTime, endTime);
  } catch (error) {
    logError('削除イベント検出エラー', error);
  }
  
  return result;
}

/**
 * イベントマッピングのクリーンアップ
 * 古いマッピングを削除
 */
function cleanupEventMappings() {
  const props = getAllProperties();
  const cutoffDate = addDays(new Date(), -CONFIG.SYNC.CALENDAR_PAST_DAYS - 30);
  let cleanedCount = 0;
  
  Object.keys(props).forEach(key => {
    if (key.startsWith('eventMapping_')) {
      // マッピングの最終更新日をチェック（実装簡略化のため省略）
      // 実際には各マッピングに最終更新日を記録しておくと良い
    }
  });
  
  if (cleanedCount > 0) {
    logInfo(`古いイベントマッピングを${cleanedCount}件削除しました`);
  }
}


