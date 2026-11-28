const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),c=await b.newContext({viewport:{width:420,height:900},acceptDownloads:true}),p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
await p.route(/fonts|gstatic|jsdelivr/,r=>r.abort());
await p.goto('file:///home/claude/smart-integrity-city/index.html');
await p.fill('#lName','ครู');await p.fill('#lCode','Solar1253');await p.click('[data-act=doLogin]');await p.waitForTimeout(600);
await p.evaluate(()=>{const r={code:'R1',owner:'ครู',lessonId:DB.lessons[0].id,status:'ended',endedAt:Date.now(),city:100,cityStart:100,log:[],players:[newPlayer('สมชาย','gov'),newPlayer('สมหญิง','doctor')]};DB.rooms.R1=r;save();});
// player view
await p.evaluate(()=>{const r=DB.rooms.R1;ui.pid=r.players[0].id;ui.code='R1';go('post',{tab:'mission'});});
await p.setInputFiles('[data-ev=think]','/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/ph0.jpg');await p.waitForTimeout(300);
console.log('preview shown',await p.evaluate(()=>!document.getElementById('pv_think').hidden));
await p.click('[data-act=sendEv][data-t=think]');await p.waitForTimeout(300);
console.log('no desc blocked',await p.evaluate(()=>!DB.rooms.R1.players[0].evidence.think));
await p.fill('[data-evd=think]','วางแผนก่อนทำงาน');await p.setInputFiles('[data-ev=think]','/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/ph0.jpg');await p.click('[data-act=sendEv][data-t=think]');await p.waitForTimeout(800);
console.log('sent',await p.evaluate(()=>Object.keys(DB.rooms.R1.players[0].evidence)),await p.innerText('.prog+p'));
await p.screenshot({path:'/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/ev_player.png',fullPage:true});
// teacher
await p.evaluate(()=>{ui.tRoom='R1';go('teacher',{tTab:'review'});});
await p.click('[data-act=tsOpen][data-k$="|public"] >> nth=0').catch(()=>{});
await p.evaluate(()=>{const r=DB.rooms.R1;ui.tsend='R1|'+r.players[1].id+'|honesty';render();});
await p.setInputFiles('#tsFile','/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/ph1.jpg');await p.fill('#tsDesc','คืนกระเป๋าที่เก็บได้');await p.click('[data-act=tSend]');await p.waitForTimeout(800);
console.log('proxy sent',await p.evaluate(()=>JSON.stringify(DB.rooms.R1.players[1].evidence.honesty&&DB.rooms.R1.players[1].evidence.honesty.status)));
await p.click('[data-act=revAll][data-code=R1]:not([data-pid])');await p.waitForTimeout(300);
console.log('all approved',await p.evaluate(()=>DB.rooms.R1.players.map(x=>Object.values(x.evidence).map(e=>e.status))));
await p.screenshot({path:'/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/ev_teacher.png',fullPage:true});
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('[data-act=zipEv]')]);await dl.saveAs('/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/ev.zip');
console.log('errors',errs);await b.close();})();
