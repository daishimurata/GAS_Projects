
from google.cloud import bigquery
import os

def export_generated_html():
    project_id = 'gen-lang-client-0396634194'
    client = bigquery.Client(project=project_id, location='asia-northeast1')
    
    sql = """
    SELECT
      ml_generate_text_result
    FROM
      ML.GENERATE_TEXT(
        MODEL `enterprise_suite_data.gemini_flash_model`,
        (
          SELECT 
            CONCAT(
              t.system_prompt, 
              '\\n\\nHTMLテンプレート: ', t.html_template, 
              '\\n\\n利用者データ: ', s.user_name, ' 様、計画期間: ', s.last_completed_date, ' ～ ', s.next_due_date
            ) AS prompt
          FROM `enterprise_suite_data.document_schedule` AS s
          JOIN `enterprise_suite_data.document_templates` AS t ON s.doc_type = t.doc_type
          WHERE s.user_name = '116-柿内環奈'
        ),
        STRUCT(0.2 AS temperature, 1072 AS max_output_tokens)
      );
    """
    
    print("🚀 Running generation query...")
    query_job = client.query(sql)
    results = query_job.result()
    
    # Get the first result
    for row in results:
        # ml_generate_text_result is a string (often JSON-like string if multiple columns, but here it's simple)
        generated_text = row.ml_generate_text_result
        
        # HTML部分だけを抽出
        html_content = generated_text
        if "```html" in generated_text:
            html_content = generated_text.split("```html")[1].split("```")[0].strip()
        elif "```" in generated_text:
             html_content = generated_text.split("```")[1].split("```")[0].strip()

        output_path = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/GAS_Projects/4_Enterprise_Suite/preview_kakiuchi_plan.html"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(str(html_content)) # 文字列であることを確約
        
        print(f"✅ Preview HTML saved to: {output_path}")
        print("Please open this file in your browser to see the result.")
        break

if __name__ == "__main__":
    try:
        export_generated_html()
    except Exception as e:
        print(f"❌ Error: {e}")
