const fs=require('fs');global.window=undefined;
eval(fs.readFileSync(__dirname+'/../data.js','utf8').replace(/^const /gm,'global.'));
const C=require('../core.js');
const D=require('./exam_samples.json');
const rows=[];
for(const g of D){const q=global.DEFAULT_LESSON[g.set][g.idx];for(const s of g.samples)rows.push({set:g.set,idx:g.idx,kind:s.kind,label:s.label,key:C.scoreExam(s.text,q).score,rev:C.reversed(s.text,q),final:C.scoreExam2(s.text,q).score,sim:C.similarity(s.text,q)});}
module.exports=rows;
if(require.main===module){
 const th={t1:+process.argv[2]||.15,t2:+process.argv[3]||.3,t3:+process.argv[4]||.45};
 const ev=(f)=>{let ex=0,w1=0;const cm=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];rows.forEach(r=>{const p=f(r);cm[r.label][p]++;if(p===r.label)ex++;if(Math.abs(p-r.label)<=1)w1++;});return {exact:ex,within1:w1,n:rows.length,cm};};
 const modes={final:r=>r.final,keyword:r=>r.key,sim:r=>C.simScore(r.sim,th),max:r=>Math.max(r.key,C.simScore(r.sim,th)),avg:r=>Math.round((r.key+C.simScore(r.sim,th))/2)};
 for(const [k,f] of Object.entries(modes)){const e=ev(f);console.log(k,'exact',e.exact+'/'+e.n,'±1',e.within1+'/'+e.n);console.log(' rows=label cols=pred',JSON.stringify(e.cm));}
 console.log('sim by label avg:',[0,1,2,3].map(l=>{const a=rows.filter(r=>r.label==l).map(r=>r.sim);return l+':'+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2)+' ['+Math.min(...a).toFixed(2)+'-'+Math.max(...a).toFixed(2)+']';}).join('  '));
}
