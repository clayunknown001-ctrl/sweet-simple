/**
 * AI Radar — Monitor v9.0
 * Harmful-only blocking: confirmed unsafe media is fully blocked; safe media is untouched.
 */
(function () {
  "use strict";
  if (window.__AI_RADAR_LOADED__) return;
  window.__AI_RADAR_LOADED__ = true;
  if (/^(chrome|edge|about|moz-extension|chrome-extension)/.test(location.protocol)) return;

  const API_BASE = "https://iwyntbeqdvsbzvmskpaw.supabase.co/functions/v1";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJpwyntbeqdvsbzvmskpawIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NDkyOTYsImV4cCI6MjA4ODAyNTI5Nn0.dwvan4-1Mifxo6r3WzFqxmdMiByJ63h1Jk4rkvUrc0g";
  const MIN = 96, MAX_ACTIVE = 6, CACHE_TTL = 30 * 60 * 1000, CLOUD_LIMIT = 24;
  const STOP = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "auxclick", "contextmenu"];
  const st = { paused:false, active:0, q:[], cache:new Map(), seen:new WeakMap(), overlays:new WeakMap(), nsfw:false, rid:0, wait:new Map(), cloud:0, cloudOff:false, stats:{totalBlocked:0,localBlocked:0,cloudBlocked:0,localApproved:0} };

  addStyle(); loadStats(); injectLoader(); start();
  console.log("[AI Radar] v9.0 loaded — harmful-only image/video shield");

  function addStyle(){
    if (document.getElementById("ai-radar-core-style")) return;
    const s=document.createElement("style"); s.id="ai-radar-core-style";
    s.textContent=`.ai-radar-hidden-media{visibility:hidden!important}.ai-radar-overlay{position:absolute!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;background:rgba(10,15,28,.97)!important;color:#fff!important;font:12px ui-monospace,SFMono-Regular,Menlo,monospace!important;text-align:center!important;padding:8px!important;border:2px solid #ef4444!important;border-radius:6px!important;box-shadow:0 0 0 1px rgba(239,68,68,.4),0 0 18px rgba(239,68,68,.3)!important;pointer-events:auto!important;cursor:not-allowed!important;user-select:none!important;overflow:hidden!important}.ai-radar-overlay .ico{font-size:22px;margin-bottom:2px}.ai-radar-overlay .ttl{font-weight:700;color:#fca5a5;letter-spacing:1px;font-size:11px}.ai-radar-overlay .rsn{opacity:.82;font-size:10px;max-width:92%;line-height:1.25;margin-top:2px}`;
    (document.head||document.documentElement).appendChild(s);
  }
  function loadStats(){try{chrome.storage?.local?.get?.(["totalBlocked","localBlocked","cloudBlocked","localApproved","paused"],s=>{Object.assign(st.stats,{totalBlocked:s?.totalBlocked||0,localBlocked:s?.localBlocked||0,cloudBlocked:s?.cloudBlocked||0,localApproved:s?.localApproved||0});st.paused=!!s?.paused;});chrome.storage?.onChanged?.addListener?.((c,a)=>{if(a==="local"&&c.paused)st.paused=!!c.paused.newValue;});}catch{}}
  function save(extra={}){try{chrome.storage?.local?.set?.({...st.stats,...extra});}catch{}}
  function blocked(kind,reason){st.stats.totalBlocked++; if(kind==="cloud")st.stats.cloudBlocked++; else st.stats.localBlocked++; save({lastBlock:{reason,host:location.hostname,ts:Date.now()}});}

  function injectLoader(){try{const u=chrome.runtime?.getURL?.("nsfw-loader.js"); if(!u)return; const s=document.createElement("script");s.src=u;s.onload=()=>s.remove();(document.head||document.documentElement).appendChild(s);}catch{}}
  window.addEventListener("ai-radar-nsfw-ready",()=>{st.nsfw=true; sweep();});
  window.addEventListener("message",e=>{if(e.source!==window||e.data?.__aiRadar!=="result")return; const cb=st.wait.get(e.data.id); if(cb){st.wait.delete(e.data.id);cb(e.data);}});
  function classify(src,ms=4500){return new Promise(res=>{if(!st.nsfw)return res({error:"not-ready"}); const id=++st.rid,t=setTimeout(()=>{st.wait.delete(id);res({error:"timeout"});},ms); st.wait.set(id,m=>{clearTimeout(t);res(m);}); window.postMessage({__aiRadar:"classify",id,src},"*");});}
  function fetchDataUrl(url){return new Promise(res=>{try{chrome.runtime?.sendMessage?.({type:"fetch-image",url},r=>{if(chrome.runtime?.lastError||!r?.ok)return res(null); res(r.dataUrl||null);});}catch{res(null);}});}
  async function classifyUrl(url){let r=await classify(url); if(r?.preds)return r; if(!url.startsWith("data:")){const d=await fetchDataUrl(url); if(d){r=await classify(d); if(r?.preds)return {...r,dataUrl:d};}} return r;}

  const strong=/\b(porn|porno|xxx|hentai|nsfw|nude|naked|topless|onlyfans|camgirl|escort|blowjob|masturbat|orgasm|anal|pussy|penis|cock|boobs|nipple|tits|gore|behead|yalangoch|yalang'och|behayo|порно|голая|голый|обнаж|топлесс)\b/i;
  const soft=/\b(sexy|hot girl|sexy girl|lingerie|thong|bikini|swimsuit|cleavage|booty|twerk|grinding|erotic|seductive|bodycon|see[ -]?through|underwear|ichki kiyim|kupalnik|декольте|купальник)\b/i;
  const safe=/\b(motogp|formula1|f1|nascar|race|racing|football|soccer|basketball|cricket|tennis|olympic|news|documentary|tutorial|education|recipe|wikipedia|baby|family)\b/i;
  function text(el,url){const a=el.closest?.("a,[role='link'],ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,article");return [url,el.alt,el.title,el.getAttribute?.("aria-label"),a?.href,a?.title,a?.getAttribute?.("aria-label"),a?.textContent?.slice(0,240),document.title,location.href].filter(Boolean).join(" ");}
  function signal(t){t=String(t||"").toLowerCase(); if(strong.test(t))return 2; if(soft.test(t)&&!safe.test(t))return 1; return 0;}
  function score(preds, strict){if(!preds)return 0; const p=preds.Porn||0,h=preds.Hentai||0,s=preds.Sexy||0,n=preds.Neutral||0,d=preds.Drawing||0; let v=Math.max(p,h)*1.05+s*(strict?.soft?0.78:0.56); if(n>.82&&p<.55&&h<.55)v*=.55; if(d>.65&&p<.5&&h<.5)v*=.55; return Math.min(1,v);}

  function srcOf(el){if(el.tagName==="VIDEO")return videoPoster(el)||el.currentSrc||el.src||location.href; const ss=(el.srcset||"").split(",").map(x=>x.trim().split(/\s+/)[0]).filter(Boolean).pop(); return el.currentSrc||el.src||ss||el.getAttribute?.("data-src")||"";}
  function ytId(v){return String(v||"").match(/(?:watch\?v=|shorts\/|youtu\.be\/)([\w-]{6,})/)?.[1]||String(v||"").match(/[?&]v=([\w-]{6,})/)?.[1]||"";}
  function ytThumbs(id){return id?[`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,`https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`,`https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`]:[];}
  function videoPoster(v){if(v.poster&&!v.poster.startsWith("blob:"))return v.poster; return ytThumbs(ytId([v.closest?.("a")?.href,v.closest?.("ytd-watch-flexy,ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer")?.innerHTML?.slice(0,1000),location.href].filter(Boolean).join(" ")))[0]||"";}
  function keyOf(el){return el.tagName+":"+srcOf(el)+":"+(el.tagName==="VIDEO"?ytId(location.href):"");}
  function eligible(el){if(!el?.isConnected||st.paused)return false; const r=el.getBoundingClientRect(),w=r.width||el.naturalWidth||el.videoWidth||0,h=r.height||el.naturalHeight||el.videoHeight||0; if(Math.max(w,h)<MIN)return false; if(el.tagName==="IMG")return !!srcOf(el)&&!srcOf(el).startsWith("data:image/svg"); return el.tagName==="VIDEO";}
  function cached(k){const v=st.cache.get(k); if(!v)return null; if(Date.now()-v.t>CACHE_TTL){st.cache.delete(k);return null;} return v;}
  function setCache(k,b,r){st.cache.set(k,{b,r,t:Date.now()}); if(st.cache.size>1500)st.cache.delete(st.cache.keys().next().value);}

  function enqueue(el){if(!eligible(el))return; const k=keyOf(el),old=st.seen.get(el); if(old===k)return; const c=cached(k); if(c){st.seen.set(el,k); if(c.b)shield(el,c.r); return;} st.seen.set(el,k); st.q.push(el); pump();}
  function pump(){while(st.active<MAX_ACTIVE&&st.q.length){const el=st.q.shift(); st.active++; scan(el).finally(()=>{st.active--;pump();});}}
  async function scan(el){const k=keyOf(el),url=srcOf(el),ctx=text(el,url),sig=signal(ctx); if(sig===2)return finish(el,k,true,"Explicit media/context","local");
    if(el.tagName==="IMG")return scanImage(el,k,url,sig,ctx);
    return scanVideo(el,k,url,sig,ctx);
  }
  async function scanImage(img,k,url,sig,ctx){let dataUrl=null,visual=false; const r=await classifyUrl(url); if(r?.preds){dataUrl=r.dataUrl||null; const sc=score(r.preds,{soft:sig>0}); if(sc>=(sig?0.62:0.78))return finish(img,k,true,"Local NSFW detector","local"); visual=sc>=(sig?0.38:0.55);} const skin=await skinRatio(dataUrl||img); if((sig||visual)&&skin>.22){const c=await cloud(url,dataUrl); if(c.should_block)return finish(img,k,true,c.block_reason||"Cloud safety filter","cloud");}
    if(sig&&skin>.38)return finish(img,k,true,"Revealing visual content","local"); finish(img,k,false);}
  async function scanVideo(v,k,url,sig,ctx){const posters=[url,...ytThumbs(ytId(ctx))].filter(Boolean); for(const u of posters.slice(0,3)){const r=await classifyUrl(u); if(r?.preds&&score(r.preds,{soft:sig>0})>=(sig?0.58:0.76))return finish(v,k,true,"Unsafe video thumbnail","local"); if(sig){const c=await cloud(u,r?.dataUrl); if(c.should_block)return finish(v,k,true,c.block_reason||"Unsafe video thumbnail","cloud");}}
    const times=[300,1200,2600,5200]; times.forEach(ms=>setTimeout(()=>sampleVideo(v,k,sig),ms)); ["playing","timeupdate"].forEach(ev=>v.addEventListener(ev,()=>sampleVideo(v,k,sig),{passive:true})); finish(v,k,false);}
  async function sampleVideo(v,k,sig){if(!v.isConnected||st.overlays.has(v)||v.readyState<2)return; const data=frame(v); if(!data)return; const r=await classify(data,3500); if(r?.preds&&score(r.preds,{soft:sig>0})>=(sig?0.58:0.76))return finish(v,k,true,"Unsafe video frame","local"); if(sig){const c=await cloud("",data); if(c.should_block)return finish(v,k,true,c.block_reason||"Unsafe video frame","cloud");}}
  function frame(v){try{const c=document.createElement("canvas");c.width=224;c.height=224;c.getContext("2d").drawImage(v,0,0,224,224);return c.toDataURL("image/jpeg",.68);}catch{return null;}}
  async function skinRatio(src){try{const img=src instanceof HTMLImageElement?src:await loadImg(src); if(!img)return 0; const c=document.createElement("canvas");c.width=64;c.height=64;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0,64,64);const d=x.getImageData(0,0,64,64).data;let s=0;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2]; if(r>95&&g>35&&b>18&&r>g&&r>b&&(r-g)>12&&Math.max(r,g,b)-Math.min(r,g,b)>18)s++;}return s/4096;}catch{return 0;}}
  function loadImg(src){return new Promise(res=>{if(!src)return res(null); const i=new Image(); if(!src.startsWith("data:"))i.crossOrigin="anonymous"; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; setTimeout(()=>res(null),2500);});}
  function finish(el,k,b,reason,kind="local"){setCache(k,b,reason); if(b){shield(el,reason); blocked(kind,reason||"Harmful content");} else {st.stats.localApproved++; save();}}

  function canCloud(){if(st.cloudOff||st.cloud>=CLOUD_LIMIT)return false; st.cloud++; setTimeout(()=>{st.cloud=Math.max(0,st.cloud-1);},60000); return true;}
  async function cloud(url,dataUrl){if(!canCloud())return {should_block:false}; try{const body=dataUrl?{image_base64:dataUrl.split(",")[1],fast:true}:{image_url:url,fast:true}; const r=await fetch(`${API_BASE}/analyze-image`,{method:"POST",headers:{"Content-Type":"application/json",apikey:ANON_KEY,Authorization:"Bearer "+ANON_KEY},body:JSON.stringify(body)}); if(r.status===429){st.cloudOff=true;setTimeout(()=>st.cloudOff=false,300000);return {should_block:false};} if(!r.ok)return {should_block:false}; return r.json();}catch{return {should_block:false};}}

  function shield(t,reason){if(st.overlays.has(t))return; t.classList.add("ai-radar-hidden-media"); if(t.tagName==="VIDEO")try{t.pause();}catch{} const o=document.createElement("div"); o.className="ai-radar-overlay"; o.innerHTML=`<div class="ico">🛡️</div><div class="ttl">BLOCKED</div><div class="rsn">${esc(reason||"Harmful content")}</div>`; const eat=e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();}; STOP.forEach(e=>o.addEventListener(e,eat,{capture:true,passive:false})); document.body.appendChild(o); const rec={raf:0,overlay:o}; st.overlays.set(t,rec); const pos=()=>{if(!t.isConnected){o.remove();st.overlays.delete(t);return;} const r=t.getBoundingClientRect(); o.style.display=r.width&&r.height?"flex":"none"; o.style.left=r.left+scrollX+"px"; o.style.top=r.top+scrollY+"px"; o.style.width=r.width+"px"; o.style.height=r.height+"px"; rec.raf=requestAnimationFrame(pos);}; pos();}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  STOP.forEach(e=>document.addEventListener(e,ev=>{if(ev.target?.closest?.(".ai-radar-overlay")){ev.preventDefault();ev.stopPropagation();}},true));
  function sweep(){document.querySelectorAll?.("img,video")?.forEach(enqueue);}
  function start(){const mo=new MutationObserver(ms=>{for(const m of ms){m.addedNodes?.forEach(n=>{if(n.nodeType!==1)return; if(n.matches?.("img,video"))enqueue(n); n.querySelectorAll?.("img,video").forEach(enqueue);}); if(m.type==="attributes"&&m.target?.matches?.("img,video")){st.seen.delete?.(m.target); enqueue(m.target);}}}); const boot=()=>{try{mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src","srcset","poster"]});}catch{} sweep(); setInterval(sweep,2000);}; document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot,{once:true}):boot();}
})();