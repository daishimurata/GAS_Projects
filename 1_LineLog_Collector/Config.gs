/**
 * LINE WORKS統合システム 設定ファイル
 * カレンダー同期 + チャット履歴保存
 */

// ==================== 共通設定 ====================
const CONFIG = {
  // LINE WORKS認証情報
  LINEWORKS: {
    CLIENT_ID: 'TPoJFiZR3UggWu2sMxiU',
    CLIENT_SECRET: 'rFefPuFxiS',
    SERVICE_ACCOUNT: 'tqdux.serviceaccount@ohisamafarm',
    API_ID: '400854414',
    
    // ダウンロードした秘密鍵ファイルの内容
    PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDcCC+g1CXpAegh
jmP4wxhCo9UUA+NihpEXBDLGsN/pgE47r0DeiCcHQcPgFPcZTXcnfEalvcc+gYCo
aC44gsoATmG5pfKtJFk+CKm/Nk/LfKSJvUvM3G0WQ8K/aAfjA0wRGv7yEKVFcOVZ
ZxgRkXyfr2uQcXCmR2O+mNo0CQo9gbsZRWz0Xb48Ty3PRq9bGnWa5s7lcAvgzizk
MrmxMzb5I3GffHxoN844gMgKVlx/LOPnZ5pdE0uTH6cD7w79mzY161Z8g8eEftap
1+wXqYZmZ2H6EafZbETwdnobvz7AJJsdViE5Y05O+L3Pt/xXPu0TPo02aiq5owbG
AZUYVLjjAgMBAAECggEACswcCjhe4+BEE+F45mwsdJi1jBXkwqD33blHBJkJY9v3
+tXOyRzFTYXcptJgjc1PW5CtptR5Qof4WEtEeWFxqDIweXu7POPbvT+PlOKFZ+bl
7Bxt68+lSsJofBwOxwUSZoR8nkRS1+WCW7DDbZlGFE/3Z08px/8Y1fGKQ6Nt7Tap
PFO8k19rK+Op5IPQY7226byG9FZGBly5ZOvIlXMhPS9BR0GARIY/2GgKQmA24qQ7
YkY6QzMOSIUPPgZ1PVlEtFjesOiyE3bzOtovb3V7f7fh4HEV7RKYQpo/8wNvwbcE
YE9GJSdEEJpNscTyBX4tc1hZk41BA8oy7PKA+2BMgQKBgQDqqZXR4pnnrVXWxM5K
hug65nkRXg/a4p1Xu4yRCCRlN7QHWnuL9fUk3p8yC1TYyG0p0kPIbvgn42UnDfgv
ZwYjYvIi26G5AH1iSy/17SGZXJY87g6iRIhQvp0tbV6hL0YDJjc7/sQbDwf3UBvn
1SmDDpV0ASUE9bZc0+wqY6yJ/QKBgQDwCglTLhqPm82ThjH0JdwMQs01LnEyiMw8
MSb+iEjfvZMy/C92+L8hLfM0XvfcpAh7KB26QRsFeLI9fIP8lCdgtJlv+/8c1Myz
6GoCIn9pcLZFf60ufANexB3fXd58CplVJzpmyXmH9O0XDMXO5q9KDmNLNLn1SMNf
gZJlx6jUXwKBgQC5CeynykWOGHKdnicFQYgSGfbRqRhbg2KK8csP+hmo7tm5CrJt
VQ9veVSTA7huEO1zkuf8PvTTj04OE8fmqRiAAt/oeMP3u9kjDyLMi6Z45jdZ6GYF
soDDGuuaDKoX880DYrkfR++fXqTrcXHvx3iqbW+QP+7PEGoynLGXY22EiQKBgQCc
H8sE4R3BfjLt2wCurdk72E8kYfqaRcOg+s9EClxruh/9r20n0o5uBDcFPyezyLUD
dYowVJxAqMo1l8E5DRu3mH+cCKlblUU3VtlsXgfFCtxiw7JeY6bFgoVzfNhykWo9
qnAf3rc/KJz0uwgFlKE6Z7VJexfgY90/R0VzEbPLvQKBgA0M21xICZhykjxVnC1K
/2hUBnBUX0CSqxuAVs5XIHZs8MifKpSYTgLa7qv5Qd34FytXu2pYDNr6q612KTS/
wR1EMp8CqsqGRE4juBTeZs3/PpcRxdwMcTIvOffWOVsjnUT7lkEtMFgGsDOYkFG4
lmOIERU57WE+FJu1djWc8R+K
-----END PRIVATE KEY-----`,
    
    BOT_ID: '10746138',
    BOT_SECRET: 'i4AxB7JBLsgBe2GbhZk9ZSUDfxGKbF'
  },
  
  ENDPOINTS: {
    AUTH: 'https://auth.worksmobile.com/oauth2/v2.0/token',
    CALENDAR_BASE: 'https://www.worksapis.com/v1.0',
    CHANNEL_LIST: 'https://www.worksapis.com/v1.0/bots/{botId}/channels',
    CHANNEL_MESSAGES: 'https://www.worksapis.com/v1.0/bots/{botId}/channels/{channelId}/messages',
    USER_MESSAGE: 'https://www.worksapis.com/v1.0/bots/{botId}/users/{userId}/messages',
    // Audit API修正: ドメインIDを含むパスがv2.0で変更されている可能性があるため、汎用的なパスに変更を試みる
    // または https://www.worksapis.com/v1.0/audits/messages など
    AUDIT_MESSAGES: 'https://www.worksapis.com/v1.0/domains/{domainId}/logs/message',
    USER_INFO: 'https://www.worksapis.com/v1.0/users/{userId}'
  },
  
  GOOGLE_CALENDAR: {
    MASTER_CALENDAR_ID: 'd.murata@izaya.llc'
  },
  
  GOOGLE_DRIVE: {
    ROOT_FOLDER_NAME: 'LINE WORKS統合ログ',
    CHAT_LOG_FOLDER: 'チャットログ',
    ATTACHMENT_FOLDER: '添付ファイル',
    DAILY_LOG_FOLDER: '日次ログ',
    ROOM_LOG_FOLDER: 'ルーム別ログ',
    MASTER_SPREADSHEET_NAME: 'マスターログ',
    CALENDAR_FOLDER: 'カレンダーデータ',
    SYSTEM_LOG_FOLDER: 'システムログ',
    MONTHLY_ORGANIZATION: true
  },
  
  SYNC: {
    CALENDAR_PAST_DAYS: 7,
    CALENDAR_FUTURE_DAYS: 60,
    CHAT_HISTORY_DAYS: 30,
    SCHEDULE: {
      TIMES: ['05:00', '10:00', '16:00', '21:00']
    },
    MAX_CALENDARS_PER_EXECUTION: 50,
    MAX_CHANNELS_PER_EXECUTION: 100,
    MAX_EVENTS_PER_CALENDAR: 1000,
    MAX_MESSAGES_PER_CHANNEL: 1000
  },
  
  NOTIFICATION: {
    ADMIN_USER_ID: 'pr.12187@ohisamafarm',
    NOTIFY_ON_ERROR: true,
    NOTIFY_ON_SUCCESS: false,
    NOTIFY_ON_WARNING: true
  },
  
  GEMINI_OPTIMIZATION: {
    ENABLE_KEYWORD_EXTRACTION: true,
    ENABLE_DAILY_SUMMARY: true,
    ENABLE_AUTO_CATEGORIZATION: true,
    ENABLE_SEARCH_INDEX: true,
    MAX_KEYWORDS_PER_MESSAGE: 10
  },
  
  LOGGING: {
    LEVEL: 'INFO',
    SYNC_LOG_FILE: '同期ログ.txt',
    MAX_LOG_SIZE: 1000000,
    AUTO_DELETE_DAYS: 90
  },
  
  GMAIL: {
    ENABLED: true,
    INITIAL_DAYS: 7,
    NOTIFY_IMPORTANT: true,
    IMPORTANT_THRESHOLD: 8,
    SAVE_ATTACHMENTS: true,
    SEARCH_FILTERS: [
      '-label:spam',
      '-label:trash'
    ],
    SPECIFIC_SENDERS: [],
    SPECIFIC_LABELS: []
  },
  
  STOCK_MANAGEMENT: {
    ENABLED: true,
    SPREADSHEET_ID: '1Os9PiyJIy_KR8I1AW8AIWpfTCZrmHSkt3PAhwfJPYg4',
    SHEET_STOCK: '在庫管理',
    SHEET_LOG: '売上履歴',
    GMAIL_QUERY: 'label:直売所売上 (subject:売上 OR subject:速報) is:unread',
    STORE_KEYWORDS: {
      'みどりの大地': ['みどりの大地', '鈴鹿'],
      '四季菜 尾平': ['尾平', '四季菜'],
      'Aコープ': ['Aコープ', 'エーコープ', 'JAストア']
    },
    NOTIFY_LOW_STOCK: true,
    DAILY_REPORT: {
      ENABLED: false,
      TIME: '18:00'
    },
    // 在庫管理・売上管理用LINE WORKSチャンネル設定
    LINE_CHANNEL: {
      ENABLED: true,
      CHANNEL_ID: '7d6b452d-2dce-09ac-7663-a2f47d622e91', // 在庫管理・売上管理用チャンネル
      NOTIFY_SHIPMENT: true,  // 出荷情報を通知
      NOTIFY_SALES: true,     // 売上情報を通知
      NOTIFY_STOCK_UPDATE: true  // 在庫更新を通知
    },
    // 在庫管理専用チャットログ設定
    STOCK_CHAT_LOG: {
      ENABLED: true,
      CHANNEL_ID: '7d6b452d-2dce-09ac-7663-a2f47d622e91', // 在庫管理専用チャンネルID
      SPREADSHEET_NAME: '在庫管理チャットログ', // 専用スプレッドシート名
      SHEET_NAME: 'メッセージ一覧' // メッセージ保存シート名
    }
  }
};

function validateConfig() {
  const errors = [];
  if (CONFIG.LINEWORKS.CLIENT_ID === 'YOUR_CLIENT_ID_HERE') errors.push('CLIENT_ID設定なし');
  if (CONFIG.LINEWORKS.SERVICE_ACCOUNT === 'YOUR_SERVICE_ACCOUNT_ID_HERE') errors.push('SERVICE_ACCOUNT設定なし');
  if (CONFIG.GOOGLE_CALENDAR.MASTER_CALENDAR_ID === 'YOUR_GOOGLE_CALENDAR_ID@group.calendar.google.com') errors.push('カレンダーID設定なし');
  return { valid: errors.length === 0, errors: errors };
}

function showConfig() {
  Logger.log(JSON.stringify(CONFIG, null, 2));
}

function maskString(str) {
  if (!str || str.length < 8) return '****';
  return str.substring(0, 4) + '****' + str.substring(str.length - 4);
}
