/* NSGA-II multi-objective genetic algorithm + helpers to pose device-design problems on nmos_model.js.
   Shared by planar_nmos_bench.html and tests/. Deterministic for a given seed. */
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.NMOS_OPT=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";

/* ---------- random numbers (mulberry32) ---------- */
function rng(seed){let a=seed>>>0;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}

/* ---------- variable encoding: every gene lives in [0,1] ---------- */
function decode(vars,g){
  const x={};
  vars.forEach((v,i)=>{
    const u=Math.min(1,Math.max(0,g[i]));
    let val=v.log?Math.pow(10,Math.log10(v.lo)+u*(Math.log10(v.hi)-Math.log10(v.lo))):v.lo+u*(v.hi-v.lo);
    if(v.int) val=Math.round(val);
    x[v.k]=val;
  });
  return x;
}
function encode(vars,x){
  return vars.map(v=>{const val=x[v.k];
    return v.log?(Math.log10(val)-Math.log10(v.lo))/(Math.log10(v.hi)-Math.log10(v.lo)):(val-v.lo)/(v.hi-v.lo);});
}

/* ---------- NSGA-II core (Deb et al. 2002) with constrained domination ---------- */
const sameViol=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(a,b)+1e-12;
function dominates(a,b){
  if(a.viol===0&&b.viol>0) return true;
  if(a.viol>0&&b.viol===0) return false;
  // both infeasible: less violation wins; equal violation falls back to the objectives
  // (otherwise a limit that no knob can move leaves the search with no pressure at all)
  if(a.viol>0&&b.viol>0&&!sameViol(a.viol,b.viol)) return a.viol<b.viol;
  let better=false;
  for(let i=0;i<a.f.length;i++){ if(a.f[i]>b.f[i]) return false; if(a.f[i]<b.f[i]) better=true; }
  return better;
}
function fronts(P){
  const S=P.map(()=>[]), n=P.map(()=>0), F=[[]];
  for(let p=0;p<P.length;p++){
    for(let q=0;q<P.length;q++){ if(p===q) continue;
      if(dominates(P[p],P[q])) S[p].push(q); else if(dominates(P[q],P[p])) n[p]++; }
    if(n[p]===0){P[p].rank=0;F[0].push(p);}
  }
  let i=0;
  while(F[i].length){const Q=[];
    for(const p of F[i]) for(const q of S[p]){ if(--n[q]===0){P[q].rank=i+1;Q.push(q);} }
    i++; F.push(Q);}
  F.pop(); return F;
}
function crowding(P,idx){
  idx.forEach(i=>P[i].crowd=0);
  if(!idx.length) return;
  const M=P[idx[0]].f.length;
  for(let m=0;m<M;m++){
    const s=[...idx].sort((a,b)=>P[a].f[m]-P[b].f[m]);
    const lo=P[s[0]].f[m], hi=P[s[s.length-1]].f[m];
    P[s[0]].crowd=P[s[s.length-1]].crowd=Infinity;
    if(hi===lo) continue;
    for(let j=1;j<s.length-1;j++) P[s[j]].crowd+=(P[s[j+1]].f[m]-P[s[j-1]].f[m])/(hi-lo);
  }
}
function sbx(r,p1,p2,eta){
  const c1=p1.slice(),c2=p2.slice();
  for(let i=0;i<p1.length;i++){
    if(r()>0.5||Math.abs(p1[i]-p2[i])<1e-12) continue;
    const u=r(), b=u<=0.5?Math.pow(2*u,1/(eta+1)):Math.pow(1/(2*(1-u)),1/(eta+1));
    c1[i]=0.5*((1+b)*p1[i]+(1-b)*p2[i]); c2[i]=0.5*((1-b)*p1[i]+(1+b)*p2[i]);
  }
  return [c1,c2];
}
function mutate(r,g,pm,eta){
  return g.map(x=>{ if(r()>=pm) return x;
    const u=r(), d=u<0.5?Math.pow(2*u,1/(eta+1))-1:1-Math.pow(2*(1-u),1/(eta+1));
    return Math.min(1,Math.max(0,x+d)); });
}
function better(a,b){ return a.rank<b.rank||(a.rank===b.rank&&a.crowd>b.crowd); }

/* problem: {vars:[{k,lo,hi,log,int}], evaluate:(x)=>({f:[...minimise], viol:>=0, data})}
   returns a run object that can be advanced in chunks (for a responsive UI). */
function createRun(problem,{pop=60,seed=1,pc=0.9,etaC=15,etaM=20}={}){
  const r=rng(seed), n=problem.vars.length, pm=1/Math.max(1,n);
  const ev=g=>{const x=decode(problem.vars,g), o=problem.evaluate(x); run.evals++; return {g,x,f:o.f,viol:o.viol,data:o.data};};
  const run={gen:0,evals:0,pop:[],archive:[],
    init(seedPoints=[]){
      const genes=seedPoints.map(x=>encode(problem.vars,x));
      while(genes.length<pop) genes.push(Array.from({length:n},()=>r()));
      this.pop=genes.slice(0,pop).map(ev); this.archive.push(...this.pop);
      const F=fronts(this.pop); F.forEach(f=>crowding(this.pop,f)); return this;
    },
    step(ng=1){
      for(let k=0;k<ng;k++){
        const P=this.pop, kids=[];
        const pick=()=>{const a=P[Math.floor(r()*P.length)], b=P[Math.floor(r()*P.length)]; return better(a,b)?a:b;};
        while(kids.length<pop){
          let [c1,c2]=r()<pc?sbx(r,pick().g,pick().g,etaC):[pick().g.slice(),pick().g.slice()];
          kids.push(ev(mutate(r,c1,pm,etaM))); if(kids.length<pop) kids.push(ev(mutate(r,c2,pm,etaM)));
        }
        this.archive.push(...kids);
        const R=P.concat(kids), F=fronts(R), next=[];
        for(const f of F){ crowding(R,f);
          if(next.length+f.length<=pop){ f.forEach(i=>next.push(R[i])); }
          else{ f.sort((a,b)=>R[b].crowd-R[a].crowd).slice(0,pop-next.length).forEach(i=>next.push(R[i])); break; } }
        this.pop=next; this.gen++;
      }
      return this;
    },
    // non-dominated feasible points among everything evaluated so far
    pareto(){
      // feasible designs if any; otherwise the least-violating ones (same violation level)
      let feas=this.archive.filter(p=>p.viol===0);
      if(!feas.length&&this.archive.length){const mv=Math.min(...this.archive.map(p=>p.viol)); feas=this.archive.filter(p=>sameViol(p.viol,mv));}
      return feas.filter(p=>!feas.some(q=>q!==p&&dominates(q,p)))
        .filter((p,i,a)=>a.findIndex(q=>q.f.every((v,j)=>v===p.f[j]))===i)
        .sort((a,b)=>a.f[0]-b.f[0]);
    }
  };
  return run;
}

/* ---------- NMOS design problems ---------- */
// metric extractors, reported in display units; "per µm" currents use W in µm
const METRICS={
  tau:    {l:"Intrinsic delay CV/I", u:"ps",    f:M=>M.tau*1e12},
  tpHL:   {l:"Drain discharge t_pHL",u:"ps",    f:M=>M.tpHL*1e12},
  Ion:    {l:"I_on",                 u:"µA/µm", f:M=>M.Ion*1e6/(M.W/1000)},
  IoffTot:{l:"I_off total",          u:"nA/µm", f:M=>M.IoffTot*1e9/(M.W/1000), log:1},
  Ioff:   {l:"I_off subthreshold",   u:"nA/µm", f:M=>M.Ioff*1e9/(M.W/1000), log:1},
  Igc:    {l:"Gate leakage (on)",    u:"nA/µm", f:M=>M.Igc*1e9/(M.W/1000), log:1},
  VthSat: {l:"V_th,sat",             u:"V",     f:M=>M.VthSat},
  DIBL:   {l:"DIBL",                 u:"mV/V",  f:M=>M.DIBL},
  SS:     {l:"Subthreshold swing",   u:"mV/dec",f:M=>M.SS},
  Cgg:    {l:"C_gg",                 u:"fF",    f:M=>M.CggOn*1e15},
  Rs:     {l:"R_S per side",         u:"Ω",     f:M=>M.Rs},
  fT:     {l:"f_T",                  u:"GHz",   f:M=>M.fT/1e9},
  fmax:   {l:"f_max",                u:"GHz",   f:M=>M.fmax/1e9},
  Eox:    {l:"Gate-oxide field",     u:"MV/cm", f:M=>M.Eox/1e6},
  area:   {l:"Footprint area",       u:"µm²",   f:M=>M.areaUm2},
  IonTot: {l:"I_on, whole device",   u:"µA",    f:M=>M.Ion*1e6},
  IonA:   {l:"I_on per area",        u:"µA/µm²",f:M=>M.Ion*1e6/M.areaUm2},
  actMargin:{l:"Contact-in-active margin",u:"nm",f:M=>M.actMargin},
  BVdss:  {l:"Breakdown BV_dss",     u:"V",     f:M=>M.BVdss},
  bvMargin:{l:"BV_dss − V_DD",       u:"V",     f:M=>M.BVdss-M.p.VDD},
  snapMargin:{l:"Snapback trigger − V_DD",u:"V",f:M=>M.snapOn-M.p.VDD},
  IsubRatio:{l:"I_sub/I_D (HCI, V_GS = V_DD/2)",u:"",f:M=>M.IsubRatio,log:1},
  sigmaVth:{l:"σV_th (Pelgrom)",     u:"mV",    f:M=>M.sigmaVth*1000},
  Vth3s:  {l:"V_th,sat − 3σ",        u:"V",     f:M=>M.VthSat-3*M.sigmaVth},
  VA:     {l:"Early voltage V_A",    u:"V",     f:M=>M.VA},
  RonA:   {l:"Specific R_on·A",      u:"mΩ·mm²",f:M=>M.RonA},
  RonW:   {l:"R_on·W",               u:"Ω·µm",  f:M=>M.Ron*M.W/1000},
  Vpass:  {l:"Pass voltage at V_G = V_DD",u:"V",f:M=>M.Vpass},
  VgReq:  {l:"Gate voltage to pass V_DD",u:"V", f:M=>M.VgReq},
  VthFld: {l:"Field-transistor V_th",u:"V",     f:M=>M.VthFld},
  fldMargin:{l:"Field V_th − V_DD",  u:"V",     f:M=>M.VthFld-M.p.VDD},
  VRT:    {l:"Punch-through bound V_RT (HV)",u:"V",f:M=>M.VRT},
  rtMargin:{l:"Punch-through bound − V_DD (HV)",u:"V",f:M=>M.VRT-M.p.VDD}
};
/* Ranges where the calibrated parts of the model (SCE fit, overlap-resistance calibration) were checked.
   Optimising outside them is allowed but flagged. */
const VALID={Lg:[50,200],Na:[1e18,5e18],tIL:[1.0,3.0],Xjext:[10,35],Lov:[0,20],Next:[1e19,2e20],VDD:[0.8,1.8]};
/* HV: ranges covered by the 2D HV references (breakdown dataset, punch-through set, drift resistor).
   L_g starts at 1.3 µm: the HV compact model has no short-channel current, and below ~1.3 µm the 2D subthreshold
   current at N_A = 1.5e16 rises by decades (the punch-through bound constraint guards the rest). */
const VALID_HV={Lg:[1300,5000],Na:[1e16,2e17],Nwell:[1e16,2e17],tIL:[35,80],Xjext:[100,500],Lov:[0,300],Next:[5e16,1e18],Ldr:[300,2000],Nddd:[2e16,5e17],Oddd:[0,400],Xjddd:[300,900],VDD:[5,40]};

/* cfg: {vars:[{k,lo,hi}], objectives:[{m,dir:"min"|"max"}], constraints:[{m,op:"<="|">=",v}], dLg:nm, base:params} */
function nmosProblem(NMOS,cfg){
  const base={...NMOS.DEF,...(cfg.base||{})};
  const hv=base.dev==="hv";
  const byK=Object.fromEntries((NMOS.paramsFor?NMOS.paramsFor(base.dev||"lv"):NMOS.PARAMS).map(d=>[d.k,d]));
  const vars=cfg.vars.map(v=>{const d=byK[v.k]; return {k:v.k,lo:v.lo??d.min,hi:v.hi??d.max,log:!!d.log,int:!!d.int};});
  const dL=cfg.dLg||0;
  const evalAt=x=>{
    const p={...base,...x};
    if(!dL) return [NMOS.model(p)];
    const lo=Math.max(p.Lg-dL,2*p.Lov+6);
    return [NMOS.model(p),NMOS.model({...p,Lg:lo}),NMOS.model({...p,Lg:p.Lg+dL})];
  };
  // worst corner for a metric given the direction in which it hurts
  const worst=(Ms,m,hurtsUp)=>{const v=Ms.map(M=>METRICS[m].f(M)); return hurtsUp?Math.max(...v):Math.min(...v);};
  return {vars,
    evaluate(x){
      let Ms; try{ Ms=evalAt(x); }catch(e){ return {f:cfg.objectives.map(()=>1e30),viol:1e30}; }
      const f=cfg.objectives.map(o=>{const v=worst(Ms,o.m,o.dir==="min"); const s=o.dir==="min"?v:-v; return METRICS[o.m].log?Math.log10(Math.max(v,1e-30))*(o.dir==="min"?1:-1):s;});
      let viol=0;
      for(const c of cfg.constraints||[]){
        const v=worst(Ms,c.m,c.op==="<="), lim=c.v;
        const L=METRICS[c.m].log;
        const d=c.op==="<="?(L?Math.log10(Math.max(v,1e-30))-Math.log10(lim):(v-lim)/(Math.abs(lim)||1)):(L?Math.log10(lim)-Math.log10(Math.max(v,1e-30)):(lim-v)/(Math.abs(lim)||1));
        if(d>0) viol+=d;
      }
      if(f.some(v=>!isFinite(v))) return {f:f.map(()=>1e30),viol:viol+1e6};
      const nominal=Ms[0], metrics={};
      Object.keys(METRICS).forEach(k=>Object.defineProperty(metrics,k,{enumerable:true,configurable:true,
        get(){const v=METRICS[k].f(nominal); Object.defineProperty(metrics,k,{value:v,enumerable:true}); return v;}}));
      return {f,viol,data:{metrics}};
    },
    // limits whose value no selected knob can change: probe the corners and random points of the box
    probeLimits(n=24,seed=9){
      const r=rng(seed), pts=[{}];
      vars.forEach(v=>{pts.push({[v.k]:v.lo});pts.push({[v.k]:v.hi});});
      for(let i=0;i<n;i++){const x={};vars.forEach(v=>{const u=r();x[v.k]=v.log?Math.pow(10,Math.log10(v.lo)+u*(Math.log10(v.hi)-Math.log10(v.lo))):v.lo+u*(v.hi-v.lo);if(v.int)x[v.k]=Math.round(x[v.k]);});pts.push(x);}
      const Ms=pts.map(x=>evalAt({...x})), out=[];
      (cfg.constraints||[]).forEach((c,i)=>{
        const vals=Ms.map(m=>worst(m,c.m,c.op==="<="));
        const lo=Math.min(...vals), hi=Math.max(...vals), fixed=(hi-lo)<=1e-9*Math.max(Math.abs(lo),Math.abs(hi),1e-30);
        const ok=c.op==="<="?lo<=c.v:hi>=c.v;   // can any probed design satisfy it?
        out.push({i,m:c.m,op:c.op,v:c.v,fixed,value:vals[0],reachable:ok});
      });
      return out;
    },
    outsideValid(x){const p={...base,...x};const out=Object.entries(hv?VALID_HV:VALID).filter(([k,[a,b]])=>p[k]<a*0.999||p[k]>b*1.001).map(([k])=>k);
      if(hv&&p.Next<3*p.Na) out.push("Next/Na"); return out;}
  };
}
return {createRun,nmosProblem,METRICS,VALID,VALID_HV,decode,encode,dominates};
});
