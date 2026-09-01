# 社群效益分析 API Server

這個後端是 **可選的**。前端 GitHub Pages 沒有後端仍可使用：活動、匯入、覆核、快照、詢問分類、報告與匯出都會走 IndexedDB。

後端只負責：

- Meta OAuth 與 Token 保存
- Facebook / Instagram / Threads 官方 API 同步
- 分平台錯誤隔離（某一平台失敗，不拖垮其他平台）
- 可選的每日排程同步

## 1. 環境變數

複製 `.env.example` 的欄位到你的部署平台 Secrets / Environment Variables。**不要提交真的 Secret、Token 或 `data/social-tokens.json` 到 GitHub。**

必要欄位：

- `BACKEND_PUBLIC_URL`：後端公開網址，例如 `https://social-api.example.com`
- `DASHBOARD_PUBLIC_URL`：GitHub Pages Dashboard 設定頁網址
- `META_APP_ID`
- `META_APP_SECRET`
- `OAUTH_STATE_SECRET`
- Threads 若使用獨立 App，再填 `THREADS_APP_ID` / `THREADS_APP_SECRET`

可選：

- `FB_PAGE_ID`：同一個帳號管理多個 Page 時，指定要同步哪個 Page
- `SCHEDULE_SYNC_KEY`：啟用 GitHub Actions 每日同步端點

## 2. OAuth Redirect URI

在 Meta App 加入：

- `{BACKEND_PUBLIC_URL}/api/social/auth/facebook/callback`
- `{BACKEND_PUBLIC_URL}/api/social/auth/instagram/callback`
- `{BACKEND_PUBLIC_URL}/api/social/auth/threads/callback`

前端「設定」頁按 Facebook / Instagram / Threads 連結，會開啟這些官方 OAuth 流程。

## 3. Instagram

目前實作採 **Instagram API with Facebook Login**，因此 Instagram 必須是 Professional Account 並連到可管理的 Facebook Page。核心讀取權限使用 `pages_show_list`、`pages_read_engagement`、`instagram_basic`、`instagram_manage_insights`。實際可取指標會依內容類型與 Meta 當下 API 回應不同；單一 metric 失敗不會讓整批資料消失。

## 4. Threads

Threads 走 `graph.threads.net`，使用 `threads_basic` 與 `threads_manage_insights`。內容與 Insights 會分別讀取，再正規化成 Dashboard 共用資料格式。

## 5. Messenger / Instagram DM

這版 Dashboard 已有 `conversation_count` / `message_count`、詢問分類與手動匯入流程；**後端不會假裝已拿到私訊權限**。

Meta Conversations API 的一般民眾對話可能需要 Messaging 權限、Business Verification 與 Advanced Access，因此未核准時設定頁會顯示「權限不足 / 使用手動匯入」。這是刻意設計，不是同步故障。

## 6. 每日排程

Repository 內有 `.github/workflows/scheduled-social-sync.yml`。在 GitHub Secrets 設定：

- `SOCIAL_SYNC_URL`：後端根網址
- `SOCIAL_SYNC_KEY`：與後端 `SCHEDULE_SYNC_KEY` 相同

Actions 會呼叫：

`POST /api/social/sync/scheduled`

並帶 `X-Sync-Key`。若 Secrets 沒填，工作流程會安全跳過，不會讓 Pages 部署失敗。

## 7. 持久化提醒

目前 OAuth Token 與後端 runtime dataset 預設存檔案。若你的部署平台檔案系統是 ephemeral，重啟後可能遺失，請把 `SOCIAL_DATA_FILE` / `SOCIAL_TOKEN_FILE` 指向持久磁碟，或後續把 `lib/db` 已附的 Drizzle schema 接到 PostgreSQL。
