function debug_timezone_check() {
    const tz = Session.getScriptTimeZone();
    console.log(`Script TimeZone: ${tz}`);

    const d1 = new Date('2025-01-07');
    console.log(`new Date('2025-01-07') -> ${d1.toString()} (ISO: ${d1.toISOString()})`);

    const d2 = new Date('2025-01-07T00:00:00');
    console.log(`new Date('2025-01-07T00:00:00') -> ${d2.toString()}`);

    const d3 = new Date(2025, 0, 7);
    console.log(`new Date(2025, 0, 7) -> ${d3.toString()}`);

    // CalendarApp interpretation check
    const calId = 'c_400854414_adc46355-89ee-4a95-bf95-1c4229f910ef@group.calendar.google.com'; // Dummy or user's
    console.log('CalendarApp default timezone might affect createAllDayEvent');
}
