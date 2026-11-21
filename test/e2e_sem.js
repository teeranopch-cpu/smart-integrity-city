const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');const srv=http.createServer((q,r)=>{let u=q.url.split('?')[0];if(u==='/')u='/index.html';const f=u==='/exam_samples.json'?path.join(__dirname,'exam_samples.json'):path.join(root,u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.json')?'application/json':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d);});});
srv.listen(0,async()=>{const port=srv.address().port;try{await main(port);}catch(e){console.error(e);process.exitCode=1;}srv.close();});
async function main(port){const b=await chromium.launch(),p=await (await b.newContext()).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
await p.route(/fonts|gstatic|jsdelivr/,r=>r.abort());
await p.goto('http://localhost:'+port+'/',{waitUntil:'load'});
await p.evaluate(()=>{DB.session={role:'teacher',name:'ครู'};save();go('home');});
await p.evaluate(()=>{ui.lessonId=DB.lessons[0].id;go('teacher',{tTab:'calib'});});
console.log('card shown',await p.evaluate(()=>document.body.innerText.includes('ตรวจเชิงความหมาย')));
await p.click('[data-act=semLoad]');await p.waitForTimeout(500);console.log('load fail handled',await p.evaluate(()=>SicSemantic.status().state),errs);
await p.evaluate(()=>{SicSemantic._setEmbedder(async t=>{const v=new Array(64).fill(0),s=String(t);for(let i=0;i<s.length-1;i++)v[(s.charCodeAt(i)*31+s.charCodeAt(i+1))%64]++;const n=Math.hypot(...v)||1;return v.map(x=>x/n);});SicSemantic.setEnabled(true);render();});
await p.click('[data-act=semBench]');await p.waitForFunction(()=>/ตรง \d+\/\d+/.test(ui.semOut||'')||/ผิดพลาด/.test(ui.semOut||''));console.log(await p.evaluate(()=>ui.semOut));
await p.click('[data-act=semFit]');await p.waitForFunction(()=>/บันทึกเกณฑ์ใหม่/.test(ui.semOut||''));console.log(await p.evaluate(()=>ui.semOut+' | '+JSON.stringify(DB.lessons[0].exam)));
console.log('eval path',await p.evaluate(async()=>{const L=DB.lessons[0];const r=await evaluateExam(L.pretest[0].ans,L,'pre',L.pretest[0]);return JSON.stringify(r)}));
console.log('errors',errs);await b.close();}
