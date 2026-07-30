import { chromium } from "playwright";
const b = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport:{width:1200,height:800} });
const errs=[]; p.on("pageerror",e=>errs.push("PE:"+e.message));
await p.goto("http://127.0.0.1:5176/three.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1500);
// EXPERIMENT: hold heat FIXED (forces full, no cooling). Does damping alone drive
// the system to equilibrium (meanSpd -> ~0)? Test several velocityDecay retains.
async function run(N, retain, heatFixed){
  await p.evaluate((n)=>[...document.querySelectorAll("button")].find(x=>x.textContent===n)?.click(), N);
  await p.waitForTimeout(600);
  return await p.evaluate((cfg)=>{
    const f=window.__threeField,s=f.solver,r=f.renderer;
    f.running=false;
    s.setParams({...{repulsion:36,linkDistance:26,linkStrength:0.16,centerGravity:0.03},velocityDecay:cfg.retain});
    const count=s.count, n=s.texSize*s.texSize*4, vel=new Float32Array(n);
    const pvx=new Float32Array(count),pvy=new Float32Array(count); let have=false;
    const series=[];
    for(let t=0;t<cfg.ticks;t++){
      s.tick(cfg.heat, 200);
      s.readVelocities(r,vel);
      let sum=0,mx=0,rev=0,fin=0;
      for(let i=0;i<count;i++){const vx=vel[i*4],vy=vel[i*4+1];const sp=Math.hypot(vx,vy);if(Number.isFinite(sp)){sum+=sp;if(sp>mx)mx=sp;fin++;}if(have&&(vx*pvx[i]+vy*pvy[i])<0)rev++;pvx[i]=vx;pvy[i]=vy;}
      have=true;
      if(t%50===0||t===cfg.ticks-1) series.push({t,meanSpd:+(sum/fin).toFixed(3),maxSpd:+mx.toFixed(1),revFrac:+(rev/count).toFixed(3)});
    }
    return {count, series};
  }, {ticks:500, retain, heat:heatFixed});
}
for(const retain of [0.6, 0.4, 0.2]){
  const r=await run("500", retain, 1.0);
  console.log(`=== N=500 heat=1(fixed) retain=${retain} ===`);
  for(const s of r.series) console.log(`t=${String(s.t).padStart(3)} meanSpd=${String(s.meanSpd).padEnd(8)} maxSpd=${String(s.maxSpd).padEnd(7)} revFrac=${s.revFrac}`);
}
console.log("errs",JSON.stringify(errs));
await b.close();
