function debugLwEventDates() {
    const sync = new CalendarSyncEngine();
    // 村田太志のID (Configより)
    const userId = 'd28b88f0-24ba-4fa0-1a14-046ff737ee66';
    const calendars = sync.lwService.getUserCalendars(userId);

    if (!calendars.length) {
        console.log('No calendars found');
        return;
    }

    const calId = calendars[0].calendarId;
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 10); // Jan 10
    const end = new Date(now.getFullYear(), 0, 20);   // Jan 20

    console.log(`Fetching events from ${start.toISOString()} to ${end.toISOString()}`);

    const events = sync.lwService.getEvents(userId, calId, start, end);

    events.forEach(e => {
        if (e.start.date) { // All day event
            console.log(`[All-Day] Title: ${e.summary}`);
            console.log(`  LW Raw Start: ${e.start.date}`);
            console.log(`  LW Raw End:   ${e.end.date}`);

            // Simulate Normalize Logic
            const sParts = e.start.date.split('-');
            const sObj = new Date(parseInt(sParts[0]), parseInt(sParts[1]) - 1, parseInt(sParts[2]));

            const eParts = e.end.date.split('-');
            const eObj = new Date(parseInt(eParts[0]), parseInt(eParts[1]) - 1, parseInt(eParts[2]));

            console.log(`  Parsed Start: ${sObj.toString()}`);
            console.log(`  Parsed End:   ${eObj.toString()}`);

            // Simulate Fix Logic
            let fixedEnd = new Date(eObj);
            if (sObj >= eObj) {
                console.log('  -> Triggering Fix (Start >= End)');
                fixedEnd.setDate(fixedEnd.getDate() + 1);
            }
            console.log(`  Final GCal Start: ${sObj.toString()}`);
            console.log(`  Final GCal End:   ${fixedEnd.toString()}`);

            const duration = (fixedEnd - sObj) / (1000 * 60 * 60 * 24);
            console.log(`  Duration: ${duration} days`);
            console.log('-----------------------------------');
        }
    });
}
