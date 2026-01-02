
import os
import json
import re

# Paths
BASE_DIR = "/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/おひさま農園/利用者情報/136-宮﨑寿則/02_個別支援計画/第1版_2026-01"
PLAN_PATH = os.path.join(BASE_DIR, "03_計画書.html")
DRAFT_PATH = os.path.join(BASE_DIR, "01_個別支援計画書（原案）.html")
JSON_PATH = os.path.join(BASE_DIR, "user_data_full.json")

# Text replacements map
# (Target Text Regex Pattern -> Replacement String)
replacements = [
    (r"専門的スキル（整備・農機具操作）", "機械整備や器具操作の経験"),
    (r"本人の卓越した強みを最大限に活かし.+?頼られる存在（マイスター）.+?役割を確立する", "得意な「機械整備・操作」の経験を活かし、事業所内で役割を持つ"),
    (r"専門家", "経験者"),
    (r"なごみB型", "おひさま農園"),
    (r"なごみ", "おひさま農園"), # Catch all other references
    (r"短期目標：.+?（期間：.+?）", ""), # Clear old short term goal line if it exists in p tag
]

# New Short Term Goals HTML Block
new_short_term_goals_html = """
            <table>
                <tr>
                    <th style="width:20%">解決すべき課題</th>
                    <th style="width:28%">具体的な到達目標</th>
                    <th style="width:37%">支援内容</th>
                    <th style="width:15%">支援期間</th>
                </tr>
                <tr>
                    <td><strong>①環境への適応</strong><br>（不安・ストレスの軽減）</td>
                    <td>新しい環境（おひさま農園）の雰囲気や手順に慣れ、落ち着いて過ごすことができる。</td>
                    <td>・「わからないことは聞いていい」と伝え、安心感を醸成する。<br>・不安や戸惑いを感じた際はスタッフに相談し、ストレスを溜め込まずに解消できるよう関わる。</td>
                    <td>R8.1.1<br>〜<br>R8.6.30</td>
                </tr>
                <tr>
                    <td><strong>②通所の安定</strong><br>（健康管理）</td>
                    <td>無理のないペース配分を覚え、週5回の通所を安定して継続する。</td>
                    <td>・加齢や体力低下に配慮し、こまめな休憩を促す。<br>・「休まず通うこと」自体を評価し、自信につなげる。</td>
                    <td>R8.1.1<br>〜<br>R8.6.30</td>
                </tr>
                <tr>
                    <td><strong>③役割の遂行</strong><br>（強みの活用）</td>
                    <td>得意な機械整備や器具操作の経験を活かし、作業に参加する。</td>
                    <td>・本人の経験が活きる作業（機械操作等）を依頼し、やりがいを感じてもらう。<br>・「上手ですね」「助かります」と声をかけ、自尊心を大切にする。</td>
                    <td>R8.1.1<br>〜<br>R8.6.30</td>
                </tr>
            </table>
"""

# New Long Term Goal
new_long_term_goal = "<strong>長期目標：</strong>心身ともに健康で、培った技術を活かしながら長く安定して働き続ける。　期間：令和8年1月1日 〜 令和9年12月31日"
new_short_term_goal_summary = "<strong>短期目標：</strong>新しい環境（おひさま農園）に慣れ、週5回の通所を継続しながら、ストレスなく過ごす。　期間：令和8年1月1日 〜 令和8年6月30日"


def update_html_file(path):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Apply general replacements
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)

    # Replace Goals Section specifically
    # Targeting the table within "5. 支援目標・支援内容"
    # Find the table and replace it with new_short_term_goals_html
    # We look for <h4 ...>◎具体的な到達目標及び支援計画等</h4> ... <table> ... </table>
    
    # Simple regex to replace the table after the specific header
    header_pattern = r"(<h4[^>]*>◎具体的な到達目標及び支援計画等</h4>\s*)(<table>[\s\S]*?</table>)"
    match = re.search(header_pattern, content)
    if match:
        content = content.replace(match.group(2), new_short_term_goals_html.strip())
    else:
        print(f"Warning: Could not find Goals Table in {path}")

    # Replace Long/Short term summary text
    # Look for <p><strong>長期目標：</strong>...</p>
    content = re.sub(r"<p><strong>長期目標：</strong>.+?</p>", f"<p>{new_long_term_goal}</p>", content)
    content = re.sub(r"<p><strong>短期目標：</strong>.+?</p>", f"<p>{new_short_term_goal_summary}</p>", content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Updated {path}")

# Run updates
update_html_file(PLAN_PATH)
update_html_file(DRAFT_PATH)

# Update JSON (Create if not exists in this folder, or update)
json_data = {
    "plan_goals": {
        "long_term": "心身ともに健康で、培った技術を活かしながら長く安定して働き続ける。",
        "short_term": "新しい環境（おひさま農園）に慣れ、週5回の通所を継続しながら、ストレスなく過ごす。",
        "specific_goals": [
            {"category": "環境への適応", "goal": "新しい環境（おひさま農園）の雰囲気や手順に慣れ、落ち着いて過ごすことができる。", "support": "不安の解消、相談対応"},
            {"category": "通所の安定", "goal": "無理のないペース配分を覚え、週5回の通所を安定して継続する。", "support": "休憩促進、通所継続の評価"},
            {"category": "役割の遂行", "goal": "得意な機械整備や器具操作の経験を活かし、作業に参加する。", "support": "経験を活かせる作業依頼、承認"}
        ]
    },
    "strength": "機械整備や器具操作の経験、手先の器用さ"
}

with open(JSON_PATH, "w", encoding="utf-8") as f:
    json.dump(json_data, f, indent=2, ensure_ascii=False)
print(f"Updated JSON at {JSON_PATH}")

