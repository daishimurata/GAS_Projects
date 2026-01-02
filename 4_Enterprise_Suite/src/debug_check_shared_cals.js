function debugListAllCalendars() {
    const sync = new CalendarSyncEngine();
    const directory = new DirectoryService();
    const users = directory.getUsers();

    console.log(`Checking ${users.length} users for shared/group calendars...`);

    const token = sync.lwService.lineAuth.getAccessToken('calendar');

    users.slice(0, 5).forEach(user => { // 最初の5人だけチェック
        const userId = user.userId;
        const name = user.userName ? `${user.userName.lastName}${user.userName.firstName}` : userId;

        // 1. Personal Calendars
        const personalUrl = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/calendar-personals`;
        const resP = UrlFetchApp.fetch(personalUrl, { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true });

        // 2. All Calendars (Group, Shared etc.)
        const allUrl = `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}/calendars`;
        const resA = UrlFetchApp.fetch(allUrl, { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true });

        console.log(`User: ${name} (${userId})`);
        console.log(`  Personal Calendars: ${resP.getContentText()}`);
        console.log(`  All Calendars Scope: ${resA.getContentText()}`);
        console.log('---');
    });
}
