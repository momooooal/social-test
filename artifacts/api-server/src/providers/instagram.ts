import { getJson } from './http';
import type { NormalizedContent, ProviderResult } from './types';

const version = process.env.META_API_VERSION || 'v25.0';
const graph = `https://graph.facebook.com/${version}`;
type Media = { id:string; caption?:string; media_type?:string; media_product_type?:string; timestamp:string; permalink?:string; like_count?:number; comments_count?:number };
type Insight = { name:string; values?:Array<{value:number}>; total_value?:{value:number} };

function value(data: Insight[], names: string[]) { for (const name of names) { const item=data.find(x=>x.name===name); const v=item?.total_value?.value ?? item?.values?.at(-1)?.value; if(typeof v==='number') return v; } return 0; }
async function insights(id:string,token:string){
  const candidates = ['views,reach,total_interactions,likes,comments,shares,saved','reach,impressions,engagement,saved','reach,plays,likes,comments,shares,saved'];
  for (const metrics of candidates) { try { const r=await getJson<{data:Insight[]}>(`${graph}/${id}/insights`,{metric:metrics},token); return r.data; } catch { /* metric availability varies by media type */ } }
  return [];
}

export async function syncInstagram(userId:string,token:string):Promise<ProviderResult>{
  const warnings:string[]=[];
  let followers=0;
  try{const profile=await getJson<{followers_count?:number}>(`${graph}/${userId}`,{fields:'followers_count'},token);followers=Number(profile.followers_count||0)}catch{/* media sync remains independent */}
  const response=await getJson<{data:Media[]}>(`${graph}/${userId}/media`,{fields:'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count',limit:100},token);
  const contents:NormalizedContent[]=[];
  for(const media of response.data){ const ins=await insights(media.id,token); const likes=media.like_count||value(ins,['likes']); const comments=media.comments_count||value(ins,['comments']); const shares=value(ins,['shares']); const saves=value(ins,['saved','saves']); const reach=value(ins,['reach']); const views=value(ins,['views','plays','impressions']); const engagement=value(ins,['total_interactions','engagement'])||likes+comments+shares+saves; const product=(media.media_product_type||'').toUpperCase();
    contents.push({id:`instagram-${media.id}`,nativeContentId:media.id,platform:'Instagram',type:product==='REELS'?'Reel':'Post',title:(media.caption||'Instagram 內容').slice(0,100),caption:media.caption||'',publishedAt:media.timestamp,views,impressions:views,reach,engagement,likes,comments,shares,saves,clicks:0,messages:0,campaignId:'unassigned',campaignName:'尚未歸類',confidence:'low',reviewStatus:'suggested',url:media.permalink||'',permalink:media.permalink||null,lastSource:'instagram-api',lastUpdatedAt:new Date().toISOString()});
  }
  if(!response.data.length) warnings.push('Instagram API 未回傳內容；僅支援 Professional account。');
  return {platform:'Instagram',contents,account:{followers,reach:contents.reduce((s,x)=>s+x.reach,0),views:contents.reduce((s,x)=>s+x.views,0),engagement:contents.reduce((s,x)=>s+x.engagement,0)},warnings};
}
