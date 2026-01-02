function debugVerifyStoreNormalization() {
    const repository = new SalesRepository();

    const testCases = [
        "一号舘 常盤店",
        "1号館常盤店",
        "（株）一号舘 常盤店",
        "(株)一号舘　常盤店",
        "一号館",
        "一号舘",
        "1号館",
        "エーコープ",
        "Aコープ",
        "Ａコープ",
        "四季彩 常磐店",
        "四季菜 常磐"
    ];

    console.log("--- Testing Store Name Normalization ---");

    testCases.forEach(input => {
        const normalized = repository._normalizeStoreName(input);
        console.log(`Input: [${input}] => Output: [${normalized}]`);
    });

    console.log("--- End of Test ---");
}
