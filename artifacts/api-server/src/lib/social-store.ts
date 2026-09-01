import fs from 'node:fs/promises';
import path from 'node:path';
import type { NormalizedContent } from '../providers/types';

export interface SocialDataset {
  generatedAt: string;
  isDemo: boolean;
  monthlyMetrics: Array<{ month:string; views:number; reach:number; engagement:number; messages:number; followers:number }>;
  contents: NormalizedContent[];
  campaigns: Array<{ id:string; name:string; startDate:string; endDate:string; contentCount:number; views:number; reach:number; engagement:number; messages:number; topQuestion:string; summary:string }>;
  interactions: Array<{ id:string; source:string; text:string; createdAt:string; campaignId:string; topic:string; confidence:'high'|'medium'|'low' }>;
  platforms: Array<{ platform:string; followers:number; growth:number; views:number; reach:number; engagement:number; posts:number; reels:number; stories:number; messages:number }>;
}

const filePath = process.env.SOCIAL_DATA_FILE || path.resolve(process.cwd(), 'data/social-runtime.json');

function demo(): SocialDataset {
  const campaignNames = ['城市裡的綠色客廳','一起生活指南','問一個好問題','不只是上網','年度成果展'];
  const campaigns = campaignNames.map((name,index)=>({id:`cp-0${index+1}`,name,startDate:`2024-0${index+1}-01`,endDate:`2024-${String(index+7).padStart(2,'0')}-28`,contentCount:0,views:0,reach:0,engagement:0,messages:0,topQuestion:'活動參與',summary:'DEMO 活動資料；開始使用真實資料後會由本機活動取代。'}));
  const platforms=['Facebook','Instagram','Threads'] as const;
  const contents:NormalizedContent[]=Array.from({length:50},(_,index)=>{const platform=platforms[index%3];const views=16000+(index*7193)%61000;const reach=Math.round(views*.7);const engagement=Math.round(reach*.06);const cp=campaigns[index%campaigns.length];return{id:`demo-${index+1}`,nativeContentId:`demo-${index+1}`,platform,type:platform==='Threads'?'Threads Post':index%4===0?'Reel':'Post',title:`DEMO｜社群內容示例 ${index+1}`,caption:'這是示範資料，用來檢查介面與分析流程。',publishedAt:`2024-${String(index%12+1).padStart(2,'0')}-${String(index%24+1).padStart(2,'0')}T08:00:00Z`,views,impressions:views,reach,engagement,likes:Math.round(engagement*.75),comments:Math.round(engagement*.1),shares:Math.round(engagement*.08),saves:Math.round(engagement*.04),clicks:Math.round(engagement*.12),messages:10+index%9,campaignId:cp.id,campaignName:cp.name,confidence:'high',reviewStatus:'accepted',url:'',lastSource:'demo'}});
  for(const cp of campaigns){const rows=contents.filter(x=>x.campaignId===cp.id);cp.contentCount=rows.length;cp.views=rows.reduce((s,x)=>s+x.views,0);cp.reach=rows.reduce((s,x)=>s+x.reach,0);cp.engagement=rows.reduce((s,x)=>s+x.engagement,0);cp.messages=rows.reduce((s,x)=>s+x.messages,0)}
  const monthlyMetrics=Array.from({length:12},(_,i)=>{const rows=contents.filter(x=>Number(x.publishedAt.slice(5,7))===i+1);return{month:`${i+1}月`,views:rows.reduce((s,x)=>s+x.views,0),reach:rows.reduce((s,x)=>s+x.reach,0),engagement:rows.reduce((s,x)=>s+x.engagement,0),messages:rows.reduce((s,x)=>s+x.messages,0),followers:0}});
  const interactions=Array.from({length:24},(_,i)=>({id:`demo-i-${i}`,source:platforms[i%3],text:['請問怎麼報名？','附近可以停車嗎？','活動幾點開始？','還有候補名額嗎？'][i%4],createdAt:`2024-${String(i%12+1).padStart(2,'0')}-10`,campaignId:campaigns[i%campaigns.length].id,topic:['報名方式','停車','時間 / 日期','名額 / 候補'][i%4],confidence:'high' as const}));
  return {generatedAt:new Date().toISOString(),isDemo:true,monthlyMetrics,contents,campaigns,interactions,platforms:platforms.map(p=>({platform:p,followers:0,growth:0,views:contents.filter(x=>x.platform===p).reduce((s,x)=>s+x.views,0),reach:contents.filter(x=>x.platform===p).reduce((s,x)=>s+x.reach,0),engagement:contents.filter(x=>x.platform===p).reduce((s,x)=>s+x.engagement,0),posts:contents.filter(x=>x.platform===p&&x.type!=='Reel').length,reels:contents.filter(x=>x.platform===p&&x.type==='Reel').length,stories:0,messages:contents.filter(x=>x.platform===p).reduce((s,x)=>s+x.messages,0)}))};
}

export async function readDataset():Promise<SocialDataset>{try{return JSON.parse(await fs.readFile(filePath,'utf8')) as SocialDataset}catch{return demo()}}
export async function writeDataset(data:SocialDataset){await fs.mkdir(path.dirname(filePath),{recursive:true});await fs.writeFile(filePath,JSON.stringify(data,null,2));}

function key(item:NormalizedContent){return `${item.platform}:${item.nativeContentId||item.permalink||item.url||item.id}`}
export function mergeProviderContents(current:SocialDataset, incoming:NormalizedContent[]){const map=new Map(current.isDemo?[]:current.contents.map(x=>[key(x),x]));for(const item of incoming){const old=map.get(key(item));map.set(key(item),old?{...old,...item,id:old.id}:item)}return [...map.values()]}
export function mergeProviderAccount(current:SocialDataset, platform:string, account?:{followers?:number;reach?:number;views?:number;engagement?:number}){
  if(!account)return current;
  const existing=current.platforms.find(x=>x.platform===platform);
  const next={platform,followers:Number(account.followers??existing?.followers??0),growth:existing?.growth??0,views:Number(account.views??existing?.views??0),reach:Number(account.reach??existing?.reach??0),engagement:Number(account.engagement??existing?.engagement??0),posts:existing?.posts??0,reels:existing?.reels??0,stories:existing?.stories??0,messages:existing?.messages??0};
  return{...current,platforms:[...current.platforms.filter(x=>x.platform!==platform),next]};
}

export function rebuildAggregates(data:SocialDataset):SocialDataset{
  const contents=data.contents;
  const monthlyMetrics=Array.from({length:12},(_,i)=>{const rows=contents.filter(x=>Number(x.publishedAt.slice(5,7))===i+1);return{month:`${i+1}月`,views:rows.reduce((s,x)=>s+x.views,0),reach:rows.reduce((s,x)=>s+x.reach,0),engagement:rows.reduce((s,x)=>s+x.engagement,0),messages:rows.reduce((s,x)=>s+x.messages,0),followers:0}});
  const names=['Facebook','Instagram','Threads'];
  const platforms=names.map(p=>{const rows=contents.filter(x=>x.platform===p);const previous=data.platforms.find(x=>x.platform===p);return{platform:p,followers:previous?.followers??0,growth:previous?.growth??0,views:rows.reduce((s,x)=>s+x.views,0)||previous?.views||0,reach:rows.reduce((s,x)=>s+x.reach,0)||previous?.reach||0,engagement:rows.reduce((s,x)=>s+x.engagement,0)||previous?.engagement||0,posts:rows.filter(x=>x.type==='Post'||x.type==='Threads Post').length,reels:rows.filter(x=>x.type==='Reel').length,stories:rows.filter(x=>x.type==='Story').length,messages:rows.reduce((s,x)=>s+x.messages,0)||previous?.messages||0}});
  return{...data,generatedAt:new Date().toISOString(),isDemo:false,monthlyMetrics,platforms};
}
