# 年度課表更新

`adjustment-timetable.htm` 和 `free-period-search.htm` 共用並直接讀取 `data/timetable.json` 和 `data/school-days.json`。網站訪客不用登入或上載檔案。QMSS Calendar 的日期和 Day A–F 對照以年度 JSON 提供給網頁，因此前端不保存 Google API key，也不要求每位訪客連接 Google。

## 新學年更新

1. 準備新學年的教師課表 Excel 檔。
2. 安裝轉換所需套件：`python -m pip install openpyxl`
3. 在專案根目錄執行：

   ```sh
   python scripts/build-timetable-data.py "新學年教師課表.xlsx" --year "2027–2028" --out data/timetable.json
   ```

4. 按新課表年份更新 `adjustment-timetable.htm` 載入 JSON 的 `v=` 版本值，並提交網頁和 JSON。若新課表列、欄位置不同，先調整轉換程式內的 `PERIOD_ROWS` 和 `DAYS`。全日節數為 1–9；Day F 第 6 列是第 1 節，其他固定課節列依序是第 2–9 節。

## QMSS Calendar 日別更新

1. 由已連接的 QMSS Calendar 取得整個學年的個別活動資料；活動標題需包含 `Day A` 至 `Day F`，並提供活動日期。
2. 將完整學年的活動列表存成 Google Calendar events API 格式的 JSON，讓重複活動先展開為每個實際日期。
3. 在專案根目錄執行：

   ```sh
   python scripts/build-school-days.py "qmss-calendar-events.json" --year "2026–2027" --out data/school-days.json
   ```

4. 提交更新的 `data/school-days.json`。工具會按日期自動帶入 Day；若校曆沒有某日，表格才顯示手動選擇作為補救。

## 公開資料

這是靜態網站，JSON 會提供給瀏覽器讀取；公開網站的訪客也能查看及下載其中的老師姓名、班別、循環日、節數和課堂文字。只放入適合公開給所有網站訪客的課表資料。
