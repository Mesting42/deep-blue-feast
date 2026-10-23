import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// 构建后读取实际哈希资源，避免离线包遗漏打包器生成的 JS/CSS 文件。
const assets = (await readdir('dist/assets')).map((name) => `/assets/${name}`);
const files = [
  '/',
  '/index.html',
  '/mark.svg',
  '/ocean-keyart.webp',
  '/coral.webp',
  '/kelp.webp',
  '/rift.webp',
  ...assets,
];
const hash = createHash('sha256')
  .update(await readFile('dist/index.html'))
  .digest('hex')
  .slice(0, 10);
const source = `const CACHE='deep-blue-offline-${hash}';
// 加版本查询参数穿过旧 SW 的缓存，再以标准路径入库，确保 HTML 与哈希资源同版。
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(cache=>Promise.all(${JSON.stringify(files)}.map(async path=>{const response=await fetch(path+'?offline=${hash}',{cache:'reload'});if(!response.ok)throw new Error('Offline resource '+path);await cache.put(path,response);}))).then(()=>self.skipWaiting()));});
// 保留上一版本资源，避免已有页面在新 SW 激活期间仍请求旧哈希而出现空白。
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>{const previous=keys.filter(k=>k.startsWith('deep-blue-offline-')&&k!==CACHE).slice(-1);return Promise.all(keys.filter(k=>k.startsWith('deep-blue-offline-')&&k!==CACHE&&!previous.includes(k)).map(k=>caches.delete(k)));}).then(()=>self.clients.claim()));});
// 静态资源不随 Origin 改变；忽略开发预览的 Vary: Origin，兼容模块脚本的 CORS 请求。
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html',{ignoreVary:true}))));return;}e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true})).then(hit=>hit||caches.match(e.request,{ignoreVary:true})).then(hit=>hit||fetch(e.request)));});
`;
await writeFile('dist/sw.js', source);
console.log(`Offline cache: ${files.length} local files, version ${hash}`);
