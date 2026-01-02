
from google.cloud import bigquery
from datetime import datetime
import json

def seed_templates():
    project_id = 'gen-lang-client-0396634194'
    client = bigquery.Client(project=project_id)
    dataset_id = 'enterprise_suite_data'
    table_id = 'document_templates'
    
    html_template = """
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
    """.strip()

    system_prompt = """
あなたは優秀な就労支援員です。提供された利用者の基本情報と過去の記録に基づき、
指定されたHTMLテンプレート内のプレースホルダ（{{...}}）を埋めて、
完成したHTMLコードのみを出力してください。
利用者の尊厳を守り、具体的でポジティブな支援計画を作成してください。
    """.strip()

    rows_to_insert = [
        {
            "doc_type": "PLAN",
            "html_template": html_template,
            "system_prompt": system_prompt,
            "version": 1,
            "updated_at": datetime.utcnow().isoformat()
        }
    ]

    print(f"🚀 Seeding template data to {table_id}...")
    errors = client.insert_rows_json(f"{project_id}.{dataset_id}.{table_id}", rows_to_insert)
    
    if errors == []:
        print("✅ Template data seeded successfully.")
    else:
        print(f"❌ Errors occurred: {errors}")

if __name__ == "__main__":
    seed_templates()
