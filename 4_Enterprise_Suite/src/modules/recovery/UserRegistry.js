/**
 * UserRegistry.js
 * 利用者情報フォルダおよびスタッフ名簿から、統合的な「人名索引」を提供するクラス。
 */
class UserRegistry {
    constructor() {
        this.directory = new DirectoryService();
        this.parentPath = '/マイドライブ/おひさま農園/利用者情報';
        this._cachedUsers = null;
        this._cachedStaff = null;
    }

    /**
     * 利用者とスタッフを統合して取得する
     */
    getAllPeople() {
        return {
            users: this.getUsers(),
            staff: this.getStaff()
        };
    }

    /**
     * ドライブのフォルダ構造から利用者名リストを取得する
     */
    /**
     * ドライブのフォルダ構造から利用者名リストを取得し、BQからあだ名も補完する
     */
    getUsers() {
        if (this._cachedUsers) return this._cachedUsers;

        const parentFolder = this._getFolderByPath(this.parentPath);
        if (!parentFolder) {
            console.error(`[UserRegistry] Parent folder not found: ${this.parentPath}`);
            return [];
        }

        // 1. フォルダから基本リスト作成
        const users = [];
        const subFolders = parentFolder.getFolders();
        while (subFolders.hasNext()) {
            const folder = subFolders.next();
            const folderName = folder.getName();
            const match = folderName.match(/^(\d+)-(.*)$/);
            if (match) {
                users.push({
                    id: match[1],
                    code: match[1],
                    name: match[2].trim(),
                    folderId: folder.getId(),
                    type: 'user',
                    nicknames: [] // 初期化
                });
            }
        }

        // 2. BigQueryからあだ名を取得してマージ
        try {
            const bq = getBigQueryClient();
            const datasetId = Config.BIGQUERY.DATASET_ID;
            // テーブル存在チェックは省略（エラーならcatch）
            const sql = `SELECT user_id, nickname FROM \`${datasetId}.user_master\` WHERE nickname IS NOT NULL AND nickname != ''`;
            const rows = bq.runQuery(sql);

            const nicknameMap = new Map();
            rows.forEach(r => nicknameMap.set(r.user_id, r.nickname));

            users.forEach(u => {
                if (nicknameMap.has(u.id)) {
                    // カンマ区切りなども考慮して配列化してもよいが、現状は単一文字列想定
                    u.nicknames.push(nicknameMap.get(u.id));
                    // 検索便宜上、プロパティとしても持たせる
                    u.nickname = nicknameMap.get(u.id);
                }
            });

        } catch (e) {
            console.warn('[UserRegistry] Failed to fetch nicknames from BQ:', e);
        }

        this._cachedUsers = users;
        return users;
    }

    /**
     * LINE WORKS からスタッフリストを取得する
     */
    getStaff() {
        if (this._cachedStaff) return this._cachedStaff;

        const rawStaff = this.directory.getUsers();
        this._cachedStaff = rawStaff.map(s => ({
            id: s.userId,
            name: `${s.userName.lastName}${s.userName.firstName}`,
            lastName: s.userName.lastName,
            firstName: s.userName.firstName,
            displayName: s.userName.displayName || s.userName.lastName,
            type: 'staff'
        }));
        return this._cachedStaff;
    }

    /**
     * 指定されたテキストから言及されている全ての利用者を特定する (旧互換用)
     */
    findAllMentionedUsers(text, userList) {
        if (!text) return [];
        const list = userList || this.getUsers();
        return list.filter(u => {
            // 名前またはあだ名のいずれかが含まれているか
            const nameMatch = text.includes(u.name);
            const nicknameMatch = u.nickname && text.includes(u.nickname);
            return nameMatch || nicknameMatch;
        });
    }

    /**
     * パスからフォルダを取得する内部関数
     */
    _getFolderByPath(path) {
        const parts = path.split('/').filter(p => p);
        let current = DriveApp.getRootFolder();
        // マイドライブはRootFolderそのものなのでスキップ、ただし明示的に書いてある場合への対応
        const startIndex = (parts[0] === 'マイドライブ' || parts[0] === 'My Drive') ? 1 : 0;

        for (let i = startIndex; i < parts.length; i++) {
            const name = parts[i];
            const folders = current.getFoldersByName(name);
            if (folders.hasNext()) {
                current = folders.next();
            } else {
                console.error(`Folder not found: ${name} in ${path}`);
                return null;
            }
        }
        return current;
    }
}
