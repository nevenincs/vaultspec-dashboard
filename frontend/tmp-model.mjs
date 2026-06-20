import { chromium } from "playwright";
const b = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport:{width:1200,height:800} });
const errs=[]; p.on("pageerror",e=>errs.push("PE:"+e.message));
await p.goto("http://127.0.0.1:5176/three.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1500);
const HEAD=49;
const read = ()=>p.evaluate(()=>{const f=window.__threeField,s=f.solver;const n=s.texSize*s.texSize*4;const buf=new Float32Array(n);s.readPositions(f.renderer,buf);return Array.from(buf.subarray(0,s.count*4));});
const meanDisp=(a,c)=>{let sum=0,k=0;for(let i=0;i<c;i++){const dx=a[1][i*4]-a[0][i*4],dy=a[1][i*4+1]-a[0][i*4+1];if(Number.isFinite(dx)){sum+=Math.hypot(dx,dy);k++;}}return +(sum/k).toFixed(3);};

// INIT jitter profile on 500: sample mean-disp over consecutive 250ms windows
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>x.textContent==="500")?.click());
const prof=[];
for(let w=0;w<8;w++){const a=await read();await p.waitForTimeout(250);const c=await p.evaluate(()=>window.__threeField.solver.count);prof.push(meanDisp([a,await read()],c));}
await p.waitForTimeout(4000);
const st1=await p.evaluate(()=>({running:window.__threeField.running, heat:+window.__threeField.heat.toFixed(4)}));

// LOCAL DRAG test: settled graph. Pick a document node + a FAR non-neighbour node.
const setup=await p.evaluate(()=>{const f=window.__threeField;const di=f.nodes.findIndex(n=>n.kind==="document");const id=f.nodes[di].id;const nbr=[...(f.neighbors.get(id)||[])];
  // find a node that is NOT id and NOT a neighbour (far/unrelated)
  let farI=-1;for(let i=0;i<f.nodes.length;i++){const nid=f.nodes[i].id;if(nid!==id&&!nbr.includes(nid)){farI=i;break;}}
  const c=f.camera;const s2c=(i)=>{const wx=f.cpuPositions[i*4],wy=f.cpuPositions[i*4+1];const hw=(c.right-c.left)/2/c.zoom,hh=(c.top-c.bottom)/2/c.zoom;return {x:((wx-c.position.x)/hw*0.5+0.5)*f.width,y:(1-((wy-c.position.y)/hh*0.5+0.5))*f.height};};
  return {di, ni:f.idToIndex.get(nbr[0]), farI, screen:s2c(di)};});
const before=await read();
await p.mouse.move(setup.screen.x, setup.screen.y+HEAD); await p.mouse.down();
for(let k=1;k<=12;k++){await p.mouse.move(setup.screen.x+20*k, setup.screen.y+HEAD-10*k);await p.waitForTimeout(35);}
await p.mouse.up(); await p.waitForTimeout(1500);
const after=await read();
const dist=(i)=>+Math.hypot(after[i*4]-before[i*4], after[i*4+1]-before[i*4+1]).toFixed(1);

// PAUSE/RESUME energy test on settled graph
await p.waitForTimeout(500); const preP=await read();
await p.evaluate(()=>{const c=window.__threeField.controller;c.command({kind:"set-simulation-active",active:false});});
await p.waitForTimeout(200);
await p.evaluate(()=>{const c=window.__threeField.controller;c.command({kind:"set-simulation-active",active:true});});
await p.waitForTimeout(600);
const postP=await read();
const c=await p.evaluate(()=>window.__threeField.solver.count);
const resumeDisp=meanDisp([preP,postP],c);

console.log(JSON.stringify({initJitterProfile:prof, afterSettle:st1, drag:{dragged:dist(setup.di), neighbor:dist(setup.ni), farNode:dist(setup.farI)}, resumeMeanDisp:resumeDisp, errs}, null, 2));
await b.close();
