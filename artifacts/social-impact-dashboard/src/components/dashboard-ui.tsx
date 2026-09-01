import { useEffect, useState, type ReactNode } from 'react';
import { Download, ExternalLink, Menu, Moon, Printer, Sun } from 'lucide-react';

const navItems = [
  { href: '/', label: '年度總覽', caption: 'Annual overview' },
  { href: '/campaigns', label: '活動分析', caption: 'Campaigns' },
  { href: '/content', label: '內容資料庫', caption: 'Content library' },
  { href: '/inquiries', label: '公眾提問', caption: 'Inquiries' },
  { href: '/platforms', label: '平台比較', caption: 'Platforms' },
  { href: '/reports', label: '報告中心', caption: 'Reports' },
  { href: '/data', label: '資料中心', caption: 'Data center' },
];

export function formatCompact(value: number) {
  return new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-TW').format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'coral' | 'blue' }) {
  const tones = {
    neutral: 'bg-secondary text-muted-foreground',
    good: 'bg-[hsl(157_34%_88%)] text-[hsl(168_48%_28%)] dark:bg-[hsl(168_30%_23%)] dark:text-[hsl(168_48%_72%)]',
    warn: 'bg-[hsl(42_75%_88%)] text-[hsl(33_56%_30%)] dark:bg-[hsl(42_36%_25%)] dark:text-[hsl(42_75%_72%)]',
    coral: 'bg-[hsl(14_72%_91%)] text-[hsl(14_55%_38%)] dark:bg-[hsl(14_35%_25%)] dark:text-[hsl(14_72%_78%)]',
    blue: 'bg-[hsl(201_45%_89%)] text-[hsl(201_45%_32%)] dark:bg-[hsl(201_35%_24%)] dark:text-[hsl(201_45%_75%)]',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function IconButton({ label, onClick, children, disabled = false }: { label: string; onClick?: () => void; children: ReactNode; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-testid={`button-${label.replaceAll(' ', '-').toLowerCase()}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45">{children}</button>;
}

export function CsvButton({ rows, filename }: { rows: Record<string, unknown>[]; filename: string }) {
  return <IconButton label={`export-${filename}`} onClick={() => downloadCsv(filename, rows)}><Download className="h-4 w-4" /></IconButton>;
}

export function Card({ children, className = '', subtle = false }: { children: ReactNode; className?: string; subtle?: boolean }) {
  return <section className={`rounded-2xl border border-card-border ${subtle ? 'bg-secondary/40' : 'bg-card'} ${className}`}>{children}</section>;
}

export function ChartHeader({ title, eyebrow, rows, filename, action }: { title: string; eyebrow?: string; rows: Record<string, unknown>[]; filename: string; action?: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 px-5 pt-5"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1 text-[16px] font-semibold tracking-[-.01em]">{title}</h2></div><div className="flex items-center gap-2">{action}<CsvButton rows={rows} filename={filename} /></div></div>;
}

export function Shell({ children, title, section }: { children: ReactNode; title: string; section?: string }) {
  const getPath = () => (typeof window !== 'undefined' ? (window.location.hash.replace(/^#/, '') || '/') : '/');
  const [location, setLocation] = useState(getPath);
  useEffect(() => { const listener = () => setLocation(getPath()); window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); }, []);
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && (localStorage.getItem('social-impact-theme') === 'dark' || document.documentElement.classList.contains('dark')));
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const toggleTheme = () => { const next = !dark; setDark(next); document.documentElement.classList.toggle('dark', next); localStorage.setItem('social-impact-theme', next ? 'dark' : 'light'); };
  return <div className="min-h-[100dvh] bg-background">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[88px] items-center gap-3 border-b border-sidebar-border px-6">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><span className="h-4 w-4 rounded-full border-[3px] border-current" /><span className="absolute h-2 w-2 translate-x-2 -translate-y-2 rounded-full bg-accent" /></div>
        <div><p className="font-display text-[21px] leading-none">社群效益分析</p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/55">Social impact desk</p></div>
      </div>
      <div className="px-4 pt-7"><p className="px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-foreground/45">Workspace</p><nav className="mt-3 space-y-1">
        {navItems.map((item) => { const active = item.href === '/' ? location === '/' : location.startsWith(item.href); return <a key={item.href} href={`#${item.href}`} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${item.href.slice(1) || 'overview'}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full transition ${active ? 'bg-accent' : 'bg-sidebar-foreground/25 group-hover:bg-sidebar-primary'}`} /><span className="flex-1"><span className="block text-[13px] font-medium">{item.label}</span><span className="mt-0.5 block text-[10px] text-sidebar-foreground/42">{item.caption}</span></span>{active && <span className="font-mono-ui text-[10px] text-accent">●</span>}</a>; })}
      </nav></div>
      <div className="mt-auto border-t border-sidebar-border p-4">
        <div className="rounded-xl bg-sidebar-accent/70 p-3"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold">資料來源</span><Pill tone="good">混合模式</Pill></div><p className="mt-2 text-[11px] leading-5 text-sidebar-foreground/55">本機匯入與連線資料會合併顯示，保留人工覆核記錄。</p><a href="#/settings" className="mt-3 inline-flex text-[11px] font-semibold text-sidebar-primary hover:underline">前往設定 <span className="ml-1">→</span></a></div>
        <div className="mt-4 flex items-center gap-3 px-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 font-mono-ui text-[11px] text-accent">CM</div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">Communications team</p><p className="text-[10px] text-sidebar-foreground/45">編輯者</p></div><button type="button" onClick={toggleTheme} aria-label="切換深色模式" data-testid="button-sidebar-theme" className="text-sidebar-foreground/55 hover:text-sidebar-foreground">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button></div>
      </div>
    </aside>
    {mobileOpen && <button type="button" aria-label="關閉導覽" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-foreground/25 lg:hidden" />}
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,.05)] backdrop-blur lg:hidden">
      {[['/','總覽'],['/campaigns','活動'],['/content','內容']].map(([href,label]) => <a key={href} href={`#${href}`} className={`rounded-xl px-2 py-2 text-center text-[11px] font-semibold ${location === href || (href !== '/' && location.startsWith(href)) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>{label}</a>)}
      <button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground">更多</button>
    </nav>
    <main className="min-h-[100dvh] pb-20 lg:pl-[244px] lg:pb-0"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-lg sm:px-8 lg:px-10"><div className="flex items-center gap-3"><button type="button" aria-label="開啟導覽" onClick={() => setMobileOpen(true)} data-testid="button-open-navigation" className="rounded-lg p-2 hover:bg-secondary lg:hidden"><Menu className="h-5 w-5" /></button><div><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span>社群效益分析</span><span className="text-border">/</span><span>{section ?? title}</span></div><h1 className="mt-1 text-[15px] font-semibold">{title}</h1></div></div><div className="flex items-center gap-2 sm:gap-3"><span className="hidden rounded-full bg-secondary px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:inline-flex"><span className="mr-2 h-1.5 w-1.5 self-center rounded-full bg-primary" />本機保存 · 雙軌資料</span><a href="#/settings" data-testid="link-settings-header" className="hidden rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-secondary sm:inline-flex">設定</a><IconButton label="切換深色模式" onClick={toggleTheme}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</IconButton></div></header><div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-10">{children}</div></main>
  </div>;
}

export function PageIntro({ kicker, title, description, children }: { kicker: string; title: string; description: string; children?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">{kicker}</p><h2 className="mt-2 font-display text-[38px] leading-none tracking-[-.035em] sm:text-[46px]">{title}</h2><p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground">{description}</p></div>{children}</div>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/25 px-6 py-14 text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><span className="h-5 w-5 rounded-full border-2 border-current" /></div><h3 className="text-[15px] font-semibold">{title}</h3><p className="mt-2 max-w-sm text-[13px] leading-5 text-muted-foreground">{body}</p></div>;
}

export function BarMeter({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  return <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>;
}

export function PrintButton() {
  return <IconButton label="列印或匯出 PDF" onClick={() => window.print()}><Printer className="h-4 w-4" /></IconButton>;
}

export function ExternalButton({ href }: { href: string }) {
  return <a href={href} target="_blank" rel="noreferrer" aria-label="開啟原始內容" data-testid="link-open-original" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" />原始內容</a>;
}