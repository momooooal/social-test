# 社群效益分析 Dashboard Frontend

此資料夾是可獨立部署到 GitHub Pages 的 React + Vite 前端。

## 離線 / 無後端仍可使用

- DEMO / 真實資料 onboarding
- IndexedDB 持久化
- 建立與編輯活動
- 宣傳內容搜尋、篩選、活動覆核
- CSV / XLSX / JSON 匯入
- Stable key 去重與 metrics 更新
- 每次內容數字變更建立 snapshot
- 人工覆核與詢問人工分類保留
- 活動 KPI 即時計算
- 年度 / 季度 / 月份 / 自訂期間報告
- 完整私有備份 / 公開安全匯出
- PWA

## 自動同步

到「設定」填入 API Server 根網址，例如：

`https://your-backend.example`

前端會使用：

- `GET /api/social/status`
- `GET /api/social/data`
- `POST /api/social/sync`
- `/api/social/auth/facebook/start`
- `/api/social/auth/instagram/start`
- `/api/social/auth/threads/start`

若 backend URL 留空，所有本機功能仍可使用。

## GitHub Pages

本專案使用 hash routing，因此網址會像：

- `/#/`
- `/#/campaigns`
- `/#/content`
- `/#/reports`

可避免 GitHub Pages 在子頁重新整理時 404。

Repository 根目錄已附 `.github/workflows/deploy-pages.yml`，建議在 GitHub Pages 選 **GitHub Actions** 作為部署來源，不要手動提交舊的 `dist/`。

## Build

在 workspace 根目錄：

```bash
pnpm install --frozen-lockfile
pnpm verify:core
pnpm --filter @workspace/social-impact-dashboard typecheck
pnpm --filter @workspace/social-impact-dashboard build
```

產物：

`artifacts/social-impact-dashboard/dist/public`

## PWA Cache

- HTML / dynamic JSON / API：network-first
- hashed JS / CSS：stale-while-revalidate / cache-first 類型策略
- Service Worker 更新時會使用新的 cache version，避免舊 Dashboard 長期蓋住新資料。

## 隱私

完整私訊原文只應留在本機 IndexedDB 或受保護後端；若要放 GitHub，請使用「公開安全資料」匯出。
