/**
 * src/modules/attendance/AttendanceDBSetup.js
 * 勤怠管理用BigQueryテーブルおよびビューのセットアップ
 */

function setupAttendanceDB() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;

    // 1. 利用者マスター (user_master)
    // ※ 既存の user_master がある場合はスキーマを統合するか、別の名前にすることを検討
    // ここでは勤怠管理に必要な最小限のフィールドを定義
    const userMasterSchema = {
        fields: [
            { name: 'user_name', type: 'STRING', mode: 'REQUIRED' },
            { name: 'recipient_id', type: 'STRING' },
            { name: 'municipality', type: 'STRING' },
            { name: 'last_updated', type: 'TIMESTAMP' }
        ]
    };

    // 2. 提供実績（マスター）テーブル (attendance_master)
    const attendanceMasterSchema = {
        fields: [
            { name: 'user_name', type: 'STRING', mode: 'REQUIRED' },
            { name: 'date', type: 'DATE', mode: 'REQUIRED' },
            { name: 'start_time', type: 'STRING' },
            { name: 'end_time', type: 'STRING' },
            { name: 'transportation', type: 'STRING' },
            { name: 'meal_provided', type: 'BOOLEAN' },
            { name: 'source_file', type: 'STRING' },
            { name: 'created_at', type: 'TIMESTAMP' }
        ]
    };

    // 3. 経理勤務表テーブル (accounting_attendance)
    const accountingAttendanceSchema = {
        fields: [
            { name: 'user_name', type: 'STRING', mode: 'REQUIRED' },
            { name: 'type', type: 'STRING' }, // 'USER' or 'STAFF'
            { name: 'date', type: 'DATE', mode: 'REQUIRED' },
            { name: 'is_recorded', type: 'BOOLEAN' },
            { name: 'source_file', type: 'STRING' },
            { name: 'created_at', type: 'TIMESTAMP' }
        ]
    };

    try {
        // 各テーブルを個別に作成（既存エラーをキャッチして継続）
        const createTbl = (id, sc) => {
            try {
                bq.createTable(datasetId, id, sc);
                console.log(`✅ Table created: ${id}`);
            } catch (e) {
                if (e.message.includes('Already Exists')) {
                    console.log(`ℹ️ Table already exists: ${id}`);
                } else {
                    throw e;
                }
            }
        };

        createTbl(Config.BIGQUERY.TABLES.ATTENDANCE_MASTER, attendanceMasterSchema);
        createTbl(Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE, accountingAttendanceSchema);

        // 4. スタッフ勤怠テーブル (staff_attendance)
        const staffAttendanceSchema = {
            fields: [
                { name: 'staff_name', type: 'STRING', mode: 'REQUIRED' },
                { name: 'date', type: 'DATE', mode: 'REQUIRED' },
                { name: 'is_recorded', type: 'BOOLEAN' },
                { name: 'source_file', type: 'STRING' },
                { name: 'created_at', type: 'TIMESTAMP' }
            ]
        };
        createTbl(Config.BIGQUERY.TABLES.STAFF_ATTENDANCE, staffAttendanceSchema);

        console.log('All tables verified/created successfully.');

        // 4. 整合性検証用ビューの作成
        const reconViewId = 'v_attendance_reconciliation';
        const project = Config.BIGQUERY.PROJECT_ID;
        const masterTable = `${project}.${datasetId}.${Config.BIGQUERY.TABLES.ATTENDANCE_MASTER}`;
        const accountingTable = `${project}.${datasetId}.${Config.BIGQUERY.TABLES.ACCOUNTING_ATTENDANCE}`;

        // 実績にあって経理にない、またはその逆、時間の差異などを抽出するSQL
        const reconSql = `
            SELECT
                COALESCE(m.user_name, a.user_name) AS user_name,
                COALESCE(m.date, a.date) AS date,
                CASE
                    WHEN m.date IS NOT NULL AND a.date IS NULL THEN '実績のみ'
                    WHEN m.date IS NULL AND a.date IS NOT NULL THEN '経理のみ'
                    ELSE '一致'
                END AS status,
                m.start_time AS master_start,
                m.end_time AS master_end,
                m.source_file AS master_source,
                a.source_file AS accounting_source
            FROM \`${masterTable}\` m
            FULL OUTER JOIN \`${accountingTable}\` a
                ON m.user_name = a.user_name AND m.date = a.date
            ORDER BY date DESC, user_name ASC
        `;

        // ビュー作成用のDML（DMLでは作成できないためBigQuery.Tables.insertを使用）
        const viewTable = {
            tableReference: {
                projectId: project,
                datasetId: datasetId,
                tableId: reconViewId
            },
            view: {
                query: reconSql,
                useLegacySql: false
            }
        };

        try {
            BigQuery.Tables.insert(viewTable, project, datasetId);
            console.log(`View ${reconViewId} created successfully.`);
        } catch (viewErr) {
            console.warn(`View creation warning (likely already exists): ${viewErr.message}`);
        }

    } catch (e) {
        console.error('Error in setupAttendanceDB:', e);
    }
}

/**
 * 書類自動生成用のスケジュール管理およびテンプレート管理テーブルのセットアップ
 */
function setupDocumentAutomationDB() {
    const bq = getBigQueryClient();
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const projectId = Config.BIGQUERY.PROJECT_ID;

    // 1. スケジュール管理テーブル (document_schedule)
    const scheduleTableId = 'document_schedule';
    const scheduleSchema = {
        fields: [
            { name: 'user_name', type: 'STRING', mode: 'REQUIRED' },
            { name: 'doc_type', type: 'STRING', mode: 'REQUIRED' }, // 'PLAN' (計画書), 'MONITORING' (モニタリング)
            { name: 'last_completed_date', type: 'DATE' },
            { name: 'next_due_date', type: 'DATE' },
            { name: 'status', type: 'STRING' }, // 'PENDING', 'GENERATED', 'SENT'
            { name: 'updated_at', type: 'TIMESTAMP' }
        ]
    };

    // 2. テンプレート管理テーブル (document_templates)
    const templateTableId = 'document_templates';
    const templateSchema = {
        fields: [
            { name: 'doc_type', type: 'STRING', mode: 'REQUIRED' },
            { name: 'html_template', type: 'STRING', mode: 'REQUIRED' },
            { name: 'system_prompt', type: 'STRING' },
            { name: 'version', type: 'INTEGER' },
            { name: 'updated_at', type: 'TIMESTAMP' }
        ]
    };

    const createTbl = (id, sc) => {
        const tableResource = {
            tableReference: {
                projectId: projectId,
                datasetId: datasetId,
                tableId: id
            },
            schema: sc
        };
        try {
            BigQuery.Tables.insert(tableResource, projectId, datasetId);
            console.log(`✅ Table created: ${id}`);
        } catch (e) {
            if (e.message.includes('Already Exists')) {
                console.log(`ℹ️ Table already exists: ${id}`);
            } else {
                console.error(`❌ Error creating ${id}:`, e);
            }
        }
    };

    createTbl(scheduleTableId, scheduleSchema);
    createTbl(templateTableId, templateSchema);

    console.log('--- BigQuery ML Model Creation SQL (Execute in BQ Console) ---');
    console.log(`
        CREATE OR REPLACE MODEL \`${datasetId}.gemini_flash_model\`
        REMOTE WITH CONNECTION \`${projectId}.us.gemini-connection\`
        OPTIONS(ENDPOINT = 'gemini-1.5-flash');
    `);
}

/**
 * 柿内環奈さんの抽出データを初期データとして投入
 */
function seedKakiuchiData() {
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const projectId = Config.BIGQUERY.PROJECT_ID;
    const tableId = 'document_schedule';

    const kakiuchiData = {
        user_name: "116-柿内環奈",
        doc_type: "PLAN",
        last_completed_date: "2025-10-31", // plan_start
        next_due_date: "2026-04-28",      // plan_end
        status: "GENERATED",
        updated_at: new Date().toISOString()
    };

    const row = {
        json: kakiuchiData
    };

    try {
        BigQuery.Tabledata.insertAll({
            rows: [row]
        }, projectId, datasetId, tableId);
        console.log(`✅ Seeded data for Kakiuchi-san to ${tableId}`);
    } catch (e) {
        console.error('❌ Error seeding data:', e);
    }
}

/**
 * 書類生成用のHTMLテンプレートとプロンプトを登録
 */
function seedTemplateData() {
    const datasetId = Config.BIGQUERY.DATASET_ID;
    const projectId = Config.BIGQUERY.PROJECT_ID;
    const tableId = 'document_templates';

    const planTemplate = {
        doc_type: "PLAN",
        html_template: `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>個別支援計画書 - {{user_name}}</title>
    <style>
        body { font-family: "MS UI Gothic", sans-serif; line-height: 1.5; }
        .header { text-align: center; font-size: 1.2em; font-weight: bold; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid black; padding: 8px; text-align: left; }
        .label { background-color: #f2f2f2; width: 25%; }
    </style>
</head>
<body>
    <div class="header">個別支援計画書（案）</div>
    <table>
        <tr>
            <td class="label">利用者氏名</td>
            <td>{{user_name}} 様</td>
        </tr>
        <tr>
            <td class="label">作成年月日</td>
            <td>{{creation_date}}</td>
        </tr>
        <tr>
            <td class="label">計画期間</td>
            <td>{{plan_start}} ～ {{plan_end}}</td>
        </tr>
    </table>
    <h3>本人の希望・生活に対する意向</h3>
    <p>{{aspiration}}</p>
    
    <h3>具体的な支援目標・内容</h3>
    <div style="border: 1px solid black; padding: 10px; height: 100px;">
        {{support_content}}
    </div>
</body>
</html>
        `,
        system_prompt: `
あなたは優秀な就労支援員です。提供された利用者の基本情報と過去の記録に基づき、
指定されたHTMLテンプレート内のプレースホルダ（{{...}}）を埋めて、
完成したHTMLコードのみを出力してください。
利用者の尊厳を守り、具体的でポジティブな支援計画を作成してください。
        `,
        version: 1,
        updated_at: new Date().toISOString()
    };

    const row = {
        json: planTemplate
    };

    try {
        BigQuery.Tabledata.insertAll({
            rows: [row]
        }, projectId, datasetId, tableId);
        console.log(`✅ Seeded template data to ${tableId}`);
    } catch (e) {
        console.error('❌ Error seeding template data:', e);
    }
}
