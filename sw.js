/* IlSboboz service worker.
   - La pagina (index.html) è "network-first": se sei online ricevi sempre
     l'ultima versione (importante: nel multigiocatore tutti devono avere la
     stessa versione), se sei offline parte quella in cache (si gioca contro i bot).
   - Icone, manifest e font: "stale-while-revalidate".
   - L'mp3 e tutto il resto (PeerJS, ecc.) non vengono toccati. */
const VERSION = 'ilsboboz-v4';
const CORE = ['./', 'index.html', 'manifest.json', 'icona.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(VERSION).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin===self.location.origin;
  const isFont = url.hostname==='fonts.googleapis.com' || url.hostname==='fonts.gstatic.com';
  if(!sameOrigin && !isFont) return;
  if(sameOrigin && /\.(mp3|ogg|wav|m4a)$/i.test(url.pathname)) return;   // niente cache per l'audio (richieste Range)

  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(VERSION).then(c=>c.put('index.html', copy));
        return res;
      }).catch(()=>caches.match('index.html').then(r=>r || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit=>{
      const net = fetch(req).then(res=>{
        if(res && (res.ok || res.type==='opaque')){ const copy = res.clone(); caches.open(VERSION).then(c=>c.put(req, copy)); }
        return res;
      }).catch(()=>hit);
      return hit || net;
    })
  );
});
