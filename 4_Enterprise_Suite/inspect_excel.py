
import openpyxl
import os

file_path = '/Users/muratafutoshishi/Library/CloudStorage/GoogleDrive-d.murata@izaya.llc/マイドライブ/経理関係/第２期（2024.3.1-2025.2.28)/勤務表（2024.3.1-2025.2.28)/勤務2024.4月分.xlsx'

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

wb = openpyxl.load_workbook(file_path, data_only=True)
sheet = wb.active # 最初のアクティブなシート

print(f"Sheet Name: {sheet.title}")

# 10x15の範囲を表示して構造を把握する
for row in range(1, 15):
    row_data = []
    for col in range(1, 15):
        val = sheet.cell(row=row, column=col).value
        row_data.append(str(val) if val is not None else "")
    print("\t".join(row_data))
