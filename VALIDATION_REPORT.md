# 驗證紀錄

日期：2026-09-02

## 已通過

- TypeScript project references build：通過
- API Server TypeScript typecheck：通過
- Dashboard TypeScript typecheck：通過
- `scripts/verify-social-core.mjs`：通過
  - stable key 去重
  - metrics 更新與 snapshot
  - 人工活動／詢問覆核保留
  - 月份與平台 merge
  - 活動 KPI 與分類
  - Meta 中文匯入欄位
- API Server 無 Meta 憑證 smoke test：通過
  - `GET /api/healthz` → 200 / `status=ok`
  - `GET /api/social/oauth/config` → Callback URL 正確且不輸出 Secret
  - `GET /api/social/status` → manual mode、4 個來源狀態
  - `GET /api/social/data` → 回應不含 Access Token / App Secret
  - 不支援的 sync source → 400
  - 未設定 `SCHEDULE_SYNC_KEY` 的排程端點 → 503

## 本次修正的同步風險

- 補上前端已呼叫但後端原本缺少的 `/api/social/oauth/config`。
- Facebook 改用 Graph API v25 Media Views 指標，移除已停用的舊 impression 指標。
- Facebook、Instagram、Threads 補上 cursor pagination 與每批數量上限。
- Instagram 單一 metric 不支援時會拆開重試，避免整組 Insights 全部變成 0。
- Instagram 同步目前仍有效的 Stories；一般貼文／Reels 不因 Stories 權限失敗而中止。
- Threads 長效 Token 在到期前自動續期。
- Threads API Views 不再冒充單篇 unique viewers / Reach。
- 最近同步時間與 warning 寫入 runtime dataset，後端重啟後仍可顯示。
- 同步工作加上 single-flight，避免重複點擊或排程重疊同時寫檔。
- 排程金鑰改用 constant-time 比對。
- npm/pnpm 安裝檢查改成跨平台 Node 腳本。

## 仍需在正式環境驗證

下列項目需要使用者的實際 Meta App、帳號與部署網域，無法在不取得 Secret 的情況下代為執行：

- 三個 OAuth consent flow
- Facebook Page / Instagram Professional account / Threads 真實內容與 Insights
- Meta App Review / Advanced Access 狀態
- 部署平台持久磁碟與實際 CORS 網域
- GitHub Actions 的 production bundle 與 Pages deployment

原專案的 pnpm 設定刻意排除 Windows 平台的原生 esbuild 套件；因此本機受限 Windows 沙箱沒有把 production bundle 當作通過項目。正式 GitHub workflow 使用 Ubuntu + Node 22 + pnpm 10，會重新執行 core regression、typecheck 與 Vite production build。
