const GEMINI_API_KEY = 'AIzaSyDK2KJXxRrcQ_duxYGAAR7Ma1U0pl1V04k'; // User provided key
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const PROJECT_ID = 'gen-lang-client-0396634194';
const DATASET_ID = 'ebay_db';
const DB_FILE_NAME = 'eBay_Item_Database';
const LEARNING_FILE_NAME = 'eBay_Learning_Data';

// --- Category Whitelisting ---
const VALID_CATEGORY_IDS = [
    "261068", "139973", "1249", "38583", "183454", "31388", "15230", "78997",
    "31387", "169291", "33021", "179001", "156526", "15687", "176983", "63968",
    "2996", "63862", "69528"
];
const DEFAULT_CATEGORY_ID = "69528";


function doGet(e) {
    // Debug Endpoint to check DB persistence
    if (e && e.parameter && e.parameter.check_db === 'true') {
        try {
            const data = getLastItems();
            return ContentService.createTextOutput(JSON.stringify(data, null, 2))
                .setMimeType(ContentService.MimeType.JSON);
        } catch (err) {
            return ContentService.createTextOutput("Error querying DB: " + err.message);
        }
    }
    // Manual Page
    if (e && e.parameter && e.parameter.page === 'manual') {
        return HtmlService.createTemplateFromFile('manual')
            .evaluate()
            .setTitle('eBayかわいい - 使い方マニュアル')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    // Shipping Guide Page
    if (e && e.parameter && e.parameter.page === 'shipping_guide') {
        return HtmlService.createTemplateFromFile('shipping_guide')
            .evaluate()
            .setTitle('eBay Shipping Policy 設定ガイド')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    // Remote Research Page
    if (e && e.parameter && e.parameter.page === 'research') {
        return HtmlService.createTemplateFromFile('research')
            .evaluate()
            .setTitle('eBay User Research - eBayかわいい')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    // Lowest Price Research Page
    if (e && e.parameter && e.parameter.page === 'lowest_price') {
        return HtmlService.createTemplateFromFile('lowest_price')
            .evaluate()
            .setTitle('最安値リサーチ - eBayかわいい')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    // Shipping Simulator Page
    if (e && e.parameter && e.parameter.page === 'shipping_simulator') {
        return HtmlService.createTemplateFromFile('shipping_simulator')
            .evaluate()
            .setTitle('送料シミュレーター - eBayかわいい')
            .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
            .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    // Default: Index Page
    return HtmlService.createTemplateFromFile('index')
        .evaluate()
        .setTitle('eBayかわいい (v17.2) - 整理されたダッシュボード')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getLastItems() {
    const query = `SELECT timestamp, title, description, category_id FROM \`${PROJECT_ID}.${DATASET_ID}.items\` ORDER BY timestamp DESC LIMIT 5`;
    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return ["No rows found"];

        // Map BQ result to simple JSON
        return result.rows.map(row => {
            return {
                timestamp: row.f[0].v,
                title: row.f[1].v,
                description: row.f[2].v ? row.f[2].v.substring(0, 50) + "..." : "Does not apply",
                category_id: row.f[3].v
            };
        });
    } catch (e) {
        throw e;
    }
}

/**
 * Initializes BigQuery Dataset and Tables if they don't exist.
 * Run this manually once.
 */
function initBigQuery() {
    try {
        // 1. Create Dataset
        try {
            BigQuery.Datasets.insert({
                datasetReference: { datasetId: DATASET_ID }
            }, PROJECT_ID);
            console.log(`Dataset ${DATASET_ID} created.`);
        } catch (e) {
            if (!e.message.includes('Already Exists')) throw e;
            console.log(`Dataset ${DATASET_ID} already exists.`);
        }

        const tables = [
            {
                tableId: 'items',
                schema: {
                    fields: [
                        { name: 'timestamp', type: 'TIMESTAMP' },
                        { name: 'custom_label', type: 'STRING' },
                        { name: 'title', type: 'STRING' },
                        { name: 'price', type: 'FLOAT' },
                        { name: 'category_id', type: 'STRING' },
                        { name: 'condition_id', type: 'STRING' },
                        { name: 'item_specifics', type: 'STRING' }, // JSON string
                        { name: 'description', type: 'STRING' }, // New Field
                        { name: 'buying_price_jpy', type: 'INTEGER' }, // New Field: Cost
                        { name: 'seller_comment', type: 'STRING' }, // New Field
                        { name: 'image_urls', type: 'STRING' }, // Added for draft completion
                        { name: 'ebay_item_id', type: 'STRING' },
                        { name: 'listing_url', type: 'STRING' },
                        { name: 'status', type: 'STRING' }
                    ]
                }
            },
            {
                tableId: 'learning_data',
                schema: {
                    fields: [
                        { name: 'timestamp', type: 'TIMESTAMP' },
                        { name: 'label', type: 'STRING' },
                        { name: 'category_id', type: 'STRING' },
                        { name: 'specifics', type: 'STRING' },
                        { name: 'raw_input', type: 'STRING' }
                    ]
                }
            },
            {
                tableId: 'mail_log',
                schema: {
                    fields: [
                        { name: 'timestamp', type: 'TIMESTAMP' },
                        { name: 'from_address', type: 'STRING' },
                        { name: 'subject', type: 'STRING' },
                        { name: 'body_preview', type: 'STRING' },
                        { name: 'related_id', type: 'STRING' }
                    ]
                }
            },
            {
                tableId: 'followed_sellers',
                schema: {
                    fields: [
                        { name: 'seller_id', type: 'STRING' },
                        { name: 'store_name', type: 'STRING' },
                        { name: 'follower_count', type: 'INTEGER' },
                        { name: 'feedback_score', type: 'INTEGER' },
                        { name: 'active_count', type: 'INTEGER' },
                        { name: 'sold_count', type: 'INTEGER' },
                        { name: 'last_updated', type: 'TIMESTAMP' }
                    ]
                }
            },
            {
                tableId: 'ebay_listings',
                schema: {
                    fields: [
                        { name: 'item_id', type: 'STRING' },
                        { name: 'title', type: 'STRING' },
                        { name: 'price', type: 'FLOAT' },
                        { name: 'currency', type: 'STRING' },
                        { name: 'status', type: 'STRING' }, // ACTIVE, SOLD, UNSOLD
                        { name: 'start_time', type: 'TIMESTAMP' },
                        { name: 'end_time', type: 'TIMESTAMP' },
                        { name: 'item_url', type: 'STRING' },
                        { name: 'image_url', type: 'STRING' },
                        { name: 'condition', type: 'STRING' },
                        { name: 'last_synced', type: 'TIMESTAMP' },
                        { name: 'sold_at', type: 'TIMESTAMP' },
                        { name: 'deleted_at', type: 'TIMESTAMP' },
                        { name: 'view_count', type: 'INTEGER' },
                        { name: 'watch_count', type: 'INTEGER' }
                    ]
                }
            }
        ];

        tables.forEach(table => {
            try {
                BigQuery.Tables.insert({
                    tableReference: { datasetId: DATASET_ID, tableId: table.tableId },
                    schema: table.schema
                }, PROJECT_ID, DATASET_ID);
                console.log(`Table ${table.tableId} created.`);
            } catch (e) {
                if (e.message.includes('Already Exists')) {
                    console.log(`Table ${table.tableId} already exists. Checking for updates...`);
                    if (table.tableId === 'items') {
                        // Check if description column exists, if not, patch it
                        try {
                            const currentTable = BigQuery.Tables.get(PROJECT_ID, DATASET_ID, 'items');
                            const fields = currentTable.schema.fields;

                            // Patch Description
                            if (!fields.some(f => f.name === 'description')) {
                                fields.push({ name: 'description', type: 'STRING' });
                                BigQuery.Tables.patch({ schema: { fields: fields } }, PROJECT_ID, DATASET_ID, 'items');
                                console.log('Schema updated: Added description column.');
                            }

                            // Patch Buying Price
                            if (!fields.some(f => f.name === 'buying_price_jpy')) {
                                fields.push({ name: 'buying_price_jpy', type: 'INTEGER' });
                                BigQuery.Tables.patch({ schema: { fields: fields } }, PROJECT_ID, DATASET_ID, 'items');
                                console.log('Schema updated: Added buying_price_jpy column.');
                            }

                            // Patch Seller Comment
                            if (!fields.some(f => f.name === 'seller_comment')) {
                                fields.push({ name: 'seller_comment', type: 'STRING' });
                                BigQuery.Tables.patch({ schema: { fields: fields } }, PROJECT_ID, DATASET_ID, 'items');
                                console.log('Schema updated: Added seller_comment column.');
                            }

                            // Patch Image URLs (for Draft Completion)
                            if (!fields.some(f => f.name === 'image_urls')) {
                                fields.push({ name: 'image_urls', type: 'STRING' });
                                BigQuery.Tables.patch({ schema: { fields: fields } }, PROJECT_ID, DATASET_ID, 'items');
                                console.log('Schema updated: Added image_urls column.');
                            }
                        } catch (patchErr) {
                            console.warn('Failed to patch schema for items:', patchErr);
                        }
                    } else if (table.tableId === 'ebay_listings') {
                        // Check and patch for sold_at and deleted_at
                        try {
                            const currentTable = BigQuery.Tables.get(PROJECT_ID, DATASET_ID, 'ebay_listings');
                            const fields = currentTable.schema.fields;
                            let updated = false;

                            if (!fields.some(f => f.name === 'sold_at')) {
                                fields.push({ name: 'sold_at', type: 'TIMESTAMP' });
                                updated = true;
                            }
                            if (!fields.some(f => f.name === 'deleted_at')) {
                                fields.push({ name: 'deleted_at', type: 'TIMESTAMP' });
                                updated = true;
                            }
                            if (!fields.some(f => f.name === 'view_count')) {
                                fields.push({ name: 'view_count', type: 'INTEGER' });
                                updated = true;
                            }
                            if (!fields.some(f => f.name === 'watch_count')) {
                                fields.push({ name: 'watch_count', type: 'INTEGER' });
                                updated = true;
                            }

                            if (updated) {
                                BigQuery.Tables.patch({ schema: { fields: fields } }, PROJECT_ID, DATASET_ID, 'ebay_listings');
                                console.log('Schema updated: Added sold_at/deleted_at to ebay_listings.');
                            }
                        } catch (patchErr) {
                            console.warn('Failed to patch schema for ebay_listings:', patchErr);
                        }
                    }
                } else {
                    throw e;
                }
            }
        });

    } catch (err) {
        console.error('BigQuery Init Failed:', err);
        throw err;
    }
}

/**
 * Helper to move file to script's folder
 */
function moveFileToScriptFolder(fileId) {
    const file = DriveApp.getFileById(fileId);
    const scriptFile = DriveApp.getFileById(ScriptApp.getScriptId());
    const parents = scriptFile.getParents();
    if (parents.hasNext()) {
        const folder = parents.next();
        file.moveTo(folder);
    }
}

/**
 * Ensures the mail log sheet exists.
 */
function getOrCreateMailLogSheet() {
    const files = DriveApp.getFilesByName('eBay_Mail_Log');
    let ss;
    if (files.hasNext()) {
        ss = SpreadsheetApp.open(files.next());
    } else {
        ss = SpreadsheetApp.create('eBay_Mail_Log');
        moveFileToScriptFolder(ss.getId()); // Move to project folder
        const sheet = ss.getActiveSheet();
        sheet.appendRow(['Timestamp', 'From', 'Subject', 'Body Preview', 'Related ItemID/SKU']);
        sheet.setFrozenRows(1);
    }
    return ss.getActiveSheet();
}

/**
 * Helper to insert data into BigQuery
 */
function insertIntoBigQuery(tableId, rows) {
    const request = {
        rows: rows.map(row => ({ json: row }))
    };
    try {
        const response = BigQuery.Tabledata.insertAll(request, PROJECT_ID, DATASET_ID, tableId);
        if (response.insertErrors && response.insertErrors.length > 0) {
            console.error(`Partial/Total Failure in ${tableId}. Errors:`, JSON.stringify(response.insertErrors));
            // If schema mismatch (invalid field), try to auto-patch schema
            if (JSON.stringify(response.insertErrors).includes('no such field')) {
                console.warn("Detected missing fields. Attempting Schema Auto-Healing...");
                initBigQuery(); // This checks for missing fields and patches them
                // Retry once
                const retryResp = BigQuery.Tabledata.insertAll(request, PROJECT_ID, DATASET_ID, tableId);
                if (retryResp.insertErrors && retryResp.insertErrors.length > 0) {
                    console.error("Retry Failed:", JSON.stringify(retryResp.insertErrors));
                } else {
                    console.log(`Schema Patch & Retry Successful for ${tableId}`);
                }
            }
        } else {
            console.log(`Inserted ${rows.length} rows into ${tableId}`);
        }
    } catch (e) {
        console.warn(`Failed to insert into ${tableId}:`, e);
        // Auto-Recovery for 404 (Table Not Found)
        if (e.message && (e.message.includes('Not found') || e.message.includes('404'))) {
            console.log(`Attempting to auto-create table ${tableId}...`);
            try {
                initBigQuery();
                // Wait a moment for propagation? BQ is usually fast.
                BigQuery.Tabledata.insertAll(request, PROJECT_ID, DATASET_ID, tableId);
                console.log(`Retry successful: Inserted ${rows.length} rows into ${tableId}`);
            } catch (retryErr) {
                console.error(`Fatal: Failed to insert into ${tableId} after retry:`, retryErr);
            }
        }
    }
}

/**
 * Ensures the learning data sheet exists.
 */
function getOrCreateLearningSheet() {
    const files = DriveApp.getFilesByName(LEARNING_FILE_NAME);
    let ss;
    if (files.hasNext()) {
        ss = SpreadsheetApp.open(files.next());
    } else {
        ss = SpreadsheetApp.create(LEARNING_FILE_NAME);
        moveFileToScriptFolder(ss.getId()); // Move to project folder
        const sheet = ss.getActiveSheet();
        sheet.appendRow(['Timestamp', 'Label', 'CategoryID', 'ItemSpecifics (JSON)', 'Raw Input']);
        sheet.setFrozenRows(1);
    }
    return ss.getActiveSheet();
}

/**
 * Saves new learning data (Few-Shot Examples) to BigQuery.
 * This directly saves the already-parsed data block.
 */
function saveLearningData(data) {
    // data: { label: string, categoryId: string, specifics: object, raw: string }
    const row = {
        timestamp: new Date().toISOString(),
        label: data.label,
        category_id: data.categoryId,
        specifics: JSON.stringify(data.specifics),
        raw_input: data.raw
    };
    insertIntoBigQuery('learning_data', [row]);
}

/**
 * Uses Gemini to parse pasted text from eBay (Key-Value, Category IDs etc)
 * and automatically saves it as learning data.
 */
function parseAndSaveLearningData(rawText) {
    if (!rawText) {
        throw new Error("学習データ（テキスト）は必須です");
    }

    const payload = {
        "contents": [{
            "parts": [{
                "text": `
You are an expert at parsing messy copied text from eBay item pages.
The user will paste text containing an eBay Category ID and Item Specifics (Key-Value pairs) or item titles.
It might be tab-separated, newline-separated, or mixed.

Extract the "CategoryID" (usually a 3 to 6 digit number at the beginning or labeled as Category ID) and all "Item Specifics".
Also, critically, generate a short "Label" (in English or Japanese, max 3-4 words) that best describes the type of product based on the pasted text (e.g., "Video Game", "Pokemon Card", "Camera Lens").

Output MUST be strictly a single JSON object with this exact structure:
{
  "label": "Super Mario Game",
  "categoryId": "123456",
  "specifics": {
    "Brand": "Nintendo",
    "Character": "Mario",
    "Type": "Action Figure"
  }
}

Do not include markdown \`\`\`json wrappers. Just the JSON object. 
If you cannot find a Category ID, use "69528" as fallback.
Extracted text:
${rawText}
                `
            }]
        }],
        "generationConfig": {
            "temperature": 0.1 // very low temperature for precise extraction
        }
    };

    const options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(payload),
        'muteHttpExceptions': true
    };

    let response;
    try {
        // GEMINI_API_URL already incorporates the API key.
        response = UrlFetchApp.fetch(GEMINI_API_URL, options);
    } catch (e) {
        throw new Error("Gemini API Error: " + e.message);
    }

    if (response.getResponseCode() !== 200) {
        throw new Error("Gemini API Status " + response.getResponseCode() + ": " + response.getContentText());
    }

    let resultJson;
    try {
        const text = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        resultJson = JSON.parse(cleanText);
    } catch (e) {
        throw new Error("Failed to parse Gemini response into JSON: " + e.message);
    }

    const learningData = {
        label: resultJson.label || "Auto-detected Item",
        categoryId: String(resultJson.categoryId || "69528"),
        specifics: resultJson.specifics || {},
        raw: rawText
    };

    // Save to BigQuery
    saveLearningData(learningData);

    return learningData;
}

/**
 * Retrieves recent learning examples from BigQuery.
 */
function getFewShotExamples() {
    try {
        const query = `
      SELECT label, category_id, specifics 
      FROM \`${PROJECT_ID}.${DATASET_ID}.learning_data\`
      ORDER BY timestamp DESC
      LIMIT 10
    `;

        const queryRequest = {
            query: query,
            useLegacySql: false
        };

        // Check if table exists before querying (basic check)
        // For simplicity, we wrap inside try-catch. If BQ not enabled/table missing, it fails gracefully.

        let result;
        try {
            result = BigQuery.Jobs.query(queryRequest, PROJECT_ID);
        } catch (e) {
            console.warn("BQ Query failed (maybe table doesn't exist yet):", e);
            return "";
        }

        const rows = result.rows;
        if (!rows || rows.length === 0) return "";

        let examplesText = "\n\nCRITICAL: Refer to these USER-DEFINED LEARNING EXAMPLES for Category and Specifics selection:\n";

        rows.forEach(row => {
            const label = row.f[0].v;
            const catId = row.f[1].v;
            const specsJson = row.f[2].v;

            if (label && catId) {
                examplesText += `- Context: "${label}" -> Use CategoryID: "${catId}", ItemSpecifics: ${specsJson}\n`;
            }
        });

        return examplesText;
    } catch (e) {
        console.warn("Failed to retrieve learning examples from BQ", e);
        return "";
    }
}

/**
 * Retrieves upload history (batches) from BigQuery.
 * Groups by timestamp to show "sets" of uploads.
 */
function getUploadHistory() {
    // Group by timestamp to identify "batches"
    // We take one title as a label
    const query = `
        SELECT 
            timestamp, 
            COUNT(*) as count, 
            ANY_VALUE(title) as sample_title 
        FROM \`${PROJECT_ID}.${DATASET_ID}.items\` 
        GROUP BY timestamp 
        ORDER BY timestamp DESC 
        LIMIT 20
    `;

    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return [];

        return result.rows.map(row => ({
            timestamp: row.f[0].v,
            count: row.f[1].v,
            label: row.f[2].v
        }));
    } catch (e) {
        console.error("History query failed:", e);
        throw new Error("Failed to fetch history.");
    }
}

/**
 * Retrieves specific items for a historical batch (timestamp).
 */
function getHistoryDetails(timestampStr) {
    // timestampStr might be in scientific notation (e.g. 1.771E9) from BQ API response
    // We need to robustly handle this.

    // Construct Query: Check if input looks like a number/scientific notation
    let whereClause = "";
    if (!isNaN(parseFloat(timestampStr))) {
        // Input is seconds (float). Convert to MICROS (int) for precise matching.
        // TIMESTAMP_SECONDS only accepts INT64 (whole seconds), so we use MICROS.
        whereClause = `timestamp = TIMESTAMP_MICROS(CAST(CAST('${timestampStr}' AS FLOAT64) * 1000000 AS INT64))`;
    } else {
        // Assume standard string format 'YYYY-MM-DD...'
        whereClause = `timestamp = '${timestampStr}'`;
    }

    const query = `
        SELECT 
            custom_label,
            title,
            price,
            category_id,
            condition_id,
            item_specifics,
            description
        FROM \`${PROJECT_ID}.${DATASET_ID}.items\` 
        WHERE ${whereClause}
    `;

    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return [];

        // Explicit Mapping based on SELECT order
        // 0:custom_label, 1:title, 2:price, 3:category_id, 4:condition_id, 5:item_specifics, 6:description
        return result.rows.map(row => {
            let specs = {};
            try {
                specs = JSON.parse(row.f[5].v); // item_specifics is index 5
            } catch (e) { specs = {}; }

            return {
                CustomLabel: row.f[0].v,
                ItemName: row.f[1].v,
                StartPrice: row.f[2].v,
                CategoryID: row.f[3].v,
                ConditionID: row.f[4].v,
                ItemSpecifics: specs,
                Description: row.f[6].v
            };
        });

    } catch (e) {
        console.error("History details failed:", e);
        throw new Error(`Failed to fetch history details: ${e.message}`);
    }
}

/**
 * Retrieves paginated items from the main database table.
 */
function getDatabaseItems(page = 1, pageSize = 50) {
    const offset = (page - 1) * pageSize;
    const query = `
        SELECT 
            timestamp,
            custom_label,
            title,
            price,
            category_id,
            status,
            description,
            buying_price_jpy,
            seller_comment
        FROM \`${PROJECT_ID}.${DATASET_ID}.items\` 
        ORDER BY timestamp DESC
        LIMIT ${pageSize} OFFSET ${offset}
    `;

    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return [];
        return mapRows(result.rows);
    } catch (e) {
        console.warn("Initial DB Query failed. Checking for schema updates...", e);
        // Check for missing column error (standard BQ error for this)
        if (e.message.includes("not found") || e.message.includes("Unrecognized name")) {
            try {
                console.log("Attempting Schema Auto-Healing...");
                initBigQuery(); // Patch Schema
                // Retry Query
                const result = BigQuery.Jobs.query(request, PROJECT_ID);
                if (!result.rows) return [];
                return mapRows(result.rows);
            } catch (retryErr) {
                console.error("Retry failed after schema patch:", retryErr);
                throw retryErr;
            }
        }
        throw e;
    }
}

function mapRows(rows) {
    const EXCHANGE_RATE = 140;
    const FEE_RATE = 0.85;
    const DEFAULT_SHIPPING = 20.00;
    const PROFIT_MULTIPLIER = 1.20;

    return rows.map(row => {
        const buyingPriceJPY = parseInt(row.f[7].v) || 0;

        // Recalculate price from BuyingPriceJPY (Phase 1 Fix)
        let calculatedPrice = 0;
        if (buyingPriceJPY > 0) {
            const costUSD = buyingPriceJPY / EXCHANGE_RATE;
            const baseTotal = costUSD + DEFAULT_SHIPPING;
            calculatedPrice = (baseTotal * PROFIT_MULTIPLIER) / FEE_RATE;
        }

        return {
            Validation: "Valid",
            Timestamp: row.f[0].v,
            CustomLabel: row.f[1].v,
            Title: row.f[2].v,
            Price: calculatedPrice > 0 ? calculatedPrice.toFixed(2) : row.f[3].v, // Use calculated price if available
            CategoryID: row.f[4].v,
            Status: row.f[5].v,
            Description: row.f[6].v ? row.f[6].v.substring(0, 100) + "..." : "",
            BuyingPriceJPY: buyingPriceJPY,
            SellerComment: row.f[8].v || "" // Map new field
        };
    });
}

/**
 * Ensures the database sheet exists and returns it.
 * If not, creates it with the correct headers.
 */
function getOrCreateDatabase() {
    const files = DriveApp.getFilesByName(DB_FILE_NAME);
    let ss;

    if (files.hasNext()) {
        ss = SpreadsheetApp.open(files.next());
    } else {
        ss = SpreadsheetApp.create(DB_FILE_NAME);
        moveFileToScriptFolder(ss.getId()); // Move to project folder
        const sheet = ss.getActiveSheet();
        // Initialize Headers for Post-Listing Tracking
        sheet.appendRow([
            'Timestamp',
            'CustomLabel (SKU)',
            'Title (EN)',
            'Price (USD)',
            'Category ID',
            'Condition ID',
            'Item Specifics (JSON)',
            'eBay Item ID',
            'Listing URL',
            'Status',
            'Last Updated'
        ]);
        sheet.setFrozenRows(1);
    }
    return ss.getActiveSheet();
}

/**
 * Saves analyzed items to BigQuery.
 */
function saveToDatabase(items) {
    const timestamp = new Date().toISOString();

    const rows = items.map(item => ({
        timestamp: timestamp,
        custom_label: item.CustomLabel,
        title: item.ItemName,
        price: parseFloat(item.StartPrice) || 0,
        category_id: item.CategoryID,
        condition_id: item.ConditionID,
        item_specifics: JSON.stringify(item.ItemSpecifics || {}),
        description: item.Description || "",
        buying_price_jpy: parseInt(item.BuyingPriceJPY) || 0,
        seller_comment: item.SellerComment || "", // Save Original Comment
        ebay_item_id: '',
        listing_url: '',
        status: 'Draft'
    }));

    if (rows.length > 0) {
        insertIntoBigQuery('items', rows);
    }
}

/**
 * Retrieves items with 'Draft' status for completion.
 */
function getDraftItems() {
    initBigQuery(); // Ensure schema is up to date
    const query = `
        SELECT 
            timestamp,
            custom_label,
            title,
            price,
            category_id,
            condition_id,
            item_specifics,
            description,
            buying_price_jpy,
            seller_comment,
            image_urls
        FROM \`${PROJECT_ID}.${DATASET_ID}.items\` 
        WHERE status = 'Draft'
        ORDER BY timestamp DESC
    `;

    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return [];

        return result.rows.map(row => {
            let specs = {};
            try {
                specs = JSON.parse(row.f[6].v);
            } catch (e) { specs = {}; }

            return {
                Timestamp: row.f[0].v,
                CustomLabel: row.f[1].v,
                ItemName: row.f[2].v,
                StartPrice: row.f[3].v,
                CategoryID: row.f[4].v,
                ConditionID: row.f[5].v,
                ItemSpecifics: specs,
                Description: row.f[7].v,
                BuyingPriceJPY: row.f[8].v,
                SellerComment: row.f[9].v,
                ImageUrls: row.f[10].v || ""
            };
        });
    } catch (e) {
        console.error("Failed to fetch draft items:", e);
        throw e;
    }
}

/**
 * Updates a draft item and sets status to 'Ready'.
 */
function updateDraftItem(timestamp, customLabel, data) {
    // timestamp and customLabel are used as composite primary key for lookup
    // data: { title, price, description, images, condition, specifics }

    const image_urls = data.images || "";
    const status = 'Ready';

    // We use a safe way to identify the row. Timestamp in BQ is precise.
    const sql = `
        UPDATE \`${PROJECT_ID}.${DATASET_ID}.items\`
        SET 
            title = '${data.title.replace(/'/g, "\\'")}',
            price = ${parseFloat(data.price) || 0},
            description = '${data.description.replace(/'/g, "\\'")}',
            image_urls = '${image_urls.replace(/'/g, "\\'")}',
            condition_id = '${data.condition}',
            item_specifics = '${JSON.stringify(data.specifics).replace(/'/g, "\\'")}',
            status = '${status}'
        WHERE timestamp = TIMESTAMP('${timestamp}') AND custom_label = '${customLabel}'
    `;

    const request = { query: sql, useLegacySql: false };

    try {
        BigQuery.Jobs.query(request, PROJECT_ID);
        return { success: true };
    } catch (e) {
        console.error("Update failed:", e);
        throw e;
    }
}

function getReadyItems() {
    initBigQuery(); // Ensure schema is up to date
    const query = `
        SELECT 
            timestamp,
            custom_label,
            title,
            price,
            category_id,
            condition_id,
            item_specifics,
            description,
            image_urls
        FROM \`${PROJECT_ID}.${DATASET_ID}.items\` 
        WHERE status = 'Ready'
        ORDER BY timestamp ASC
    `;

    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return [];

        return result.rows.map(row => {
            let specs = {};
            try {
                specs = JSON.parse(row.f[6].v);
            } catch (e) { specs = {}; }

            return {
                Timestamp: row.f[0].v,
                CustomLabel: row.f[1].v,
                ItemName: row.f[2].v,
                StartPrice: row.f[3].v,
                CategoryID: row.f[4].v,
                ConditionID: row.f[5].v,
                ItemSpecifics: specs,
                Description: row.f[7].v,
                ImageUrls: row.f[8].v || ""
            };
        });
    } catch (e) {
        console.error("Failed to fetch ready items:", e);
        throw e;
    }
}

function getCategoryConditions(categoryId) {
    // We'll read from ebay_category_conditions.csv if it's available in the project
    // For GAS, we might need to search for the file in the project folder
    // Or, for simplicity during initial dev, we can hardcode some defaults 
    // and attempt to read the file.

    const fileName = 'ebay_category_conditions.csv';
    const files = DriveApp.getFilesByName(fileName);
    if (!files.hasNext()) {
        // Fallback to defaults
        return [
            { id: "1000", name: "New" },
            { id: "3000", name: "Used" },
            { id: "4000", name: "Very Good" },
            { id: "5000", name: "Good" },
            { id: "6000", name: "Acceptable" }
        ];
    }

    const file = files.next();
    const csvData = Utilities.parseCsv(file.getBlob().getDataAsString());

    // csv format: category_id,condition_id,condition_name,category_path
    const conditions = [];
    for (let i = 1; i < csvData.length; i++) {
        const row = csvData[i];
        if (row[0] === categoryId) {
            conditions.push({ id: row[1], name: row[2] });
        }
    }

    if (conditions.length === 0) {
        return [
            { id: "1000", name: "New" },
            { id: "3000", name: "Used" },
            { id: "4000", name: "Very Good" },
            { id: "5000", name: "Good" },
            { id: "6000", name: "Acceptable" }
        ];
    }

    return conditions;
}

/**
 * Checks Gmail for tool logs and eBay errors.
 * Run this via Time-driven trigger (e.g. every hour).
 */
function checkGmailForErrors() {
    const lastCheck = PropertiesService.getScriptProperties().getProperty('LAST_MAIL_CHECK') || '0';
    const now = Math.floor(Date.now() / 1000); // Unix timestamp

    // Search query: Specific Tool Email OR eBay Official Errors
    const query = `(from:inf-tooliz@msjp.sakura.ne.jp) OR (from:ebay.com subject:(error OR MC011 OR restricted OR removed)) after:${lastCheck}`;

    const threads = GmailApp.search(query);
    const newRows = []; // Store rows to append

    threads.forEach(thread => {
        const messages = thread.getMessages();
        messages.forEach(msg => {
            // Double check timestamp
            if (msg.getDate().getTime() / 1000 > parseInt(lastCheck)) {
                const body = msg.getPlainBody();
                const subject = msg.getSubject();
                const from = msg.getFrom();

                // --- Parsing Logic for 'inf-tooliz' emails ---
                let errorDetail = "";
                let relatedId = "";

                if (from.includes("inf-tooliz")) {
                    // Extract "list error"
                    const errorMatch = body.match(/list error : (.*)/);
                    if (errorMatch) errorDetail = errorMatch[1].trim();

                    // Extract SKU (e.g. #me_m12345...)
                    const skuMatch = body.match(/SKU : (#\w+)/);
                    if (skuMatch) relatedId = skuMatch[1].trim();

                    // Fallback: search for Item ID if SKU not found
                    if (!relatedId) {
                        const itemIdMatch = body.match(/\b\d{12}\b/);
                        if (itemIdMatch) relatedId = itemIdMatch[0];
                    }
                } else {
                    // Standard eBay Email Parsing
                    errorDetail = subject; // Use subject as main error for generic emails
                    const itemIdMatch = body.match(/\b\d{12}\b/);
                    if (itemIdMatch) relatedId = itemIdMatch[0];
                }

                // Only log if we found an error or it's an important email
                newRows.push({
                    timestamp: new Date(msg.getDate()).toISOString(),
                    from_address: from,
                    subject: subject,
                    body_preview: errorDetail || body.substring(0, 200),
                    related_id: relatedId
                });
            }
        });
    });

    if (newRows.length > 0) {
        insertIntoBigQuery('mail_log', newRows);
        console.log(`Logged ${newRows.length} new emails to BigQuery.`);
    }

    // Update timestamp
    PropertiesService.getScriptProperties().setProperty('LAST_MAIL_CHECK', now.toString());

    return `Checked ${threads.length} threads. Found ${newRows.length} new logs.`;
}

// PDF Processing (processPdf) has been removed as it is no longer used.

/**
 * Process JSON items from direct import (Benchmark / Extension).
 */
function processJsonItems(items) {
    try {
        console.log(`Processing ${items.length} items from JSON import.`);

        // Re-use the parallel generation logic
        // We pass 'null' for fileData because the items already have URLs
        const finalItems = generateItemDetailsParallel(items, null);

        // Post-Processing & Price Calculation
        const processedItems = finalItems.map(item => {
            return calculatePriceAndFormat(item);
        });

        // Save to Database
        saveToDatabase(processedItems);

        // Return in format expected by showJsonResults()
        return { Items: processedItems };
    } catch (e) {
        console.error("Process JSON Failed:", e);
        throw new Error(`JSON Processing failed: ${e.message}`);
    }
}

/**
 * Retry a single failed item
 * @param {Object} originalItem - The original item data from JSON input
 * @returns {Object} - Processed item or error item
 */
function retrySingleItem(originalItem) {
    console.log(`🔄 Retrying item: ${originalItem.label || 'Unknown'}`);

    try {
        // Re-use the existing parallel generation logic for a single item
        const results = generateItemDetailsParallel([originalItem], null);

        if (results && results.length > 0) {
            const item = results[0];

            // Check if retry also failed
            if (item.CustomLabel && item.CustomLabel.includes('Error Item')) {
                console.error(`❌ Retry failed for: ${originalItem.label}`);
                return item;
            }

            // Apply price calculation
            const processedItem = calculatePriceAndFormat(item);

            // Save to database
            saveToDatabase([processedItem]);

            console.log(`✅ Retry successful for: ${originalItem.label}`);
            return processedItem;
        }

        throw new Error('No results returned from retry');

    } catch (e) {
        console.error(`❌ Retry exception for ${originalItem.label}:`, e.message);
        return {
            CustomLabel: `Error Item (Retry Failed)`,
            ItemName: `Failed to Generate: ${originalItem.label}`,
            Description: `Retry failed. Reason: ${e.message}`,
            BuyingPriceJPY: 0,
            StartPrice: "0.00",
            CategoryID: "N/A",
            _error: {
                message: e.message,
                timestamp: new Date().toISOString()
            }
        };
    }
}


// Stage 1 extraction logic (extractItemsList) has been removed.

/**
 * Stage 2: Parallel Fetching of Details
 */
/**
 * Stage 2: Parallel Fetching of Details
 */
function generateItemDetailsParallel(itemList, fileData) {
    // Inject Learning Data once for context
    const learningContext = getFewShotExamples();
    const systemInstruction = getGeminiSystemInstruction(); // Use external prompt

    // Prepare arrays for valid requests and tracking
    const validRequests = [];
    const validIndices = [];
    const results = new Array(itemList.length).fill(null);

    // 1. Filter Prohibited Items & Construct Requests
    itemList.forEach((item, index) => {
        // --- 0. PROHIBITED ITEMS CHECK ---
        const prohibitedMatch = checkProhibitedItem(item.label || item.title);

        if (prohibitedMatch) {
            console.warn(`🚫 BLOCKED Item [Index ${index}]: "${item.label}" matched prohibited pattern: ${prohibitedMatch}`);
            results[index] = {
                CustomLabel: `BLOCKED ERROR`,
                ItemName: `[PROHIBITED] ${item.label}`,
                Description: `Item blocked due to prohibited content match: ${prohibitedMatch}`,
                BuyingPriceJPY: 0,
                StartPrice: "0.00",
                CategoryID: "N/A",
                _error: {
                    message: `Prohibited content: ${prohibitedMatch}`,
                    block: true
                }
            };
            return; // Skip API request for this item
        }

        // --- Valid Item Processing ---
        const parts = [];

        // 1. Add System/Item Prompt Text with Source Description
        // We inject item.description (from JSON/Bookmarklet) into the prompt for better context.
        const sourceDescription = item.description || "No description provided.";

        // Use external prompt builder
        const itemPrompt = getGeminiItemPrompt(item, sourceDescription, systemInstruction, learningContext);

        parts.push({ "text": itemPrompt });

        // 2. Add Visual/Content Data
        if (fileData) {
            // PDF Mode
            parts.push({
                "inline_data": {
                    "mime_type": fileData.mimeType,
                    "data": fileData.base64
                }
            });
        } else if (item.url) {
            // URL Mode (Supports Multiple Images from Bookmarklet)
            const imageUrls = item.image_urls || (item.image_url ? [item.image_url] : []);

            if (imageUrls.length > 0) {
                // Filter out invalid images (e.g. no_image.png from placeholders)
                const validUrls = imageUrls.filter(url => !url.includes('no_image.png') && url.startsWith('http'));

                // Fetch up to 5 valid images
                const targetUrls = validUrls.slice(0, 5);
                let successCount = 0;

                targetUrls.forEach((imgUrl, idx) => {
                    try {
                        const imgBlob = UrlFetchApp.fetch(imgUrl).getBlob();
                        parts.push({
                            "inline_data": {
                                "mime_type": imgBlob.getContentType(),
                                "data": Utilities.base64Encode(imgBlob.getBytes())
                            }
                        });
                        successCount++;
                        console.log(`Fetched image ${idx + 1}/${targetUrls.length} for ${item.label}`);
                    } catch (e) {
                        console.warn(`Failed to fetch image ${imgUrl}: ${e.message}`);
                    }
                });
                if (successCount === 0) {
                    parts.push({ "text": "\n[Note: Image fetching failed (or all were invalid). Rely on Title/Description/URL.]" });
                }
            } else {
                parts.push({ "text": "\n[Note: No images provided. Rely on Title/Description/URL.]" });
            }
        }

        // Construct Payload
        const payload = {
            "contents": [{ "parts": parts }],
            "generationConfig": { "response_mime_type": "application/json" }
        };

        const request = {
            url: GEMINI_API_URL,
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        validRequests.push(request);
        validIndices.push(index);
    });

    // 2. Execute Parallel Fetch for Valid Requests Only
    if (validRequests.length > 0) {
        console.log(`🚀 Sending ${validRequests.length} valid requests to Gemini API...`);
        const responses = UrlFetchApp.fetchAll(validRequests);

        // 3. Process Responses and Map Back to Results
        responses.forEach((res, i) => {
            const originalIndex = validIndices[i];
            const originalItem = itemList[originalIndex];

            try {
                let json = parseGeminiResponse(res);
                if (Array.isArray(json)) json = json[0];

                // MERGE ORIGINAL DATA (Crucial for Images)
                if (originalItem.image_urls) {
                    json.image_urls = originalItem.image_urls;
                }

                // Apply HTML Template
                json = applyEbayTemplate(json);

                results[originalIndex] = json;
            } catch (e) {
                // Enhanced Error Logging
                const itemLabel = originalItem.label || `Item ${originalIndex + 1}`;
                console.error(`❌ Failed to parse ${itemLabel}:`, e.message);
                console.error(`HTTP Status: ${res.getResponseCode()}`);

                // Log the raw API response for debugging
                try {
                    const responseText = res.getContentText();
                    console.error(`Raw API Response (first 500 chars):`, responseText.substring(0, 500));
                } catch (logErr) {
                    console.error(`Could not retrieve response text:`, logErr.message);
                }

                // Return structured error item
                results[originalIndex] = {
                    CustomLabel: `Error Item ${originalIndex + 1}`,
                    ItemName: `Failed to Generate: ${itemLabel}`,
                    Description: `Error processing this item. Reason: ${e.message}`,
                    BuyingPriceJPY: 0,
                    StartPrice: "0.00",
                    CategoryID: "N/A",
                    _error: {
                        message: e.message,
                        httpStatus: res.getResponseCode(),
                        timestamp: new Date().toISOString()
                    },
                    _originalItem: originalItem // Store original data for retry (if needed)
                };
            }
        });
    }

    return results;
}



/**
 * Helper: Create Payload
 */
function createGeminiPayload(text, fileData) {
    return {
        "contents": [
            {
                "parts": [
                    { "text": text },
                    {
                        "inline_data": {
                            "mime_type": fileData.mimeType,
                            "data": fileData.base64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    };
}

/**
 * Analyzes items from a JSON input or plain URL list.
 */
function processJson(jsonString) {
    let itemList = [];
    try {
        if (jsonString.trim().startsWith('[') || jsonString.trim().startsWith('{')) {
            itemList = JSON.parse(jsonString);
            if (!Array.isArray(itemList)) itemList = [itemList];
        } else {
            // Auto-detect plain URL list
            const urls = jsonString.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
            itemList = urls.map(url => ({ url: url, title: "" }));
        }
    } catch (e) {
        console.error("JSON Parse Error:", e);
        throw new Error("有効なコピーデータまたはURLリストを入力してください。");
    }

    return processJsonItems(itemList).Items; // Items key contains the results
}


/**
 * Analyzes raw pasted text to extract Item Specifics for Trading Cards using Gemini.
 */
function analyzeSpecificsWithGemini(rawText) {
    if (!rawText || rawText.trim() === '') throw new Error("テキストがありません。");

    const systemInstruction = getGeminiSystemInstruction();
    const prompt = `
        ${systemInstruction}
        INSTRUCTION: You will be provided with raw, messy text copied from another seller's eBay listing for a Pokemon Card.
        Extract the Item Specifics (characteristics) of the card.
        Translate all values into exact English.
        Map the extracted details into standard eBay Trading Card item specifics fields where possible.
        Ensure "Brand" is set to "Nintendo" or "Pokemon", "Game" is "Pokémon TCG".
        Examples of fields: Brand, Set, Game, Features, Card Name, Card Number, Rarity, ConditionID, Graded, Professional Grader, etc.
        Output MUST be a flat JSON object where keys are the specific names and values are the extracted values.
        If the condition is ungraded/used, output "ConditionID": "4000". If Graded/PSA, output "ConditionID": "2750".
        Return ONLY valid JSON.
        
        RAW TEXT:
        ${rawText}
    `;

    const payload = {
        "contents": [{
            "parts": [
                { "text": prompt }
            ]
        }],
        "generationConfig": {
            "response_mime_type": "application/json"
        }
    };

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = UrlFetchApp.fetch(url, options);
    let json = parseGeminiResponse(response);

    // Ensure we return a flat JSON object
    if (Array.isArray(json)) json = json[0];

    return json;
}

/**
 * Helper: Parse Response
 */
function parseGeminiResponse(response) {
    const json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
        let text = json.candidates[0].content.parts[0].text;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsedJSON = JSON.parse(text);

        // --- CATEGORY ID FALLBACK LOGIC (Safety Net) ---
        // If it's a single item (object) and has a CategoryID, validate it.
        // It ignores Phase 1 which returns an array.
        if (parsedJSON && !Array.isArray(parsedJSON) && parsedJSON.CategoryID) {
            if (!VALID_CATEGORY_IDS.includes(String(parsedJSON.CategoryID))) {
                console.warn(`Invalid Category ID detected: ${parsedJSON.CategoryID}. Falling back to default: ${DEFAULT_CATEGORY_ID}`);
                parsedJSON.CategoryID = DEFAULT_CATEGORY_ID;
            }
        }

        return parsedJSON;
    }
    throw new Error(`Gemini API Error: ${JSON.stringify(json)}`);
}

/**
 * Helper: Post-Processing Price Logic
 */
function calculatePriceAndFormat(item) {
    const EXCHANGE_RATE = 140;
    const FEE_RATE = 0.85;

    const SHIPPING_MAP = {
        "Envelope": 5.00,
        "Small": 12.00,
        "Medium": 20.00,
        "Large": 35.00
    };

    const PROFIT_MAP = {
        "HighTurnover": 1.05,
        "Niche": 1.20
    };

    // Map Enum to actual Policy Name
    const POLICY_NAME_MAP = {
        "Envelope": "01_【3mm以内】カード・ステッカー・ポスカ（SpeedPAK）",
        "Small": "02_【1cm以内】クリアファイル・雑誌・小冊子（SpeedPAK）",
        "Medium": "03_【3cm以内】アクスタ・缶バッジ・指乗りぬい（FedEx）",
        "Large": "04_【3cm超・大型】ぬいぐるみ・フィギュア・箱物（FedEx）"
    };

    // --- Safety Net for Media Shipping Cap ---
    // eBay enforces strict shipping maximums ($25) for Video Games, CDs, and DVDs.
    // If the category is one of these, we aggressively downgrade Large/Medium to Small 
    // to ensure the listing does not fail to upload.
    const MEDIA_CATEGORIES = [139973, 176983, 11232, 617, 112846, 13758, 155106, 61005, 50130, 20188];
    if (item.CategoryID && MEDIA_CATEGORIES.includes(parseInt(item.CategoryID))) {
        if (item.ShippingType === "Large" || item.ShippingType === "Medium") {
            item.ShippingType = "Small";
        }
    }

    const costJPY = parseInt(item.BuyingPriceJPY) || 0;
    const shippingUSD = SHIPPING_MAP[item.ShippingType] || 20.00;
    const profitMultiplier = PROFIT_MAP[item.ProfitTier] || 1.20;

    if (costJPY > 0) {
        const costUSD = costJPY / EXCHANGE_RATE;
        const baseTotal = costUSD + shippingUSD;
        const sellingPrice = (baseTotal * profitMultiplier) / FEE_RATE;
        item.StartPrice = sellingPrice.toFixed(2);
    } else {
        item.StartPrice = "0.00";
    }

    // Ensure Defaults
    if (!item.Quantity) item.Quantity = 1;
    if (!item.ConditionID) item.ConditionID = "3000";

    // Set the display shipping type to the policy name
    if (POLICY_NAME_MAP[item.ShippingType]) {
        item.ShippingType = POLICY_NAME_MAP[item.ShippingType];
    }

    return item;
}

/**
 * Helper: Generate Specifics HTML Table
 */
function generateSpecificsHtml(specifics) {
    if (!specifics) return "";
    let specs = specifics;
    if (typeof specs === 'string') {
        try {
            specs = JSON.parse(specs);
        } catch (e) {
            return "";
        }
    }

    let rows = "";
    if (specs && typeof specs === 'object') {
        for (const key in specs) {
            if (specs.hasOwnProperty(key)) {
                const value = specs[key];
                if (value && value !== "Does not apply") {
                    rows += `<tr>
                        <td class="spec-label">${key}</td>
                        <td class="spec-value">${value}</td>
                    </tr>`;
                }
            }
        }
    }

    if (!rows) return "";

    return `<table class="specifics-table">${rows}</table>`;
}

/**
 * Helper: Apply eBay HTML Template
 * Wraps the AI-generated description in the HTML template.
 */
function applyEbayTemplate(item) {
    if (!item.Description) return item;

    // The user's external listing tool already automatically inserts the template.
    // So we just return the raw text generated by Gemini.
    // We can add simple HTML breaks if strictly required, but the prompt says PLAIN TEXT.
    // The UI handles 'white-space: pre-wrap' or we can leave it as plain text.

    // Just to ensure it's clean, we return the item essentially unchanged.
    // The description is already generated according to the 4-part structure.

    return item;
}

/**
 * Returns the raw HTML template string.
 * Based on user's requested tool template format.
 */
function getEbayTemplateString() {
    try {
        const part1 = HtmlService.createHtmlOutputFromFile('ebay_template_part1').getContent();
        const part2 = HtmlService.createHtmlOutputFromFile('ebay_template_part2').getContent();
        const part3 = HtmlService.createHtmlOutputFromFile('ebay_template_part3').getContent();
        return part1 + part2 + part3;
    } catch (e) {
        console.error("Failed to load template parts, using fallback. Error:", e);
        // Fallback or throw
        throw new Error("Template files not found: " + e.message);
    }
}

/**
 * Adds a user to the followed list (BigQuery).
 * Currently just stores ID/StoreName. Future: Fetch metrics.
 */
function addFollowUser(sellerId, storeName) {
    if (!sellerId) throw new Error("Seller ID is required");

    // Check if table exists (lazy init)
    // We assume initBigQuery run at least once.
    // If table doesn't exist, insert might fail, auto-retry logic in insertIntoBigQuery handles creation if we call initBigQuery there.
    // But for safety, let's just insert.

    const row = {
        seller_id: sellerId,
        store_name: storeName || null,
        follower_count: 0,
        feedback_score: 0,
        active_count: 0,
        sold_count: 0,
        last_updated: new Date().toISOString()
    };

    // Check duplication? BQ allows dups, we should probably delete old entry first or use merge.
    // For simplicity V1: Delete executed before Insert if exists? Or just Append.
    // Let's Append for now, frontend shows latest? No, getFollowedUsers should execute deduplication.

    // Better: Delete existing entry for this seller first to avoid duplicates
    try {
        const deleteQuery = `DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.followed_sellers\` WHERE seller_id = '${sellerId}'`;
        BigQuery.Jobs.query({ query: deleteQuery, useLegacySql: false }, PROJECT_ID);
    } catch (e) {
        console.warn("Delete old follow failed (maybe first time):", e);
    }

    insertIntoBigQuery('followed_sellers', [row]);
}

/**
 * Removes a user from the followed list.
 */
function removeFollowUser(sellerId) {
    if (!sellerId) return;
    const query = `DELETE FROM \`${PROJECT_ID}.${DATASET_ID}.followed_sellers\` WHERE seller_id = '${sellerId}'`;
    BigQuery.Jobs.query({ query: query, useLegacySql: false }, PROJECT_ID);
}

/**
 * Retrieves all followed users.
 */
function getFollowedUsers() {
    // Deduplicate by taking the latest entry for each seller_id
    const query = `
        SELECT 
            seller_id, 
            ANY_VALUE(store_name) as store_name,
            MAX(follower_count) as follower_count,
            MAX(active_count) as active_count,
            MAX(sold_count) as sold_count
        FROM \`${PROJECT_ID}.${DATASET_ID}.followed_sellers\`
        GROUP BY seller_id
        ORDER BY seller_id ASC
    `;

    try {
        const result = BigQuery.Jobs.query({ query: query, useLegacySql: false }, PROJECT_ID);
        if (!result.rows) return [];

        return result.rows.map(row => ({
            SellerID: row.f[0].v,
            StoreName: row.f[1].v,
            FollowerCount: row.f[2].v ? parseInt(row.f[2].v) : 0,
            ActiveCount: row.f[3].v ? parseInt(row.f[3].v) : 0,
            SoldCount: row.f[4].v ? parseInt(row.f[4].v) : 0
        }));
    } catch (e) {
        console.warn("Get Followed Users Failed (Table likely missing):", e);
        // Attempt to create table if missing
        if (e.message.includes("Not found")) {
            initBigQuery(); // Create table
            return [];
        }
        throw e;
    }
}

/**
 * Analyzes a seller input (ID or URL) and returns research data.
 * Does NOT save to DB unless requested.
 */
/**
 * Analyzes a seller input (ID or URL) and returns research data.
 * fetchUrl logic reverted due to CAPTCHA issues.
 * Accepts optional storeName for manual override.
 */
function analyzeSeller(input, optionalStoreName) {
    if (!input) throw new Error("Input is required");

    let sellerId = input.trim();
    let storeName = optionalStoreName ? optionalStoreName.trim() : "";

    // URL Parsing Logic
    if (input.includes("ebay.com")) {
        // try to extract ID from URL
        const usrMatch = input.match(/\/usr\/([^\/?]+)/);
        const strMatch = input.match(/\/str\/([^\/?]+)/);

        if (usrMatch) {
            sellerId = usrMatch[1];
        } else if (strMatch) {
            // Store URL detected. Use extracted name as storeName.
            // But we CANNOT fetch the true Seller ID automatically due to CAPTCHA.
            // If storeName was not provided manually, we use the URL's store name.
            const extractedStoreName = strMatch[1];
            if (!storeName) {
                storeName = extractedStoreName;
            }
            // Fallback: If no manual ID was provided (input is URL), we can only guess ID = StoreName
            // which is often wrong. But the user can now manually input ID.
            if (sellerId.includes('ebay.com')) {
                sellerId = extractedStoreName;
            }
        }
    }

    // Clean up
    sellerId = sellerId.split('?')[0].split('&')[0];
    if (storeName) storeName = storeName.split('?')[0].split('&')[0];

    // Construct Research URL
    // Format: ...&_ssn=[USER_ID]&store_name=[STORE_NAME]...
    let researchUrl = `https://www.ebay.com/sch/i.html?_dkr=1&iconV2Request=true&_blrs=recall_filtering&_ssn=${sellerId}`;
    if (storeName) {
        researchUrl += `&store_name=${storeName}`;
    }
    researchUrl += `&_oac=1&LH_Sold=1&_sop=13`;

    return {
        sellerId: sellerId,
        storeName: storeName,
        researchUrl: researchUrl,
        activeCount: 0,
        soldCount: 0,
        followerCount: 0
    };
}
// Force update for sync
// force update 2
/**
 * Retrieves synced eBay listings from BigQuery.
 * @param {string} status - Filter by status (Active, Sold, Unsold) or null for all.
 */
function fetchInventoryFromBQ(status = null) {
    let whereClause = "";
    if (status && status !== 'All') {
        whereClause = `WHERE status = '${status.toUpperCase()}'`;
    }

    const query = `
        SELECT 
            item_id, title, price, currency, status, 
            FORMAT_TIMESTAMP('%Y/%m/%d %H:%M', start_time) as start_time,
            FORMAT_TIMESTAMP('%Y/%m/%d %H:%M', end_time) as end_time,
            item_url, image_url, condition,
            FORMAT_TIMESTAMP('%Y/%m/%d %H:%M', last_synced) as last_synced,
            FORMAT_TIMESTAMP('%Y/%m/%d %H:%M', sold_at) as sold_at,
            FORMAT_TIMESTAMP('%Y/%m/%d %H:%M', deleted_at) as deleted_at,
            view_count, watch_count
        FROM \`${PROJECT_ID}.${DATASET_ID}.ebay_listings\` 
        ${whereClause}
        ORDER BY last_synced DESC
        LIMIT 1000
    `;

    const request = { query: query, useLegacySql: false };

    try {
        const result = BigQuery.Jobs.query(request, PROJECT_ID);
        if (!result.rows) return [];

        return result.rows.map(row => ({
            itemId: row.f[0].v,
            title: row.f[1].v,
            price: row.f[2].v,
            currency: row.f[3].v,
            status: row.f[4].v,
            startTime: row.f[5].v,
            endTime: row.f[6].v,
            itemUrl: row.f[7].v,
            imageUrl: row.f[8].v,
            condition: row.f[9].v,
            lastSynced: row.f[10].v,
            soldAt: row.f[11].v,
            deletedAt: row.f[12].v,
            viewCount: row.f[13] && row.f[13].v ? parseInt(row.f[13].v, 10) : 0,
            watchCount: row.f[14] && row.f[14].v ? parseInt(row.f[14].v, 10) : 0
        }));
    } catch (e) {
        console.error("Failed to fetch inventory from BQ:", e);
        // If table doesn't exist or column is missing, try to init and retry once
        if (e.message.includes("Not found") || e.message.includes("404") || e.message.includes("Unrecognized name")) {
            console.log("Database out of sync. Initializing BigQuery and retrying...");
            initBigQuery();
            try {
                const retryResult = BigQuery.Jobs.query(request, PROJECT_ID);
                if (!retryResult.rows) return [];
                return retryResult.rows.map(row => ({
                    itemId: row.f[0].v,
                    title: row.f[1].v,
                    price: row.f[2].v,
                    currency: row.f[3].v,
                    status: row.f[4].v,
                    startTime: row.f[5].v,
                    endTime: row.f[6].v,
                    itemUrl: row.f[7].v,
                    imageUrl: row.f[8].v,
                    condition: row.f[9].v,
                    lastSynced: row.f[10].v
                }));
            } catch (retryErr) {
                console.error("Retry failed:", retryErr);
                return [];
            }
        }
        throw e;
    }
}

/**
 * Triggers eBay API sync to BigQuery and returns the count.
 */
function syncEbayToBQ() {
    try {
        initBigQuery();
        const totalFetched = EbayApiService.syncToBigQuery();

        // Fetch current stats from BQ to return to UI
        const stats = checkBigQueryStats();

        return {
            success: true,
            count: totalFetched,
            stats: stats
        };
    } catch (e) {
        console.error("Sync Failed:", e);
        return { success: false, message: e.message };
    }
}

/**
 * Debug function to check row counts in BigQuery.
 */
function checkBigQueryStats() {
    try {
        const query = `
            SELECT status, COUNT(*) as count 
            FROM \`${PROJECT_ID}.${DATASET_ID}.ebay_listings\` 
            GROUP BY status
        `;
        const result = BigQuery.Jobs.query({ query: query, useLegacySql: false }, PROJECT_ID);
        const stats = {};
        if (result.rows) {
            result.rows.forEach(row => {
                stats[row.f[0].v] = row.f[1].v;
            });
        }
        console.log("Current BigQuery Stats:", JSON.stringify(stats));
        return stats;
    } catch (e) {
        console.error("Failed to check BQ stats:", e);
        return {};
    }
}

/**
 * Uses Gemini to translate a Japanese product title into a short, effective English search keyword for eBay.
 */
function translateTitleToEbayKeywordWithGemini(title) {
    const prompt = `
You are an expert at finding products on eBay.
The user will provide a Japanese product title (e.g., from Mercari).
Your task is to convert it into a short, highly effective English search query for eBay.
- Extract only the core brand, character, or product name.
- Remove unnecessary details like "新品未開封", "Free Shipping", "100%", etc.
- Keep it under 4-5 words.
- OUTPUT ONLY THE ENGLISH SEARCH QUERY. Do not include quotes or any other text.

Japanese Title:
${title}
`;

    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            temperature: 0.1
        }
    };

    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(GEMINI_API_URL, options);
    const code = response.getResponseCode();
    if (code !== 200) {
        console.error("Gemini Title Translation Error:", response.getContentText());
        return title; // Fallback to original if API fails
    }

    const json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
        return json.candidates[0].content.parts[0].text.trim();
    }

    return title; // Fallback
}

/**
 * Triggers a Browse API search to find the lowest price active items for a given drafted item keyword.
 * Gets called by lowest_price.html.
 */
function fetchLowestPriceForDraft(searchQuery) {
    if (!searchQuery) throw new Error("検索キーワード（タイトル）がありません。");

    let query = translateTitleToEbayKeywordWithGemini(searchQuery);
    console.log("Original Query: " + searchQuery + " | Translated Query: " + query);

    const token = EbayApiService.getApplicationToken(); // Accesses the application token for Browse API.
    const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=10&sort=price`;

    const options = {
        method: 'get',
        headers: {
            'Authorization': 'Bearer ' + token,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        },
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code !== 200) {
        throw new Error(`eBay API Error (${code}): ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());
    if (!data.itemSummaries || data.itemSummaries.length === 0) {
        return { query: query, items: [] };
    }

    const items = data.itemSummaries.map(item => ({
        itemId: item.itemId,
        title: item.title,
        price: item.price ? item.price.value : '0.00',
        currency: item.price ? item.price.currency : 'USD',
        imageUrl: item.image ? item.image.imageUrl : '',
        itemUrl: item.itemWebUrl,
        seller: item.seller ? item.seller.username : 'Unknown',
        condition: item.condition,
        buyingFormat: item.buyingOptions ? item.buyingOptions[0] : 'UNKNOWN',
        shippingCost: item.shippingOptions && item.shippingOptions[0] && item.shippingOptions[0].shippingCost ? item.shippingOptions[0].shippingCost.value : null
    }));

    return { query: query, items: items };
}

/**
 * Fetches specific eBay item details using the Item API based on a provided eBay URL.
 * Called by lowest_price.html for manual overrides.
 */
function fetchEbayItemByUrl(url) {
    if (!url) throw new Error("eBayのURLが入力されていません。");

    // Extract the 12-to-13-digit item ID from the URL or string.
    let itemIdMatch = url.match(/(?:\/itm\/(?:[^\/]+\/)?|v1\|)(\d{12,13})/);
    if (!itemIdMatch) {
        itemIdMatch = url.match(/(?:\b|[^0-9])(\d{12,13})(?:\b|[^0-9])/);
    }
    if (!itemIdMatch) {
        itemIdMatch = url.match(/(\d{12,13})/);
    }
    if (!itemIdMatch || !itemIdMatch[1]) {
        throw new Error("入力されたURLからeBayの商品ID(12〜13桁)を見つけられませんでした。");
    }
    let itemId = itemIdMatch[1];

    const token = EbayApiService.getApplicationToken();
    // The '|' character in the item ID needs to be URL-encoded for UrlFetchApp
    const encodedItemId = encodeURIComponent(`v1|${itemId}|0`);
    const apiUrl = `https://api.ebay.com/buy/browse/v1/item/${encodedItemId}`;

    const options = {
        method: 'get',
        headers: {
            'Authorization': 'Bearer ' + token,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        },
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const code = response.getResponseCode();

    if (code !== 200) {
        throw new Error(`eBay API Error (${code}): ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());

    // Attempt to extract shipping cost
    let shippingCost = '0.00';
    if (data.estimatedStandardDeliveryCost && data.estimatedStandardDeliveryCost.value) {
        shippingCost = data.estimatedStandardDeliveryCost.value;
    } else if (data.deliveryOptions && data.deliveryOptions.length > 0 && data.deliveryOptions[0].shippingCost && data.deliveryOptions[0].shippingCost.value) {
        shippingCost = data.deliveryOptions[0].shippingCost.value;
    }

    const item = {
        itemId: data.itemId,
        title: data.title,
        price: data.price ? data.price.value : '0.00',
        currency: data.price ? data.price.currency : 'USD',
        itemUrl: data.itemWebUrl,
        shippingCost: shippingCost
    };

    return item;
}

/**
 * Product Knowledge Base for Shipping Estimation
 * Based on common eBay export items.
 */
const PRODUCT_KNOWLEDGE_BASE = `
【フィギュア / おもちゃ】
- ねんどろいど (通常): 18x14x10 cm, 0.4kg / 輸送箱込: 22x16x14 cm, 0.6kg
- S.H.Figuarts (通常): 18x15x5 cm, 0.3kg / 輸送箱込: 22x18x10 cm, 0.5kg
- 一番くじ / Masterlise (大型): 30x20x15 cm, 1.0-1.5kg / 輸送箱込: 35x25x20 cm, 2.0kg
- 1/7 スケールフィギュア: 35x25x25 cm, 1.2kg / 輸送箱込: 40x30x30 cm, 2.5kg
- プライズフィギュア (中型): 20x15x15 cm, 0.5kg / 輸送箱込: 25x20x20 cm, 0.8kg

【ぬいぐるみ / 雑貨】
- ぬいぐるみ (特大/40cm〜): 45x35x30 cm, 0.8-1.5kg
- ぬいぐるみ (中型/25cm〜): 30x20x15 cm, 0.4kg
- ぬいぐるみ (マスコット/10cm〜): 12x10x8 cm, 0.1kg
- アクリルスタンド (1枚): 15x10x1 cm, 0.05kg
- キーホルダー / 缶バッジ: 10x10x2 cm, 0.05kg
- タペストリー (棒付): 55x5x5 cm, 0.3kg
- アニメセル画 / クリアファイル: 35x25x1 cm, 0.2kg

【カード / ゲーム / メディア】
- ポケカBOX (1個): 14x14x4 cm, 0.3kg / 3BOXセット: 18x15x15 cm, 1.0kg
- トレカ1枚: 15x10x1 cm, 0.05kg
- ゲームソフト (Switch/PS): 17x11x2 cm, 0.1kg
- ゲーム機本体 (Switch): 30x25x10 cm, 1.2kg
- VHSテープ (1巻): 20x12x4 cm, 0.3kg / 10本ロット: 25x25x25 cm, 3.5kg
- 漫画本 (1冊): 18x13x2 cm, 0.2kg
`;

/**
 * Estimates product size and weight from a given URL using Gemini API.
 * @param {string} url - Product page URL (Mercari, etc.)
 */
function estimateProductSize(url) {
    try {
        // 1. Fetch the content of the URL (Increase limit to capture meta tags and JSON-LD)
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const fullHtml = response.getContentText();

        // Extract key metadata to stay within token limits while providing high-quality context
        const title = (fullHtml.match(/<title>(.*?)<\/title>/i) || [])[1] || "";
        const description = (fullHtml.match(/<meta\s+name="description"\s+content="(.*?)"/i) || [])[1] || "";
        const jsonLd = (fullHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i) || [])[1] || "";

        // Additional parameters: Extract Category, condition, price, and shipping method
        const category = (fullHtml.match(/"categoryName":"(.*?)"/i) || [])[1] || "";
        const condition = (fullHtml.match(/"itemConditionName":"(.*?)"/i) || [])[1] || "";
        const price = (fullHtml.match(/"price":(\d+)/i) || [])[1] || "";
        const shippingMethod = (fullHtml.match(/"shippingMethodName":"(.*?)"/i) || [])[1] || "";

        // Combine context with price and shipping method (crucial for set/size inference)
        const context = `Title: ${title}\nCategory: ${category}\nCondition: ${condition}\nPrice: ${price} JPY\nShippingMethod: ${shippingMethod}\nDescription: ${description}\nJSON-LD: ${jsonLd}`.substring(0, 15000);

        // 2. Prepare prompt for Gemini with Product Knowledge Base
        const prompt = `以下の商品情報を分析し、この商品の「梱包後の外装箱サイズ（縦・横・高さ cm）」と「合計重量 (kg)」を精密に推測してください。

【ナレッジベース（参考値）】
${PRODUCT_KNOWLEDGE_BASE}

【重要な指示】
1. 解析対象のタイトルと説明から、商品の「カテゴリー」「個数（数量）」「材質」を正確に特定してください。
2. 基本的に説明文に「1枚」「4本セット」「10点まとめ」などの記載がある場合、それを合計したサイズを算出してください。
3. 上記ナレッジベースの数値と数量を掛け合わせ、「梱包後の輸送箱」のサイズを算出してください。
4. 複数商品（セット）の場合は、それらが全て収まる最小の「一つの箱」を想定してください。隙間の緩衝材も考慮してください。
5. eBay輸出では頑丈な梱包が求められるため、緩衝材（プチプチ）や厚手の段ボールの厚みを必ず考慮してください。
6. 実情より小さい見積もり（送料不足）になると大損するため、十分に余裕を持たせた安全な数値を返してください。
7. タイトルから商品名を「title_jp」として抽出し、価格情報から仕入金額（円）を数値で「price_jpy」として抽出してください。
8. 値は以下のJSON形式のみで返してください。

JSON形式:
{
  "title_jp": "商品名(string)",
  "price_jpy": 仕入金額(number),
  "length": 縦(cm),
  "width": 横(cm),
  "height": 高さ(cm),
  "weight": 重量(kg),
  "quantity": 推測した個数(number),
  "reason": "サイズ推測の理由（例：フィギュア4個分として計算）"
}

解析対象の商品情報:
${context}`;

        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                response_mime_type: "application/json"
            }
        };

        const options = {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
        };

        const apiResponse = UrlFetchApp.fetch(GEMINI_API_URL, options);
        const result = JSON.parse(apiResponse.getContentText());

        if (result.candidates && result.candidates[0].content.parts[0].text) {
            let text = result.candidates[0].content.parts[0].text;
            // Clean markdown blocks
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

            const estimated = JSON.parse(text);

            // Add +2cm safety margin to each dimension as requested
            if (estimated.length) estimated.length += 2;
            if (estimated.width) estimated.width += 2;
            if (estimated.height) estimated.height += 2;

            // Safety fallback if Gemini couldn't extract title/price but we have HTML metadata
            if (!estimated.title_jp) estimated.title_jp = title || "商品名取得エラー";
            if (!estimated.price_jpy) estimated.price_jpy = parseInt(price) || 0;

            return estimated;
        }
        return null;
    } catch (e) {
        console.error("Error in estimateProductSize: " + e.message);
        throw new Error("サイズ推測中にエラーが発生しました: " + e.message);
    }
}

/**
 * Shipping simulator rates from the parsed JSON file.
 * Now using a hardcoded constant in RatesData.js for maximum reliability.
 */
function getShippingRates() {
    try {
        if (typeof SHIPPING_RATES !== 'undefined') {
            return SHIPPING_RATES;
        }
        console.error("SHIPPING_RATES is not defined.");
        return {};
    } catch (e) {
        console.error("Error loading shipping rates: " + e.message);
        return {};
    }
}
