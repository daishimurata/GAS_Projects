/**
 * DirectoryService.js
 * LINE WORKS Directory API (Users, Groups, etc.) との通信を担当。
 */
class DirectoryService {
    constructor() {
        this.lineAuth = new LineWorksAuth();
    }

    /**
     * 有効なユーザー一覧を取得
     */
    getUsers() {
        const token = this.lineAuth.getAccessToken('user.read'); // または directory
        const url = 'https://www.worksapis.com/v1.0/users';

        try {
            const response = UrlFetchApp.fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
                muteHttpExceptions: true
            });
            const result = JSON.parse(response.getContentText());
            return result.users || [];
        } catch (e) {
            Logger.error('Failed to fetch users from Directory API', e);
            return [];
        }
    }
}
