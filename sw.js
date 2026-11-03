const CACHE='brinque-app-v37';
const FILES=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('brinque-app-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));return response;}).catch(()=>caches.match('./index.html')));
 }else{
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
 }
});

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{}}catch(_){data={body:event.data?event.data.text():''}}
 const title=data.title||'Brinque App';
 const options={
  body:data.body||'Há uma atualização na equipe da sua empresa.',
  tag:data.tag||'brinque-notification',
  data:{url:data.url||'https://vbf1.github.io/brinque-app/'},
  renotify:false
 };
 event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=event.notification.data&&event.notification.data.url?event.notification.data.url:'https://vbf1.github.io/brinque-app/';
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windowClients=>{
  for(const client of windowClients){
   if(client.url.startsWith('https://vbf1.github.io/brinque-app/'))return client.focus();
  }
  return clients.openWindow(target);
 }));
});
