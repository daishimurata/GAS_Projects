
function checkCounts() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const project = Config.BIGQUERY.PROJECT_ID;

    const countUser = bq.runQuery(`SELECT count(*) as cnt FROM \`${project}.${datasetId}.accounting_attendance\``);
    const countStaff = bq.runQuery(`SELECT count(*) as cnt FROM \`${project}.${datasetId}.staff_attendance\``);

    console.log(`User Attendance Count: ${countUser[0].cnt}`);
    console.log(`Staff Attendance Count: ${countStaff[0].cnt}`);
}
