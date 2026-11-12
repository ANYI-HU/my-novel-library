# 木棕書房｜My Novel Library（GitHub Pages 共用書庫版）

這個版本已改為：**所有訪客共用同一份 TXT 書庫，進站前需輸入密碼**。

> 重要：此版本的密碼鎖是一般門檻，不是安全存取控制。GitHub Pages 會公開發布靜態檔案；前端密碼雜湊可被檢視、破解或繞過，TXT 也能透過檔案網址直接讀取。請只放你願意公開給知道網址的人看到的內容，不要放機密或未獲授權的作品。

## 專案結構

```text
my-novel-library/
├── index.html
├── css/style.css
├── js/app.js
├── js/config.js             # 在這裡設定密碼雜湊
├── novels/
│   ├── manifest.json        # 共用書庫目錄
│   └── *.txt                # 你放入的小說
├── tools/password-generator.html
└── README.md
```

## 一、設定網站密碼

1. 用 VS Code 開啟整個 `my-novel-library` 資料夾。
2. 使用 Live Server 啟動網站（例如 `http://127.0.0.1:5500`）。
3. 在網址後方開啟 `tools/password-generator.html`，例如：`http://127.0.0.1:5500/tools/password-generator.html`。
4. 輸入你想設定的書房密碼，按「產生雜湊」。建議使用不會用在其他帳號的長密碼。
5. 複製產生的 64 位十六進位字串。
6. 開啟 `js/config.js`，把 `ACCESS_PASSWORD_HASH` 的內容替換成複製的雜湊值，例如：

   ```js
   const ACCESS_PASSWORD_HASH = "在這裡貼上64位雜湊字串";
   ```

7. 儲存後重新整理網站，測試正確／錯誤密碼是否正常。

密碼原文不會寫進網站檔案；但雜湊值會在前端程式中，因此這只能當作一般門檻。不要把真正重要或重複使用的密碼放在這裡。

## 二、把小說加入共用書庫

網站上的每個人都會看到 `novels/manifest.json` 登記的小說。新增小說需由你更新 GitHub 專案：

1. 將 `.txt` 檔放進 `novels` 資料夾。建議檔名使用英文或簡短名稱，並避免重複。
2. 開啟 `novels/manifest.json`，在 `books` 陣列中新增一筆資料：

   ```json
   {
     "books": [
       {
         "id": "novel-001",
         "title": "小說名稱",
         "file": "novels/小說名稱.txt"
       }
     ]
   }
   ```

3. 若有多本小說，請用逗號分隔各筆 `{ ... }`，但最後一筆後面不要加逗號。
4. 儲存並把整個專案更新到 GitHub。部署完成後，所有訪客重新整理就會看到新小說。

`id` 請保持唯一且不要任意更改；`file` 路徑需與實際檔名完全一致（包含大小寫及副檔名）。建議新 TXT 使用 UTF-8 編碼。舊檔可保留原始編碼；閱讀時網站會先辨識 BOM、驗證 UTF-8，再嘗試 Big5／GB18030。由於 Big5 與 GBK 的位元組範圍可能重疊，自動辨識無法保證每個舊檔都正確，遇到亂碼時請在閱讀設定中手動切換編碼。

## 三、在本機測試

1. VS Code 開啟專案資料夾。
2. 安裝 Live Server 擴充套件。
3. 對 `index.html` 按右鍵 → **Open with Live Server**。
4. 輸入密碼進入書房，測試書籍是否載入、目錄是否能開啟。

也可在專案根目錄執行：

```bash
python -m http.server 8000
```

再開啟 `http://localhost:8000`。

## 四、部署到 GitHub Pages

### A. 建立 Repository

1. 登入 GitHub，點右上角 `+` → `New repository`。
2. Repository name 可填 `my-novel-library`。
3. 若使用 GitHub Free，GitHub Pages 一般需要公開 Repository；請記得網站內容與小說檔案也會公開可取得。
4. 建立 Repository。

### B. 上傳網站檔案

1. 解壓縮本專案 ZIP。
2. 進入 GitHub 新建的 Repository。
3. 選 `Add file` → `Upload files`。
4. 將專案內的檔案與資料夾（`index.html`、`css`、`js`、`novels`、`tools`、`.nojekyll`、`README.md`）拖曳上傳。注意要上傳資料夾內的內容，不要多包一層 `my-novel-library/my-novel-library`。
5. 在頁面下方按 `Commit changes`。

### C. 開啟 GitHub Pages

1. 在 Repository 上方選 `Settings`。
2. 左側選 `Pages`。
3. `Build and deployment` 的 `Source` 選 `Deploy from a branch`。
4. `Branch` 選 `main`，資料夾選 `/(root)`。
5. 按 `Save`。
6. 等待部署完成，在 `Settings` → `Pages` 頁面按 `Visit site`，網址通常是 `https://你的GitHub帳號.github.io/my-novel-library/`。

GitHub 官方說明： https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## 五、之後如何更新

- **新增小說**：上傳 TXT 到 `novels/`，並更新 `novels/manifest.json`。
- **刪除小說**：從 manifest 移除該筆，再刪除對應 TXT。
- **更改密碼**：重新使用 `tools/password-generator.html` 產生雜湊，更新 `js/config.js`，再 commit。
- **更新網站設計**：修改 HTML/CSS/JS 後 commit，GitHub Pages 會重新部署。
- **切換小說文字編碼**：閱讀時點選右上角「Aa」→「小說文字編碼」。預設為自動辨識；若仍有亂碼，可手動選擇 UTF-8、Big5、GB18030／GBK、UTF-16 LE 或 UTF-16 BE。選擇會保存在目前瀏覽器。

## 六、收藏與閱讀進度

- 小說正文是共用的靜態 TXT 檔案，所有訪客讀到相同內容。
- 收藏、最近閱讀、字體大小、行距、主題與閱讀進度，分別存在每位訪客自己的瀏覽器 `localStorage`，不會同步給其他人，也不會上傳到 GitHub。
- 若清除瀏覽器網站資料或換裝置，個人閱讀紀錄可能消失。

## 七、密碼鎖的限制與著作權提醒

- 此密碼檢查發生在瀏覽器端，無法阻止使用者直接開啟 `novels/*.txt` 檔案網址或檢視網站程式碼。
- SHA-256 雜湊不是伺服器端驗證；技術使用者可繞過前端檢查。不要將它當作真正的隱私或安全保護。
- GitHub Pages 是靜態網站託管，不提供一般的伺服器端密碼登入。官方說明指出 Pages 會發布 Repository 中的靜態檔案，網站內容可公開存取。
- 請只上傳你有權公開分享的小說或其他內容，並遵守著作權規範。


## 閱讀介面更新

- 閱讀設定列固定在閱讀畫面上方，捲動時仍可調整字體、行距與文字編碼。
- 右下角提供回到最上方／前往最末端按鈕。
- 左上角目錄按鈕可收合或重新開啟藏書目錄；手機版以側邊抽屜方式呈現。
- 依螢幕寬度自動切換桌面與手機版排版。
- 章節辨識結果超過五章才顯示章節導覽。
- 已開啟的小說會暫存在目前頁面的記憶體中，切換回該小說時不必重複下載；瀏覽器快取也會協助減少重複網路讀取。
- 大型 TXT 的段落使用瀏覽器延遲繪製提示，降低長篇內容捲動時的繪製負擔。

若首次開啟大型 TXT 仍需等待，屬於瀏覽器下載與建立文字版面的正常成本；建議將 TXT 儲存為 UTF-8，並避免一次載入不必要的圖片或外部字型。


## 八、手機直接上傳 TXT（Cloudflare Worker）

本版本新增 `admin.html` 管理頁面。手機進入書房後，點選上方「＋ 新增小說」，即可選擇 TXT、填寫書名／作者、指定文字編碼並上傳。上傳成功後，Worker 會把 TXT 放進 `novels/`，並更新 `novels/manifest.json`。

> **重要：前端頁面尚不能單獨完成上傳。** 必須先部署 Cloudflare Worker 並設定 GitHub 權限；在完成下列設定前，管理頁會提示尚未設定上傳服務。

### A. 建立 GitHub Token

1. 在 GitHub 開啟 Settings → Developer settings → Personal access tokens → Fine-grained tokens。
2. 建立一組只授權此小說 Repository 的 Token。
3. Repository permissions 僅需設定 **Contents: Read and write**。
4. 產生後先複製保存。Token 只會放進 Cloudflare Worker Secret，**不要貼進任何 HTML／JavaScript 檔案，也不要傳給別人**。

### B. 部署 Cloudflare Worker

1. 建立或登入 Cloudflare 帳號，進入 Workers & Pages，建立 Worker。
2. 建議在電腦上安裝 Node.js 與 Wrangler，於終端機執行：

   ```bash
   npm install -g wrangler
   npx wrangler login
   ```

3. 在本專案 `cloudflare-worker/wrangler.toml` 修改：
   - `GITHUB_OWNER`：你的 GitHub 使用者名稱。
   - `GITHUB_REPO`：Repository 名稱（例如 `my-novel-library`）。
   - `ALLOWED_ORIGIN`：GitHub Pages 網站的來源網域，不要加路徑或最後的 `/`。例如網站為 `https://example.github.io/my-novel-library/`，此處填 `https://example.github.io`。
4. 在 `cloudflare-worker` 資料夾開啟終端機，設定兩個 Secret（請替換成你自己的值）：

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put ADMIN_PASSWORD
   ```

   第一個貼上剛才建立的 GitHub Token；第二個設定一組專門用於新增小說的長密碼。它與書房閱讀密碼可以不同。
5. 部署 Worker：

   ```bash
   npx wrangler deploy
   ```

6. 部署完成後，Cloudflare 會提供類似 `https://my-novel-library-uploader.你的子網域.workers.dev` 的網址。

### C. 設定網站呼叫 Worker

1. 開啟 `js/upload-config.js`。
2. 將 `https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev` 替換成剛才取得的 Worker 網址（不要加 `/upload`）。
3. 將網站更新到 GitHub Pages。
4. 用手機開啟網站，登入後點「＋ 新增小說」，選一個 TXT 測試上傳。

### D. 使用方式與限制

- 支援手機檔案選擇器，可從手機本機或雲端硬碟選擇 `.txt`。
- 單一 TXT 目前限制 15 MB；請避免一次上傳非常大的檔案。
- 可選 UTF-8、GB18030／GBK、Big5、UTF-16 LE／BE。上傳時會轉成 UTF-8 儲存，避免不同電腦／手機解讀原始編碼不一致。
- 書名或檔名重複時會拒絕上傳，不會直接覆蓋舊小說。
- 上傳成功後 GitHub 會產生 commit；GitHub Pages 部署需要一點時間，稍後重新整理書庫即可看到新小說。
- 若 TXT 上傳成功但 `manifest.json` 更新失敗，管理頁會顯示提醒。此時請先到 GitHub 檢查 `novels/`，不要立刻重複上傳同名檔案。
- `ADMIN_PASSWORD` 與 `GITHUB_TOKEN` 僅設定在 Worker 的 Secret；不要將這兩項資訊寫進前端設定檔。
- Worker 網址雖可公開，但沒有正確管理密碼就不能執行上傳。請使用不重複於其他帳號的高強度管理密碼；若需要更高防護，可再加 Cloudflare Turnstile 或 Rate Limiting。
- 這項功能不會改變 GitHub Pages 的公開性：TXT 仍然會成為 Repository／Pages 可取得的靜態檔案。請只上傳你有權公開分享的內容。
