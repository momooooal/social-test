# Facebook / Instagram / Threads 同步設定

這個專案的 GitHub Pages 前端不能直接安全保存 Meta App Secret，因此真正的自動同步一定要同時部署 `artifacts/api-server`。前端繼續保存人工覆核與快照；後端只保存 OAuth Token、向 Meta 取資料，再把結果交給既有 merge pipeline。

## 1. 帳號條件

- Facebook：你必須能管理要同步的 Facebook Page。
- Instagram：必須是 Business 或 Creator 的 Professional account，並連到上述 Facebook Page。個人帳號無法使用這套官方 API。
- Threads：要同步的 Threads 帳號需授權你的 Threads App。
- 如果 App 只服務你自己管理的帳號，可先把自己的 Meta 帳號加入 App roles / testers 測試；若要讓其他人的帳號使用，需依 Meta 要求切到 Live mode 並申請對應權限。

## 2. 部署 API Server

在支援 Node.js 22 與持久磁碟的服務上部署整個 repository，建置與啟動指令如下：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server build
pnpm --filter @workspace/api-server start
```

健康檢查路徑：

```text
GET https://你的後端網域/api/healthz
```

必填環境變數：

```dotenv
BACKEND_PUBLIC_URL=https://你的後端網域
DASHBOARD_PUBLIC_URL=https://你的帳號.github.io/你的repo/#/settings
DASHBOARD_ORIGIN=https://你的帳號.github.io

META_APP_ID=你的 Meta App ID
META_APP_SECRET=你的 Meta App Secret
META_API_VERSION=v25.0

THREADS_APP_ID=你的 Threads App ID
THREADS_APP_SECRET=你的 Threads App Secret

OAUTH_STATE_SECRET=至少32字元的隨機字串
SCHEDULE_SYNC_KEY=另一組至少32字元的隨機字串

SOCIAL_DATA_FILE=/持久磁碟/social-runtime.json
SOCIAL_TOKEN_FILE=/持久磁碟/social-tokens.json
SOCIAL_SYNC_MAX_ITEMS=500
```

`THREADS_APP_ID` / `THREADS_APP_SECRET` 留空時，後端會退回使用 `META_APP_ID` / `META_APP_SECRET`；只有在同一個 Meta App 已加入 Threads use case 時才適合這樣做。

## 3. Meta Developer 設定

部署後，先打開 Dashboard →「設定」→ 填入後端 URL →「測試連線」。網站會顯示後端實際使用的三個 Callback URL，請逐字貼到對應產品的 Valid OAuth Redirect URIs：

```text
https://你的後端網域/api/social/auth/facebook/callback
https://你的後端網域/api/social/auth/instagram/callback
https://你的後端網域/api/social/auth/threads/callback
```

同步使用的 scopes：

- Facebook：`pages_show_list`、`pages_read_engagement`
- Instagram：`pages_show_list`、`pages_read_engagement`、`instagram_basic`、`instagram_manage_insights`
- Threads：`threads_basic`、`threads_manage_insights`

Instagram with Facebook Login 的官方流程需要先從 `/me/accounts` 取得 Page access token 與連結的 Instagram Professional account；本專案已照這個流程實作。Threads 會把短效 Token 換成約 60 天的長效 Token，並在到期前 7 天自動續期。

## 4. 在 Dashboard 連結帳號

建議依序操作：

1. 按「Facebook」完成 Page 授權。
2. 按「Instagram」補齊 Instagram Insights 權限並確認 Professional account。
3. 按「Threads」完成 Threads 授權。
4. 回到設定頁按「立即向 Meta 同步」。
5. 到「內容資料庫」確認逐篇內容；同一篇再次同步只會更新數字並建立 snapshot，不會產生複本。

Facebook / Instagram 若管理多個 Page，可在後端加上 `FB_PAGE_ID` 指定 Page。未指定時會使用 Meta 回傳的第一個 Page。

## 5. 每日排程

在 GitHub repository → Settings → Secrets and variables → Actions 新增：

- `SOCIAL_SYNC_URL`：後端根網址，例如 `https://social-api.example.com`
- `SOCIAL_SYNC_KEY`：必須與後端 `SCHEDULE_SYNC_KEY` 完全相同

`.github/workflows/scheduled-social-sync.yml` 會每天呼叫受保護的同步端點。Threads Token 續期也會在這次同步中自動處理。

## 6. 指標定義

- Facebook Views 使用 v25 的 `post_media_view`；unique media viewers 使用 `post_total_media_view_unique`。舊 `post_impressions` / `post_impressions_unique` 已停用，不再使用。
- Instagram 的 Views 與 Reach 分開保存；不同內容類型沒提供的欄位會標示未提供。
- Threads 官方 API 提供單篇 Views，但沒有可穩定使用的單篇 unique viewers 時，不會把 Views 冒充 Reach。Dashboard 的 Chrome 擷取備援若取得「瀏覽人數」，仍會保存在 `threadsInsights.viewers`。
- 單一 metric 或單一平台權限不足時，只會顯示 warning，其餘平台仍繼續同步。

## 7. 常見問題

**OAuth 顯示 Redirect URI mismatch**

確認 Meta Developer 內的 URI 與設定頁顯示值完全一致，包括 `https`、網域、路徑與結尾斜線。

**Instagram 顯示未授權**

確認帳號是 Business / Creator、已連到 Facebook Page，且登入者能管理該 Page。若 Page 有多個，設定正確的 `FB_PAGE_ID`。

**只有自己看得到資料**

App 還在 Development mode 時，通常只有 App roles / testers 與其管理的資產可測試。若要開放其他人使用，需依 Meta App Review 要求申請權限。

**部署重啟後要重新登入**

`SOCIAL_TOKEN_FILE` 沒有放在持久磁碟。請先修正檔案路徑，再重新走一次 OAuth。

**Facebook Views / Reach 都是 0**

先看設定頁來源警告。新版已使用 Media Views 指標；若仍為 0，通常是 App 權限、內容類型可用性，或該內容確實尚無數值。Dashboard 會用 `metricAvailability` 區分「真實 0」與「未提供」。
