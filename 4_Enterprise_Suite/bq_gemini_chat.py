
import sys
from google.cloud import bigquery

# --- 設定 ---
PROJECT_ID = 'gen-lang-client-0396634194'
DATASET_ID = 'enterprise_suite_data'
LOCATION = 'asia-northeast1'

client = bigquery.Client(project=PROJECT_ID, location=LOCATION)

def chat_with_bq_gemini(user_prompt):
    """BigQuery ML の Gemini モデルと対話する"""
    
    # ユーザー名が含まれているか簡易チェック（コンテキスト付与のため）
    # 本来はもっと賢く抽出しますが、今回は「環奈」が含まれていれば環奈さんのデータを付与
    context = ""
    if "環奈" in user_prompt:
        # スケジュールデータを取得
        query = f"SELECT * FROM `{PROJECT_ID}.{DATASET_ID}.document_schedule` WHERE user_name LIKE '%柿内環奈%' LIMIT 1"
        results = client.query(query).result()
        for row in results:
            context = f"\n\n[システムコンテキスト: 書類スケジュール]\n利用者: {row.user_name}\n次回の計画期限: {row.next_due_date}\n現状ステータス: {row.status}"

    sql = f"""
    SELECT
      ml_generate_text_result
    FROM
      ML.GENERATE_TEXT(
        MODEL `{DATASET_ID}.gemini_flash_model`,
        (SELECT @prompt AS prompt),
        STRUCT(0.7 AS temperature, 1024 AS max_output_tokens)
      );
    """
    
    full_prompt = user_prompt + context
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("prompt", "STRING", full_prompt),
        ]
    )
    
    try:
        results = client.query(sql, job_config=job_config).result()
        for row in results:
            raw = row.ml_generate_text_result
            # テキスト抽出 (以前の修正を反映)
            if isinstance(raw, dict):
                if 'candidates' in raw and len(raw['candidates']) > 0:
                    return raw['candidates'][0].get('content', {}).get('parts', [])[0].get('text', '')
            return str(raw)
    except Exception as e:
        return f"❌ エラーが発生しました: {e}"

def main():
    print("--- 🌌 おひさま BQ-Gemini Chat (Beta) ---")
    print("コマンド: 'exit' で終了, 'clear' で画面クリア")
    print("※ 「環奈さんの状況は？」のように聞くと、DBのデータも参照します。")
    
    while True:
        try:
            user_input = input("\n👤 質問 > ")
            if user_input.lower() in ['exit', 'quit']:
                break
            if user_input.lower() == 'clear':
                print("\033c", end="")
                continue
            if not user_input.strip():
                continue
                
            print("🤖 思考中...")
            response = chat_with_bq_gemini(user_input)
            print(f"\n✨ 回答:\n{response}")
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"⚠️ 予期せぬエラー: {e}")

if __name__ == "__main__":
    main()
