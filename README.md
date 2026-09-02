# 社群效益分析 Dashboard｜完成版

這是一套可長期使用的 Facebook / Instagram / Threads 社群效益分析工具，定位不是單純看粉絲數，而是把「逐篇宣傳內容 → 活動歸因 → 民眾詢問 → 成效快照 → 年度成果報告」串成同一套資料流程。

## 架構

- `artifacts/social-impact-dashboard`：React + Vite 前端，可獨立部署到 GitHub Pages。
- `artifacts/api-server`：可選的 Node/Express 後端，用於 Meta OAuth、Token 保存與自動同步。
- `lib/db`：Drizzle/PostgreSQL schema，供未來將後端 runtime JSON 持久化到資料庫。
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自動 build/deploy。
- `.github/workflows/scheduled-social-sync.yml`：可選的每日後端同步觸發器。

前端沒有 backend 也能使用：活動、CSV/XLSX/JSON 匯入、分類、人工覆核、快照、報告與備份都會走 IndexedDB。

## 已完成的重要功能

- 逐篇內容資料庫：Facebook / Instagram / Threads，支援 Post、Reel、Story、Threads Post。
- Stable key 去重：優先 `platform + native_content_id`，其次 permalink，再退回發布時間 + caption hash。
- 同篇內容更新不新增複本，metrics 改變時自動新增 `content_snapshots`。
- 人工活動覆核（接受 / 改派 / 排除）不會被後續 API 或匯入資料洗掉。
- 民眾詢問人工主題與人工活動歸類也會保留。
- 月份與平台彙總採 merge，不會因只匯入一個月份或一個平台就清空舊資料。
- 活動 KPI 由實際內容與詢問即時計算，不再依賴活動物件內寫死數字。
- 規則式活動分類器：活動名稱、別名、hashtag、關鍵字、活動網址、宣傳期間。
- 規則式詢問分類：報名、候補、資格、時間、地點、交通、停車、費用、退款、天候、規則等。
- `conversation_count` 與 `message_count` 分開統計。
- CSV / XLSX / JSON 匯入預覽與欄位模糊對應；Views 與 Reach 分開辨識。
- 年度 / 季度 / 月份 / 自訂日期 / 單一活動成果報告。
- 資料品質中心：完整度、歸屬信心、重複疑慮、待覆核、未歸類、缺少連結。
- 私有完整備份與公開安全匯出分開；公開匯出會移除私訊原文與匿名對話識別碼。
- PWA 與 GitHub Pages hash routing。
- 可選 Meta OAuth / API provider：Facebook、Instagram Professional Account、Threads。
- 分平台錯誤隔離：某平台權限不足時，其餘平台仍可同步。

## 最快使用方式：GitHub Pages + 手動備援

1. 把整個專案上傳到 GitHub repository。
2. Repository → **Settings → Pages**，Source 選 **GitHub Actions**。
3. Push 到 `main` 後，`.github/workflows/deploy-pages.yml` 會自動安裝依賴、跑核心回歸檢查、TypeScript typecheck、Vite build，再部署 Pages。
4. 第一次打開網站，可選：
   - **自動同步＋手動備援**
   - **只使用手動匯入**
   - **DEMO 看看**
5. 無後端時，到「資料中心」匯入 Meta / Threads 匯出的 CSV、XLSX 或 JSON 即可。

## 自動同步

若要自動同步，另外部署 `artifacts/api-server`，並在前端「設定」填入 backend URL。

完整逐步設定請看：`SYNC_SETUP.md`。

後端 Secrets 請依 `artifacts/api-server/.env.example` 設定，至少包含：

- `BACKEND_PUBLIC_URL`
- `DASHBOARD_PUBLIC_URL`
- `DASHBOARD_ORIGIN`
- `META_APP_ID`
- `META_APP_SECRET`
- `OAUTH_STATE_SECRET`
- Threads 若使用獨立 App：`THREADS_APP_ID`、`THREADS_APP_SECRET`
- 可選：`FB_PAGE_ID`
- 每日排程：`SCHEDULE_SYNC_KEY`

任何 Token / App Secret 都不得放進前端或公開 GitHub。

## 每日排程

`.github/workflows/scheduled-social-sync.yml` 會在有設定下列 GitHub Secrets 時呼叫後端：

- `SOCIAL_SYNC_URL`
- `SOCIAL_SYNC_KEY`

`SOCIAL_SYNC_KEY` 要與後端 `SCHEDULE_SYNC_KEY` 相同。沒有設定時 workflow 會安全跳過。

## Meta 權限提醒

Facebook / Instagram / Threads 可取得的 Insights 指標會受帳號類型、內容類型、API 版本與 App Review 影響。Messenger / Instagram DM 的一般民眾對話可能需要額外 Messaging permission、Business Verification 或 Advanced Access。

本系統的設計原則是：**權限不足只標示該資料來源受限，不讓整批同步失敗。** 受限項目仍可使用手動匯入備援。

## 後端持久化

目前 API Server 的 OAuth Token 與 runtime dataset 預設使用本機 JSON 檔案。若部署平台檔案系統會在 restart / redeploy 後清空，請：

- 使用 persistent disk 並設定 `SOCIAL_DATA_FILE` / `SOCIAL_TOKEN_FILE`，或
- 將 runtime store 接到 `lib/db` 已提供的 PostgreSQL / Drizzle schema。

前端人工覆核與快照會保存在瀏覽器 IndexedDB，因此 GitHub Pages 本機模式不依賴後端資料庫。

## 驗證

GitHub Pages workflow 會執行：

```bash
pnpm install --frozen-lockfile
pnpm verify:core
pnpm --filter @workspace/social-impact-dashboard typecheck
pnpm --filter @workspace/social-impact-dashboard build
```

`pnpm verify:core` 會檢查：

- 同一篇內容更新不產生複本
- metrics 能更新
- 人工活動覆核不被同步覆蓋
- 民眾詢問人工主題 / 活動歸類不被覆蓋
- snapshot baseline + 最新值建立正常
- 月份 / 平台資料 merge 不清空其他資料
- 活動 KPI 即時計算
- 活動分類器 / 詢問分類器
- 中文欄位匯入與 Views / Reach 正確辨識

## 重要資料安全規則

公開 repository 不應保存：

- 民眾姓名
- Facebook / Instagram / Threads 使用者 ID
- Profile URL
- 完整私人對話
- Access Token / App Secret

如要把資料推上 GitHub，請使用網站的「公開安全資料」匯出，而不是「完整私有備份」。

## 子專案說明

前端詳細說明：`artifacts/social-impact-dashboard/README.md`

後端詳細說明：`artifacts/api-server/README.md`

驗證紀錄：`VALIDATION_REPORT.md`
