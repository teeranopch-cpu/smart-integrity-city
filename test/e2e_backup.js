const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),c=await b.newContext({acceptDownloads:true}),p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());await p.route(/fonts/,r=>r.abort());
await p.goto('file:///home/claude/smart-integrity-city/index.html',{waitUntil:'load'});
await p.fill('#lEmail','t@x.com');await p.fill('#lCode','Solar1253');await p.click('[data-act=doLogin]');
await p.evaluate(()=>{DB.rooms.R1={code:'R1',owner:'ครู',lessonId:DB.lessons[0].id,status:'lobby',city:100,cityStart:100,log:[],players:[newPlayer('สมชาย','gov')]};save();go('teacher',{tTab:'export'});});
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('[data-act=backup]')]);const f='/tmp/sic-backup-test.json';await dl.saveAs(f);
await p.evaluate(()=>{delete DB.rooms.R1;save();});console.log('after delete',await p.evaluate(()=>!!DB.rooms.R1));
await p.setInputFiles('#restoreFile',f);await p.waitForFunction(()=>DB.rooms.R1);console.log('restored',await p.evaluate(()=>DB.rooms.R1.players[0].name),'errors',errs);await b.close();})();
