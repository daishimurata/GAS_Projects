
import os
import time
from datetime import datetime
from google.cloud import bigquery

# --- 設定 ---
PROJECT_ID = 'gen-lang-client-0396634194'
DATASET_ID = 'enterprise_suite_data'
LOCATION = 'asia-northeast1'
USER_NAME = '116-柿内環奈'
BASE_DRIVE_PATH = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/利用者情報"

client = bigquery.Client(project=PROJECT_ID, location=LOCATION)

def get_latest_completed_date():
    """最後に完了した日付をscheduleから取得"""
    query = f"SELECT last_completed_date FROM `{PROJECT_ID}.{DATASET_ID}.document_schedule` WHERE user_name = '{USER_NAME}' LIMIT 1"
    results = client.query(query).result()
    for row in results:
        return row.last_completed_date
    return datetime.now().date()

def generate_doc(doc_type, prompt_data):
    """指定されたdoc_typeの書類をGeminiで生成"""
    sql = f"""
    SELECT
      ml_generate_text_result
    FROM
      ML.GENERATE_TEXT(
        MODEL `{DATASET_ID}.gemini_flash_model`,
        (
          SELECT 
            CONCAT(
              t.system_prompt, 
              '\\n\\nHTMLテンプレート: ', t.html_template, 
              '\\n\\n利用者データ: ', @user_data
            ) AS prompt
          FROM `{DATASET_ID}.document_templates` AS t
          WHERE t.doc_type = @doc_type
          ORDER BY t.updated_at DESC
          LIMIT 1
        ),
        STRUCT(0.2 AS temperature, 8192 AS max_output_tokens)
      );
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("user_data", "STRING", prompt_data),
            bigquery.ScalarQueryParameter("doc_type", "STRING", doc_type),
        ]
    )
    
    print(f"  Generating {doc_type}...")
    try:
        results = client.query(sql, job_config=job_config).result()
        for row in results:
            raw = row.ml_generate_text_result
            
            # --- 精緻なテキスト抽出 ---
            text = ""
            if isinstance(raw, dict):
                if 'candidates' in raw and len(raw['candidates']) > 0:
                    parts = raw['candidates'][0].get('content', {}).get('parts', [])
                    if parts:
                        text = parts[0].get('text', '')
                else:
                    text = raw.get('text', str(raw))
            else:
                # 文字列として返ってきた場合（JSON文字列の可能性あり）
                import json
                try:
                    data = json.loads(raw)
                    if isinstance(data, dict) and 'candidates' in data:
                        text = data['candidates'][0]['content']['parts'][0]['text']
                    else:
                        text = raw
                except:
                    text = str(raw)

            # Clean markdown if exists
            if "```html" in text:
                text = text.split("```html")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()
            return text
    except Exception as e:
        print(f"  ❌ Error generating {doc_type}: {e}")
    return None

import sys

def main():
    # 引数から生成したい doc_type リストを取得
    # 例: python3 generate.py MONITORING ASSESSMENT
    # 引数がない場合は、対話形式で確認するか、エラーにする（今回は安全のため全件は自動でやらない）
    requested_types = sys.argv[1:]
    
    if not requested_types:
        print("💡 Usage: python3 generate_document_set.py <DOC_TYPE1> <DOC_TYPE2> ...")
        print("   Available types: FACE_SHEET, ASSESSMENT, EVALUATION, MEETING_MINUTES, PLAN_DRAFT, PLAN_FINAL, PROGRESS_REPORT, MONITORING")
        return

    print(f"🚀 Starting selective document generation for {USER_NAME}: {requested_types}")
    
    # 1. フォルダパスの準備
    version_label = f"第1版_{datetime.now().strftime('%Y-%m')}"
    target_dir = os.path.join(BASE_DRIVE_PATH, USER_NAME, "02_個別支援計画", version_label)
    
    if not os.path.exists(target_dir):
        os.makedirs(target_dir, exist_ok=True)
    
    # 指示用データの構築
    last_date = get_latest_completed_date()
    user_data_prompt = f"利用者名: {USER_NAME}, 直近作成日: {last_date}"

    # 生成対象マッピング
    doc_map = {
        "FACE_SHEET": "00_フェイスシート.html",
        "ASSESSMENT": "01_アセスメントシート.html",
        "EVALUATION": "02_個別支援計画評価シート.html",
        "MEETING_MINUTES": "03_検討会議議事録.html",
        "PLAN_DRAFT": "04_個別支援計画書_原案.html",
        "PLAN_FINAL": "05_個別支援計画書_正式版.html",
        "PROGRESS_REPORT": "06_経過報告書.html",
        "MONITORING": "07_モニタリング記録.html",
    }

    for d_type in requested_types:
        if d_type not in doc_map:
            print(f"  ⚠️ Unknown type: {d_type}. Skipping.")
            continue
            
        filename = doc_map[d_type]
        content = generate_doc(d_type, user_data_prompt)
        if content:
            file_path = os.path.join(target_dir, filename)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  ✅ Saved: {filename}")
            time.sleep(1)

    print(f"\n✨ Specified documents generated and saved!")

if __name__ == "__main__":
    main()
