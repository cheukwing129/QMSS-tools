# 年度課表更新

`adjustment-timetable.htm` 直接讀取 `data/timetable.json`。網站訪客不用登入或上載檔案。

## 新學年更新

1. 準備新學年的教師課表 Excel 檔。
2. 安裝轉換所需套件：`python -m pip install openpyxl`
3. 在專案根目錄執行：

   ```sh
   python scripts/build-timetable-data.py "新學年教師課表.xlsx" --year "2027–2028" --out data/timetable.json
   ```

4. 按新課表年份更新 `adjustment-timetable.htm` 載入 JSON 的 `v=` 版本值，並提交網頁和 JSON。若新課表列、欄位置不同，先調整轉換程式內的 `PERIOD_ROWS` 和 `DAYS`。

## 公開資料

這是靜態網站，JSON 會提供給瀏覽器讀取；公開網站的訪客也能查看及下載其中的老師姓名、班別、循環日、節數和課堂文字。只放入適合公開給所有網站訪客的課表資料。
