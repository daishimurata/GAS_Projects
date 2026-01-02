/**
 * CalendarService.js
 * LINE WORKS カレンダーAPIとの通信を担当するサービスクラス。
 * 新規設計: 既存コードのコピーではなく、公式API仕様に基づき再実装。
 */
class CalendarService {
    constructor() {
        this.lineAuth = new LineWorksAuth();
        // BotではなくUser権限(calendarスコープ)のトークンが必要なケースが多いが、
        // サービスアカウント(JWT)に全ユーザーのカレンダー参照権限を付与する前提とする。
    }

    /**
     * ユーザーのカレンダーリストを取得
     * @param {string} userId 対象ユーザーID
     */
    getUserCalendars(userId) {
        const token = this.lineAuth.getAccessToken('calendar');
        // Use /calendar-personals to get all accessible calendars (Personal, Shared, Group)
        const url = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/calendar-personals`;

        try {
            const response = UrlFetchApp.fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
                muteHttpExceptions: true
            });
            const resText = response.getContentText();
            const resCode = response.getResponseCode();

            if (resCode !== 200) {
                Logger.error(`Failed to fetch calendars for ${userId}. Code: ${resCode}, Body: ${resText}`);
                return [];
            }

            const result = JSON.parse(resText);
            // API may return calendars or calendarPersonals depending on access context
            return result.calendars || result.calendarPersonals || [];
        } catch (e) {
            Logger.error(`Failed to fetch calendars for user: ${userId}`, e);
            return [];
        }
    }

    /**
     * 指定期間のイベントを取得
     */
    /**
     * 指定期間のイベントを取得
     * LINE WORKS APIの制限（最大31日間）に対応するため、自動的に期間を分割してリクエストします。
     */
    getEvents(userId, calendarId, startTime, endTime) {
        const token = this.lineAuth.getAccessToken('calendar');
        const cid = encodeURIComponent(calendarId);
        const uid = encodeURIComponent(userId);

        const allEvents = [];
        const eventIds = new Set();
        const chunkDays = 30; // Safe margin for 31 days limit

        let currentStart = new Date(startTime);
        const finalEnd = new Date(endTime);

        while (currentStart < finalEnd) {
            // Calculate chunk end
            let currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + chunkDays);

            // Adjust if exceeds final end
            if (currentEnd > finalEnd) {
                currentEnd = new Date(finalEnd);
            }

            const fromStr = currentStart.toISOString();
            const toStr = currentEnd.toISOString(); // Use untilDateTime which is exclusive or inclusive? API varies, usually exclusive for time range, but for date range standard.
            // LINE WORKS API usually treats untilDateTime as end of range.

            Logger.info(`[CalendarService] Fetching chunk: ${fromStr} ~ ${toStr}`);

            const url = `https://www.worksapis.com/v1.0/users/${uid}/calendars/${cid}/events?fromDateTime=${encodeURIComponent(fromStr)}&untilDateTime=${encodeURIComponent(toStr)}`;

            try {
                const response = UrlFetchApp.fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                    muteHttpExceptions: true
                });

                const resCode = response.getResponseCode();
                if (resCode !== 200) {
                    Logger.error(`Failed to fetch events chunk (${resCode}): ${response.getContentText()}`);
                    // Continue to next chunk or throw? 
                    // If one chunk fails, likely others will too or data missing. 
                    // For now, log error and try next to salvage partial data.
                } else {
                    const result = JSON.parse(response.getContentText());
                    // result.events includes eventComponents
                    if (result.events) {
                        result.events.forEach(ev => {
                            if (ev.eventComponents) {
                                ev.eventComponents.forEach(comp => {
                                    if (comp.eventId && !eventIds.has(comp.eventId)) {
                                        eventIds.add(comp.eventId);
                                        allEvents.push(comp);
                                    }
                                });
                            }
                        });
                    }
                }
            } catch (e) {
                Logger.error(`Exception fetching events chunk: ${e.message}`);
            }

            // Move start to next chunk (overlap? API usually handled by time. 
            // If currentEnd is T, next start should be T? 
            // If untilDateTime is inclusive, we might get duplicates. 
            // If exclusive, we are good. 
            // Let's assume standard [start, end) behavior or handle duplicates later if needed.
            // But since getEvents is used for deduplication, we should be careful.
            // Let's increment currentStart to currentEnd.
            currentStart = new Date(currentEnd);
        }

        return allEvents;
    }

    /**
     * イベントを作成
     */
    createEvent(userId, calendarId, eventData) {
        const token = this.lineAuth.getAccessToken('calendar');
        // Endpoint URL is v1.0 even for the new structure accoring to docs
        const url = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(calendarId)}/events`;

        const payload = {
            eventComponents: [eventData]
        };
        const payloadStr = JSON.stringify(payload);
        Logger.info(`[CalendarService] Creating Event in ${calendarId}: ${payloadStr}`);

        const response = UrlFetchApp.fetch(url, {
            method: 'post',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            payload: payloadStr,
            muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 201) {
            Logger.error(`Failed to create event in LW: ${response.getContentText()}`);
            return null;
        }
        return JSON.parse(response.getContentText());
    }

    /**
     * イベントを更新
     */
    updateEvent(userId, calendarId, eventId, eventData) {
        const token = this.lineAuth.getAccessToken('calendar');
        const url = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

        const response = UrlFetchApp.fetch(url, {
            method: 'put',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify(eventData),
            muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 200) {
            Logger.error(`Failed to update event in LW: ${response.getContentText()}`);
            return false;
        }
        return true;
    }

    /**
     * イベントを削除
     */
    deleteEvent(userId, calendarId, eventId) {
        const token = this.lineAuth.getAccessToken('calendar');
        const url = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

        const response = UrlFetchApp.fetch(url, {
            method: 'delete',
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true
        });

        if (response.getResponseCode() !== 204) {
            Logger.error(`Failed to delete event from LW: ${response.getContentText()}`);
            return false;
        }
        return true;
    }
}
