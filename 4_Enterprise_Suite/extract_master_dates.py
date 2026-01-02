
import os
import json
import re
import glob
import time
from pathlib import Path
import google.generativeai as genai

# Gemini APIキーの設定 (src/SetProp.js から確認したキーを使用)
# 本番運用時は環境変数等で管理することを推奨
API_KEY = "AIzaSyA71N8Tr5x4w6S6gMo5EiQGfd2cHHfumxE"
genai.configure(api_key=API_KEY)

def extract_with_gemini(file_path, prompt):
    """
    Gemini API を使用してファイルの内容を解析し、JSONデータを抽出する
    """
    # ユーザー環境で安定している 2.5 flash モデルを指定
    model = genai.GenerativeModel('models/gemini-2.5-flash')
    
    # 拡張子に応じた処理
    mime_type = "application/pdf" if file_path.endswith(".pdf") else "text/html"
    
    with open(file_path, "rb") as f:
        doc_blob = f.read()

    try:
        response = model.generate_content([
            prompt,
            {'mime_type': mime_type, 'data': doc_blob}
        ])
        
        # JSON部分を抽出
        text = response.text
        json_match = re.search(r'\[.*\]|\{.*\}', text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        print(f"Gemini API Error: {e}")
    return None

def extract_dates_from_plan_gemini(html_path):
    """
    計画書HTMLからGeminiで詳細データを抽出
    """
    print(f"Analyzing Plan with Gemini: {html_path}")
    prompt = """
    以下の個別支援計画書(HTML)から、スケジュール管理に必要な日付データを抽出してJSON形式で返してください。
    
    期待するJSON形式:
    {
      "creation_date": "YYYY-MM-DD (作成年月日)",
      "plan_start": "YYYY-MM-DD (計画期間の開始日)",
      "plan_end": "YYYY-MM-DD (計画期間の終了日)",
      "plan_number": "数字 (計画書番号)"
    }
    ※元データが和暦の場合は西暦に変換してください。
    """
    try:
        data = extract_with_gemini(html_path, prompt)
        return data
    except Exception as e:
        print(f"Error parsing HTML {html_path}: {e}")
        return None

def extract_dates_from_cert_gemini(pdf_path):
    """
    受給者証PDFからGeminiで有効期限等を抽出
    """
    print(f"Analyzing Certificate with Gemini: {pdf_path}")
    prompt = """
    以下の障害福祉サービス受給者証(PDF)から、以下の情報を抽出してJSON形式で返してください。
    
    期待するJSON形式:
    {
      "recipient_id": "受給者証番号 (10桁等)",
      "expiry_date": "YYYY-MM-DD (受給者証の有効期限の終期)",
      "municipality": "支給市町村名",
      "determined_amount": "支給量 (例: 22日/月)"
    }
    ※元データが和暦の場合は西暦に変換してください。
    """
    try:
        data = extract_with_gemini(pdf_path, prompt)
        return data
    except Exception as e:
        print(f"Error parsing PDF {pdf_path}: {e}")
        return None

def process_single_user(base_dir, user_folder_name):
    folder = os.path.join(base_dir, user_folder_name)
    if not os.path.exists(folder):
        print(f"Folder not found: {folder}")
        return None

    result = {
        "certificate_data": None,
        "plan_data": None
    }
    
    # 1. 受給者証
    cert_files = glob.glob(os.path.join(folder, "00_基本情報", "*受給者証*.pdf"))
    if cert_files:
        latest_cert = max(cert_files, key=os.path.getmtime)
        result["certificate_data"] = extract_dates_from_cert_gemini(latest_cert)
        time.sleep(1)
        
    # 2. 最新の計画書
    plan_root = os.path.join(folder, "02_個別支援計画")
    if os.path.exists(plan_root):
        plan_folders = sorted(glob.glob(os.path.join(plan_root, "第*版_*")), reverse=True)
        if plan_folders:
            latest_plan_file = os.path.join(plan_folders[0], "03_計画書.html")
            if os.path.exists(latest_plan_file):
                result["plan_data"] = extract_dates_from_plan_gemini(latest_plan_file)
                time.sleep(1)
                
    return result

if __name__ == "__main__":
    base_dir = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/利用者情報"
    
    # 柿内環奈さんをテストケースとして優先
    target_user = "116-柿内環奈"
    
    print(f"Targeting test user: {target_user}")
    extracted = process_single_user(base_dir, target_user)
    data = {target_user: extracted}
    
    output_file = 'user_master_dates_gemini.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Gemini-enhanced extraction saved to {output_file}")
    
    output_file = 'user_master_dates_gemini.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"Gemini-enhanced extraction saved to {output_file}")
