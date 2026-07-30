import { chromium } from "playwright";
const b = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport:{width:1200,height:800} });
const errs=[]; p.on("pageerror",e=>errs.push("PE:"+e.message));
await p.goto("http://127.0.0.1:5176/three.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1500);
async function conv(N){
  await p.evaluate((n)=>[...document.querySelectorAll("button")].find(x=>x.textContent===n)?.click(), N);
  await p.waitForTimeout(500);
  const r = await p.evaluate(()=>window.__threeField.diagnose(400));
  const idx=[0,5,10,25,50,100,150,200,300,399];
  console.log("=== convergence N="+N+" ===");
  for(const t of idx) console.log(`t=${String(t).padStart(3)} meanDisp=${String(r.meanDisplacement[t]).padEnd(8)} totalSwing=${String(r.totalSwinging[t]).padEnd(10)} speed=${r.speed[t]}`);
}
await conv("500");
await conv("5000");
// DRAG LOCALITY: settle 500, pin a node, displace it, step, measure who moves.
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>x.textContent==="500")?.click());
await p.waitForTimeout(500);
const loc = await p.evaluate(()=>{
  const f=window.__threeField,s=f.solver,r=f.renderer;
  f.diagnose(400); // settle
  const n=s.texSize*s.texSize*4; const a=new Float32Array(n); s.readPositions(r,a);
  // pick a document node + a neighbor + a far non-neighbor
  const di=f.nodes.findIndex(x=>x.kind==="document"); const id=f.nodes[di].id;
  const nbr=[...(f.neighbors.get(id)||[])]; const ni=f.idToIndex.get(nbr[0]);
  let far=-1; for(let i=0;i<f.nodes.length;i++){const nid=f.nodes[i].id; if(nid!==id && !nbr.includes(nid)){far=i;break;}}
  // displace dragged node far from its spot and pin; step 60 ticks
  const dragTo=[a[di*4]+400, a[di*4+1]+300];
  s.setDrag(di, dragTo[0], dragTo[1]);
  for(let t=0;t<60;t++) s.tick(r);
  const c=new Float32Array(n); s.readPositions(r,c);
  s.clearDrag();
  const d=(i)=>+Math.hypot(c[i*4]-a[i*4], c[i*4+1]-a[i*4+1]).toFixed(1);
  return { draggedMoved:d(di), neighborMoved:d(ni), farMoved:d(far), count:s.count };
});
console.log("=== drag locality (500) ===", JSON.stringify(loc));
console.log("errs", JSON.stringify(errs));
await b.close();
