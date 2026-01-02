
from google.cloud import bigquery
from datetime import datetime
import os

def sync_standard_templates():
    project_id = 'gen-lang-client-0396634194'
    client = bigquery.Client(project=project_id)
    dataset_id = 'enterprise_suite_data'
    table_id = 'document_templates'
    
    base_path = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/Templates"
    
    # テンプレート定義のマッピング (全書類セット)
    templates_to_sync = [
        {
            "doc_type": "PLAN_FINAL", 
            "file": "📋 個別支援計画書テンプレート（最新版）.html", 
            "guide": "📋 4_個別支援計画書（正式版）_データ入力.md",
            "prompt": "正式な個別支援計画書を作成してください。利用者の希望と検討会議の結果を矛盾なく反映させてください。"
        },
        {
            "doc_type": "PLAN_DRAFT", 
            "file": "📋 個別支援計画書原案テンプレート（最新版）.html", 
            "guide": "📋 2_個別支援計画書（原案）_データ入力.md",
            "prompt": "個別支援計画書の原案を作成してください。アセスメントの結果に基づき、具体的な課題と支援方針を立案してください。"
        },
        {
            "doc_type": "EVALUATION", 
            "file": "📋 個別支援計画評価シートテンプレート（最新版）.html", 
            "guide": "📋 3_個別支援計画評価シート_データ入力.md",
            "prompt": "前回の計画に対する評価シートを作成してください。実績に基づき、客観的な達成度を記入してください。"
        },
        {
            "doc_type": "MEETING_MINUTES", 
            "file": "📋 個別支援計画検討会議議事録テンプレート（最新版）.html", 
            "guide": "📋 5_個別支援計画検討会議議事録_データ入力.md",
            "prompt": "計画策定のための検討会議議事録を作成してください。原案からの変更点や多職種での検討プロセスを記録してください。"
        },
        {
            "doc_type": "PROGRESS_REPORT", 
            "file": "📋 経過報告書テンプレート（最新版）.html", 
            "prompt": "日々の支援経過をまとめた報告書を作成してください。特筆すべき変化や支援のポイントを明確にしてください。"
        },
        {
            "doc_type": "ASSESSMENT", 
            "file": "📋 アセスメントシートテンプレート（最新版）.html", 
            "guide": "📋 1_アセスメントシート_データ入力.md",
            "prompt": "多角的な視点からアセスメントシートを作成してください。"
        },
        {
            "doc_type": "FACE_SHEET", 
            "file": "利用者フェイスシート_テンプレート.html", 
            "prompt": "利用者の基本情報をまとめたフェイスシートを作成してください。"
        },
        {
            "doc_type": "MONITORING", 
            "file": "📋 個別支援計画評価シートテンプレート（最新版）.html", 
            "guide": "📋 3_個別支援計画評価シート_データ入力.md",
            "prompt": "月次のモニタリング記録を作成してください。評価シートの書式を用いて、進捗状況を記録してください。"
        }
    ]

    rows_to_insert = []
    
    for t_def in templates_to_sync:
        html_file = os.path.join(base_path, t_def["file"])
        if not os.path.exists(html_file):
            print(f"⚠️ Warning: HTML {html_file} not found. Skipping.")
            continue
            
        with open(html_file, "r", encoding="utf-8") as f:
            html_content = f.read()

        # ガイドがある場合はプロンプトに統合
        full_prompt = t_def["prompt"]
        if "guide" in t_def:
            guide_file = os.path.join(base_path, t_def["guide"])
            if os.path.exists(guide_file):
                with open(guide_file, "r", encoding="utf-8") as f:
                    guide_content = f.read()
                full_prompt += f"\n\n### 入力指針と必須項目:\n{guide_content}"
            
        rows_to_insert.append({
            "doc_type": t_def["doc_type"],
            "html_template": html_content,
            "system_prompt": full_prompt,
            "version": 3, # 指針統合版としてバージョンアップ
            "updated_at": datetime.utcnow().isoformat()
        })

    if not rows_to_insert:
        print("❌ No templates found to sync.")
        return

    print(f"🚀 Syncing {len(rows_to_insert)} standard templates to BigQuery...")
    # 既存の古いテンプレートを削除するか更新するか（ここでは REPLACE を想定しているので insert して最新を JOIN するか、一旦クリアするか）
    # 今回は単純化のため insert するが、本番運用では WHERE version = (SELECT MAX(version)...) のようなクエリを組む
    errors = client.insert_rows_json(f"{project_id}.{dataset_id}.{table_id}", rows_to_insert)
    
    if errors == []:
        print("✅ Standard templates synced successfully.")
    else:
        print(f"❌ Errors occurred: {errors}")

if __name__ == "__main__":
    sync_standard_templates()
