import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowUpRight, Check, Clock3, Copy, Download, FileJson, Lightbulb, MessageCircle, Plus,
  RefreshCw, Search, Settings2, Sparkles, Upload, Users, X,
} from 'lucide-react';
import {
  BarMeter, Card, ChartHeader, CsvButton, EmptyState, ExternalButton, formatCompact, formatDate,
  formatNumber, PageIntro, Pill, PrintButton, Shell, downloadJson,
} from '@/components/dashboard-ui';
import { demoData, demoStatus } from '@/lib/demo-data';
import {
  DATA_UPDATED_EVENT, clearWorkspace, mergeAndStoreIncoming, readSnapshots, readStoredData,
  updateWorkspace, writeStoredData,
} from '@/lib/storage';
import { asWorkspaceData, type Campaign, type ContentSnapshot, type DataSource, type Interaction, type SocialContent, type WorkspaceData } from '@/lib/workspace-types';
import { calculateCampaignMetrics, campaignTopics, contentsForCampaign, dataQuality, growthForContent, recommendationFromTopics } from '@/lib/analytics';
import { classifyInquiry, classifyInteractionCampaign, INQUIRY_TOPICS } from '@/lib/classifier';
import { detectImportKind, normalizeImportedContent, normalizeImportedInteraction, normalizeImportedMonthlyMetric, normalizeImportedPlatformMetric, normalizeMetaContentExport, parseMessengerConversationText, parseThreadsInsightsText, type ImportKind } from '@/lib/importer';
import { discoverCampaignsFromContents } from '@/lib/campaign-discovery';
import { fetchBackendDataset, fetchBackendStatus, getBackendUrl, requestBackendSync, setBackendUrl } from '@/lib/backend';

const COLORS = { teal: '#2b897a', coral: '#e17b62', blue: '#4b8aa9', gold: '#d5a64f', plum: '#8f789d' };
const platformColors: Record<string, string> = { Facebook: COLORS.blue, Instagram: COLORS.coral, Threads: COLORS.teal };
type SourceStatus = { source: string; label: string; status: 'healthy' | 'warning' | 'unavailable'; lastSynced: string; detail: string };
type DashboardStatus = { mode: 'manual' | 'automatic' | 'hybrid'; sources: SourceStatus[] };

function useSocialDataset() {
  const [data, setData] = useState<WorkspaceData>(() => asWorkspaceData(demoData));
  const [status, setStatus] = useState<DashboardStatus>(() => demoStatus as DashboardStatus);
  const [snapshots, setSnapshots] = useState<ContentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stored, history] = await Promise.all([readStoredData(), readSnapshots()]);
      setData(stored ?? asWorkspaceData(demoData));
      setSnapshots(history);
      if (getBackendUrl()) {
        try { setStatus(await fetchBackendStatus()); } catch { /* local mode remains usable */ }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const listener = () => void load();
    window.addEventListener(DATA_UPDATED_EVENT, listener);
    return () => window.removeEventListener(DATA_UPDATED_EVENT, listener);
  }, [load]);

  const syncNow = useCallback(async () => {
    if (!getBackendUrl()) throw new Error('尚未設定後端服務 URL；目前仍可使用手動匯入。');
    setSyncing(true); setSyncMessage('');
    try {
      const result = await requestBackendSync();
      const remote = await fetchBackendDataset();
      const merged = await mergeAndStoreIncoming(data, remote, 'backend');
      setSyncMessage(`${result.message}｜新增 ${merged.summary.added}、更新 ${merged.summary.updated}、快照 ${merged.summary.snapshotsAdded}`);
      await load();
      return result;
    } finally { setSyncing(false); }
  }, [data, load]);

  return { data, status, snapshots, loading, syncing, syncMessage, reload: load, syncNow };
}

function DataModePill({ isDemo }: { isDemo: boolean }) {
  return <Pill tone={isDemo ? 'warn' : 'good'}>{isDemo ? 'DEMO 示範資料' : '真實 / 匯入資料'}</Pill>;
}

function Kpi({ label, value, note, accent = 'text-primary' }: { label: string; value: string; note: string; accent?: string }) {
  return <Card className="relative overflow-hidden"><div className="absolute right-0 top-0 h-20 w-20 rounded-bl-[60px] bg-primary/5" /><div className="p-5"><p className="text-[12px] font-medium text-muted-foreground">{label}</p><p className={`mt-3 text-[30px] font-semibold tracking-[-.04em] ${accent}`}>{value}</p><p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><ArrowUpRight className="h-3.5 w-3.5 text-primary" />{note}</p></div></Card>;
}

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-border bg-card px-3 py-2 text-[11px] shadow-xl"><p className="mb-1.5 font-semibold">{label}</p>{payload.map((entry) => <div key={entry.name} className="flex items-center justify-between gap-5 text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />{entry.name}</span><strong className="text-foreground">{formatNumber(Number(entry.value))}</strong></div>)}</div>;
}

function byYear<T extends { publishedAt?: string; createdAt?: string }>(rows: T[], year: string) {
  return rows.filter((row) => String(row.publishedAt ?? row.createdAt ?? '').startsWith(year));
}

function monthlyFromContents(contents: SocialContent[], year: string) {
  const rows = Array.from({ length: 12 }, (_, index) => ({ month: `${index + 1}月`, views: 0, reach: 0, engagement: 0, messages: 0, followers: 0 }));
  for (const content of byYear(contents, year)) {
    const month = Math.max(0, Math.min(11, Number(content.publishedAt.slice(5, 7)) - 1));
    rows[month].views += content.views;
    rows[month].reach += content.reach;
    rows[month].engagement += content.engagement;
    rows[month].messages += content.messages;
  }
  return rows;
}

function Overview() {
  const { data, status, snapshots, loading, syncing, syncMessage, syncNow, reload } = useSocialDataset();
  const years = useMemo(() => {
    const found = new Set(data.contents.map((item) => item.publishedAt.slice(0, 4)).filter(Boolean));
    if (!found.size) found.add(String(new Date().getFullYear()));
    return [...found].sort().reverse();
  }, [data.contents]);
  const [year, setYear] = useState(years[0] ?? '2026');
  useEffect(() => { if (!years.includes(year)) setYear(years[0] ?? year); }, [years, year]);
  const yearContents = useMemo(() => byYear(data.contents, year).filter((x) => x.reviewStatus !== 'excluded'), [data.contents, year]);
  const monthly = data.isDemo && year === '2024' ? data.monthlyMetrics : monthlyFromContents(data.contents, year);
  const totals = useMemo(() => ({
    views: yearContents.reduce((s, x) => s + x.views, 0) || monthly.reduce((s, x) => s + x.views, 0),
    reach: yearContents.reduce((s, x) => s + x.reach, 0) || monthly.reduce((s, x) => s + x.reach, 0),
    engagement: yearContents.reduce((s, x) => s + x.engagement, 0) || monthly.reduce((s, x) => s + x.engagement, 0),
    messages: yearContents.reduce((s, x) => s + x.messages, 0) || monthly.reduce((s, x) => s + x.messages, 0),
  }), [yearContents, monthly]);
  const campaigns = useMemo(() => data.campaigns.map((campaign) => ({ campaign, metrics: calculateCampaignMetrics(data, campaign) })).sort((a, b) => b.metrics.reach - a.metrics.reach), [data]);
  const fastGrowth = useMemo(() => yearContents.map((content) => ({ content, growth: growthForContent(content, snapshots, 24) })).sort((a, b) => b.growth.absolute - a.growth.absolute).slice(0, 5), [yearContents, snapshots]);
  const platformRows = ['Facebook', 'Instagram', 'Threads'].map((platform) => ({ platform, reach: yearContents.filter((x) => x.platform === platform).reduce((s, x) => s + x.reach, 0), engagement: yearContents.filter((x) => x.platform === platform).reduce((s, x) => s + x.engagement, 0) }));
  const quality = dataQuality(data);

  const doSync = async () => { try { await syncNow(); } catch (error) { window.alert(error instanceof Error ? error.message : '同步失敗'); } };
  return <Shell title="年度總覽">
    <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div><div className="flex items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">{year} 年度回顧</p><DataModePill isDemo={data.isDemo} /></div><h2 className="mt-2 font-display text-[40px] leading-none tracking-[-.035em] sm:text-[52px]">今天的社群，<span className="text-primary">也有好好留下痕跡。</span></h2><p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">把 Facebook、Instagram 與 Threads 的內容、互動、民眾詢問與活動成果放在同一個脈絡裡，月底不用再從零拼報表。</p><div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" />資料生成於 {new Date(data.generatedAt).toLocaleString('zh-TW')} · {status.mode === 'hybrid' ? '雙軌模式' : status.mode}</div></div>
      <div className="flex flex-wrap items-center gap-2 print-hidden"><button type="button" onClick={() => void reload()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold hover:bg-secondary"><RefreshCw className="h-3.5 w-3.5" />重讀本機資料</button><PrintButton /><button type="button" onClick={() => void doSync()} disabled={syncing} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />向平台同步</button><select value={year} onChange={(e) => setYear(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold">{years.map((item) => <option key={item}>{item}</option>)}</select></div>
    </div>
    {syncMessage && <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-[11px] text-primary">{syncMessage}</div>}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{loading ? [1,2,3,4].map((x) => <div key={x} className="h-[142px] animate-pulse rounded-2xl bg-secondary" />) : <><Kpi label="內容觀看 / 曝光" value={formatCompact(totals.views)} note={`${yearContents.length} 則有效內容`} /><Kpi label="觸及人次" value={formatCompact(totals.reach)} note="跨三平台合計" /><Kpi label="有效互動" value={formatCompact(totals.engagement)} note="按讚、留言、分享等" /><Kpi label="私訊 / 詢問" value={formatNumber(totals.messages)} note="與 conversation count 分開保存" accent="text-accent" /></>}</div>
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
      <Card className="min-h-[390px]"><ChartHeader title="社群觸及與互動趨勢" eyebrow="全年節奏" rows={monthly.map((r) => ({ 月份:r.month, 觸及:r.reach, 互動:r.engagement, 私訊:r.messages }))} filename={`${year}-monthly.csv`} /><div className="h-[315px] px-3 pb-4 pt-4 sm:px-5"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthly} margin={{ top:10,right:8,left:-18,bottom:0 }}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="month" tick={{fontSize:11}} tickLine={false} axisLine={false}/><YAxis tick={{fontSize:11}} tickFormatter={formatCompact} tickLine={false} axisLine={false}/><Tooltip content={<TooltipBox/>}/><Legend wrapperStyle={{fontSize:11,paddingTop:12}}/><Line type="monotone" dataKey="reach" name="觸及" stroke={COLORS.teal} strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="engagement" name="互動" stroke={COLORS.coral} strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="messages" name="私訊" stroke={COLORS.gold} strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></Card>
      <Card><ChartHeader title="平台貢獻" eyebrow="依實際內容加總" rows={platformRows.map((x) => ({平台:x.platform,觸及:x.reach,互動:x.engagement}))} filename={`${year}-platform.csv`} /><div className="flex h-[315px] flex-col justify-center gap-5 px-5 pb-5 pt-3"><div className="relative mx-auto h-[180px] w-full max-w-[250px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={platformRows} dataKey="reach" nameKey="platform" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">{platformRows.map((entry) => <Cell key={entry.platform} fill={platformColors[entry.platform]} />)}</Pie><Tooltip content={<TooltipBox/>}/></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-display text-[29px]">{formatCompact(totals.reach)}</span><span className="text-[10px] text-muted-foreground">總觸及</span></div></div><div className="grid grid-cols-3 gap-2">{platformRows.map((p) => <div key={p.platform} className="text-center"><div className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold"><span className="h-2 w-2 rounded-full" style={{backgroundColor:platformColors[p.platform]}}/>{p.platform}</div><p className="font-mono-ui text-[12px]">{formatCompact(p.reach)}</p></div>)}</div></div></Card>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Card><ChartHeader title="活動表現" eyebrow="由內容即時計算" rows={campaigns.map((x) => ({活動:x.campaign.name,觸及:x.metrics.reach,互動:x.metrics.engagement}))} filename={`${year}-campaigns.csv`} /><div className="divide-y divide-border px-5 pb-2 pt-3">{campaigns.map((x,index) => <div key={x.campaign.id} className="flex items-center gap-4 py-3"><span className="font-mono-ui text-[11px] text-muted-foreground">{String(index+1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-[13px] font-semibold">{x.campaign.name}</p><span className="font-mono-ui text-[12px]">{formatCompact(x.metrics.reach)}</span></div><div className="mt-2"><BarMeter value={x.metrics.reach} max={campaigns[0]?.metrics.reach || 1}/></div></div><Pill tone={index===0?'good':'neutral'}>{x.metrics.contentCount} 則</Pill></div>)}</div></Card>
      <Card><ChartHeader title="資料品質訊號" eyebrow="不是寫死的百分比" rows={[{項目:'欄位完整度',值:quality.completeness},{項目:'活動歸屬信心',值:quality.confidence}]} filename="data-quality.csv" /><div className="space-y-4 px-5 pb-5 pt-4"><div><div className="mb-2 flex justify-between text-[12px]"><span>欄位完整度</span><b>{quality.completeness.toFixed(1)}%</b></div><BarMeter value={quality.completeness} max={100}/></div><div><div className="mb-2 flex justify-between text-[12px]"><span>活動歸屬信心</span><b>{quality.confidence.toFixed(1)}%</b></div><BarMeter value={quality.confidence} max={100} color="bg-accent"/></div><div className="grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-xl bg-secondary/45 p-3">待覆核 <b className="float-right">{quality.pending}</b></div><div className="rounded-xl bg-secondary/45 p-3">未歸類 <b className="float-right">{quality.unassigned}</b></div><div className="rounded-xl bg-secondary/45 p-3">重複疑慮 <b className="float-right">{quality.duplicates}</b></div><div className="rounded-xl bg-secondary/45 p-3">缺 URL <b className="float-right">{quality.missingUrl}</b></div></div></div></Card>
    </div>
    <Card className="mt-4"><ChartHeader title="最近快速成長內容" eyebrow="24 小時快照" rows={fastGrowth.map((x) => ({標題:x.content.title,平台:x.content.platform,目前:x.content.views,成長:x.growth.absolute}))} filename="fast-growth.csv" /><div className="divide-y divide-border px-5 pb-2 pt-2">{fastGrowth.length ? fastGrowth.map(({content,growth}) => <div key={content.id} className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{content.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{content.platform} · 目前 {formatCompact(content.views)}</p></div><Pill tone={growth.absolute>0?'good':'neutral'}>{growth.absolute>=0?'+':''}{formatCompact(growth.absolute)} · {growth.percent.toFixed(1)}%</Pill></div>) : <EmptyState title="還沒有歷史快照" body="同一篇內容下一次同步或匯入數字改變後，就會開始形成成長曲線。"/>}</div></Card>
  </Shell>;
}

function CampaignDetail({ campaign }: { campaign: Campaign }) {
  const { data } = useSocialDataset();
  const metrics = calculateCampaignMetrics(data, campaign);
  const themes = campaignTopics(metrics.interactions);
  const recommendation = recommendationFromTopics(metrics.interactions);
  const maxContribution = Math.max(1, ...Object.values(metrics.platforms).map((x) => x.reach));
  return <Shell title={campaign.name} section="活動分析"><PageIntro kicker="Campaign analysis" title={campaign.name} description={campaign.summary ?? '尚未補充活動摘要。'}><div className="flex gap-2 print-hidden"><PrintButton /></div></PageIntro><div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"><Pill tone="good">動態計算</Pill>{campaign.autoGenerated&&<Pill tone="warn">系統自動建立 · 請確認日期/關鍵字</Pill>}<span>{formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}</span><span className="text-border">·</span><span>{metrics.contentCount} 則有效內容</span></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="活動觸及" value={formatCompact(metrics.reach)} note="由活動內容實際加總"/><Kpi label="內容觀看" value={formatCompact(metrics.views)} note="跨平台合計"/><Kpi label="有效互動" value={formatCompact(metrics.engagement)} note={`互動率 ${metrics.engagementRate.toFixed(1)}%`}/><Kpi label="民眾對話" value={formatNumber(metrics.conversationCount || metrics.messages)} note={`訊息 ${formatNumber(metrics.messageCount || metrics.messages)} 則`} accent="text-accent"/></div>
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card><ChartHeader title="平台貢獻" eyebrow="Contribution" rows={Object.entries(metrics.platforms).map(([platform,m]) => ({平台:platform,觸及:m.reach,內容:m.contentCount}))} filename={`${campaign.id}-platform.csv`}/><div className="space-y-5 px-5 pb-6 pt-5">{Object.entries(metrics.platforms).map(([platform,m],index) => <div key={platform}><div className="mb-2 flex justify-between text-[12px]"><span className="font-semibold">{platform}</span><span className="font-mono-ui text-muted-foreground">{formatCompact(m.reach)} · {metrics.reach?Math.round(m.reach/metrics.reach*100):0}% · {m.contentCount} 則</span></div><BarMeter value={m.reach} max={maxContribution} color={index===0?'bg-primary':index===1?'bg-accent':'bg-[hsl(201_45%_44%)]'}/></div>)}</div></Card><Card><ChartHeader title="問題主題" eyebrow="Questions people asked" rows={themes.map(([topic,count]) => ({主題:topic,提問數:count}))} filename={`${campaign.id}-questions.csv`}/><div className="space-y-3 px-5 pb-5 pt-4">{themes.length ? themes.map(([topic,count],index) => <div key={topic} className="flex items-center gap-3"><span className="font-mono-ui text-[11px] text-muted-foreground">{String(index+1).padStart(2,'0')}</span><span className="flex-1 text-[12px]">{topic}</span><b className="font-mono-ui text-[12px]">{count}</b></div>) : <EmptyState title="還沒有歸類提問" body="匯入或同步留言 / 私訊後，這裡會形成問題主題。"/>}</div></Card></div>
    <Card className="mt-4"><ChartHeader title="活動宣傳內容" eyebrow="逐篇內容" rows={metrics.contents.map((x) => ({標題:x.title,平台:x.platform,觸及:x.reach,互動:x.engagement}))} filename={`${campaign.id}-contents.csv`}/><div className="divide-y divide-border px-5 pb-2 pt-2">{metrics.contents.length ? [...metrics.contents].sort((a,b)=>b.reach-a.reach).slice(0,10).map((content,index) => <div key={content.id} className="flex items-center gap-3 py-4"><span className="w-5 font-mono-ui text-[11px] text-muted-foreground">{String(index+1).padStart(2,'0')}</span><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{content.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{content.platform} · {formatDate(content.publishedAt)} · {formatCompact(content.reach)} 觸及</p></div><span className="font-mono-ui text-[12px]">{formatCompact(content.engagement)} 互動</span></div>) : <EmptyState title="活動尚未有內容" body="把內容接受、改派到這個活動後，就會出現在這裡。"/>}</div></Card>
    <Card className="mt-4 overflow-hidden"><div className="flex flex-col gap-4 bg-[hsl(var(--primary)/.08)] p-5 sm:flex-row sm:items-start"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5"/></div><div className="flex-1"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Rule-based improvement note</p><h3 className="mt-1 text-[17px] font-semibold">{recommendation.title}</h3><p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted-foreground">{recommendation.body}</p><p className="mt-2 text-[11px] font-semibold text-primary">判斷依據：{recommendation.evidence}</p></div><button type="button" onClick={() => downloadJson(`${campaign.id}-recommendation.json`, recommendation)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-card px-3 text-[11px] font-semibold text-primary"><FileJson className="h-3.5 w-3.5"/>保存建議</button></div></Card>
  </Shell>;
}

function Campaigns() {
  const { data } = useSocialDataset();
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (selected) return <CampaignDetail campaign={data.campaigns.find((x)=>x.id===selected.id) ?? selected}/>;
  const campaigns = data.campaigns.filter((item) => !item.archived && item.name.includes(query));
  const saveNew = async (campaign: Campaign) => { await updateWorkspace((current) => ({ ...current, isDemo:false, campaigns:[campaign,...current.campaigns] }), data); setCreateOpen(false); };
  return <Shell title="活動分析"><PageIntro kicker="Campaigns" title="活動，是社群效益的脈絡。" description="跨平台內容會先由規則分類器提出建議，再由你接受、改派或排除；人工決定永遠優先於下一次同步。"><button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground"><Plus className="h-4 w-4"/>新增活動</button></PageIntro><div className="mb-4 flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"><div className="relative w-full max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="搜尋活動名稱" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px]"/></div><span className="text-[11px] text-muted-foreground">{campaigns.length} 個活動</span></div><div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{campaigns.map((campaign,index) => { const m=calculateCampaignMetrics(data,campaign); return <button type="button" key={campaign.id} onClick={() => setSelected(campaign)} className="group text-left"><Card className="h-full transition duration-300 group-hover:-translate-y-0.5 group-hover:border-primary/40"><div className="p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${index===0?'bg-primary':index===1?'bg-accent':'bg-[hsl(201_45%_44%)]'}`}/><h3 className="text-[16px] font-semibold">{campaign.name}</h3>{campaign.autoGenerated&&<Pill tone="warn">系統候選 · 待確認</Pill>}</div><p className="mt-2 text-[12px] leading-5 text-muted-foreground">{campaign.summary}</p></div></div><div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4"><div><p className="text-[10px] text-muted-foreground">內容</p><p className="mt-1 font-mono-ui text-[14px]">{m.contentCount}</p></div><div><p className="text-[10px] text-muted-foreground">觸及</p><p className="mt-1 font-mono-ui text-[14px]">{formatCompact(m.reach)}</p></div><div><p className="text-[10px] text-muted-foreground">對話</p><p className="mt-1 font-mono-ui text-[14px] text-accent">{formatNumber(m.conversationCount||m.messages)}</p></div></div><div className="mt-4 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{formatDate(campaign.startDate)} — {formatDate(campaign.endDate)}</span><span className="text-[11px] font-semibold text-primary opacity-0 transition group-hover:opacity-100">開啟分析 →</span></div></div></Card></button>; })}</div>{createOpen && <CreateCampaignDialog onClose={()=>setCreateOpen(false)} onCreate={(campaign)=>void saveNew(campaign)}/>}</Shell>;
}

function CreateCampaignDialog({ onClose, onCreate }: { onClose:()=>void; onCreate:(campaign:Campaign)=>void }) {
  const [name,setName]=useState(''); const [summary,setSummary]=useState(''); const [start,setStart]=useState(new Date().toISOString().slice(0,10)); const [end,setEnd]=useState(new Date().toISOString().slice(0,10)); const [promoStart,setPromoStart]=useState(''); const [promoEnd,setPromoEnd]=useState(''); const [keywords,setKeywords]=useState(''); const [hashtags,setHashtags]=useState(''); const [aliases,setAliases]=useState('');
  const split=(v:string)=>v.split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
  const submit=()=>onCreate({id:`cp-local-${Date.now()}`,name:name.trim(),summary:summary.trim()||'尚未補充活動摘要。',startDate:start,endDate:end,promotionStartDate:promoStart||start,promotionEndDate:promoEnd||end,keywords:split(keywords),hashtags:split(hashtags),aliases:split(aliases),landingUrls:[],contentCount:0,views:0,reach:0,engagement:0,messages:0,topQuestion:'尚無提問'});
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">New campaign</p><h2 className="mt-1 font-display text-[27px]">新增活動脈絡</h2></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-secondary"><X className="h-4 w-4"/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-[12px] font-semibold sm:col-span-2">活動名稱<input value={name} onChange={e=>setName(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold">活動開始<input type="date" value={start} onChange={e=>setStart(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold">活動結束<input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold">宣傳起日<input type="date" value={promoStart} onChange={e=>setPromoStart(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold">宣傳迄日<input type="date" value={promoEnd} onChange={e=>setPromoEnd(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold sm:col-span-2">一句話說明<textarea value={summary} onChange={e=>setSummary(e.target.value)} className="mt-2 min-h-[76px] w-full rounded-lg border border-border bg-background px-3 py-2"/></label><label className="text-[12px] font-semibold">關鍵字<input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="造筏, 大港橋" className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold">Hashtags<input value={hashtags} onChange={e=>setHashtags(e.target.value)} placeholder="#創意造筏" className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label><label className="text-[12px] font-semibold sm:col-span-2">別名 / 常見寫法<input value={aliases} onChange={e=>setAliases(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"/></label></div><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-lg px-3 text-[12px] font-semibold text-muted-foreground hover:bg-secondary">取消</button><button disabled={!name.trim()} onClick={submit} className="h-9 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-40">建立活動</button></div></div></div>;
}

function ContentLibrary() {
  const { data }=useSocialDataset(); const [query,setQuery]=useState(''); const [platform,setPlatform]=useState('全部平台'); const [status,setStatus]=useState('全部狀態'); const [type,setType]=useState('全部類型'); const [campaign,setCampaign]=useState('全部活動'); const [selected,setSelected]=useState<SocialContent|null>(null);
  const rows=data.contents.filter(content => (platform==='全部平台'||content.platform===platform)&&(status==='全部狀態'||content.reviewStatus===status)&&(type==='全部類型'||content.type===type)&&(campaign==='全部活動'||(content.manualCampaignId||content.campaignId||content.suggestedCampaignId)===campaign)&&`${content.title} ${content.caption??''} ${content.campaignName} ${content.id} ${content.url}`.toLowerCase().includes(query.toLowerCase()));
  if(selected){ const live=data.contents.find(x=>x.id===selected.id)??selected; return <ContentDetail content={live} onClose={()=>setSelected(null)}/>; }
  return <Shell title="內容資料庫"><PageIntro kicker="Content library" title="逐篇內容，這次真的會進來。" description="API 與 CSV / XLSX / JSON 最後都進同一個 merge pipeline；同一篇只更新數字，不會每天長出一份分身。"><div className="flex gap-2"><CsvButton rows={rows.map(x=>({標題:x.title,平台:x.platform,類型:x.type,發布:x.publishedAt,觀看:x.views,觸及:x.reach,互動:x.engagement,狀態:x.reviewStatus}))} filename="content-library.csv"/><button onClick={()=>downloadJson('content-library.json',rows)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold"><FileJson className="h-4 w-4"/>JSON</button></div></PageIntro><Card><div className="flex flex-col gap-3 border-b border-border p-4 xl:flex-row xl:items-center"><div className="relative w-full xl:max-w-[330px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋文案、活動、ID、網址" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px]"/></div><select value={platform} onChange={e=>setPlatform(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-[12px]"><option>全部平台</option><option>Facebook</option><option>Instagram</option><option>Threads</option></select><select value={type} onChange={e=>setType(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-[12px]"><option>全部類型</option><option>Post</option><option>Reel</option><option>Story</option><option>Threads Post</option></select><select value={status} onChange={e=>setStatus(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-[12px]"><option>全部狀態</option><option value="suggested">待覆核</option><option value="accepted">已接受</option><option value="reassigned">已改派</option><option value="excluded">已排除</option></select><select value={campaign} onChange={e=>setCampaign(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-[12px]"><option>全部活動</option>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><span className="ml-auto text-[11px] text-muted-foreground">{rows.length} / {data.contents.length} 則</span></div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{rows.map(content=><button type="button" key={content.id} onClick={()=>setSelected(content)} className="rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:bg-secondary/20"><div className="flex items-center justify-between gap-2"><Pill tone={content.reviewStatus==='suggested'?'warn':content.reviewStatus==='excluded'?'coral':'good'}>{content.reviewStatus==='suggested'?'待覆核':content.reviewStatus==='accepted'?'已接受':content.reviewStatus==='reassigned'?'已改派':'已排除'}</Pill><span className="text-[10px] text-muted-foreground">{content.platform} · {content.type}</span></div><p className="mt-3 line-clamp-2 text-[13px] font-semibold leading-5">{content.title}</p><p className="mt-2 text-[10px] text-muted-foreground">{content.campaignName} · {formatDate(content.publishedAt)}</p><div className="mt-4 grid grid-cols-3 gap-2 text-[10px]"><div><span className="text-muted-foreground">觀看</span><b className="mt-1 block text-[12px]">{formatCompact(content.views)}</b></div><div><span className="text-muted-foreground">觸及</span><b className="mt-1 block text-[12px]">{formatCompact(content.reach)}</b></div><div><span className="text-muted-foreground">互動</span><b className="mt-1 block text-[12px]">{formatCompact(content.engagement)}</b></div></div></button>)}</div></Card></Shell>;
}

function ContentDetail({content,onClose}:{content:SocialContent;onClose:()=>void}) {
  const {data}=useSocialDataset(); const [snapshots,setSnapshots]=useState<ContentSnapshot[]>([]); const [campaignId,setCampaignId]=useState(content.manualCampaignId||content.campaignId||content.suggestedCampaignId||'unassigned');
  useEffect(()=>{ void readSnapshots(content.id).then(setSnapshots); },[content.id]);
  const saveReview=async(status:'accepted'|'reassigned'|'excluded')=>{ await updateWorkspace(current=>({...current,contents:current.contents.map(item=>item.id===content.id?{...item,manualCampaignId:status==='excluded'?item.manualCampaignId:campaignId,reviewStatus:status,reviewedAt:new Date().toISOString(),reviewSource:'manual',campaignId:status==='excluded'?item.campaignId:campaignId,campaignName:current.campaigns.find(c=>c.id===campaignId)?.name??item.campaignName}:item)}),data); };
  const chart=snapshots.map(s=>({time:new Date(s.capturedAt).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit'}),views:s.views,reach:s.reach,engagement:s.engagement})); const g24=growthForContent(content,snapshots,24); const g168=growthForContent(content,snapshots,168);
  return <Shell title="內容詳情" section="內容資料庫"><button onClick={onClose} className="mb-4 text-[12px] font-semibold text-primary">← 返回內容資料庫</button><PageIntro kicker={`${content.platform} · ${content.type}`} title={content.title} description={`${content.campaignName} · ${content.publishedAt}`}><ExternalButton href={content.permalink||content.url||'#'}/></PageIntro><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="目前觀看" value={formatCompact(content.views)} note={`24h ${g24.absolute>=0?'+':''}${formatCompact(g24.absolute)} / ${g24.percent.toFixed(1)}%`}/><Kpi label="觸及" value={formatCompact(content.reach)} note="目前最新值"/><Kpi label="互動" value={formatCompact(content.engagement)} note={`7 日觀看成長 ${g168.percent.toFixed(1)}%`}/><Kpi label="分享 / 收藏" value={`${formatNumber(content.shares)} / ${formatNumber(content.saves)}`} note={`點擊 ${formatNumber(content.clicks)}`}/></div><div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.7fr]"><Card><ChartHeader title="歷史成長快照" eyebrow="Snapshot history" rows={chart} filename={`${content.id}-snapshots.csv`}/><div className="h-[300px] p-4">{chart.length>1?<ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="time" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} tickFormatter={formatCompact}/><Tooltip content={<TooltipBox/>}/><Area type="monotone" dataKey="views" name="觀看" stroke={COLORS.blue} fill={COLORS.blue} fillOpacity={.12}/><Area type="monotone" dataKey="reach" name="觸及" stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={.08}/></AreaChart></ResponsiveContainer>:<EmptyState title="等待下一次快照" body="下一次同步或重新匯入同一篇內容，而且數字有變化時，就會形成歷史曲線。"/>}</div></Card><Card><div className="p-5"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-primary">Attribution review</p><h2 className="mt-1 text-[16px] font-semibold">活動歸屬覆核</h2><div className="mt-4 rounded-xl bg-secondary/45 p-3 text-[11px] leading-5 text-muted-foreground"><b className="text-foreground">系統建議理由</b><br/>{content.classificationReasons?.length?content.classificationReasons.join('、'):'舊資料尚未重新跑分類器'}<br/>信心：{content.confidence} · 分數 {content.classificationScore??'—'}</div><label className="mt-4 block text-[12px] font-semibold">指定活動<select value={campaignId} onChange={e=>setCampaignId(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3"><option value="unassigned">尚未歸類</option>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="mt-4 grid grid-cols-3 gap-2"><button onClick={()=>void saveReview('accepted')} className="h-9 rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">接受</button><button onClick={()=>void saveReview('reassigned')} className="h-9 rounded-lg bg-accent/15 text-[11px] font-semibold text-accent">改派</button><button onClick={()=>void saveReview('excluded')} className="h-9 rounded-lg bg-destructive/10 text-[11px] font-semibold text-destructive">排除</button></div><p className="mt-3 text-[10px] leading-5 text-muted-foreground">人工覆核會寫入 IndexedDB；之後 API / CSV 更新 metrics 時不會把這個決定洗掉。</p></div></Card></div></Shell>;
}

function Inquiries() {
  const {data}=useSocialDataset(); const [query,setQuery]=useState(''); const [campaign,setCampaign]=useState('全部活動'); const [selected,setSelected]=useState<Interaction|null>(null);
  const rows=data.interactions.filter(item=>!item.excluded&&(campaign==='全部活動'||(item.manualCampaignId||item.campaignId)===campaign)&&`${item.text} ${item.manualTopic||item.topic}`.includes(query)); const topics=campaignTopics(rows); const conv=rows.reduce((s,x)=>s+Number(x.conversationCount??1),0); const msgs=rows.reduce((s,x)=>s+Number(x.messageCount??1),0);
  const saveInteraction=async(item:Interaction,topic:string, campaignId:string, excluded=false)=>{ await updateWorkspace(current=>({...current,interactions:current.interactions.map(x=>x.id===item.id?{...x,manualTopic:topic,topic,manualCampaignId:campaignId,campaignId,reviewStatus:excluded?'excluded':'reassigned',excluded,reviewedAt:new Date().toISOString()}:x)}),data); setSelected(null); };
  return <Shell title="公眾提問"><PageIntro kicker="Inquiries" title="大家一直問的，就是下一次要先說的。" description="區分 conversation_count 與 message_count；同一個人連續傳十則訊息，不會被當成十個人。"/><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="有效對話" value={formatNumber(conv)} note="conversation count"/><Kpi label="訊息則數" value={formatNumber(msgs)} note="message count"/><Kpi label="問題主題" value={formatNumber(topics.length)} note="可人工改分類"/><Kpi label="待覆核" value={formatNumber(rows.filter(x=>x.confidence==='low').length)} note="低信心優先處理" accent="text-accent"/></div><div className="mt-4 grid gap-4 lg:grid-cols-[.8fr_1.2fr]"><Card><ChartHeader title="熱門詢問主題" eyebrow="Conversation topics" rows={topics.map(([topic,count])=>({主題:topic,對話數:count}))} filename="inquiry-topics.csv"/><div className="space-y-3 px-5 pb-5 pt-4">{topics.map(([topic,count])=><div key={topic} className="flex items-center gap-3"><span className="flex-1 text-[12px]">{topic}</span><BarMeter value={count} max={topics[0]?.[1]||1}/><b className="w-8 text-right text-[12px]">{count}</b></div>)}</div></Card><Card><div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋民眾問題" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px]"/></div><select value={campaign} onChange={e=>setCampaign(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-[12px]"><option>全部活動</option>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="divide-y divide-border px-5">{rows.map(item=><button key={item.id} onClick={()=>setSelected(item)} className="w-full py-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold">{item.manualTopic||item.topic}</p><p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted-foreground">{item.text}</p></div><Pill tone={item.confidence==='low'?'warn':'good'}>{item.confidence}</Pill></div><p className="mt-2 text-[10px] text-muted-foreground">{item.source} · {item.createdAt} · 對話 {item.conversationCount??1} / 訊息 {item.messageCount??1}</p></button>)}</div></Card></div>{selected&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"><div className="w-full max-w-md rounded-2xl bg-card p-6"><div className="flex justify-between"><h2 className="text-[17px] font-semibold">人工校正詢問</h2><button onClick={()=>setSelected(null)}><X className="h-4 w-4"/></button></div><p className="mt-4 rounded-xl bg-secondary/45 p-3 text-[12px] leading-6">{selected.text}</p><InteractionEditor item={selected} campaigns={data.campaigns} onSave={saveInteraction}/></div></div>}</Shell>;
}

function InteractionEditor({item,campaigns,onSave}:{item:Interaction;campaigns:Campaign[];onSave:(item:Interaction,topic:string,campaignId:string,excluded?:boolean)=>void}) {
  const suggested=classifyInquiry(item.text); const [topic,setTopic]=useState(item.manualTopic||item.topic||suggested.topic); const [campaign,setCampaign]=useState(item.manualCampaignId ?? item.campaignId ?? '');
  return <div className="mt-4 space-y-3"><label className="block text-[12px] font-semibold">問題主題<select value={topic} onChange={e=>setTopic(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3">{INQUIRY_TOPICS.map(t=><option key={t}>{t}</option>)}</select></label><label className="block text-[12px] font-semibold">活動<select value={campaign} onChange={e=>setCampaign(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3">{campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p className="text-[10px] text-muted-foreground">規則分類器建議：{suggested.topic}</p><div className="flex gap-2"><button onClick={()=>onSave(item,topic,campaign)} className="h-9 flex-1 rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">儲存校正</button><button onClick={()=>onSave(item,topic,campaign,true)} className="h-9 rounded-lg bg-destructive/10 px-3 text-[11px] font-semibold text-destructive">排除</button></div></div>;
}

function Platforms() {
  const {data}=useSocialDataset(); const rows=['Facebook','Instagram','Threads'].map(platform=>{const contents=data.contents.filter(x=>x.platform===platform&&x.reviewStatus!=='excluded'); const original=data.platforms.find(x=>x.platform===platform); return {platform,followers:original?.followers??0,growth:original?.growth??0,views:contents.reduce((s,x)=>s+x.views,0)||original?.views||0,reach:contents.reduce((s,x)=>s+x.reach,0)||original?.reach||0,engagement:contents.reduce((s,x)=>s+x.engagement,0)||original?.engagement||0,posts:contents.filter(x=>x.type==='Post'||x.type==='Threads Post').length,reels:contents.filter(x=>x.type==='Reel').length,stories:contents.filter(x=>x.type==='Story').length,messages:contents.reduce((s,x)=>s+x.messages,0)||original?.messages||0};});
  return <Shell title="平台比較"><PageIntro kicker="Platforms" title="三個平台，各自擅長什麼？" description="平台數字優先由逐篇內容加總；若尚未匯入逐篇明細，才使用平台彙總資料。"/><div className="grid gap-4 lg:grid-cols-3">{rows.map(row=><Card key={row.platform}><div className="p-5"><div className="flex items-center justify-between"><h2 className="text-[17px] font-semibold">{row.platform}</h2><span className="h-3 w-3 rounded-full" style={{backgroundColor:platformColors[row.platform]}}/></div><p className="mt-5 font-display text-[36px]">{formatCompact(row.reach)}</p><p className="text-[11px] text-muted-foreground">觸及</p><div className="mt-5 grid grid-cols-2 gap-3 text-[11px]"><div className="rounded-xl bg-secondary/45 p-3">觀看<b className="mt-1 block text-[14px]">{formatCompact(row.views)}</b></div><div className="rounded-xl bg-secondary/45 p-3">互動<b className="mt-1 block text-[14px]">{formatCompact(row.engagement)}</b></div><div className="rounded-xl bg-secondary/45 p-3">貼文 / Threads<b className="mt-1 block text-[14px]">{row.posts}</b></div><div className="rounded-xl bg-secondary/45 p-3">Reels / Story<b className="mt-1 block text-[14px]">{row.reels} / {row.stories}</b></div></div></div></Card>)}</div><Card className="mt-4"><ChartHeader title="平台觸及與互動" eyebrow="Comparison" rows={rows.map(x=>({平台:x.platform,觸及:x.reach,互動:x.engagement}))} filename="platform-comparison.csv"/><div className="h-[330px] p-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="platform"/><YAxis tickFormatter={formatCompact}/><Tooltip content={<TooltipBox/>}/><Legend/><Bar dataKey="reach" name="觸及" fill={COLORS.teal} radius={[5,5,0,0]}/><Bar dataKey="engagement" name="互動" fill={COLORS.coral} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></Card></Shell>;
}

function Reports() {
  const { data } = useSocialDataset();
  const years = [...new Set([...data.contents.map((x) => x.publishedAt.slice(0, 4)), ...data.interactions.map((x) => x.createdAt.slice(0, 4))].filter(Boolean))].sort().reverse();
  const [year, setYear] = useState(years[0] ?? String(new Date().getFullYear()));
  const [period, setPeriod] = useState<'year' | 'quarter' | 'month' | 'custom'>('year');
  const [quarter, setQuarter] = useState('1');
  const [month, setMonth] = useState('01');
  const [customStart, setCustomStart] = useState(`${year}-01-01`);
  const [customEnd, setCustomEnd] = useState(`${year}-12-31`);
  const [campaignId, setCampaignId] = useState('all');

  const dateInScope = (raw: string) => {
    const date = raw.slice(0, 10);
    if (!date) return false;
    if (period === 'year') return date.startsWith(year);
    if (period === 'month') return date.startsWith(`${year}-${month}`);
    if (period === 'quarter') {
      const m = Number(date.slice(5, 7));
      return date.startsWith(year) && Math.ceil(m / 3) === Number(quarter);
    }
    return date >= customStart && date <= customEnd;
  };

  const scopedContents = data.contents.filter((x) => x.reviewStatus !== 'excluded' && dateInScope(x.publishedAt));
  const scopedInteractions = data.interactions.filter((x) => !x.excluded && dateInScope(x.createdAt));
  const scopedData: WorkspaceData = { ...data, contents: scopedContents, interactions: scopedInteractions };
  const campaign = campaignId === 'all' ? null : data.campaigns.find((x) => x.id === campaignId) ?? null;
  const m = campaign ? calculateCampaignMetrics(scopedData, campaign) : null;
  const contents = m?.contents ?? scopedContents;
  const interactions = m?.interactions ?? scopedInteractions;
  const reach = m?.reach ?? contents.reduce((s, x) => s + x.reach, 0);
  const views = m?.views ?? contents.reduce((s, x) => s + x.views, 0);
  const eng = m?.engagement ?? contents.reduce((s, x) => s + x.engagement, 0);
  const messages = m?.messages ?? contents.reduce((s, x) => s + x.messages, 0);
  const conversationCount = m?.conversationCount ?? interactions.reduce((s, x) => s + Number(x.conversationCount ?? 1), 0);
  const topics = campaignTopics(interactions);
  const topContent = [...contents].sort((a, b) => b.reach - a.reach)[0];
  const topCampaign = data.campaigns.map((c) => ({ c, m: calculateCampaignMetrics(scopedData, c) })).sort((a, b) => b.m.reach - a.m.reach)[0];
  const periodLabel = period === 'year' ? `${year} 年度` : period === 'quarter' ? `${year} 年第 ${quarter} 季` : period === 'month' ? `${year} 年 ${Number(month)} 月` : `${customStart} 至 ${customEnd}`;
  const recommendation = recommendationFromTopics(interactions);
  const report = `${campaign ? `【${campaign.name} 社群宣傳成果摘要】` : `【${periodLabel}社群宣傳成果摘要】`}

本期跨 Facebook、Instagram 與 Threads 共彙整 ${contents.length} 則有效內容，累計觀看／曝光 ${formatNumber(views)}、觸及 ${formatNumber(reach)}、互動 ${formatNumber(eng)}，並記錄 ${formatNumber(conversationCount)} 組有效對話及 ${formatNumber(messages)} 則內容或私訊相關訊息。

${topContent ? `成效較突出的內容為「${topContent.title}」，觸及 ${formatNumber(topContent.reach)}、互動 ${formatNumber(topContent.engagement)}。` : '本期尚無可排名的逐篇內容。'}

${!campaign && topCampaign?.m.contentCount ? `活動層級以「${topCampaign.c.name}」觸及表現較高，共納入 ${topCampaign.m.contentCount} 則有效內容、觸及 ${formatNumber(topCampaign.m.reach)}。` : ''}

${topics[0] ? `民眾詢問以「${topics[0][0]}」最常見，共 ${topics[0][1]} 組；${recommendation.body}` : '目前尚無足夠的民眾詢問資料可形成主題判讀。'}

整體而言，跨平台內容已形成可追蹤、可覆核的宣傳與服務紀錄；後續可持續利用內容快照、活動歸因與詢問分類，作為下一年度宣傳策略、資訊優化及經費需求之佐證。`;
  const copy = () => void navigator.clipboard?.writeText(report);

  return <Shell title="報告中心"><PageIntro kicker="Reports" title="把數據，翻成可以送進成果報告的話。" description="年度、季度、月份、自訂日期與單一活動都會真的過濾資料，不只是換下拉選單文字。"><div className="flex gap-2"><PrintButton/><button onClick={copy} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[12px] font-semibold"><Copy className="h-4 w-4"/>複製文字</button></div></PageIntro>
    <Card className="mb-4"><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6"><label className="text-[10px] font-semibold text-muted-foreground">期間<select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground"><option value="year">年度</option><option value="quarter">季度</option><option value="month">月份</option><option value="custom">自訂日期</option></select></label><label className="text-[10px] font-semibold text-muted-foreground">年份<select value={year} onChange={(e) => { setYear(e.target.value); setCustomStart(`${e.target.value}-01-01`); setCustomEnd(`${e.target.value}-12-31`); }} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground">{years.map((y) => <option key={y}>{y}</option>)}</select></label>{period === 'quarter' && <label className="text-[10px] font-semibold text-muted-foreground">季度<select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground"><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option></select></label>}{period === 'month' && <label className="text-[10px] font-semibold text-muted-foreground">月份<select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground">{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((mth) => <option key={mth} value={mth}>{Number(mth)} 月</option>)}</select></label>}{period === 'custom' && <><label className="text-[10px] font-semibold text-muted-foreground">開始<input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground"/></label><label className="text-[10px] font-semibold text-muted-foreground">結束<input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground"/></label></>}<label className="text-[10px] font-semibold text-muted-foreground xl:col-span-2">活動<select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground"><option value="all">全部活動</option>{data.campaigns.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div></Card>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="觀看 / 曝光" value={formatCompact(views)} note={periodLabel}/><Kpi label="觸及" value={formatCompact(reach)} note={periodLabel}/><Kpi label="互動" value={formatCompact(eng)} note={`${contents.length} 則內容`}/><Kpi label="有效對話" value={formatNumber(conversationCount)} note={`訊息 ${formatNumber(messages)} 則`} accent="text-accent"/></div>
    <Card className="mt-4"><div className="p-6"><div className="mb-4 flex items-center justify-between"><Pill tone="good">政府成果 / 經費佐證語氣</Pill><span className="text-[10px] text-muted-foreground">{periodLabel}</span></div><p className="whitespace-pre-line text-[13px] leading-7">{report}</p><div className="mt-5 flex gap-2"><button onClick={() => downloadJson(`${year}-report-data.json`, { period, periodLabel, campaignId, views, reach, engagement: eng, messages, conversationCount, topics, topContent })} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground"><FileJson className="h-4 w-4"/>匯出報告資料</button></div></div></Card>
  </Shell>;
}

function DataCenter() {
  const { data } = useSocialDataset();
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [incoming, setIncoming] = useState<Partial<WorkspaceData> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [source, setSource] = useState<DataSource>('manual-csv');
  const [kind, setKind] = useState<ImportKind | 'backup'>('contents');
  const [result, setResult] = useState('');
  const [campaignHints, setCampaignHints] = useState<string[]>([]);
  const [threadsPaste, setThreadsPaste] = useState('');
  const [messengerPaste, setMessengerPaste] = useState('');
  const quality = dataQuality(data);

  const resetPreview = () => { setFileName(''); setPreviewRows([]); setIncoming(null); setWarnings([]); setResult(''); setKind('contents'); setCampaignHints([]); };

  const parseImport = async (file: File) => {
    setFileName(file.name); setWarnings([]); setIncoming(null); setResult('');
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.txt')) {
      setSource('threads-web-paste'); setKind('contents');
      const parsed = parseThreadsInsightsText(await file.text());
      setIncoming({ contents: parsed.contents, isDemo: false }); setWarnings(parsed.warnings);
      setPreviewRows([['平台','內容','發布日','觀看','互動'], ...parsed.contents.slice(0, 5).map((row) => [row.platform,row.title,row.publishedAt,String(row.views),String(row.engagement)])]);
      const discovered = discoverCampaignsFromContents(parsed.contents, data.isDemo ? [] : data.campaigns);
      setCampaignHints(discovered.evidence.map((x) => `${x.name}（${x.count} 則內容）`));
      return;
    }
    if (lower.endsWith('.json')) {
      setSource('manual-json');
      try {
        const value = JSON.parse(await file.text()) as Partial<WorkspaceData> | SocialContent[];
        if (Array.isArray(value)) {
          setKind('contents');
          setIncoming({ contents: value, isDemo: false });
          setPreviewRows([['平台','標題','發布日','觀看','觸及'], ...value.slice(0, 4).map((row) => [String(row.platform), row.title, row.publishedAt, String(row.views), String(row.reach)])]);
        } else {
          setKind('backup');
          setIncoming({ ...value, isDemo: false });
          const rows = value.contents ?? [];
          setPreviewRows([['資料類型','筆數'],['宣傳內容', String(rows.length)],['活動', String(value.campaigns?.length ?? 0)],['民眾詢問', String(value.interactions?.length ?? 0)],['平台彙總', String(value.platforms?.length ?? 0)]]);
        }
      } catch {
        setWarnings(['JSON 格式無法解析，請確認檔案是否完整。']);
      }
      return;
    }

    let rows: Record<string, unknown>[] = [];
    if (lower.endsWith('.xlsx')) {
      setSource('manual-xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    } else {
      setSource('manual-csv');
      const parsed = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true });
      rows = parsed.data;
    }
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    setPreviewRows([headers.slice(0, 7), ...rows.slice(0, 4).map((row) => headers.slice(0, 7).map((key) => String(row[key] ?? '')))]);

    // Real Meta exports need their own parser: FB repeats one post for every report date; IG has 日期=總期間.
    const meta = normalizeMetaContentExport(rows);
    if (meta) {
      setKind('contents');
      setIncoming({ contents: meta.contents, isDemo: false });
      setWarnings(meta.warnings);
      const discovered = discoverCampaignsFromContents(meta.contents, data.isDemo ? [] : data.campaigns);
      setCampaignHints(discovered.evidence.map((x) => `${x.name}（${x.count} 則內容）`));
      setPreviewRows([['平台','內容','發布日','類型','觀看','觸及','互動'], ...meta.contents.slice(0, 5).map((row) => [row.platform, row.title, row.publishedAt, row.type, String(row.views), String(row.reach), String(row.engagement)])]);
      return;
    }

    const detected = detectImportKind(rows);
    setKind(detected);

    if (detected === 'interactions') {
      const normalized = rows.map((row, index) => normalizeImportedInteraction(row, index)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((item) => {
        const suggested = classifyInquiry(item.text);
        const activity = classifyInteractionCampaign(item.text, item.createdAt, data.campaigns);
        return { ...item, campaignId: item.campaignId || activity.campaignId, suggestedTopic: suggested.topic, topic: item.topic === '其他' ? suggested.topic : item.topic, confidence: activity.score > 0 ? activity.confidence : suggested.confidence } as Interaction;
      });
      setIncoming({ interactions: normalized, isDemo: false });
      if (normalized.length < rows.length) setWarnings([`${rows.length - normalized.length} 筆沒有可辨識的詢問文字，未納入。`]);
      return;
    }
    if (detected === 'monthlyMetrics') {
      const normalized = rows.map(normalizeImportedMonthlyMetric).filter((x): x is NonNullable<typeof x> => Boolean(x));
      setIncoming({ monthlyMetrics: normalized, isDemo: false });
      return;
    }
    if (detected === 'platforms') {
      const normalized = rows.map(normalizeImportedPlatformMetric).filter((x): x is NonNullable<typeof x> => Boolean(x));
      setIncoming({ platforms: normalized, isDemo: false });
      return;
    }

    const normalized = rows.map((row, index) => normalizeImportedContent(row, index));
    const contents = normalized.map((x) => x.content).filter((x): x is SocialContent => Boolean(x));
    setIncoming({ contents, isDemo: false });
    setWarnings([...new Set(normalized.flatMap((x) => x.warnings))]);
    const discovered = discoverCampaignsFromContents(contents, data.isDemo ? [] : data.campaigns);
    setCampaignHints(discovered.evidence.map((x) => `${x.name}（${x.count} 則內容）`));
  };

  const previewThreadsPaste = () => {
    const parsed = parseThreadsInsightsText(threadsPaste);
    setFileName('Threads 洞察頁文字'); setSource('threads-web-paste'); setKind('contents');
    setIncoming({ contents: parsed.contents, isDemo: false }); setWarnings(parsed.warnings);
    setPreviewRows([['平台','內容','發布日','觀看','互動'], ...parsed.contents.slice(0, 5).map((row) => [row.platform,row.title,row.publishedAt,String(row.views),String(row.engagement)])]);
    const discovered = discoverCampaignsFromContents(parsed.contents, data.isDemo ? [] : data.campaigns);
    setCampaignHints(discovered.evidence.map((x) => `${x.name}（${x.count} 則內容）`));
  };

  const previewMessengerPaste = () => {
    const raw = parseMessengerConversationText(messengerPaste);
    const normalized = raw.map((item) => {
      const suggested = classifyInquiry(item.text);
      const activity = classifyInteractionCampaign(item.text, item.createdAt, data.campaigns);
      return { ...item, campaignId: activity.campaignId, suggestedTopic: suggested.topic, topic: suggested.topic, confidence: activity.score > 0 ? activity.confidence : suggested.confidence } as Interaction;
    });
    setFileName('Messenger 手動對話'); setSource('messenger-manual-paste'); setKind('interactions'); setCampaignHints([]);
    setIncoming({ interactions: normalized, isDemo: false });
    setWarnings(normalized.length ? [`已辨識 ${normalized.length} 組對話；空白行分隔一組對話，因此同一民眾連續 ${normalized[0]?.messageCount ?? 1} 則訊息不會被算成多位民眾。`] : ['尚未貼上可辨識的 Messenger 對話。']);
    setPreviewRows([['來源','對話內容','日期','建議主題','訊息則數'], ...normalized.slice(0, 5).map((row) => [row.source,row.text.slice(0,80),row.createdAt,row.topic,String(row.messageCount ?? 1)])]);
  };

  useEffect(() => {
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => { event.preventDefault(); const file = event.dataTransfer?.files?.[0]; if (file) void parseImport(file); };
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void parseImport(file); };
  const confirm = async () => {
    if (!incoming) return;
    const merged = await mergeAndStoreIncoming(data, incoming, source);
    const extra = kind === 'contents' || kind === 'backup' ? `新增 ${merged.summary.added}、更新 ${merged.summary.updated}、未變更 ${merged.summary.unchanged}、快照 ${merged.summary.snapshotsAdded}` : '資料已合併進統一資料層';
    setResult(`完成：${extra}`);
  };
  const safeExport = {
    ...data,
    interactions: data.interactions.map(({ text, anonymousConversationId, ...rest }) => ({ ...rest, text: '[已移除原始文字]', anonymousConversationId: null })),
  };
  const count = incoming ? (kind === 'interactions' ? incoming.interactions?.length : kind === 'monthlyMetrics' ? incoming.monthlyMetrics?.length : kind === 'platforms' ? incoming.platforms?.length : incoming.contents?.length) ?? 0 : 0;
  const kindLabel: Record<string, string> = { contents:'逐篇宣傳內容', interactions:'民眾詢問 / 私訊', monthlyMetrics:'月份彙總', platforms:'平台彙總', backup:'完整備份' };

  return <Shell title="資料中心"><PageIntro kicker="Data center" title="資料進來之前，先讓它可被信任。" description="手動匯入與 API 同步使用同一套去重、快照與人工覆核保護規則。CSV / XLSX 會先判斷資料類型，再讓你確認合併。"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground"><Upload className="h-4 w-4"/>匯入 CSV / XLSX / JSON<input type="file" accept=".csv,.xlsx,.json,.txt" onChange={handleFile} className="hidden"/></label></PageIntro>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card><div className="p-5"><div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Import preview</p><h2 className="mt-1 text-[16px] font-semibold">{fileName || '等待資料檔案'}</h2></div>{fileName && <Pill tone="warn">{kindLabel[kind]}</Pill>}</div>{fileName ? <><div className="mt-4 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[550px] text-left text-[11px]"><tbody>{previewRows.map((row, i) => <tr key={i} className={i === 0 ? 'bg-secondary font-semibold' : 'border-t border-border'}>{row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div><div className="mt-4 text-[11px] text-muted-foreground">偵測類型：<b className="text-foreground">{kindLabel[kind]}</b> · 可辨識 {count} 筆。逐篇內容去重依 native ID → permalink → 發布時間＋caption hash。</div>{warnings.length > 0 && <div className="mt-3 rounded-xl bg-[hsl(42_75%_88%)] p-3 text-[11px] text-[hsl(33_56%_30%)]">{warnings.join('；')}</div>}{campaignHints.length > 0 && <div className="mt-3 rounded-xl bg-primary/5 p-3 text-[11px] leading-5 text-primary"><b>系統辨識到可自動建立的活動候選：</b><br/>{campaignHints.join('、')}<br/><span className="text-muted-foreground">確認合併後會建立為「待確認活動」，並重新把內容歸類；單篇出現一次的活動名稱不會自動建立。</span></div>}<div className="mt-4 flex gap-2"><button disabled={!incoming} onClick={() => void confirm()} className="h-9 rounded-lg bg-primary px-4 text-[11px] font-semibold text-primary-foreground disabled:opacity-40">確認合併</button><button onClick={resetPreview} className="h-9 rounded-lg px-3 text-[11px] font-semibold text-muted-foreground">取消</button></div>{result && <p className="mt-3 text-[11px] font-semibold text-primary">{result}</p>}</> : <EmptyState title="拖入或選擇資料檔" body="支援 Meta FB / IG 原生 CSV、一般 CSV / XLSX / JSON、Threads 頁面文字 TXT、民眾詢問與完整備份。Views 與 Reach 分開辨識，不會拿 Reach 冒充 Views。"/>}</div></Card>
      <Card><div className="p-5"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Quality center</p><h2 className="mt-1 text-[16px] font-semibold">資料健康度</h2><div className="mt-5 space-y-4"><div><div className="mb-2 flex justify-between text-[12px]"><span>欄位完整度</span><b>{quality.completeness.toFixed(1)}%</b></div><BarMeter value={quality.completeness} max={100}/></div><div><div className="mb-2 flex justify-between text-[12px]"><span>歸屬信心</span><b>{quality.confidence.toFixed(1)}%</b></div><BarMeter value={quality.confidence} max={100} color="bg-accent"/></div></div><div className="mt-5 space-y-2 text-[11px]"><div className="rounded-lg bg-secondary/45 px-3 py-2">待人工覆核 <b className="float-right">{quality.pending}</b></div><div className="rounded-lg bg-secondary/45 px-3 py-2">尚未歸類 <b className="float-right">{quality.unassigned}</b></div><div className="rounded-lg bg-secondary/45 px-3 py-2">重複疑慮 <b className="float-right">{quality.duplicates}</b></div><div className="rounded-lg bg-secondary/45 px-3 py-2">缺少原始連結 <b className="float-right">{quality.missingUrl}</b></div></div></div></Card></div>
    <Card className="mt-4"><div className="p-5"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Web / conversation fallback</p><h2 className="mt-1 text-[16px] font-semibold">Threads 網頁與 Messenger 手動對話備援</h2><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Threads 沒有方便的匯出檔時，可在洞察頁複製目前看得到的文字貼進來；Messenger 則以「一個空白行＝一組民眾對話」匯入，之後再由規則分類器判斷活動與問題主題。</p></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-border p-4"><b className="text-[12px]">Threads 洞察頁</b><p className="mt-1 text-[10px] leading-5 text-muted-foreground">先開 Threads 洞察，把含貼文網址、Views / Likes / Replies / Reposts / Quotes 的可見內容複製後貼上。GitHub Pages 因同源限制不能直接讀另一個登入分頁，所以這是免 API 的安全備援。</p><textarea value={threadsPaste} onChange={e=>setThreadsPaste(e.target.value)} placeholder="貼上 Threads 洞察頁複製文字…" className="mt-3 min-h-[150px] w-full rounded-xl border border-border bg-background p-3 text-[11px] leading-5"/><div className="mt-3 flex gap-2"><button onClick={previewThreadsPaste} className="h-9 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">解析並預覽</button><a href="https://www.threads.net/insights" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-[11px] font-semibold">開啟 Threads</a></div></div><div className="rounded-xl border border-border p-4"><b className="text-[12px]">Messenger 民眾詢問</b><p className="mt-1 text-[10px] leading-5 text-muted-foreground">把同一位民眾的一段對話貼在同一區塊，不同民眾之間空一行。系統會保存 conversation_count=1，message_count 則依該區塊行數計算。</p><textarea value={messengerPaste} onChange={e=>setMessengerPaste(e.target.value)} placeholder={"民眾A：請問還能報名嗎？\n民眾A：如果額滿可以候補嗎？\n\n民眾B：衛武營附近有停車場嗎？"} className="mt-3 min-h-[150px] w-full rounded-xl border border-border bg-background p-3 text-[11px] leading-5"/><button onClick={previewMessengerPaste} className="mt-3 h-9 rounded-lg bg-accent px-3 text-[11px] font-semibold text-white">解析並預覽對話</button></div></div></div></Card>
    <Card className="mt-4"><div className="p-5"><div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Backup & privacy</p><h2 className="mt-1 text-[16px] font-semibold">兩種匯出，避免私訊跑進公開 GitHub</h2></div><Pill tone="good">Privacy first</Pill></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><button onClick={() => downloadJson('social-impact-private-backup.json', data)} className="rounded-xl border border-border p-4 text-left"><Download className="h-4 w-4 text-primary"/><b className="mt-2 block text-[12px]">完整私有備份</b><small className="text-[10px] text-muted-foreground">含原始詢問文字，請私下保管</small></button><button onClick={() => downloadJson('social-impact-public-safe.json', safeExport)} className="rounded-xl border border-border p-4 text-left"><FileJson className="h-4 w-4 text-accent"/><b className="mt-2 block text-[12px]">公開安全資料</b><small className="text-[10px] text-muted-foreground">自動移除私訊原文與識別碼</small></button><button onClick={() => void clearWorkspace()} className="rounded-xl border border-border p-4 text-left"><X className="h-4 w-4 text-destructive"/><b className="mt-2 block text-[12px]">清除本機資料</b><small className="text-[10px] text-muted-foreground">清除 IndexedDB；重整後回 DEMO</small></button></div></div></Card>
  </Shell>;
}

function Settings() {
  const {status,syncing,syncMessage,syncNow}=useSocialDataset(); const [backend,setBackend]=useState(getBackendUrl()); const [tested,setTested]=useState(''); const [remoteStatus,setRemoteStatus]=useState<DashboardStatus|null>(null);
  const test=async()=>{setBackendUrl(backend);try{const s=await fetchBackendStatus();setRemoteStatus(s);setTested('連線成功');}catch(error){setTested(`連線失敗：${error instanceof Error?error.message:'未知錯誤'}`)}}; const sync=async()=>{try{await syncNow()}catch(error){setTested(error instanceof Error?error.message:'同步失敗')}}; const shown=remoteStatus??status;
  const auth=(platform:string)=>{const base=getBackendUrl();if(!base){setTested('請先設定後端 URL');return;}window.open(`${base}/api/social/auth/${platform}/start`,'_blank','noopener,noreferrer')};
  return <Shell title="設定"><PageIntro kicker="Workspace settings" title="自動同步＋手動備援，兩條路都留著。" description="GitHub Pages 可以單獨工作；後端只負責 Token 與 Meta API。沒有後端時，匯入、覆核、報告仍然全部可用。"><button onClick={()=>void sync()} disabled={syncing} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground"><RefreshCw className={`h-4 w-4 ${syncing?'animate-spin':''}`}/>立即向 Meta 同步</button></PageIntro><div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]"><Card><div className="p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Connection</p><h2 className="mt-1 text-[16px] font-semibold">後端服務 URL</h2><p className="mt-2 text-[11px] leading-5 text-muted-foreground">留空＝純 GitHub Pages / 本機模式。填入後端＝可以真正向平台同步；Meta App Secret 永遠不放前端。</p><div className="mt-4 flex gap-2"><input value={backend} onChange={e=>setBackend(e.target.value)} placeholder="https://your-backend.example" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[12px]"/><button onClick={()=>void test()} className="h-10 rounded-lg border border-border px-3 text-[11px] font-semibold">測試連線</button></div>{tested&&<p className={`mt-3 text-[11px] ${tested.startsWith('連線成功')?'text-primary':'text-destructive'}`}>{tested}</p>}<div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">{[['facebook','Facebook'],['instagram','Instagram'],['threads','Threads']].map(([id,label])=><button key={id} onClick={()=>auth(id)} className="rounded-xl border border-border p-3 text-left hover:bg-secondary"><b className="text-[12px]">{label}</b><p className="mt-1 text-[10px] text-muted-foreground">開啟官方 OAuth</p></button>)}</div>{syncMessage&&<p className="mt-4 rounded-xl bg-primary/5 p-3 text-[11px] text-primary">{syncMessage}</p>}</div></Card><Card><div className="p-5 sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Source status</p><h2 className="mt-1 text-[16px] font-semibold">目前來源</h2><div className="mt-5 space-y-3">{shown.sources.map(source=><div key={source.source} className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${source.status==='healthy'?'bg-primary':source.status==='warning'?'bg-[hsl(42_72%_55%)]':'bg-destructive'}`}/><div className="flex-1"><p className="text-[12px] font-semibold">{source.label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{source.detail}</p></div><Pill tone={source.status==='healthy'?'good':'warn'}>{source.status==='healthy'?'正常':source.status==='unavailable'?'未授權':'注意'}</Pill></div>)}</div></div></Card></div><Card className="mt-4"><div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2"><div><div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary"/><h2 className="text-[14px] font-semibold">隱私</h2></div><p className="mt-3 text-[12px] leading-6 text-muted-foreground">公開 GitHub 只放匿名彙總。完整私訊文字只留在 IndexedDB 或受保護後端；公開安全匯出會自動移除原文與識別碼。</p></div><div><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-accent"/><h2 className="text-[14px] font-semibold">權限不足不拖垮整批同步</h2></div><p className="mt-3 text-[12px] leading-6 text-muted-foreground">Messenger / IG DM 若缺 Advanced Access，後端會回報 partial，Facebook、Instagram、Threads 的其他可用內容仍會正常更新。</p></div></div></Card></Shell>;
}

export function AppRouterPage({page,campaignId}:{page:string;campaignId?:string}) {
  const {data}=useSocialDataset();
  if(page==='overview')return <Overview/>;
  if(page==='campaigns'){const campaign=campaignId?data.campaigns.find(x=>x.id===campaignId):undefined;return campaign?<CampaignDetail campaign={campaign}/>:<Campaigns/>;}
  if(page==='content')return <ContentLibrary/>;
  if(page==='inquiries')return <Inquiries/>;
  if(page==='platforms')return <Platforms/>;
  if(page==='reports')return <Reports/>;
  if(page==='data')return <DataCenter/>;
  return <Settings/>;
}
