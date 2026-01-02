/**
 * SyncEngine.js
 * カレンダー同期のコアロジック。
 * LINE WORKSから取得した予定をGoogleカレンダーに反映し、BigQueryに履歴を保存する。
 */
class CalendarSyncEngine {
    constructor() {
        this.lwService = new CalendarService();
        this.bq = getBigQueryClient();
        this.gemini = getGeminiClient();
        this.masterCalendarId = Config.GOOGLE_CALENDAR?.MASTER_CALENDAR_ID;
        this.datasetId = Config.BIGQUERY.DATASET_ID;
        this.tableId = Config.BIGQUERY.TABLES.CALENDAR_EVENTS;
    }

    /**
     * 全ユーザーのカレンダーを同期
     */
    syncAllUsers() {
        const directory = new DirectoryService();
        const users = directory.getUsers();

        Logger.info(`Starting Scan for ${users.length} users...`);

        // カレンダーIDごとの重複スキャンを避けるため、一意なカレンダー情報のマップを作成
        // { calendarId: { userId: string, displayName: string, calendarName: string } }
        const calendarMap = new Map();

        users.forEach(user => {
            const userId = user.userId;
            const userName = user.userName ? `${user.userName.lastName}${user.userName.firstName}` : userId;

            const calendars = this.lwService.getUserCalendars(userId);
            calendars.forEach(cal => {
                const calId = cal.calendarId;
                const calName = cal.calendarName;

                // 既に別のユーザー経由で同じカレンダーを処理予定ならスキップ
                // ただし、個人カレンダー(type: 'PRIMARY' または 'SUB')の場合はユーザー名を紐づける
                if (!calendarMap.has(calId)) {
                    calendarMap.set(calId, {
                        userId: userId,
                        displayName: userName,
                        calendarName: calName,
                        type: cal.type
                    });
                }
            });
        });

        Logger.info(`Unique Calendars found: ${calendarMap.size}. Starting sync...`);

        for (const [calId, info] of calendarMap.entries()) {
            Logger.info(`Syncing Calendar: ${info.calendarName} (${calId}) via User: ${info.displayName}`);
            this.runSyncForUser(info.userId, info.displayName, calId);
        }
    }

    /**
     * 特定のユーザーのカレンダーを同期
     * @param {string} userId LINE WORKS User ID
     * @param {string} displayName 表示名
     * @param {Date} [customStart] (Optional) 開始日
     * @param {Date} [customEnd] (Optional) 終了日
     * @param {boolean} [dryRun] (Optional) GCalへの書き込みをスキップするか (Default: false)
     */
    runSyncForUser(userId, displayName, calendarId, customStart, customEnd, dryRun = false) {
        if (!this.masterCalendarId) {
            Logger.warn('Master Google Calendar ID is not configured.');
            return;
        }

        const gCal = CalendarApp.getCalendarById(this.masterCalendarId);

        // 日付範囲の設定
        let start, end;
        if (customStart && customEnd) {
            start = customStart;
            end = customEnd;
        } else {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);
        }

        // もし引数でcalendarIdが渡されていない場合は、ユーザーのメインカレンダーを取得して実行
        let targetCalendarId = calendarId;
        let calName = '';

        if (!targetCalendarId) {
            const calendars = this.lwService.getUserCalendars(userId);
            const mainCal = calendars.find(c => c.type === 'PRIMARY') || calendars[0];
            if (!mainCal) {
                Logger.warn(`No calendars found for user: ${userId}`);
                return;
            }
            targetCalendarId = mainCal.calendarId;
            calName = mainCal.calendarName;
        } else {
            // calendarIdが渡されている場合（syncAllUsersからの呼び出し）
            // 名前特定のために再度リストを見るのは非効率だが、現状のownerTag生成のために必要
            const calendars = this.lwService.getUserCalendars(userId);
            const cal = calendars.find(c => c.calendarId === targetCalendarId);
            calName = cal ? cal.calendarName : '';
        }

        Logger.info(`Syncing: User=${displayName}, Calendar=${calName} (${targetCalendarId}) [DryRun: ${dryRun}]`);

        // 1. LWイベント一覧取得
        const lwEvents = this.lwService.getEvents(userId, targetCalendarId, start, end);
        Logger.info(`Fetched ${lwEvents.length} events from LW for ${displayName}`);

        // 2. 各イベントの処理
        const currentLwIds = [];
        const ownerTag = (calName === '既定のカレンダー' || !calName) ? displayName : `${displayName} (${calName})`;

        lwEvents.forEach(lwEvent => {
            this._syncSingleEvent(gCal, lwEvent, ownerTag, targetCalendarId, dryRun);
            currentLwIds.push(lwEvent.eventId);
        });

        // 3. 削除されたイベントの同期 (DryRun時はスキップ)
        if (!dryRun) {
            this._deleteRemovedEvents(gCal, currentLwIds, ownerTag, start, end);
        }
    }

    /**
     * 個別イベントの同期 (LW -> GCal)
     */
    _syncSingleEvent(gCal, lwEvent, ownerName, calendarId, dryRun) {
        // 同期ループ防止: システム(GCal Sync)が作成したLW予定はGoogleカレンダーへ戻さない
        if (lwEvent.description && lwEvent.description.includes('【GCal Sync】')) {
            return;
        }

        const baseEventData = this._normalizeLwEvent(lwEvent, ownerName);
        if (!baseEventData) {
            Logger.warn(`Skipping invalid/incomplete LW event: ${lwEvent.eventId}`);
            return;
        }

        // 1. AI Classification & Owner Override
        const category = this._classifyEventCategory(baseEventData.rawSummary || '');
        let effectiveOwner = ownerName;

        if (category === 'COMPANY') {
            effectiveOwner = 'おひさま';
        } else if (category === 'MURATA') {
            effectiveOwner = '村田太志';
        }

        // 2. Title Generation
        const finalTitle = `[${effectiveOwner}] ${baseEventData.rawSummary || '(No Title)'}`;
        baseEventData.title = finalTitle;

        // 3. Deduplication (Find by Time & Title Match)
        let existingEvent = this._findExistingGCalEventByContent(gCal, finalTitle, baseEventData.start, baseEventData.end);

        // Fallback: Check by ID mapping
        if (!existingEvent) {
            existingEvent = this._findExistingGCalEvent(gCal, lwEvent.eventId, baseEventData.start, baseEventData.end);
        }

        if (existingEvent) {
            if (this._hasChanged(existingEvent, baseEventData)) {
                if (!dryRun) {
                    this._updateGCalEvent(existingEvent, baseEventData);
                    this._saveMapping(lwEvent.eventId, existingEvent.getId());
                    Utilities.sleep(500);
                }
                this._logToBigQuery(lwEvent, baseEventData, 'updated', calendarId);
            } else {
                if (!dryRun) this._saveMapping(lwEvent.eventId, existingEvent.getId());
            }
        } else {
            // New Event
            if (!dryRun) {
                const newEvent = this._createGCalEvent(gCal, baseEventData);
                this._saveMapping(lwEvent.eventId, newEvent.getId());
                Utilities.sleep(800);
            }
            this._logToBigQuery(lwEvent, baseEventData, 'migrated_found', calendarId);
        }
    }

    /**
     * Classify event based on keywords
     */
    _classifyEventCategory(summary) {
        if (!summary) return 'OTHER';
        if (/見学|来客|視察受け入れ|視察受入/.test(summary)) return 'COMPANY';
        if (/面接|視察|会議|出張|会合|交流会|総会/.test(summary)) return 'MURATA';
        return 'OTHER';
    }

    /**
     * Find existing event by Core Title and Time
     */
    _findExistingGCalEventByContent(gCal, title, start, end) {
        const searchStart = new Date(start.getTime() - 60000);
        const searchEnd = new Date(end.getTime() + 60000);
        const events = gCal.getEvents(searchStart, searchEnd);

        // title からプレフィックスを除去
        const coreTitle = title.replace(/^\[[^\]]+\]\s*/, '').trim();

        return events.find(e => {
            const eTitle = e.getTitle();
            const eCoreTitle = eTitle.replace(/^\[[^\]]+\]\s*/, '').trim();

            if (eCoreTitle !== coreTitle) return false;

            const isSameStart = Math.abs(e.getStartTime().getTime() - start.getTime()) < 5000;
            const isSameEnd = Math.abs(e.getEndTime().getTime() - end.getTime()) < 5000;
            return isSameStart && isSameEnd;
        });
    }

    /**
     * LWイベントをGCal形式に変換 & AIによる時間補正
     */
    _normalizeLwEvent(lwEvent, ownerName) {
        // Guard against missing start/end
        if (!lwEvent.start || !lwEvent.end) {
            return null; // Skip invalid event completely
        }

        let start, end;
        const isAllDay = isValidAllDay(lwEvent);

        if (isAllDay) {
            // "YYYY-MM-DD" -> Local Date (00:00:00) 
            // タイムゾーンによる1日のズレを防ぐため、Date(y, m-1, d)でJST固定
            const sParts = lwEvent.start.date.split('-');
            start = new Date(Number(sParts[0]), Number(sParts[1]) - 1, Number(sParts[2]), 0, 0, 0);

            const eParts = lwEvent.end.date.split('-');
            end = new Date(Number(eParts[0]), Number(eParts[1]) - 1, Number(eParts[2]), 0, 0, 0);
        } else {
            // DateTime string (ISO)
            start = new Date(lwEvent.start.dateTime);
            end = new Date(lwEvent.end.dateTime);
        }

        const rawSummary = lwEvent.summary || '(No Title)';
        const title = `[${ownerName}] ${rawSummary}`; // Default title
        let description = `【LW Sync】\nID: ${lwEvent.eventId}\nOwner: ${ownerName}\n\n${lwEvent.description || ''}`;

        let finalStart = start;
        let finalEnd = end;

        // Geminiによる曖昧な時間の補正 (e.g. "午後から")
        if (this._isFuzzyTime(rawSummary)) {
            const adjustment = this._getAITimeAdjustment(rawSummary, lwEvent.start.date || start.toISOString().split('T')[0]);
            if (adjustment) {
                finalStart = new Date(adjustment.start);
                finalEnd = new Date(adjustment.end);
                description += `\n\n[AI Adjustment] Recognized fuzzy time.`;
            }
        }

        return {
            title: title,
            rawSummary: rawSummary, // Added for AI Classification
            start: finalStart,
            end: finalEnd,
            isAllDay: isAllDay,
            description: description,
            location: lwEvent.location || '',
            lwEventId: lwEvent.eventId
        };
    }

    _isFuzzyTime(title) {
        return /昼まで|午後|午前|夕方|朝から|夕方から|頃/.test(title);
    }

    _getAITimeAdjustment(title, baseDate) {
        const prompt = `Interpret fuzzy time in calendar title. Return JSON {start, end} in ISO format. Base Date: ${baseDate}. Title: ${title}. Rule: Afternoon=13-16, Morning=9-12. If already specific, return null.`;
        try {
            const res = this.gemini.generateJson(prompt);
            return (res && res.start) ? res : null;
        } catch (e) {
            return null;
        }
    }

    _findExistingGCalEvent(gCal, lwEventId, start, end) {
        const gId = PropertiesService.getScriptProperties().getProperty(`map_lw_${lwEventId}`);
        if (gId) {
            try {
                return gCal.getEventById(gId);
            } catch (e) {
                PropertiesService.getScriptProperties().deleteProperty(`map_lw_${lwEventId}`);
            }
        }

        const events = gCal.getEvents(new Date(start.getTime() - 86400000), new Date(end.getTime() + 86400000));
        return events.find(e => e.getDescription().includes(`ID: ${lwEventId}`)) || null;
    }

    _createGCalEvent(gCal, data) {
        // Fix: Ensure start < end
        if (data.start >= data.end) {
            Logger.warn(`Fixing invalid duration for: ${data.title} (${data.start} - ${data.end})`);
            if (data.isAllDay) {
                // Next day
                const newEnd = new Date(data.start);
                newEnd.setDate(newEnd.getDate() + 1);
                data.end = newEnd;
            } else {
                // +30 mins
                const newEnd = new Date(data.start);
                newEnd.setMinutes(newEnd.getMinutes() + 30);
                data.end = newEnd;
            }
        }

        const options = { description: data.description, location: data.location };
        if (data.isAllDay) {
            // Check duration to decide whether to pass end date
            // Duration in days (round to avoid float issues)
            const diffDays = Math.round((data.end - data.start) / (1000 * 60 * 60 * 24));

            if (diffDays <= 1) {
                // Single day event: Pass only start date
                return gCal.createAllDayEvent(data.title, data.start, options);
            } else {
                // Multiple days: Pass start and end
                return gCal.createAllDayEvent(data.title, data.start, data.end, options);
            }
        } else {
            return gCal.createEvent(data.title, data.start, data.end, options);
        }
    }

    _updateGCalEvent(gEvent, data) {
        gEvent.setTitle(data.title);
        gEvent.setDescription(data.description);
        gEvent.setLocation(data.location);

        if (data.isAllDay) {
            const diffDays = Math.round((data.end - data.start) / (1000 * 60 * 60 * 24));
            if (diffDays <= 1) {
                gEvent.setAllDayDate(data.start);
            } else {
                // For all-day events spanning multiple days, internal handling might need specific care,
                // but setTime usually works if end is exclusive. 
                // Note: setAllDayDates(start, end) doesn't exist in GAS, use setTime or setAllDayDate for single.
                // Actually GAS has gEvent.setAllDayDates(start, end) ? No, distinct methods often separate.
                // Docs: setTime(start, end). For all day, dates are date only.
                gEvent.setTime(data.start, data.end);
            }
        } else {
            gEvent.setTime(data.start, data.end);
        }
    }

    _hasChanged(gEvent, data) {
        if (gEvent.getTitle() !== data.title) return true;
        if (gEvent.getLocation() !== data.location) return true;

        // Check Start Time
        // For all day events, getStartTime() returns date at midnight
        if (Math.abs(gEvent.getStartTime().getTime() - data.start.getTime()) > 60000) return true;

        // Check End Time (Crucial for duration fixes)
        // GCal getEndTime() for all day is usually exclusive (next day midnight)
        if (Math.abs(gEvent.getEndTime().getTime() - data.end.getTime()) > 60000) return true;

        return false;
    }

    _saveMapping(lwId, gId) {
        PropertiesService.getScriptProperties().setProperty(`map_lw_${lwId}`, gId);
    }

    _deleteRemovedEvents(gCal, currentLwIds, ownerName, start, end) {
        const events = gCal.getEvents(start, end);
        const prefix = `[${ownerName}]`;

        events.forEach(event => {
            if (event.getTitle().startsWith(prefix) && event.getDescription().includes('【LW Sync】')) {
                const match = event.getDescription().match(/ID: ([^\n]+)/);
                if (match) {
                    const lwId = match[1].trim();
                    if (!currentLwIds.includes(lwId)) {
                        Logger.info(`Deleting removed event: ${event.getTitle()}`);
                        event.deleteEvent();
                        PropertiesService.getScriptProperties().deleteProperty(`map_lw_${lwId}`);
                        this._logToBigQuery({ eventId: lwId, summary: event.getTitle() }, 'deleted');
                    }
                }
            }
        });
    }

    _logToBigQuery(lwEvent, eventData, action, calendarId) {
        try {
            const summary = eventData ? eventData.title : (lwEvent.summary || lwEvent.subject || 'Deleted Event');
            const description = eventData ? eventData.description : (lwEvent.description || '');
            const location = eventData ? eventData.location : (lwEvent.location || '');

            let start = null;
            let end = null;
            if (eventData) {
                if (eventData.start instanceof Date) {
                    start = eventData.start.toISOString().replace('T', ' ').replace('Z', '');
                    end = eventData.end.toISOString().replace('T', ' ').replace('Z', '');
                } else {
                    // start/end are objects { dateTime, date }
                    if (eventData.start.dateTime) {
                        start = eventData.start.dateTime.replace('T', ' ').substring(0, 19);
                        end = eventData.end.dateTime.replace('T', ' ').substring(0, 19);
                    } else if (eventData.start.date) {
                        start = eventData.start.date + ' 00:00:00';
                        end = eventData.end.date + ' 00:00:00';
                    }
                }
            }

            const row = {
                event_id: lwEvent.eventId || lwEvent.id || 'N/A',
                lw_event_id: lwEvent.eventId || lwEvent.id || 'N/A',
                calendar_id: calendarId || 'unknown',
                summary: summary,
                description: description,
                start_time: start,
                end_time: end,
                location: location,
                status: action,
                html_link: lwEvent.htmlLink || '',
                last_synced_at: new Date().toISOString()
            };
            this.bq.insertRows(this.datasetId, this.tableId, [row]);
        } catch (e) {
            Logger.error('BQ Logging failed for Calendar', e);
        }
    }

    /**
     * GoogleカレンダーからLINE WORKSへ同期 (逆方向)
     */
    syncGoogleToLW(gCalId, targetLwUserId, targetLwCalendarId) {
        if (!gCalId || !targetLwUserId || !targetLwCalendarId) {
            Logger.warn('Invalid params for syncGoogleToLW');
            return;
        }

        const gCal = CalendarApp.getCalendarById(gCalId);
        if (!gCal) {
            Logger.error(`Google Calendar not found: ${gCalId}`);
            return;
        }

        const now = new Date();
        const start = new Date(now.getTime() - 86400000);
        const end = new Date(now.getTime() + 86400000 * 30);
        const gEvents = gCal.getEvents(start, end);

        Logger.info(`Syncing Google to LW: ${gCalId} -> ${targetLwUserId}/${targetLwCalendarId} (${gEvents.length} events)`);

        const lwEvents = this.lwService.getEvents(targetLwUserId, targetLwCalendarId, start, end);

        gEvents.forEach(gEvent => {
            if (gEvent.getDescription().includes('【LW Sync】')) return;
            this._syncSingleToLW(targetLwUserId, targetLwCalendarId, gEvent, lwEvents);
        });
    }

    _syncSingleToLW(userId, calendarId, gEvent, lwEvents) {
        const gId = gEvent.getId();
        const eventData = this._normalizeGCalEvent(gEvent);

        const existingLwEvent = lwEvents.find(lw =>
            lw.description && lw.description.includes(`GCalID: ${gId}`)
        );

        if (existingLwEvent) {
            if (existingLwEvent.summary !== eventData.summary) {
                Logger.info(`Updating event in LW: ${eventData.summary}`);
                this.lwService.updateEvent(userId, calendarId, existingLwEvent.eventId, eventData);
                // 履歴保存 (UPDATE)
                this._logToBigQuery(existingLwEvent, { ...eventData, title: eventData.summary }, 'updated_g2lw', calendarId);
            }
        } else {
            Logger.info(`Creating new event in LW: ${eventData.summary}`);
            const created = this.lwService.createEvent(userId, calendarId, eventData);
            // 履歴保存 (INSERT)
            this._logToBigQuery(created || { eventId: 'pending' }, { ...eventData, title: eventData.summary }, 'created_g2lw', calendarId);
        }
    }

    _normalizeGCalEvent(gEvent) {
        const isAllDay = gEvent.isAllDayEvent();
        const start = gEvent.getStartTime();
        let end = gEvent.getEndTime();

        if (isAllDay) {
            // LW all-day is inclusive. GCal is exclusive (next day midnight).
            // Subtract 1 day for inclusive end date.
            end = new Date(end.getTime() - 86400000);
        }

        return {
            summary: gEvent.getTitle(),
            description: `${gEvent.getDescription()}\n\n【GCal Sync】\nGCalID: ${gEvent.getId()}`,
            location: gEvent.getLocation(),
            start: isAllDay ?
                { date: Utilities.formatDate(start, "Asia/Tokyo", "yyyy-MM-dd") } :
                { dateTime: Utilities.formatDate(start, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'Asia/Tokyo' },
            end: isAllDay ?
                { date: Utilities.formatDate(end, "Asia/Tokyo", "yyyy-MM-dd") } :
                { dateTime: Utilities.formatDate(end, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'Asia/Tokyo' }
        };
    }

    /**
     * チャットから抽出された休み予定を全プラットフォームに登録する
     * @param {Object} data 抽出された予定データ
     */
    registerAbsenceEvent(data) {
        Logger.info(`Registering absence event from chat for: ${data.target_user_name}`);

        const gCal = CalendarApp.getCalendarById(this.masterCalendarId);

        // 日付文字列をパースする際、時刻とJSTオフセットを明記してズレを防止
        const parseJstDate = (dateStr) => {
            if (dateStr.includes('T')) return new Date(dateStr);
            return new Date(dateStr + 'T00:00:00+09:00');
        };

        const startDate = parseJstDate(data.start);
        const endDate = parseJstDate(data.end);

        // 1. 重複チェック (Idempotency Check)
        // 同じ日のイベントを取得し、タイトルが完全一致するものが既に登録されていないか確認
        // チャットソース由来のもののみを対象とする
        const checkStart = new Date(startDate);
        checkStart.setHours(0, 0, 0, 0);
        const checkEnd = new Date(startDate);
        checkEnd.setHours(23, 59, 59, 999);

        const existingEvents = gCal.getEvents(checkStart, checkEnd);
        const duplicate = existingEvents.find(e =>
            e.getTitle() === data.summary &&
            e.getDescription().includes('【Chat Source】')
        );

        if (duplicate) {
            Logger.info(`Skipping duplicate event: ${data.summary} (${duplicate.getId()})`);
            return duplicate.getId();
        }

        // 2. Google カレンダーへの登録
        const gEventOptions = { description: `【Chat Source】\n${data.reason || ''}\n\n【LW Sync】` };
        let gEvent;

        if (data.is_all_day) {
            // 終日予定の場合
            if (startDate.getTime() === endDate.getTime()) {
                gEvent = gCal.createAllDayEvent(data.summary, startDate, gEventOptions);
            } else {
                // start < end を保証
                if (endDate <= startDate) {
                    endDate.setDate(endDate.getDate() + 1);
                }
                gEvent = gCal.createAllDayEvent(data.summary, startDate, endDate, gEventOptions);
            }
        } else {
            // 時間指定イベント
            gEvent = gCal.createEvent(data.summary, startDate, endDate, gEventOptions);
        }
        const gId = gEvent.getId();

        // 3. LINE WORKS への登録 (スタッフ本人または代表者)
        // 抽出フェーズで特定されたIDがあればそれを使用、なければAdmin/Configのデフォルト
        let targetUserId = data.target_user_id || PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID');

        // フォールバック: Configからデフォルトユーザーを取得
        if (!targetUserId && Config.GOOGLE_CALENDAR.SYNC_PAIRS && Config.GOOGLE_CALENDAR.SYNC_PAIRS.length > 0) {
            targetUserId = Config.GOOGLE_CALENDAR.SYNC_PAIRS[0].lwUserId;
        }

        if (targetUserId) {
            const lwEventData = {
                summary: data.summary,
                description: `${data.reason || ''}\n\n【GCal Sync】\nGCalID: ${gId}`,
                start: data.is_all_day ?
                    { date: data.start.split('T')[0] } :
                    { dateTime: Utilities.formatDate(new Date(data.start), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'Asia/Tokyo' },
                end: data.is_all_day ?
                    { date: data.end.split('T')[0] } :
                    { dateTime: Utilities.formatDate(new Date(data.end), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss"), timeZone: 'Asia/Tokyo' }
            };

            // ConfigからカレンダーIDを取得 (設定済みの場合)
            let targetCalendarId = null;
            if (Config.GOOGLE_CALENDAR.SYNC_PAIRS && Config.GOOGLE_CALENDAR.SYNC_PAIRS.length > 0) {
                const pair = Config.GOOGLE_CALENDAR.SYNC_PAIRS.find(p => p.lwUserId === targetUserId);
                if (pair && pair.lwCalendarId && pair.lwCalendarId !== '1') {
                    targetCalendarId = pair.lwCalendarId;
                }
            }

            // フォールバック: ConfigになければAPIから検索 (既定のカレンダー)
            if (!targetCalendarId) {
                const lwCalendars = this.lwService.getUserCalendars(targetUserId);
                // "既定のカレンダー" またはユーザー名と同名のカレンダーを探す
                // または isDefault 的なフラグがあれば良いがAPIレスポンス依存
                const primaryCal = lwCalendars.find(c => c.calendarName === '既定のカレンダー' || c.calendarName === 'マイカレンダー') || lwCalendars[0];
                if (primaryCal) targetCalendarId = primaryCal.calendarId;
            }

            if (targetCalendarId) {
                Logger.info(`Clicking creating evnet for user: ${targetUserId} in cal: ${targetCalendarId}`);
                const createdLw = this.lwService.createEvent(targetUserId, targetCalendarId, lwEventData);
                if (createdLw) {
                    // IDマッピングの保存
                    this._saveMapping(createdLw.eventId, gId);
                    // 4. BigQuery への履歴保存
                    this._logToBigQuery(createdLw, { ...lwEventData, title: lwEventData.summary }, 'created_from_chat', targetCalendarId);
                }
            } else {
                Logger.warn(`Target Calendar ID could not be determined for user: ${targetUserId}`);
            }
        }

        return gId;
    }
}

function isValidAllDay(lwEvent) {
    return lwEvent.start && lwEvent.start.date && !lwEvent.start.dateTime;
}
