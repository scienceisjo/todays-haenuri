const CACHE='school-shell-v3';
// 배포 경로(예: /todays-haenuri/)에 상대적인 앱 화면 파일만 캐시한다. 데이터(Supabase)와 첨부는 캐시하지 않는다.
const BASE=new URL('./',self.location).pathname;
const SHELL=['','index.html','app.js','styles.css','config.js','vendor/supabase.js','lib/core.js','lib/series.js','lib/import.js','lib/data.js','logo.png','icon-192.png','icon-512.png','manifest.webmanifest'].map(p=>BASE+p);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('school-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
