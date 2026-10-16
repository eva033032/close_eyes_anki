# Close Eyes Anki 專案說明

英文聆聽、口說與間隔複習工具。前端為靜態網頁，學習資料以 Supabase 為唯一資料來源。

## 功能

- **我的文章**：貼上原文／翻譯句對或匯入 Markdown；可選 YouTube、書本或自訂來源，附加 URL；可編輯文章、建立資料夾、拖曳文章分類，依新增日期或名稱排序；首頁提供 YouTube 逐字稿工具連結與可複製的 ChatGPT 句對提示詞；新增文章貼入 YouTube 網址時會嘗試自動取得影片標題，不需 AI API key。
- **聆聽練習**：逐句播放原文與翻譯、調整每句朗讀次數（帳號設定並同步 Supabase）、收藏句子；支援自動播放與 Anki 模式。句子清單可展開／收合，預設收起。
- **收藏句子與間隔複習**：依 Again、Hard、Good、Easy 安排下次複習；手機可在答案下方的手勢區滑動評分，按鈕仍可使用。
- **公開分享**：可公開文章或資料夾；登入者可瀏覽公開資料並自行引入。
- **英文口說**：使用 Groq 對話及 Whisper 英文語音轉文字；可選文字或英文語音輸入；AI 提供 Native Correction、英文錯誤解釋與續聊，自動朗讀開關與修正版朗讀次數都按帳號儲存並同步 Supabase（修正版 N 次、解釋與續聊各一次）。自訂句子、單字、片語及常見文法錯誤可加入收藏，並共用原有間隔複習。
- **API key 設定**：口說需 Groq API key；可收合設定面板。金鑰由 Supabase Edge Function 加密後依帳戶儲存。
- **跨裝置同步與 RWD**：登入同一 Supabase 帳戶同步文章、資料夾、收藏、口說內容及進度；支援手機版面。桌面左側導覽列可垂直捲動。

## 修改時請保留

1. 學習資料只存取 Supabase；不要新增 localStorage／IndexedDB 等本機持久儲存。
2. 複習規則共用於收藏句子及口說自訂卡，不要另建一套口說複習排程。
3. 公開資料只能由擁有者發布／更新／取消公開；其他登入者可瀏覽和引入，不可修改原件。
4. `user_ai_keys` 只能由 Edge Function 以服務端密鑰讀寫；絕不可把 service-role key 或加密密鑰放入前端或 Git。
5. 修改頁面、事件或樣式時，先檢查對應的 HTML、JS、CSS 與手機版行為；保留既有功能，避免整段覆寫其他模組。

## 主要檔案

- `index.html`：頁面與元件結構
- `app.js`、`styles.css`：文章、聆聽、收藏、複習、分享及主要版面
- `speaking.js`：口說介面與互動
- `cloud-sync.js`：Supabase 登入、同步與公開資料
- `supabase/functions/speaking-ai/index.ts`：口說 AI、語音轉文字及 API key 加密儲存
- `supabase-setup.sql`：資料表與 RLS 權限設定

## 本機啟動

PowerShell 切到專案資料夾後執行 `.\start.ps1`，再開啟 `http://127.0.0.1:8000`。文章句對格式見 [`sentence-pairs-template.md`](sentence-pairs-template.md)。

Supabase 資料表設定見 `supabase-setup.sql`。部署口說功能前，需設定 `SPEAKING_KEY_ENCRYPTION_SECRET` 並部署 `speaking-ai` Edge Function；部署網站使用 Vercel。前端只可使用 Supabase publishable／anon key。
