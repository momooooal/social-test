const captureButton = document.getElementById('capture');
const sendButton = document.getElementById('send');
const downloadButton = document.getElementById('download');
const clearButton = document.getElementById('clear');
const status = document.getElementById('status');
const countLabel = document.getElementById('count');
const STORAGE_KEY = 'socialImpactThreadsLastCapture';

function say(text, type='') { status.textContent = text; status.className = `status ${type}`; }
async function activeTab() { const [tab] = await chrome.tabs.query({active:true,currentWindow:true}); return tab; }

function extractThreadsPage() {
  const normalize = (s) => (s || '').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const hrefOf = (a) => { try { return new URL(a.getAttribute('href') || '', location.href).href; } catch { return ''; } };
  const num = (v) => { const n = Number(String(v ?? '').replace(/[,，\s%]/g,'')); return Number.isFinite(n) ? n : undefined; };
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pageText = normalize(document.body?.innerText || document.documentElement?.innerText || '');

  const labeled = (text,label,percent=false) => {
    const re = new RegExp(`(?:^|\\n)\\s*${esc(label)}\\s*(?:\\n|[:：]\\s*|\\s+)([\\d,.]+)\\s*${percent?'%':''}`,'im');
    const m = text.match(re); return m ? num(m[1]) : undefined;
  };
  const benchmark = (text,label) => {
    const re = new RegExp(`(?:^|\\n)\\s*${esc(label)}\\s*(?:\\n|[:：]\\s*|\\s+)[\\d,.]+%?\\s*(較低|一般|高於)`,'im');
    return text.match(re)?.[1];
  };
  const sourcePct = (text,label) => {
    const at = text.indexOf('瀏覽次數主要來源');
    return at < 0 ? undefined : labeled(text.slice(at,at+1800),label,true);
  };
  const postLinks = [...document.querySelectorAll('a[href]')]
    .map(a => ({a, href:hrefOf(a)}))
    .filter(x => /threads\.com\/@[^/]+\/post\//i.test(x.href));
  const tagNames = [...new Set([...document.querySelectorAll('a[href]')]
    .filter(a => /(?:serp_type=tags|tag_id=)/i.test(a.getAttribute('href') || ''))
    .map(a => normalize(a.innerText || a.textContent || '').replace(/^#/,'')).filter(Boolean))];

  const extractCaption = (text) => {
    const before = text.split(/(?:^|\n)\s*摘要\s*(?:\n|$)/i)[0] || text;
    const candidates = before.split('\n').map(normalize).filter(Boolean).filter(line => {
      if (/^https?:\/\//i.test(line)) return false;
      if (/^@?[\w.]+$/.test(line)) return false;
      if (/^\d+\s*(秒|分鐘|小時|天|週|個月|年)$/.test(line)) return false;
      if (line === 'svg') return false;
      return line.length > 25;
    });
    return candidates.sort((a,b)=>b.length-a.length)[0] || '';
  };

  const timeNear = (anchor) => {
    let node = anchor;
    for (let i=0;i<8 && node;i++,node=node.parentElement) {
      const time = node.querySelector?.('time[datetime]');
      if (time?.getAttribute('datetime')) return time.getAttribute('datetime');
    }
    return document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
  };

  const detailMarkers = /(?:^|\n)\s*摘要\s*(?:\n|$)/m.test(pageText) && /瀏覽次數主要來源|按讚率|瀏覽人數/.test(pageText);
  if (detailMarkers) {
    const preferred = postLinks.find(x => pageText.includes(x.a.innerText || '')) || postLinks[0];
    const href = preferred?.href?.split('?')[0].replace(/\/$/,'') || '';
    const nativeContentId = href.match(/\/post\/([^/?#]+)/i)?.[1] || '';
    const accountHandle = href.match(/threads\.com\/@([^/]+)/i)?.[1] || '';
    const publishedAtRaw = preferred ? timeNear(preferred.a) : (document.querySelector('time[datetime]')?.getAttribute('datetime') || '');
    const caption = extractCaption(pageText);
    const metrics = {
      views: labeled(pageText,'瀏覽次數'),
      profileViews: labeled(pageText,'個人檔案瀏覽次數'),
      viewers: labeled(pageText,'瀏覽人數'),
      follows: labeled(pageText,'追蹤次數'),
      rates: {
        like: labeled(pageText,'按讚率',true),
        reply: labeled(pageText,'回覆率',true),
        share: labeled(pageText,'分享率',true),
        quote: labeled(pageText,'引用率',true),
        repost: labeled(pageText,'轉發率',true),
      },
      trafficSources: {
        home: sourcePct(pageText,'首頁'),
        search: sourcePct(pageText,'搜尋'),
        profile: sourcePct(pageText,'個人檔案'),
        activityTab: sourcePct(pageText,'活動頁籤'),
      },
      benchmarks: {
        views: benchmark(pageText,'瀏覽次數'),
        profileViews: benchmark(pageText,'個人檔案瀏覽次數'),
        viewers: benchmark(pageText,'瀏覽人數'),
        follows: benchmark(pageText,'追蹤次數'),
        likeRate: benchmark(pageText,'按讚率'),
        replyRate: benchmark(pageText,'回覆率'),
        shareRate: benchmark(pageText,'分享率'),
        quoteRate: benchmark(pageText,'引用率'),
        repostRate: benchmark(pageText,'轉發率'),
      },
    };
    return {
      captureType:'threads-insights-capture', schemaVersion:3, captureMode:'single-post-detail',
      capturedAt:new Date().toISOString(), sourceUrl:location.href, title:document.title, pageText,
      posts:[{href,nativeContentId,accountHandle,publishedAt:publishedAtRaw,publishedAtRaw,caption,tagNames,context:pageText,metrics}]
    };
  }

  const metricRe = /(views?|瀏覽|觀看|likes?|按讚|replies?|回覆|留言|reposts?|轉發|quotes?|引用)/i;
  const seen = new Set();
  const posts = [];
  const addBlock = (node, href='') => {
    if (!node) return;
    const context = normalize(node.innerText || node.textContent || '');
    if (!context || context.length < 20 || context.length > 9000 || !metricRe.test(context)) return;
    const cleanHref = href ? href.split('?')[0].replace(/\/$/,'') : '';
    const key = cleanHref || context.slice(0,700);
    if (seen.has(key)) return;
    seen.add(key);
    posts.push({
      href:cleanHref,
      nativeContentId:cleanHref.match(/\/post\/([^/?#]+)/i)?.[1] || '',
      accountHandle:cleanHref.match(/threads\.com\/@([^/]+)/i)?.[1] || '',
      publishedAtRaw:'', caption:extractCaption(context), tagNames:[], context,
      metrics:{
        views:labeled(context,'瀏覽次數') ?? labeled(context,'觀看次數'),
        viewers:labeled(context,'瀏覽人數'),
        profileViews:labeled(context,'個人檔案瀏覽次數'),
        follows:labeled(context,'追蹤次數')
      }
    });
  };
  for (const {a,href} of postLinks) {
    let node=a,best=a;
    for(let i=0;i<10&&node;i++,node=node.parentElement){const text=normalize(node.innerText||node.textContent||'');if(metricRe.test(text)&&text.length<9000){best=node;if(text.length>100)break;}}
    addBlock(best,href);
  }
  return {captureType:'threads-insights-capture',schemaVersion:3,captureMode:'overview',capturedAt:new Date().toISOString(),sourceUrl:location.href,title:document.title,pageText,posts};
}

function mergeCaptures(oldCapture, fresh) {
  const oldPosts = oldCapture?.posts || [];
  const map = new Map();
  const keyOf = p => p.nativeContentId || p.href || (p.context || '').slice(0,500);
  for (const p of oldPosts) map.set(keyOf(p), p);
  for (const p of fresh.posts || []) {
    const key = keyOf(p);
    const old = map.get(key) || {};
    map.set(key, {
      ...old, ...p,
      tagNames:[...new Set([...(old.tagNames||[]),...(p.tagNames||[])])],
      metrics:{...old.metrics,...p.metrics,rates:{...(old.metrics?.rates||{}),...(p.metrics?.rates||{})},trafficSources:{...(old.metrics?.trafficSources||{}),...(p.metrics?.trafficSources||{})},benchmarks:{...(old.metrics?.benchmarks||{}),...(p.metrics?.benchmarks||{})}}
    });
  }
  return {...fresh,captureMode:(oldPosts.length && fresh.captureMode!==oldCapture?.captureMode)?'mixed':fresh.captureMode,posts:[...map.values()]};
}

async function refreshCount() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const n = stored[STORAGE_KEY]?.posts?.length || 0;
  countLabel.textContent = `目前已累積 ${n} 篇`;
}

captureButton.addEventListener('click', async () => {
  captureButton.disabled = true; say('正在讀取目前 Threads 洞察…');
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/(www\.)?threads\.com\//i.test(tab.url || '')) throw new Error('請先切到 Threads 洞察頁或單篇洞察。');
    const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractThreadsPage});
    if (!result?.pageText) throw new Error('目前頁面沒有可擷取內容，請確認已登入且洞察已載入。');
    if (!result.posts?.length) throw new Error('沒有辨識到貼文洞察。請先打開某一篇貼文的「洞察」詳情再按擷取。');
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const merged = mergeCaptures(stored[STORAGE_KEY], result);
    await chrome.storage.local.set({[STORAGE_KEY]:merged});
    await refreshCount();
    const detail = result.captureMode === 'single-post-detail';
    say(detail ? `已擷取這 1 篇的完整洞察，累積 ${merged.posts.length} 篇。可以開下一篇繼續按①。` : `已從目前列表辨識 ${result.posts.length} 篇；若要完整互動率與流量來源，請進單篇洞察後再按①。`,'ok');
  } catch (e) { say(e instanceof Error ? e.message : String(e),'err'); }
  finally { captureButton.disabled = false; }
});

sendButton.addEventListener('click', async () => {
  sendButton.disabled = true; say('正在送入目前 Dashboard…');
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY); const payload = stored[STORAGE_KEY];
    if (!payload?.posts?.length) throw new Error('還沒有擷取資料。先到 Threads 洞察按①。');
    const tab = await activeTab(); if (!tab?.id) throw new Error('找不到目前分頁。');
    if (/^https:\/\/(www\.)?threads\.com/i.test(tab.url || '')) throw new Error('現在仍在 Threads。請切到「社群效益分析 → 資料中心」再按②。');
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:(data)=>{window.postMessage({type:'SOCIAL_IMPACT_THREADS_CAPTURE',payload:data},'*');},args:[payload]});
    say(`已送出 ${payload.posts.length} 篇。Dashboard 上方應該會出現 Threads 匯入預覽。`,'ok');
  } catch(e) { say(e instanceof Error ? e.message : String(e),'err'); }
  finally { sendButton.disabled=false; }
});

downloadButton.addEventListener('click', async () => {
  try {
    const stored=await chrome.storage.local.get(STORAGE_KEY); const payload=stored[STORAGE_KEY];
    if(!payload?.posts?.length) throw new Error('還沒有擷取資料。');
    const url='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(payload,null,2));
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    await chrome.downloads.download({url,filename:`threads-insights-${stamp}.json`,saveAs:false}); say('已另存 JSON 備份。','ok');
  } catch(e){say(e instanceof Error?e.message:String(e),'err');}
});

clearButton.addEventListener('click', async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  await refreshCount();
  say('已清空累積資料。','ok');
});

void refreshCount();
