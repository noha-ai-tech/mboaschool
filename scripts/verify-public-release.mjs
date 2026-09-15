import fs from 'node:fs/promises';
// Protected previews are checked in the authenticated browser, not counted
// as successful when their HTTP request redirects to Vercel login.
const bases = ['https://ecoles237.com'];
const paths = ['/','/recherche','/preinscription','/suivi-admission','/contact','/qui-sommes-nous','/categorie/secondaire','/ecole/268aa2ea-315c-4a3f-a959-7ef1e0f00f49'];
const results=[];
for (const base of bases) {
  for (const path of paths) {
    const response=await fetch(base+path,{signal:AbortSignal.timeout(30000)});
    const html=await response.text();
    const result={url:base+path,status:response.status,title:html.match(/<title>(.*?)<\/title>/)?.[1]};
    if(path==='/preinscription') {
      const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]).filter(s=>s.includes('/preinscription/'));
      result.formBundles=await Promise.all(scripts.map(async src=>{
        const js=await (await fetch(new URL(src,base))).text();
        return {src,rpc:js.includes('submit_public_application'),directInsert:js.includes('.insert(')};
      }));
    }
    results.push(result);
  }
}
await fs.writeFile('../release-public-http.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.status!==200 || (r.formBundles && !r.formBundles.some(b=>b.rpc && !b.directInsert)))) process.exitCode=1;
