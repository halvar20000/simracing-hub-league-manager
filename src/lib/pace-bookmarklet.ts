/**
 * The pace-reference bookmarklet (iRacing Series Insights → Pace Analysis →
 * clipboard). Kept as plain JS text — NOT a compiled function's toString(),
 * which the build could rewrite with helpers that don't exist on iRacing's page.
 *
 * v1 (until 2026-10-12) only looked in performance.getEntriesByType("resource")
 * for a URL containing "pace_analysis". That failed for Johann Solowej with the
 * chart on screen: the browser keeps just 250 resource entries by default, and
 * iRacing's single-page app fills that long before you reach the chart, so the
 * request was never recorded ("Open the Pace Analysis chart first…").
 *
 * v2:
 *   1. raises the resource buffer, matches /pace[-_]?analysis/i and accepts a
 *      response only if it LOOKS like a pace curve (`line` array + event_type
 *      or race_week_num) — robust to a renamed endpoint;
 *   2. otherwise hooks fetch + XMLHttpRequest and asks the user to switch the
 *      chart's Race week once: the refetch is captured by shape;
 *   3. copies to the clipboard, and when the browser refuses (no user gesture
 *      after an async wait) opens an overlay with the JSON and a Copy button.
 * No '#' anywhere in the script: some browsers cut a javascript: URL at '#'.
 * Stamps `_cls` (grabbed_at, page title, URL) exactly like v1.
 */
const SRC = [
  "(async()=>{",
  "const RX=/pace[-_]?analysis/i;",
  "const ok=j=>!!j&&typeof j==='object'&&Array.isArray(j.line)&&('event_type' in j||'race_week_num' in j);",
  "const stamp=j=>{j._cls={grabbed_at:new Date().toISOString(),page_title:document.title,url:location.href};return JSON.stringify(j)};",
  "const msg=j=>'Copied: '+j.line.length+' points, event_type '+j.event_type+', week '+j.race_week_num;",
  "const show=(t,j)=>{const d=document.createElement('div');d.style.cssText='position:fixed;inset:24px;z-index:2147483647;background:rgb(24,24,27);color:rgb(250,250,250);padding:16px;border:2px solid rgb(255,107,53);border-radius:8px;font:14px sans-serif;display:flex;flex-direction:column;gap:8px';",
  "const p=document.createElement('div');p.textContent='CLS pace reference captured — '+j.line.length+' points, event_type '+j.event_type+', week '+j.race_week_num+'. Click the button, then paste into CLS.';",
  "const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='flex:1;font:11px monospace;color:rgb(17,17,17);background:white';",
  "const b=document.createElement('button');b.textContent='Copy to clipboard & close';b.style.cssText='padding:10px;background:rgb(255,107,53);color:black;border:0;border-radius:4px;font-weight:bold;cursor:pointer';",
  "b.onclick=async()=>{try{await navigator.clipboard.writeText(t)}catch(_){ta.select();document.execCommand('copy')}d.remove()};",
  "d.append(p,ta,b);document.body.append(d)};",
  "const done=async j=>{const t=stamp(j);try{await navigator.clipboard.writeText(t);alert(msg(j))}catch(_){show(t,j)}};",
  "try{performance.setResourceTimingBufferSize(5000)}catch(_){}",
  "const urls=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>RX.test(n)).reverse();",
  "for(const u of urls){try{const j=await fetch(u,{credentials:'include'}).then(r=>r.json());if(ok(j)){await done(j);return}}catch(_){}}",
  "if(window.__clsPace){alert('CLS is already listening — switch the Race week in the Pace Analysis chart once.');return}",
  "window.__clsPace=1;",
  "const hit=j=>{if(!ok(j)||window.__clsPaceDone)return;window.__clsPaceDone=1;show(stamp(j),j)};",
  "const of=window.fetch;window.fetch=async function(...a){const r=await of.apply(this,a);try{r.clone().json().then(hit,()=>{})}catch(_){}return r};",
  "const os=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(...a){this.addEventListener('load',()=>{try{const v=this.response;hit(v&&typeof v==='object'&&!(v instanceof ArrayBuffer)&&!(v instanceof Blob)?v:JSON.parse(this.responseText))}catch(_){}});return os.apply(this,a)};",
  "alert('CLS: the chart data is not in this page yet. Now switch the Race week (or Car class) in the Pace Analysis chart once - the data is captured and a copy window opens.');",
  "})()",
].join("");

export const PACE_BOOKMARKLET = `javascript:${SRC}`;
