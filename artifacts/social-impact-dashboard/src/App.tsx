import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppRouterPage } from '@/pages/dashboard';
import { writeStoredData } from '@/lib/storage';
import type { WorkspaceData } from '@/lib/workspace-types';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } } });
const ONBOARDING_KEY = 'social-impact-onboarding-v1';

function useHashPath() {
  const read = () => window.location.hash.replace(/^#/, '').split('?')[0] || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    const listener = () => setPath(read());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  return path;
}

function Router() {
  const path = useHashPath();
  if (path === '/') return <AppRouterPage page="overview" />;
  if (path === '/campaigns') return <AppRouterPage page="campaigns" />;
  if (path.startsWith('/campaigns/')) return <AppRouterPage page="campaigns" campaignId={decodeURIComponent(path.slice('/campaigns/'.length))} />;
  if (path === '/content') return <AppRouterPage page="content" />;
  if (path === '/inquiries') return <AppRouterPage page="inquiries" />;
  if (path === '/platforms') return <AppRouterPage page="platforms" />;
  if (path === '/reports') return <AppRouterPage page="reports" />;
  if (path === '/data') return <AppRouterPage page="data" />;
  return <AppRouterPage page="settings" />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const path = typeof window === 'undefined' ? '/' : window.location.hash;
  return <ErrorBoundary resetKey={path}>{children}</ErrorBoundary>;
}

function emptyWorkspace(): WorkspaceData {
  return {
    generatedAt: new Date().toISOString(),
    isDemo: false,
    monthlyMetrics: [],
    contents: [],
    campaigns: [],
    interactions: [],
    platforms: [
      { platform: 'Facebook', followers: 0, growth: 0, views: 0, reach: 0, engagement: 0, posts: 0, reels: 0, stories: 0, messages: 0 },
      { platform: 'Instagram', followers: 0, growth: 0, views: 0, reach: 0, engagement: 0, posts: 0, reels: 0, stories: 0, messages: 0 },
      { platform: 'Threads', followers: 0, growth: 0, views: 0, reach: 0, engagement: 0, posts: 0, reels: 0, stories: 0, messages: 0 },
    ],
  };
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const begin = async (mode: 'demo' | 'hybrid' | 'manual') => {
    if (mode !== 'demo') await writeStoredData(emptyWorkspace());
    localStorage.setItem(ONBOARDING_KEY, mode);
    onDone();
    if (mode === 'hybrid') window.location.hash = '#/settings';
    else if (mode === 'manual') window.location.hash = '#/data';
  };
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/95 p-5 backdrop-blur-xl">
    <div className="mx-auto flex min-h-full max-w-4xl items-center justify-center py-8">
      <div className="w-full rounded-[28px] border border-border bg-card p-6 shadow-2xl sm:p-9">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-2xl">◡</div><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Welcome</p><h1 className="font-display text-[34px] leading-none sm:text-[44px]">社群效益分析</h1></div></div>
        <p className="mt-5 max-w-2xl text-[14px] leading-7 text-muted-foreground">把 Facebook、Instagram、Threads 的內容成效、活動歸因與民眾詢問整理成一套可以長期累積、年底也拿得出來的成果資料。</p>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          <button onClick={() => void begin('hybrid')} className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left transition hover:-translate-y-0.5 hover:border-primary"><span className="text-[11px] font-semibold text-primary">推薦</span><h2 className="mt-2 text-[16px] font-semibold">自動同步＋手動備援</h2><p className="mt-2 text-[12px] leading-5 text-muted-foreground">有後端就自動抓；API 權限不足或漏資料時，再用 CSV / XLSX / JSON 補。</p></button>
          <button onClick={() => void begin('manual')} className="rounded-2xl border border-border p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/50"><span className="text-[11px] font-semibold text-muted-foreground">不用 API</span><h2 className="mt-2 text-[16px] font-semibold">只使用手動匯入</h2><p className="mt-2 text-[12px] leading-5 text-muted-foreground">所有核心分析、活動覆核、快照、報告仍可在 GitHub Pages 完整使用。</p></button>
          <button onClick={() => void begin('demo')} className="rounded-2xl border border-border p-5 text-left transition hover:-translate-y-0.5 hover:border-accent"><span className="text-[11px] font-semibold text-accent">先逛逛</span><h2 className="mt-2 text-[16px] font-semibold">使用 DEMO 看看</h2><p className="mt-2 text-[12px] leading-5 text-muted-foreground">保留示範資料，先把每個頁面和流程摸熟，不會誤以為是假資料是正式成果。</p></button>
        </div>
        <p className="mt-5 text-[11px] leading-5 text-muted-foreground">之後仍可在「資料中心」清除本機資料，或在「設定」更換後端 URL。Meta Token / App Secret 不會存進這個前端。</p>
      </div>
    </div>
  </div>;
}

export default function App() {
  const [onboarded, setOnboarded] = useState(() => typeof window !== 'undefined' && Boolean(localStorage.getItem(ONBOARDING_KEY)));
  return <QueryClientProvider client={queryClient}><TooltipProvider><RoutedErrorBoundary>{!onboarded && <Onboarding onDone={() => setOnboarded(true)} />}<Router /></RoutedErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>;
}
