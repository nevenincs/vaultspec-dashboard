import { chromium } from "playwright";
const b = await chromium.launch({ args:["--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport:{width:1200,height:800} });
const errs=[]; p.on("pageerror",e=>errs.push("PE:"+e.message));
await p.goto("http://127.0.0.1:5176/three.html",{waitUntil:"networkidle"});
await p.waitForTimeout(1500);
async function run(N){
  await p.evaluate((n)=>[...document.querySelectorAll("button")].find(x=>x.textContent===n)?.click(), N);
  await p.waitForTimeout(600);
  return await p.evaluate((cfg)=>{
    const f=window.__threeField,s=f.solver,r=f.renderer;
    f.running=false;
    const count=s.count, n=s.texSize*s.texSize*4, vel=new Float32Array(n);
    let heat=1; const pvx=new Float32Array(count),pvy=new Float32Array(count); let have=false;
    const series=[];
    for(let t=0;t<cfg.ticks;t++){
      s.tick(heat, cfg.safety); heat*=(1-cfg.decay);
      s.readVelocities(r,vel);
      let sum=0,mx=0,rev=0,fin=0;
      for(let i=0;i<count;i++){const vx=vel[i*4],vy=vel[i*4+1];const sp=Math.hypot(vx,vy);if(Number.isFinite(sp)){sum+=sp;if(sp>mx)mx=sp;fin++;}if(have&&(vx*pvx[i]+vy*pvy[i])<0)rev++;pvx[i]=vx;pvy[i]=vy;}
      have=true;
      if(t<4||t%25===0||t===cfg.ticks-1) series.push({t,heat:+heat.toFixed(3),meanSpd:+(sum/fin).toFixed(3),maxSpd:+mx.toFixed(2),revFrac:+(rev/count).toFixed(3)});
    }
    return {count, series};
  }, {ticks:320, decay:0.0228, safety:200});
}
for(const N of ["500","5000"]){
  const r=await run(N);
  console.log("=== N="+N+" (count "+r.count+") ===");
  for(const s of r.series) console.log(`t=${String(s.t).padStart(3)} heat=${String(s.heat).padEnd(5)} meanSpd=${String(s.meanSpd).padEnd(7)} maxSpd=${String(s.maxSpd).padEnd(8)} revFrac=${s.revFrac}`);
}
console.log("errs",JSON.stringify(errs));
await b.close();
