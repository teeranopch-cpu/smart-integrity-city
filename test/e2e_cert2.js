const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),p=await (await b.newContext({viewport:{width:1100,height:900}})).newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
await p.route(/fonts|gstatic|jsdelivr/,r=>r.abort());
await p.goto('file:///home/claude/smart-integrity-city/index.html');
await p.fill('#lName','ครู');await p.fill('#lCode','Solar1253');await p.click('[data-act=doLogin]');await p.waitForTimeout(600);
await p.evaluate(()=>go('teacher',{tTab:'cert'}));
await p.setInputFiles('#certFile','/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/user_tpl.jpg');await p.waitForSelector('#certPrev');
await p.click('[data-act=certSel][data-k=s0]');await p.setInputFiles('#sigFile','/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/sig_a.png');await p.waitForSelector('img.csig');
await p.click('[data-act=certSel][data-k=s1]');await p.setInputFiles('#sigFile','/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/sig_b.png');await p.waitForFunction(()=>document.querySelectorAll('img.csig').length==2);
// drag sig 2 slightly
const bx=await p.locator('#certPrev').boundingBox();await p.mouse.move(bx.x+bx.width*0.78,bx.y+bx.height*0.83);await p.mouse.down();await p.mouse.up();
await p.click('[data-act=certSel][data-k=date]');await p.fill('[data-cert=cdt]','');
await p.click('[data-act=certSave]');await p.waitForTimeout(300);
console.log('saved',await p.evaluate(()=>{const c=DB.lessons[0].cert;return JSON.stringify({d:c.date,s:c.sig.map(s=>({x:s.x,y:s.y,w:s.w,len:s.img.length})),img:c.img.length})}));
await p.screenshot({path:'/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/cert2_teacher.png',fullPage:true});
await p.evaluate(()=>{const r={code:'R1',owner:'ครู',lessonId:DB.lessons[0].id,status:'ended',endedAt:Date.now(),city:100,cityStart:100,log:[],players:[newPlayer('สมชาย ใจดี','gov')]};DB.rooms.R1=r;ui.pid=r.players[0].id;ui.code='R1';window.totalScore=()=>({post:30,ev:5,total:35,max:35,pass:true});DB.session={role:'player',name:'สมชาย ใจดี'};go('post',{tab:'cert'});});
await p.waitForSelector('.certT');await p.waitForTimeout(400);
await p.locator('.certT').screenshot({path:'/tmp/claude-0/-home-claude/d6ae1287-04fa-5adb-af3e-8b4577102c9a/scratchpad/cert2_student.png'});
console.log('errors',errs);await b.close();})();
