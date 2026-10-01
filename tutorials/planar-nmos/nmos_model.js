/* Planar NMOS compact model — shared by planar_nmos_bench.html and tests/.
   Units inside: cm, F, A, V, K. Inputs in nm / cm^-3 / eV / uOhm*cm as labeled in PARAMS. */
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.NMOS=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";
/* ================= constants (cm, F, A, V) ================= */
const q=1.602176634e-19, kB=1.380649e-23, e0=8.8541878e-14, eSi=11.7*e0, eOx=3.9*e0;
const hbar=1.054571817e-34, m0=9.1093837e-31, nm=1e-7;
const muCT=N=>68.5+(1414-68.5)/(1+Math.pow(N/9.2e16,0.711));
const rhoN=N=>1/(q*N*muCT(N));
const softplus=x=>x>40?x:Math.log1p(Math.exp(x));
const EgT=T=>1.17-4.73e-4*T*T/(T+636);
const niT=T=>{const vt=kB*T/q, v3=kB*300/q;return 9.65e9*Math.pow(T/300,1.5)*Math.exp(-EgT(T)/(2*vt)+EgT(300)/(2*v3));};
const E00=N=>{const es=11.7*8.8541878e-12, ms=0.3*m0;return (q*hbar/2)*Math.sqrt(N*1e6/(es*ms))/q;};
const rhoCraw=(N,phiB,T)=>{const kT=kB*T/q, e=E00(N), Eo=e/Math.tanh(e/kT);return Math.exp(phiB/Eo);};
const RHOC0=1e-7/rhoCraw(1e20,0.6,300);

/* ---------- leakage physics (module-level so tests can call them directly) ----------
   Direct tunnelling through the gate stack (A/cm²). Schuegraf & Hu (1992) closed form for the SiO₂/SiON
   interfacial layer, with the WKB attenuation of the high-k layer multiplied in. Barriers are measured
   from the Si conduction band: SiO₂ 3.1 eV (m* 0.40 m₀), high-k taken as HfO₂-like 1.5 eV (m* 0.18 m₀).
   The oxide voltage is split between the layers in proportion to their EOT.                        */
const TUN={phiIL:3.1, mIL:0.40, phiHK:1.5, mHK:0.18};
function wkbLayer(t,a,Vdrop,mr){ // ∫√(2m·φ(x))dx through one layer, barrier falling linearly from a to a−Vdrop (eV); SI result
  if(a<=0) return 0;
  const k=Math.sqrt(2*mr*m0*q)*t, b=a-Vdrop;
  if(Math.abs(Vdrop)<1e-9) return k*Math.sqrt(a);
  const bb=Math.max(b,0);                      // past the point where the barrier drops below the electron energy: FN regime
  return k*(2/3)*(Math.pow(a,1.5)-Math.pow(bb,1.5))/(a-b);
}
function gateTunnelJ(Vox,tIL_nm,kIL,tHK_nm,kHK){
  Vox=Math.abs(Vox); if(Vox<1e-3) return 0;
  const eIL=tIL_nm*3.9/kIL, eHK=tHK_nm*3.9/kHK, eot=eIL+eHK;
  const VIL=Vox*eIL/eot, VHK=Vox-VIL;
  const tIL=tIL_nm*1e-9, tHK=tHK_nm*1e-9;
  const S=wkbLayer(tIL,TUN.phiIL,VIL,TUN.mIL)+(tHK>0?wkbLayer(tHK,TUN.phiHK-VIL,VHK,TUN.mHK):0);
  const E=VIL/tIL;                                             // field in the interfacial layer, V/m
  const A=q*q*q/(16*Math.PI*Math.PI*hbar*TUN.phiIL*q);          // FN/Schuegraf–Hu prefactor, A/V²
  return A*E*E*Math.exp(-2*S/hbar)*1e-4;                        // A/cm²
}

/* ---------- high-field helpers: impact ionisation and avalanche breakdown ----------
   Impact ionisation coefficients of Van Overstraeten & de Man (1970), with their optical-phonon
   temperature factor γ(T) = tanh(ħω/2kT₀)/tanh(ħω/2kT), ħω = 63 meV. E in V/cm, α in 1/cm.       */
const VOM={n:[7.03e5,1.231e6],pLo:[1.582e6,2.036e6],pHi:[6.71e5,1.693e6]};
function ionCoef(E,T){
  if(E<1e4) return [0,0];
  const g=Math.tanh(0.063/(2*kB*300/q))/Math.tanh(0.063/(2*kB*T/q));
  const hp=E<4e5?VOM.pLo:VOM.pHi;
  return [g*VOM.n[0]*Math.exp(-g*VOM.n[1]/E), g*hp[0]*Math.exp(-g*hp[1]/E)];
}
// ionisation integral along a path of length L (cm) with field Efun(s) (V/cm), s = 0 at the metallurgical
// junction; breakdown when it reaches 1 (hole-initiated form, equal to the electron form at breakdown)
function ionIntegral(Efun,L,T,n=160){
  let acc=0,I=0; const h=L/n;
  for(let i=0;i<n;i++){ const [an,ap]=ionCoef(Efun((i+0.5)*h),T); I+=ap*Math.exp(-acc)*h; acc+=(ap-an)*h; }
  return I;
}
// one-sided abrupt junction, lightly doped side N (cm⁻³), total junction voltage Vt = V_R + V_bi.
// r_j = Infinity: planar. Finite r_j (cm): cylindrical edge of radius r_j (junction depth).
function junctionField(N,Vt,rj){
  const k=q*N/eSi;
  if(!isFinite(rj)){ const Wd=Math.sqrt(2*Vt/k), Em=k*Wd; return {L:Wd,E:s=>Em*(1-s/Wd),Emax:Em}; }
  // V = (qN/2ε)[r_d² ln(r_d/r_j) − (r_d² − r_j²)/2]; solve r_d
  const Vof=rd=>k/2*(rd*rd*Math.log(rd/rj)-(rd*rd-rj*rj)/2);
  let lo=rj, hi=rj+10*Math.sqrt(2*Vt/k)+rj; while(Vof(hi)<Vt) hi*=2;
  for(let i=0;i<36;i++){const m=(lo+hi)/2; if(Vof(m)<Vt) lo=m; else hi=m;}
  const rd=(lo+hi)/2;
  return {L:rd-rj,E:s=>k/2*(rd*rd-(rj+s)*(rj+s))/(rj+s),Emax:k/2*(rd*rd-rj*rj)/rj};
}
function avalancheBV(N,Vbi,rj,T,boost,lb){
  // boost(V): optional extra field (V/cm) added in quadrature at the junction edge, decaying over length lb (cm)
  const I=V=>{const f=junctionField(N,V+Vbi,rj); if(!boost) return ionIntegral(f.E,f.L,T);
    const Eb=boost(V); return ionIntegral(s=>Math.sqrt(f.E(s)**2+(Eb*Math.exp(-s/lb))**2),f.L,T);};
  let lo=0.05, hi=4000; if(I(hi)<1) return hi;
  if(I(lo)>=1) return lo;
  for(let i=0;i<24;i++){const m=Math.sqrt(lo*hi); if(I(m)>=1) hi=m; else lo=m;}   // ~1e-4 relative
  return Math.sqrt(lo*hi);
}
/* ---------- layered abrupt junctions (HV drift / DDD) ----------
   n side made of layers {N (cm⁻³), t (cm)} listed from the metallurgical junction outward (last t may be
   Infinity); p side uniform N_p. Full depletion approximation, both sides.
   deplLayers: planar, closed form. Returns n-side depletion depth xn, p-side xp, and whether every
   finite n layer is depleted (pinched: no neutral n left).
   V·ε/q = (Q_prev + N_k y)²/(2N_p) + M_prev + N_k(d_k·y + y²/2), y = depth into layer k               */
function deplLayers(layers,Np,Vt){
  Vt=Math.max(Vt,0);
  let Q=0,M=0,d=0;
  for(let k=0;k<layers.length;k++){
    const N=layers[k].N, t=layers[k].t;
    const a=N*N/(2*Np)+N/2, b=Q*N/Np+N*d, c=Q*Q/(2*Np)+M-Vt*eSi/q;
    const y=(-b+Math.sqrt(Math.max(b*b-4*a*c,0)))/(2*a);
    if(y<=t) return {xn:d+y,xp:(Q+N*y)/Np,pinched:false};
    Q+=N*t; M+=N*((d+t)*(d+t)-d*d)/2; d+=t;
  }
  // all n layers depleted (finite stack ending at a surface/insulator): remaining voltage on the p side only
  const xp=Math.max(Math.sqrt(Math.max(2*Np*(Vt*eSi/q-M),0))/Np, Q/Np);
  return {xn:d,xp,pinched:true};
}
/* Numeric field profile for a planar (rj = Infinity) or cylindrical junction of radius rj with the n side
   inside (junction edge / corner). Returns arrays ds (cm) and E (V/cm) from the n-side depletion edge to
   the p-side edge, plus xn, xp and the potential (V, relative to the p-side edge) at a distance s into the
   n side from the junction.                                                                           */
function layeredProfile(layers,Np,Vt,rj=Infinity,n=160){
  const cyl=isFinite(rj);
  const Nat=s=>{let d=0;for(const L of layers){if(s<d+L.t) return L.N; d+=L.t;} return layers[layers.length-1].N;};
  const capN=cyl?rj*0.999:Infinity;
  // n-side charge (per rad·cm for cylinder, per cm² for planar, in units of cm⁻³·cm²) between depth 0 and xn
  const Qn=xn=>{let Q=0,d=0;for(const L of layers){const a=d,b=Math.min(d+L.t,xn); if(b>a) Q+=L.N*(cyl?((rj-a)*(rj-a)-(rj-b)*(rj-b))/2:(b-a)); d+=L.t; if(d>=xn) break;} return Q;};
  const xpOf=Q=>cyl?Math.sqrt(rj*rj+2*Q/Np)-rj:Q/Np;
  const build=xn=>{
    const Q=Qn(xn), xp=xpOf(Q), ds=[],E=[],s=[];
    // n side: s from xn (depletion edge) to 0 (junction); field magnitude
    for(let i=0;i<n;i++){const u=xn*(1-(i+0.5)/n), r=cyl?rj-u:1;
      ds.push(xn/n); E.push(q/eSi*Math.max(Q-Qn(u),0)/r); s.push(-u);}
    for(let i=0;i<n;i++){const u=xp*(i+0.5)/n, r=cyl?rj+u:1; const Qp=Np*(cyl?((rj+u)*(rj+u)-rj*rj)/2:u);
      ds.push(xp/n); E.push(q/eSi*Math.max(Q-Qp,0)/r); s.push(u);}
    let V=0; for(let i=0;i<E.length;i++) V+=E[i]*ds[i];
    return {ds,E,s,V,xn,xp};
  };
  // bisection on the n-side depletion depth
  let lo=0, hi=Math.min(capN,1e-5);
  while(build(hi).V<Vt&&hi<capN&&hi<1) hi=Math.min(hi*2,capN);
  for(let i=0;i<40;i++){const m=(lo+hi)/2; if(build(m).V<Vt) lo=m; else hi=m;}
  const P=build((lo+hi)/2);
  // potential at distance x into the n side (from the junction), relative to the p-side depletion edge
  P.psiAt=x=>{let V=0;for(let i=0;i<P.E.length;i++){ if(P.s[i]<-x) continue; V+=P.E[i]*P.ds[i];} return V;};
  return P;
}
/* avalanche breakdown of a layered junction; boost(V,s): extra field (V/cm) added in quadrature at
   position s (cm, <0 inside the n side, measured from the junction)                                    */
function layeredBV(layers,Np,Vbi,T,rj=Infinity,boost=null,vmax=4000){
  const I=V=>{const P=layeredProfile(layers,Np,V+Vbi,rj);
    const E=boost?P.E.map((e,i)=>Math.hypot(e,boost(V,P.s[i],P))):P.E;
    // hole-initiated form from the n-side edge (equal to the electron form at breakdown)
    let acc=0,J=0; for(let i=0;i<E.length;i++){const [an,ap]=ionCoef(E[i],T); J+=ap*Math.exp(-acc)*P.ds[i]; acc+=(ap-an)*P.ds[i];}
    return J;};
  let lo=0.05, hi=vmax; if(I(hi)<1) return hi; if(I(lo)>=1) return lo;
  for(let i=0;i<24;i++){const m=Math.sqrt(lo*hi); if(I(m)>=1) hi=m; else lo=m;}
  return Math.sqrt(lo*hi);
}
/* ---------- quasi-2D surface model of an HV drain (off state, gate at V_G, body = source = 0) ----------
   Gauss box over a surface layer of effective thickness t_e along x (per unit width):
     ε_Si·t_e·ψ'' = −q(N_D − N_A + p − n)·t + √(2qN_A ε_Si ψ⁺)  [+ C_ox(ψ − V_G + V_FB) under the gate]
   ψ = potential w.r.t. the neutral body. N_D(x): LDD (X_j,ext deep; LDD+DDD over the overhang counted as
   areal charge N·t with t = layer depth). Holes (φp = 0) clamp neutral p, electrons (φn = V_D) clamp neutral n,
   so neutral LDD sits at V_D + V_bi and only depleted parts carry charge. Left: channel centre (ψ' = 0);
   right: n⁺ edge (ψ = V_D + V_bi,n⁺). Bottom term: depletion of the p body below the layer (RESURF).
   Surface field = lateral −ψ' combined with the vertical field under the gate (Si side of the oxide).     */
function surfaceProfile(g,Vd,prev){
  const {xj,xg,xo,xn,t,tO,Next,Nddd,Na,Cox,VgFb,T,ni}=g;
  const vt=kB*T/q;
  // grid from the channel centre (x = 0) to the n⁺ edge, refined at the junction, gate edge, overhang, n⁺
  if(!g.X){ const br=[0,xj,xg,xo,xn].filter((v,i,a)=>v>=0&&(i===0||v>a[i-1]+1e-9)).filter(v=>v<=xn+1e-12);
    const X=[0]; const hmin=g.hmin||2e-7, hmax=g.hmax||4e-6, r=1.15;
    for(let s=0;s<br.length-1;s++){ const a=br[s], b=br[s+1], mid=(a+b)/2, L=[],R=[];
      let x=a,h=hmin; while(x+h<mid){x+=h;L.push(x);h=Math.min(h*r,hmax);} x=b;h=hmin; while(x-h>mid){x-=h;R.push(x);h=Math.min(h*r,hmax);}
      L.concat(R.reverse()).forEach(v=>{if(v-X[X.length-1]>1e-9) X.push(v);}); X.push(b); }
    g.X=X;
    g.ND=X.map(x=>x>=xo-1e-12?Next*t/tO+Nddd:(x>=xj-1e-12?Next:0));     // donors averaged over the layer depth
    g.TL=X.map(x=>x>=xo-1e-12?tO:t);
    g.gate=X.map(x=>x<=xg+1e-12?1:0); }
  const X=g.X, n=X.length, ND=g.ND, TL=g.TL, GT=g.gate;
  const VbiN=vt*Math.log(Math.max(ND[n-1],Next)*Na/(ni*ni)), Vr=Vd+VbiN;
  const nC=(ps,Nd)=>ni*ni/Na*Math.exp(Math.min((ps-Vd)/vt,80)), pC=ps=>Na*Math.exp(Math.min(-ps/vt,80));
  const bot=ps=>{const sp=vt*Math.log1p(Math.exp(Math.min(ps/vt,700)))+(ps>700*vt?ps-vt*700:0); return Math.sqrt(2*q*Na*eSi*Math.max(sp,1e-12));};
  const botD=ps=>{const e=1/(1+Math.exp(Math.max(Math.min(-ps/vt,700),-700))); return q*Na*eSi*e/Math.max(bot(ps),1e-30);};
  // warm start: previous profile with the n-type part shifted by the change in V_D
  let ps=prev?Float64Array.from(prev,(v,i)=>ND[i]>0?v+(Vd-(g.prevV??Vd)):v):Float64Array.from(X,(x,i)=>ND[i]>0?Vr*Math.min(1,Math.max(0,(x-xj)/(xn-xj+1e-9))):0);
  g.prevV=Vd;
  ps[n-1]=Vr;
  const a=new Float64Array(n),b=new Float64Array(n),c=new Float64Array(n),d=new Float64Array(n);
  for(let it=0;it<200;it++){
    let md=0;
    for(let i=0;i<n;i++){
      if(i===n-1){a[i]=0;b[i]=1;c[i]=0;d[i]=0;continue;}
      const hl=i>0?X[i]-X[i-1]:0, hr=X[i+1]-X[i], hm=(hl+hr)/2||hr/2;
      const k=eSi*TL[i];
      const fl=i>0?k*(ps[i-1]-ps[i])/hl:0, fr=k*(ps[i+1]-ps[i])/hr;
      const Nd=ND[i], tl=TL[i], nn=nC(ps[i]), pp=pC(ps[i]);
      const rho=q*(Nd-Na+pp-nn)*tl;
      const top=GT[i]?Cox*(ps[i]-VgFb):0, topD=GT[i]?Cox:0;
      const F=(fl+fr)/hm+rho-bot(ps[i])-top;
      const J=-(i>0?k/hl:0)/hm-k/hr/hm+q*(-pp/vt-nn/vt)*tl-botD(ps[i])-topD;
      a[i]=i>0?k/hl/hm:0; b[i]=J; c[i]=k/hr/hm; d[i]=-F;
    }
    // Thomas
    for(let i=1;i<n;i++){const w=a[i]/b[i-1]; b[i]-=w*c[i-1]; d[i]-=w*d[i-1];}
    const dx=new Float64Array(n); dx[n-1]=d[n-1]/b[n-1];
    for(let i=n-2;i>=0;i--) dx[i]=(d[i]-c[i]*dx[i+1])/b[i];
    const cl=Math.max(0.5,Vr/10);
    for(let i=0;i<n-1;i++){const s=Math.max(-cl,Math.min(cl,dx[i])); ps[i]+=s; md=Math.max(md,Math.abs(s));}
    if(md<1e-7) break;
  }
  // surface field along x
  const E=new Float64Array(n-1), xm=new Float64Array(n-1), ds=new Float64Array(n-1), EV=new Float64Array(n-1), EL=new Float64Array(n-1);
  for(let i=0;i<n-1;i++){ const el=(ps[i+1]-ps[i])/(X[i+1]-X[i]); const pm=(ps[i]+ps[i+1])/2;
    // vertical field under the gate: deep-depletion partition of ψ − (V_G − V_FB) between oxide and the drift
    // surface (ψ_d + (ε_Si/C_ox)·√(2qNψ_d/ε_Si) = V), E = √(2qNψ_d/ε_Si); in the p channel region: oxide field only
    let ev=0; if(GT[i]&&GT[i+1]){ const Vx=pm-VgFb, Nl=(ND[i]+ND[i+1])/2;
      if(Nl>Na&&Vx>0){ const A=eSi/Cox*Math.sqrt(2*q*Nl/eSi), sq=(-A+Math.sqrt(A*A+4*Vx))/2; ev=Math.sqrt(2*q*Nl/eSi)*sq; }
      else ev=Cox*Math.abs(Vx)/eSi; }
    EL[i]=Math.abs(el); EV[i]=ev; xm[i]=(X[i]+X[i+1])/2; ds[i]=X[i+1]-X[i]; }
  // Gate-edge step: under the gate edge the drift surface is deep-depleted by ψ_dep = E_v·W_top/2 below the
  // neutral drift beside it (W_top = vertical depletion depth). The layer-averaged ψ above does not contain this
  // step; in 2D it drops laterally at the electrode corner. Added as a potential-conserving lateral term
  // ψ_dep/(2L_s)·e^{−|x−x_g|/L_s} with L_s = (ε_Si/ε_ox)·EOT (the Si-equivalent oxide thickness; not fitted).
  let evE=0, iE=0; for(let i=0;i<n-1;i++) if(xm[i]<xg){evE=EV[i]; iE=i;}
  const wTop=evE*eSi/(q*Math.max(ND[iE],Na)), psiDep=evE*wTop/2, Ls=eSi/eOx*g.EOT;
  let elE=0; for(let i=0;i<n-1;i++){ const sp=psiDep/(2*Ls)*Math.exp(-Math.abs(xm[i]-xg)/Ls);
    E[i]=Math.hypot(EL[i]+sp,EV[i]); if(xm[i]<xg) elE=EL[i]; }
  return {X,psi:ps,E,EL,EV,xm,ds,Vr,evE,wTop,elE};
}
function surfaceBV(g,T,vmax=200){
  // ascending sweep with warm starts (each profile starts from the previous one), then bisection in the bracket
  let prev=null;
  const I=V=>{const P=surfaceProfile(g,V,prev); prev=P.psi; let acc=0,J=0;
    for(let i=0;i<P.E.length;i++){const [an,ap]=ionCoef(P.E[i],T); J+=ap*Math.exp(-acc)*P.ds[i]; acc+=(ap-an)*P.ds[i];} return J;};
  const grid=[]; for(let v=1;v<vmax;v*=1.25) grid.push(v); grid.push(vmax);
  let lo=null, hi=null, psLo=null;
  for(const v of grid){ const j=I(v); if(j>=1){hi=v;break;} lo=v; psLo=prev; }
  if(hi===null) return Infinity;
  if(lo===null) return grid[0];
  for(let i=0;i<14;i++){const m=Math.sqrt(lo*hi); prev=psLo; const j=I(m); if(j>=1) hi=m; else {lo=m; psLo=prev;}}
  return Math.sqrt(lo*hi);
}
function bisectUp(f,target,lo,hi,it=30){ // smallest x in [lo,hi] with f(x) ≥ target, f increasing; hi if never
  if(f(hi)<target) return hi; if(f(lo)>=target) return lo;
  for(let i=0;i<it;i++){const m=(lo+hi)/2; if(f(m)>=target) hi=m; else lo=m;}
  return (lo+hi)/2;
}

/* Band-to-band tunnelling current density across a reverse-biased junction (Sze & Ng Eq. 2.83), A/cm².
   Emax in V/cm, Vr in V, reduced tunnelling mass 0.2 m₀.                                            */
function btbtJ(Emax,Vr,Eg){
  if(Emax<=0||Vr<=0) return 0;
  const ms=0.2*m0, E=Emax*100, Egj=Eg*q;
  const pre=Math.sqrt(2*ms)*q*q*q*E*Vr/(4*Math.PI*Math.PI*Math.PI*hbar*hbar*Math.sqrt(Egj));
  const ex=4*Math.sqrt(2*ms)*Math.pow(Egj,1.5)/(3*q*hbar*E);
  return pre*Math.exp(-ex)*1e-4;
}


/* ================= parameters ================= */
const GROUPS=[
  {id:"stack",name:"Gate stack"},
  {id:"geo",name:"Geometry"},
  {id:"dop",name:"Doping"},
  {id:"plug",name:"Contact plug & ILD"},
  {id:"layout",name:"Layout & area"},
  {id:"op",name:"Operating point"}
];
const PARAMS=[
  {g:"stack",k:"tIL",l:"Interfacial oxide thickness",u:"nm",v:2.0,min:0.3,max:6,st:0.05,hv:{v:65,min:5,max:80}},
  {g:"stack",k:"kIL",l:"Interfacial oxide k",u:"",v:3.9,min:3.9,max:8,st:0.1},
  {g:"stack",k:"tHK",l:"High-k thickness",u:"nm",v:0,min:0,max:8,st:0.1},
  {g:"stack",k:"kHK",l:"High-k k",u:"",v:20,min:7,max:40,st:0.5},
  {g:"stack",k:"Npoly",l:"Poly doping (n⁺)",u:"cm⁻³",v:1e20,min:1e19,max:2e21,log:1,show:p=>p.gate==="poly"},
  {g:"stack",k:"phiM",l:"Metal work function",u:"eV",v:4.2,min:3.9,max:5.2,st:0.01,show:p=>p.gate==="metal"},
  {g:"stack",k:"rhoM",l:"Metal gate resistivity",u:"µΩ·cm",v:20,min:5,max:300,log:1,show:p=>p.gate==="metal"},
  {g:"stack",k:"Qf",l:"Fixed oxide charge",u:"cm⁻²",v:1e10,min:1e9,max:1e12,log:1},
  {g:"stack",k:"Dit",l:"Interface trap density",u:"cm⁻²eV⁻¹",v:1e10,min:1e9,max:1e12,log:1},
  {g:"stack",k:"Hg",l:"Gate height",u:"nm",v:100,min:30,max:300,st:1,hv:{v:150}},
  {g:"geo",k:"Lg",l:"Gate length Lg",u:"nm",v:90,min:20,max:2000,log:1,hv:{v:2000,min:300,max:5000}},
  {g:"geo",k:"W",l:"Width W",u:"nm",v:500,min:50,max:20000,log:1,hv:{v:10000,min:1000,max:50000}},
  {g:"geo",k:"Lov",l:"Gate–extension overlap",u:"nm",v:8,min:0,max:40,st:0.5,hv:{v:60,max:400}},
  {g:"geo",k:"Wsp",l:"Spacer width",u:"nm",v:30,min:5,max:120,st:1,hv:{v:100,max:300}},
  {g:"geo",k:"ksp",l:"Spacer k",u:"",v:7.0,min:2.5,max:9,st:0.1},
  {g:"geo",k:"Ldr",l:"n⁺ offset from gate edge (drift length)",u:"nm",v:1300,min:50,max:5000,log:1,dev:"hv"},
  {g:"geo",k:"Lsd",l:"Active length (gate edge→STI)",u:"nm",v:200,min:60,max:1500,st:5,hv:{v:1700,min:300,max:6000}},
  {g:"dop",k:"Na",l:"Channel doping Nₐ",u:"cm⁻³",v:2e18,min:1e16,max:1e19,log:1,hv:{v:1.5e16,min:1e15,max:1e18}},
  {g:"dop",k:"Nwell",l:"Well doping under S/D",u:"cm⁻³",v:5e17,min:1e15,max:1e19,log:1,hv:{v:1.5e16}},
  {g:"dop",k:"Nsd",l:"Deep S/D doping",u:"cm⁻³",v:2e20,min:1e18,max:1e21,log:1,hv:{v:1e20}},
  {g:"dop",k:"Xj",l:"Deep S/D junction depth",u:"nm",v:60,min:10,max:250,st:1,hv:{v:150,max:500}},
  {g:"dop",k:"Next",l:"Extension (LDD) doping",u:"cm⁻³",v:5e19,min:1e18,max:1e21,log:1,hv:{v:1.4e17,min:1e16,max:1e19}},
  {g:"dop",k:"Nddd",l:"DDD (deep n⁻ under n⁺) doping",u:"cm⁻³",v:7e16,min:1e15,max:1e19,log:1,dev:"hv"},
  {g:"dop",k:"Xjddd",l:"DDD junction depth",u:"nm",v:700,min:50,max:1500,st:5,dev:"hv"},
  {g:"dop",k:"Oddd",l:"DDD overhang past n⁺ edge (toward gate)",u:"nm",v:100,min:0,max:2000,st:5,dev:"hv"},
  {g:"dop",k:"taug",l:"Generation lifetime (SRH)",u:"µs",v:10,min:0.1,max:1000,log:1},
  {g:"dop",k:"Xjext",l:"Extension junction depth",u:"nm",v:20,min:4,max:100,st:1,hv:{v:140,min:50,max:800}},
  {g:"plug",k:"CD",l:"Plug CD (square)",u:"nm",v:60,min:15,max:300,st:1,hv:{v:150,max:500}},
  {g:"plug",k:"dpg",l:"Plug-to-gate spacing (edge)",u:"nm",v:60,min:5,max:400,st:1,hv:{v:1500,min:100,max:5000}},
  {g:"plug",k:"Hp",l:"Plug height",u:"nm",v:300,min:80,max:1200,st:5,hv:{v:500,max:2000}},
  {g:"plug",k:"Np",l:"Plugs per side",u:"",v:2,min:1,max:20,st:1,int:1,hv:{v:10,max:50}},
  {g:"plug",k:"rhoP",l:"Plug resistivity (eff.)",u:"µΩ·cm",v:15,min:3,max:100,st:0.5},
  {g:"plug",k:"phiB",l:"Contact barrier height φB",u:"eV",v:0.6,min:0.2,max:0.9,st:0.01},
  {g:"plug",k:"kILD",l:"ILD k",u:"",v:4.0,min:2.0,max:7.5,st:0.1},
  {g:"op",k:"VDD",l:"Supply VDD",u:"V",v:1.2,min:0.5,max:3.3,st:0.05,hv:{v:30,min:5,max:40}},
  {g:"op",k:"T",l:"Temperature",u:"K",v:300,min:220,max:425,st:1},
  {g:"op",k:"Vsb",l:"Source–body reverse bias V_SB",u:"V",v:0,min:0,max:25,st:0.1},
  {g:"op",k:"pclm",l:"CLM strength (model coefficient)",u:"",v:1,min:0,max:2,st:0.05},
  {g:"op",k:"Ibv",l:"Breakdown current criterion",u:"µA/µm",v:1,min:1e-4,max:100,log:1},
  {g:"op",k:"CL",l:"External load on drain",u:"fF",v:0,min:0,max:50,st:0.1},
  {g:"layout",k:"SL",l:"Isolation space along L (to next active)",u:"nm",v:100,min:30,max:1000,st:5,hv:{v:1000,max:3000}},
  {g:"layout",k:"SW",l:"Space along W (STI + poly endcap)",u:"nm",v:150,min:30,max:2000,st:5,hv:{v:1000,max:5000}},
  {g:"layout",k:"rsub",l:"Substrate resistance × W (to body tie)",u:"kΩ·µm",v:2,min:0.1,max:100,log:1},
  {g:"layout",k:"tfox",l:"Field oxide under poly (STI depth)",u:"nm",v:300,min:50,max:1000,st:5,dev:"hv"},
  {g:"layout",k:"Nfld",l:"Field (channel-stop) doping under STI",u:"cm⁻³",v:5e17,min:1e15,max:1e19,log:1,dev:"hv"},
  {g:"layout",k:"eAct",l:"Active enclosure of contact",u:"nm",v:15,min:0,max:100,st:1,hv:{v:50}},
];
const DEF={dev:"lv",gate:"poly",lsdAuto:false}; PARAMS.forEach(d=>DEF[d.k]=d.v);
// HV (~30 V class) preset: overrides in d.hv; HV-only parameters (d.dev==="hv") keep their own v
const HVDEF={...DEF,dev:"hv"}; PARAMS.forEach(d=>{ if(d.hv&&d.hv.v!=null) HVDEF[d.k]=d.hv.v; });
const PRESETS={lv:DEF,hv:HVDEF};
// parameter list with the ranges of a device type (LV: base ranges; HV: overrides applied)
function paramsFor(dev){ return PARAMS.map(d=>{ if(dev==="hv"&&d.hv) return {...d,...d.hv}; return d; })
  .filter(d=>!d.dev||d.dev===dev); }

/* ================= device model ================= */
const SCE_HV={DVT0:4.08, DVT1:0.602, ETA0:0.695, DSUB:1.10, GXJ:0.227};   // replaced by the HV fit below
function model(p){
  // Active length from the contact rule (gate edge → plug gap → plug → enclosure) when requested
  if(p.lsdAuto) p={...p,Lsd:p.dpg+p.CD+p.eAct};
  const hv=p.dev==="hv";
  // gate edge → n⁺ edge: the spacer in LV (self-aligned n⁺), an independent offset (drift length) in HV
  const Loff=hv?p.Ldr:p.Wsp, Oeff=hv?Math.min(p.Oddd,p.Ldr):0;
  const T=p.T, vt=kB*T/q, ni=niT(T), eg=EgT(T);
  const EOT=(p.tIL*3.9/p.kIL + p.tHK*3.9/p.kHK)*nm;
  const tphys=(p.tIL+p.tHK)*nm;
  const Cox=eOx/EOT;
  const phiF=vt*Math.log(p.Na/ni);
  const Vsb=p.Vsb||0;
  // body effect: depletion at ψs = 2φ_F + V_SB
  const Wd=Math.sqrt(2*eSi*(2*phiF+Vsb)/(q*p.Na));
  const Qd=q*p.Na*Wd;
  // fixed positive oxide charge Q_f shifts V_FB by −qQ_f/C_ox (grows with oxide thickness)
  const dVfbQf=-q*p.Qf/Cox;
  const Vfb = (p.gate==="poly" ? -(eg/2+phiF) : p.phiM-(4.05+eg/2+phiF)) + dVfbQf;
  const VthL=Vfb+2*phiF+Qd/Cox;
  const m=1+3*EOT/Wd;
  const Cit=q*p.Dit;                                   // interface-trap capacitance, F/cm²
  const LeffNm=Math.max(p.Lg-2*p.Lov,5), Leff=LeffNm*nm;
  // Short-channel V_th (BSIM3 form). Characteristic length gets an extension-depth term; the five
  // constants below were fitted to the 2D Poisson reference solver (tests/reference_solvers.js, mos2d)
  // and checked on held-out devices (other N_A, EOT, X_j,ext, L_ov).
  const SCE_LV={DVT0:4.08, DVT1:0.602, ETA0:0.695, DSUB:1.10, GXJ:0.227};
  const SCE=SCE_LV;
  const lam=Math.sqrt(3*EOT*Wd)*Math.pow(p.Xjext*nm/Wd,SCE.GXJ);
  const thL=D=>Math.exp(-D*Leff/(2*lam))+2*Math.exp(-D*Leff/lam);
  const theta=thL(SCE.DVT1), thetaDibl=thL(SCE.DSUB);
  const Vbi=vt*Math.log(p.Na*p.Next/(ni*ni));
  // Lateral drain junction seen from the channel: p (N_A) | extension/drift | (DDD overlap) | n⁺
  const latLayers=hv?[{N:p.Next,t:(p.Lov+Loff-Oeff)*nm},...(Oeff>0?[{N:p.Next+p.Nddd,t:Oeff*nm}]:[]),{N:p.Nsd,t:Infinity}]
                    :[{N:p.Next,t:(p.Lov+Loff)*nm},{N:p.Nsd,t:Infinity}];
  /* Short-channel V_th.
     LV: BSIM3 form with the five constants fitted to the 2D Poisson reference (mos2d), linear DIBL.
     HV: long-channel V_th only. Thick oxide and light doping put λ at 0.1–0.3 µm, far outside the LV fit, and
     the 2D HV reference (hv2d) shows bulk punch-through that saturates with V_DS because the drift absorbs the
     extra voltage. Neither a refitted BSIM form (1.9 decades rms) nor a source-to-drain Gauss-box barrier model
     (good for N_A ≥ 3e16, 3–4 decades off for lighter bodies) followed the 2D subthreshold current across the
     HV space, so no compact short-channel shift is applied. Punch-through is handled as a design rule instead:
     the 1D reach-through voltage (breakdown list), which on all 76 2D rows was conservative (see tests).    */
  const vthAt=Vds=>hv?VthL:VthL-SCE.DVT0*theta*(Vbi-2*phiF)-SCE.ETA0*thetaDibl*Vds;
  // Subthreshold swing factor with the Taur & Ning 2D short-channel degradation term
  const nSS=(m+Cit/Cox)*(1+(11*EOT/Wd)*Math.exp(-Math.PI*Leff/(2*(Wd+3*EOT))));
  let tpd=0;
  // Gate charge at V_GS = V_DD. In strong inversion ψs is pinned near 2φ_F, so the oxide voltage
  // V_DD − V_FB − ψs does not depend on L: the V_th roll-off of a short channel comes from S/D taking over
  // part of the depletion charge, which the extra inversion charge exactly replaces. Use the long-channel V_th.
  // (Using the short-channel V_th here double-counted that charge and made E_ox rise as L_g shrank.)
  const Qg=Qd+Cox*Math.max(p.VDD-VthL,0);
  if(p.gate==="poly") tpd=Qg/(q*p.Npoly);
  const Toxe=EOT+0.4*nm+tpd*3.9/11.7;
  const Cinv=eOx/Toxe;
  const vsat=2.4e7/(1+0.8*Math.exp(T/600));
  const W=p.W*nm;
  const muT=540*Math.pow(T/300,-1.5);
  const Csub=2*nSS*Cox*Math.sqrt(2*(2*phiF+Vsb)/(q*eSi*p.Na));
  // smooth max(V_th, 0) (20 mV corner): a hard max put a kink in g_m where V_th crosses 0 in short channels
  const muEff=(vg,vth)=>muT/(1+Math.pow(((vg+2*0.02*softplus(vth/0.02)+0.2)/(6*Toxe))/1e6,1.85));

  function vgsteffV(Vgs,Vth){
    const x=Vgs-Vth, nvt=nSS*vt;
    return 2*nvt*softplus(x/(2*nvt))/(1+Csub*Math.exp(-x/(2*nvt)));
  }
  const vgsteff=(Vgs,Vds)=>vgsteffV(Vgs,vthAt(Vds));
  // channel-length modulation length (pseudo-2D): l = √(3·EOT·X_j,ext)
  const lClm=Math.sqrt(3*EOT*p.Xjext*nm);
  function core(Vgs,Vds){ return coreV(Vgs,Vds,vthAt(Vds)); }
  function coreV(Vgs,Vds,Vth){
    const Vgt=vgsteffV(Vgs,Vth);
    const mu=muEff(Vgt,Vth), Esat=2*vsat/mu, EL=Esat*Leff;
    const Vdsat=EL*(Vgt+2*vt)/(m*EL+Vgt+2*vt);
    const d=0.01, a=Vdsat-Vds-d;
    const Vde=Vdsat-0.5*(a+Math.sqrt(a*a+4*d*Vdsat));
    let I=W*mu*Cinv/Leff*Vgt*(1-m*Vde/(2*(Vgt+2*vt)))*Vde/(1+Vde/EL);
    // CLM: ΔL = l·ln[1 + (V_DS − V_DSeff)/(l·E_sat)], only above threshold (the velocity-saturated
    // pinch-off region exists in strong inversion; subthreshold output conductance is DIBL)
    // smooth max(V_DS − V_DSat, 0) and a weight that switches CLM off in subthreshold
    const x=Vds-Vdsat, dm=0.01, dV=0.5*(x+Math.sqrt(x*x+4*dm*dm))-dm, wInv=Vgt*Vgt/(Vgt*Vgt+0.01);
    // First-order form I·(1 + ΔL/L) of Ko's L/(L − ΔL): no divergence, so no cap is needed.
    // (L/(L − ΔL) with a cap at 0.9·L let I(V_DD/2, V_DD) exceed I_on in extreme devices; a cap at 0.5·L made
    //  V_A non-monotonic in the CLM strength.) Same first-order form as BSIM's (1 + (V_DS − V_DSeff)/V_A).
    // p.pclm scales ΔL (1 = textbook Ko form; not fitted — no strong-inversion reference in this repo)
    const dL=(p.pclm??1)*wInv*lClm*Math.log(1+Math.max(dV,0)/(lClm*Esat));
    I*=(1+dL/Leff);
    return {I,Vdsat,Esat,dL};
  }
  function idi(Vgs,Vds){
    if(Vds<0) return -idi(Vgs-Vds,-Vds);
    return core(Vgs,Vds).I;
  }

  /* ---- series resistance per side ---- */
  const rhoExt=rhoN(p.Next), rhoSD=rhoN(p.Nsd);
  // Front end (channel → extension): gate-induced accumulation sheet over the overlap coupled to the
  // extension sheet below (two-sheet transmission line), in parallel with Ng–Lynch edge spreading.
  // Coupling resistivity ρ_i = 0.2·ρ_ext·X_j,ext is calibrated to the 2D resistor solver (tests/).
  const phiN=vt*Math.log(p.Next/ni);
  const VfbOv = p.gate==="poly" ? phiN-eg/2 : p.phiM-(4.05+eg/2-phiN);
  const Vov=Math.max(p.VDD-VfbOv,0.05);
  const muAcc=1/(1/muEff(Vov,0)+1/muCT(p.Next));
  const Racc=1/(muAcc*Cinv*Vov);                       // Ω/□, evaluated at V_GS = V_DD
  const ReExt=rhoExt/(p.Xjext*nm);                     // Ω/□
  const RspW=Math.max(0,2*rhoExt/Math.PI*Math.log(0.75*p.Xjext*nm/(2*nm)));   // Ω·cm
  const Lov=p.Lov*nm;
  let frontW;
  { const S=Racc+ReExt, par=Racc*ReExt/S;
    if(Lov<=0) frontW=RspW;
    else{ const rhoi=0.2*rhoExt*p.Xjext*nm, k=Math.sqrt(S/rhoi);
      const ex=((Racc*Racc+ReExt*ReExt)/Math.tanh(k*Lov)+2*Racc*ReExt/Math.sinh(k*Lov))/(S*k);
      frontW=par*Lov+(RspW>0?1/(1/RspW+1/ex):0); } }
  const Rspr=frontW/W;
  const Rext=hv?0:rhoExt*(p.Wsp*nm)/(W*p.Xjext*nm);
  const RshSD=rhoSD/(p.Xj*nm);
  const Rsd=RshSD*(Math.max(p.dpg-Loff,0)*nm)/W;
  const Ac=p.Np*Math.pow(p.CD*nm,2);
  const rhoc=RHOC0*rhoCraw(p.Nsd,p.phiB,T);
  const Rc=rhoc/Ac;
  const Rplug=p.rhoP*1e-6*(p.Hp*nm)/Ac;
  /* ---- HV drift region (per side, gate edge → n⁺ edge, length L_off) ----
     Neutral cross-section = LDD (N_ext, X_j,ext) plus, over the DDD overhang next to the n⁺, the DDD layer
     below it. The drift–well junction at the bottom depletes the layers from below (JFET): local reverse
     bias = V(x) + V_SB. Velocity saturation: J = G·E/(1 + G·E/J_max), J_max = Kirk current density, so the
     drop grows steeply as I → W·J_max (quasi-saturation).                                               */
  let RcPl=Rsd+Rc+Rplug;                           // n⁺ sheet + contact + plug (+ overhang spreading), per side
  const dLayers=[{N:p.Next,t:p.Xjext*nm}];
  const oLayers=hv&&p.Xjddd>p.Xjext?[{N:p.Nddd,t:(p.Xjddd-p.Xjext)*nm},{N:p.Next+p.Nddd,t:p.Xjext*nm}]:[{N:p.Next+(hv?p.Nddd:0),t:p.Xjext*nm}];
  const vbiB=L=>vt*Math.log(L[0].N*p.Nwell/(ni*ni));
  // (p._noDep: test hook that drops the junction depletion, for comparison with the 2D resistor, which has none)
  const sheet=(L,Vr)=>{ const d=p._noDep?{xn:0}:deplLayers(L,p.Nwell,vbiB(L)+Math.max(Vr,-0.4)); let dep=d.xn,G=0,Jm=0;
    // low-field conductance from the neutral thickness (floored at 10%: with current flowing, injected electrons
    // keep a thin conducting sheet in a depleted drift); the saturation limit is the Kirk current density
    // q·N·v_sat over the full layer thickness (electrons replace the depletion charge at the onset of Kirk effect)
    for(const l of L){ const tn=p._noDep?l.t:Math.max(l.t-Math.max(dep,0),0.1*l.t); dep-=l.t; G+=q*(l.mu??(l.mu=muCT(l.N)))*l.N*tn; Jm+=q*l.N*vsat*l.t; }
    return [G,Jm]; };
  // voltage drop across one drift region for current I (A); V0 = potential at the n⁺ end (w.r.t. the source
  // terminal); dir = +1 on the source side (potential rises toward the channel), −1 on the drain side
  function driftDrop(I,V0,dir){
    if(!hv||I<=0) return 0;
    // Local current–field relation per unit width in each drift segment:
    //   J(E) = G·E/(1 + E/E_s) + κ·S(E),   E_s = J_max/G,   κ = 2ε_Si·v_sat·t/ℓ
    // First term: ohmic conduction with velocity saturation, capped at the Kirk current J_max = q·N·v_sat·t.
    // Second: space-charge-limited conduction once the field exceeds E_s (Mott–Gurney with saturated velocity,
    // J = 2ε·v_sat·V/ℓ² over a segment of length ℓ). S(E) = w·[sp((E − E_s)/w) − sp(−E_s/w)], w = E_s/4, a smooth
    // ramp that is ~0 below E_s (injected charge only appears beyond the doping) and ~E − E_s above it. It keeps the
    // drop finite above J_max and makes it vanish as ℓ → 0, so a vanishing LDD-only segment no longer clamps the
    // current (it did: I_on jumped 3× where the drift length crossed the DDD overhang).
    // E(J) by safeguarded Newton; dx/dV = 1/E. Integrate position against potential with adaptive dV.
    const J=I/W, segs=[[oLayers,Oeff*nm],[dLayers,(Loff-Oeff)*nm]];
    const sig=x=>1/(1+Math.exp(-x));
    let V=V0;
    for(const [L,len] of segs){ if(len<=0) continue;
      const tt=L.reduce((a,l)=>a+l.t,0), kap=2*eSi*vsat*tt/len;
      const dxdV=v=>{ const [G,Jm]=sheet(L,v+Vsb), Es=Jm/G, w=Es/4, s0=softplus(-Es/w);
        const f=E=>G*E/(1+E/Es)+kap*w*(softplus((E-Es)/w)-s0)-J, fp=E=>G/((1+E/Es)**2)+kap*sig((E-Es)/w);
        let lo=0, hi=Es; while(f(hi)<0) hi*=2;
        let E=J<0.5*Jm?J/(G*(1-J/Jm)):(lo+hi)/2;
        for(let it=0;it<60;it++){ const fv=f(E); if(fv>0) hi=E; else lo=E; if(Math.abs(fv)<=1e-9*J) break;
          let En=E-fv/fp(E); if(!(En>lo&&En<hi)) En=(lo+hi)/2; if(Math.abs(En-E)<=1e-9*E){E=En;break;} E=En; }
        return 1/E; };
      let x=0, k=dxdV(V), n=0;
      while(x<len&&n<400){ n++;
        let dV=Math.min(len/(12*k),1e3);                         // ~12 steps per segment
        const k2=dxdV(V+dir*dV/2);
        let dx=k2*dV;
        if(x+dx>len){ dV*=(len-x)/dx; dx=len-x; }
        x+=dx; V+=dir*dV; k=dxdV(V); }
    }
    return Math.abs(V-V0);
  }

  // Current entering the DDD overhang from the shallow LDD must spread down into the DDD layer: two-sheet
  // transmission line (top: LDD+DDD over X_j,ext, bottom: DDD below it), entry in the top sheet, both sheets
  // tied at the n⁺. The excess over the parallel-sheet value, R₁²/(R₁+R₂)·tanh(kL)/k, is added in series.
  // Coupling ρ_i = 0.2·(ρ₁t₁ + ρ₂t₂): same coefficient as the overlap front end (not refitted); checked
  // against the 2D drift resistor (tests, group B).
  let RtlmO=0;
  if(hv&&Oeff>0&&p.Xjddd>p.Xjext){ const t1=p.Xjext*nm, t2=(p.Xjddd-p.Xjext)*nm, r1=rhoN(p.Next+p.Nddd), r2=rhoN(p.Nddd);
    const R1=r1/t1, R2=r2/t2, k=Math.sqrt((R1+R2)/(0.2*(r1*t1+r2*t2))), L=Oeff*nm;
    RtlmO=R1*R1/(R1+R2)*Math.tanh(k*L)/k/W; }
  const Rdrift=hv?driftDrop(1e-9*p.W/1000,0,1)/(1e-9*p.W/1000)+RtlmO:0;   // low-current drift R per side (Ω)
  RcPl+=RtlmO;
  const Rs=Rspr+Rext+Rsd+Rc+Rplug+Rdrift;
  // internal (intrinsic) gate–source and drain–source voltages for a terminal current I ≥ 0
  function internalV(Vgs,Vds,I){
    if(!hv) return [Vgs-I*Rs,Vds-2*I*Rs];
    const Vsn=I*RcPl, Vs=Vsn+driftDrop(I,Vsn,1)+I*Rspr;
    const Vdn=Vds-I*RcPl, Vd=Vdn-driftDrop(I,Vdn,-1)-I*Rspr;
    return [Vgs-Vs,Vd-Vs];
  }
  function ids(Vgs,Vds,R){
    if(Vds<0) return -ids(Vgs-Vds,-Vds,R); // swap source/drain so series R is applied in reverse mode too
    const hi0=idi(Vgs,Vds);
    if(hi0<=0) return hi0;
    const lin=R!==undefined||!hv; if(R===undefined) R=Rs;
    if(lin&&R<=0) return hi0;
    // root of g(I) = I_intrinsic(internal V(I)) − I, decreasing in I, bracketed by [0, I(R = 0)].
    // Illinois regula falsi (≈ 10 evaluations instead of 60 bisections; the HV drift drop is costly)
    const g=I=>{ const v=lin?[Vgs-I*R,Vds-2*I*R]:internalV(Vgs,Vds,I); return idi(v[0],v[1])-I; };
    let a=0,fa=hi0,b=hi0,fb=g(hi0),side=0;
    if(fb>=0) return hi0;
    for(let i=0;i<200;i++){
      // (tolerances relative to the root: with a huge series R the root can sit many decades below I(R = 0))
      // when the bracket still spans decades (huge R: g is exponential in I), step geometrically instead
      const wide=i>0&&(a<=0||b>4*a);
      const c=wide?(a>0?Math.sqrt(a*b):b*1e-3):(i%8===7?(a+b)/2:(a*fb-b*fa)/(fb-fa)), fc=g(c);
      if(fc>0){ a=c; fa=fc; if(side===1) fb/=2; side=1; } else { b=c; fb=fc; if(side===-1) fa/=2; side=-1; }
      if(Math.abs(b-a)<=1e-11*c||Math.abs(fc)<=1e-12*c) return c;
    }
    return (a+b)/2;
  }

  /* ---- gate resistance ---- */
  const rhoG = p.gate==="poly" ? rhoN(p.Npoly) : p.rhoM*1e-6;
  const RshG=rhoG/(p.Hg*nm);
  const Rg=RshG*p.W/(3*p.Lg);

  /* ---- capacitance ---- */
  const Cch=W*Leff*Cinv;
  const Cov=W*p.Lov*nm*Cox;
  // outer fringe: quarter-circle arcs from the gate corner, spacer k out to W_sp, ILD k beyond.
  // A plug cuts the arcs off at its distance, but only over the width it actually covers (N_p·CD).
  const rmin=tphys;
  const cofPerW=rmaxNm=>{const rmax=Math.max(rmaxNm*nm,rmin*1.001), r1=Math.min(Math.max(p.Wsp*nm,rmin),rmax);
    return (2/Math.PI)*e0*(p.ksp*Math.log(r1/rmin)+p.kILD*Math.log(rmax/r1));};
  const plugFrac=Math.min(1,p.Np*p.CD/p.W);
  const CofShield=cofPerW(Math.min(p.Hg,p.dpg)), CofOpen=cofPerW(p.Hg);
  const Cof=W*(plugFrac*CofShield+(1-plugFrac)*CofOpen);
  const rmax=Math.max(Math.min(p.Hg,p.dpg)*nm,rmin*1.001), r1=Math.min(Math.max(p.Wsp*nm,rmin),rmax);
  const Cif=W*(2*eSi/Math.PI)*Math.log(1+p.Xjext*nm/(2*tphys));
  const dG=p.dpg*nm, hF=Math.min(p.Hg,p.Hp)*nm, wF=p.CD*nm, sp=Math.min(p.Wsp,p.dpg)*nm;
  const epsEff=e0*dG/(sp/p.ksp+(dG-sp)/p.kILD);
  // Palmer edge correction, ln(1+x) form so it stays positive when the plate is narrower than the gap
  const pal=a=>1+dG/(Math.PI*a)*(1+Math.log(1+2*Math.PI*a/dG));
  // plate term + Palmer edge fringes added per edge pair (additive form stays monotonic in the gap)
  const edge=(L,a)=>(L/Math.PI)*(1+Math.log(1+2*Math.PI*a/dG));
  const CpgSide=p.Np*epsEff*(hF*wF/dG+edge(hF,wF)+edge(wF,hF));
  // plug portion above the gate top couples to the gate top surface (ILD); saturates about one gap above the gate
  const CpgTop=p.Np*wF*e0*p.kILD/Math.PI*Math.log(1+Math.min(Math.max(p.Hp-p.Hg,0),p.dpg)/p.dpg);
  const Cpg=CpgSide+CpgTop;
  const cj=(N1,N2)=>{const Vb=vt*Math.log(N1*N2/(ni*ni));return {c:Math.sqrt(q*eSi*N1*N2/(2*(N1+N2)*Vb)),Vb,N1,N2};};
  // large-signal average of C_j(V) over a reverse-bias swing V1 → V2
  const keq=(Vb,V2,V1=0)=>2*Vb/(V2-V1)*(Math.sqrt(1+V2/Vb)-Math.sqrt(1+V1/Vb));
  // [0] S/D bottom, [1] extension/drift bottom, [2] extension–channel sidewall, [3] deep sidewall facing
  // the channel; HV adds [4] DDD overhang bottom. HV: the n⁺ (and overhang) bottom is the DDD/well junction.
  const nBot=hv&&p.Xjddd>p.Xj?p.Nddd:p.Nsd;
  const jParts=hv?[
    {A:W*Math.max(p.Lsd-Loff,0)*nm, ...cj(nBot,p.Nwell)},
    {A:W*Math.max(Math.min(Loff,p.Lsd)-Oeff,0)*nm, ...cj(p.Next,p.Nwell)},
    {A:W*p.Xjext*nm, ...cj(p.Next,p.Na)},
    {A:W*Math.max(Math.max(p.Xjddd,p.Xj)-p.Xjext,0)*nm, ...cj(p.Xjddd>p.Xj?p.Nddd:p.Nsd,p.Nwell)},
    {A:W*Oeff*nm, ...cj(p.Nddd+p.Next,p.Nwell)}
  ]:[
    {A:W*Math.max(p.Lsd-p.Wsp,0)*nm, ...cj(p.Nsd,p.Nwell)},
    {A:W*Math.min(p.Wsp,p.Lsd)*nm, ...cj(p.Next,p.Nwell)},
    {A:W*p.Xjext*nm, ...cj(p.Next,p.Na)},
    {A:W*Math.max(p.Xj-p.Xjext,0)*nm, ...cj(p.Nsd,p.Nwell)}
  ];
  let Cj0=0, CjAvg=0;
  jParts.forEach(j=>{Cj0+=j.c*j.A/Math.sqrt(1+Vsb/j.Vb); CjAvg+=j.c*j.A*keq(j.Vb,p.VDD+Vsb,Vsb);});
  const CdepS=eSi/Wd;
  const CgbOff=W*Leff/(1/Cox+1/CdepS);
  const CggOn=Cch+2*(Cov+Cof+Cpg);
  const CggOff=CgbOff+2*(Cov+Cof+Cif+Cpg);
  const Cgd=Cov+Cof+Cpg;
  const CL=p.CL*1e-15;
  const Cdrain=CjAvg+Cgd+CL;

  /* ---- DC metrics ---- */
  const V=p.VDD;
  const VthLin=vthAt(0.05), VthSat=vthAt(V);
  const DIBL=(VthLin-VthSat)/(V-0.05)*1000;
  const SS=nSS*vt*Math.LN10*1000;
  const Ion=ids(V,V), Ion0=idi(V,V), Ioff=idi(0,V);
  const IH=ids(V,V/2), IL=ids(V/2,V), Ieff=(IH+IL)/2;
  const Ron=0.05/ids(V,0.05);
  const dv=5e-3;
  const gm=(ids(V+dv,V)-ids(V-dv,V))/(2*dv);
  const gds=(ids(V,V+dv)-ids(V,V-dv))/(2*dv);
  const tau=CggOn*V/Ion;
  const tpHL=Cdrain*V/(2*Ieff);
  const tauG=Rg*CggOn;
  const fT=gm/(2*Math.PI*CggOn);
  const fmax=fT/(2*Math.sqrt(gds*(Rg+Rs)+2*Math.PI*fT*Rg*Cgd));
  const Eox=Qg/eOx; // SiO2-equivalent field, V/cm

  /* ---- leakage ---- */
  // gate-to-channel tunnelling in the on state (oxide voltage = gate charge / C_ox)
  const VoxOn=Qg/Cox;
  const Igc=gateTunnelJ(VoxOn,p.tIL,p.kIL,p.tHK,p.kHK)*W*Leff;
  // off state, drain at V_DD, gate at 0: edge direct tunnelling through the gate–drain overlap
  const VoxEdt=Math.abs(V-VfbOv);
  const Iedt=gateTunnelJ(VoxEdt,p.tIL,p.kIL,p.tHK,p.kHK)*W*Math.max(p.Lov,0.5)*nm;
  // GIDL: surface field at the drain edge under the gate (Chan et al.: (V_DG − E_g)/(3·EOT)), BTBT over
  // the overlap plus ~2 nm of fringe along the drain surface. Order-of-magnitude estimate.
  // Surface field at the gate edge for drain–gate voltage Vdg. Chan's (V_DG − E_g)/(3·EOT), capped by what
  // the Si under the edge can hold in deep depletion: ψ + (ε_Si/ε_ox)·EOT·√(2qNψ/ε_Si) = V_DG, E = √(2qNψ/ε_Si).
  // The cap only binds for a lightly doped edge (HV LDD): the edge depletes and takes most of V_DG.
  const edgeField=Vdg=>{ if(Vdg<=0) return 0; const a=eSi/eOx*EOT*Math.sqrt(2*q*p.Next/eSi);
    const sq=(-a+Math.sqrt(a*a+4*Vdg))/2; return Math.min(Math.max(Vdg-eg,0)/(3*EOT),Math.sqrt(2*q*p.Next/eSi)*sq); };
  // potential (w.r.t. the body) of the drift surface at the gate edge, off state, drain–body bias Vr.
  // LV: the heavily doped extension is neutral there (= Vr). HV: the drift may be depleted up to the edge.
  const edgeV=Vr=>{ if(!hv) return Vr; const d=deplLayers(latLayers,p.Na,Vbi+Vr), s0=p.Lov*nm;
    if(s0>=d.xn) return Vr; let drop=0,z=0;               // drop from the depletion edge back to s0
    for(const l of latLayers){ const a=Math.max(z,s0), b=Math.min(z+l.t,d.xn); if(b>a) drop+=q*l.N/eSi*((b-s0)*(b-s0)-(a-s0)*(a-s0))/2; z+=l.t; if(z>=d.xn) break; }
    return Math.max(Vr-drop,0); };
  const Vedge=edgeV(V+Vsb)-Vsb;                          // gate-edge potential w.r.t. the source, off state
  const Vgidl=Math.max(Vedge-eg,0), Egidl=edgeField(Vedge);
  const Igidl=btbtJ(Egidl,Vgidl,eg)*W*(p.Lov+2)*nm;
  // drain junction BTBT: extension–channel sidewall (N_ext/N_A) and deep S/D bottom (N_SD/N_well)
  const Vdb=V+Vsb;                                     // drain-to-body reverse bias in the off state
  const Emax=(N1,N2,Vb,VR=Vdb)=>Math.sqrt(2*q*(N1*N2/(N1+N2))*(Vb+VR)/eSi);
  const jSide=jParts[2], jBot=jParts[0];
  const Ibtbt=btbtJ(Emax(jSide.N1,jSide.N2,jSide.Vb),Vdb,eg)*jSide.A+btbtJ(Emax(jBot.N1,jBot.N2,jBot.Vb),Vdb,eg)*jBot.A;
  // SRH generation in the drain depletion region: q·n_i·W_dep·A/(2τ_g)
  const Wdep=(N1,N2,Vb,VR)=>Math.sqrt(2*eSi*(Vb+VR)*(N1+N2)/(q*N1*N2));
  const Igen=jParts.reduce((s,j)=>s+q*ni*Wdep(j.N1,j.N2,j.Vb,Vdb)*j.A/(2*p.taug*1e-6),0);
  const IoffTot=Ioff+Iedt+Igidl+Ibtbt+Igen;

  /* ---- impact ionisation, hot carriers, breakdown ---- */
  // Hu's characteristic length of the velocity-saturated region: l = 0.22·t_ox^(1/3)·X_j^(1/2) (cm)
  const lHu=0.22*Math.cbrt(EOT)*Math.sqrt(p.Xjext*nm);
  const gT=Math.tanh(0.063/(2*kB*300/q))/Math.tanh(0.063/(2*kB*T/q));
  const Ai=2e6*gT, Bi=1.7e6*gT;                        // effective electron ionisation (Hu), 1/cm and V/cm
  function hotCarrier(Vgs,Vds){
    const I=ids(Vgs,Vds), vi=internalV(Vgs,Vds,I), c=core(vi[0],vi[1]);
    const dV=Math.max(vi[1]-c.Vdsat,0);
    const ratio=dV>1e-6?Ai/Bi*dV*Math.exp(-Bi*lHu/dV):0;   // I_sub/I_D
    return {I,ratio,Isub:I*ratio,Em:Math.sqrt((dV/lHu)**2+c.Esat**2)};
  }
  const idsM=(Vgs,Vds)=>{const h=hotCarrier(Vgs,Vds); return h.I*(1+h.ratio);};  // drain current incl. avalanche
  const hcOn=hotCarrier(V,V), hcWorst=hotCarrier(V/2,V);   // HCI stress is worst near V_GS ≈ V_DS/2
  const Rsub=p.rsub*1e3/(p.W/1000);                      // Ω
  // Pelgrom mismatch: A_VT ≈ 1 mV·µm per nm EOT, weak doping dependence (N_A^¼)
  const AVT=1.0*(EOT/nm)*Math.pow(p.Na/1e18,0.25);       // mV·µm
  const sigmaVth=AVT/Math.sqrt((p.W/1000)*(LeffNm/1000))/1000;   // V
  // breakdown voltages (drain–source, gate and body at source), computed on first use
  const Icrit=p.Ibv*1e-6*(p.W/1000);                     // A
  let bvCache=null;
  function breakdown(){
    if(bvCache) return bvCache;
    // BV_dss is defined with the body tied to the source (V_SB = 0); snapback keeps the actual bias
    if(Vsb!==0){ const b0=model({...p,Vsb:0}).breakdown();
      const vt1=bisectUp(Vd=>hotCarrier(V,Vd).Isub*Rsub,0.7,V,Math.max(V,b0.BVdss),24);
      bvCache={...b0,snapOn:vt1,snapLimited:vt1<b0.BVdss}; return bvCache; }
    const Neff=(a,b)=>a*b/(a+b);
    // avalanche at the cylindrical junction edges (radius = junction depth)
    const avExt=hv?null:avalancheBV(Neff(p.Next,p.Na),jSide.Vb,p.Xjext*nm,T);
    const avSD=hv?null:avalancheBV(Neff(p.Nsd,p.Nwell),jBot.Vb,p.Xj*nm,T);
    // tunnelling (Zener) breakdown: junction BTBT current reaches the criterion
    const itun=VR=>btbtJ(Emax(jSide.N1,jSide.N2,jSide.Vb,VR),VR,eg)*jSide.A+btbtJ(Emax(jBot.N1,jBot.N2,jBot.Vb,VR),VR,eg)*jBot.A;
    const tun=bisectUp(itun,Icrit,0,500);
    // gated diode (gate at 0 over the drain edge): (a) gate-edge band-to-band tunnelling reaches the criterion
    const igd=VD=>{const Ve=edgeV(VD+Vsb)-Vsb, Vg=Math.max(Ve-eg,0);return btbtJ(edgeField(Ve),Vg,eg)*W*(p.Lov+2)*nm;};
    const gdTun=bisectUp(igd,Icrit,0,500);
    // (b) avalanche at the extension edge with the gate-induced vertical field added (Chan: (V_DG−E_g)/(3·EOT))
    // the gate-induced field is confined to the drain edge: decay length √(3·EOT·X_j,ext) (same scale as CLM)
    let gdAv, avExtHV=null, avBot=null;
    if(!hv) gdAv=avalancheBV(Neff(p.Next,p.Na),jSide.Vb,p.Xjext*nm,T,VD=>edgeField(VD),lClm);
    else{
      // HV surface path (gate edge, drift, reach-through to n⁺): quasi-2D Gauss-box model, see surfaceProfile
      const sg={xj:(p.Lg/2-p.Lov)*nm,xg:p.Lg/2*nm,xo:(p.Lg/2+Loff-Oeff)*nm,xn:(p.Lg/2+Loff)*nm,t:p.Xjext*nm,tO:Math.max(p.Xjddd,p.Xjext)*nm,
        Next:p.Next,Nddd:Oeff>0?p.Nddd:0,Na:p.Na,Cox,VgFb:-Vfb,T,ni,EOT};
      gdAv=surfaceBV(sg,T);
      // channel-side corner of the LDD (cylinder of radius X_j,ext; matters for a heavily doped LDD)
      avExtHV=layeredBV([{N:p.Next,t:Infinity}],p.Na,Vbi,T,p.Xjext*nm);
      // bottom corner: n⁺ core inside the DDD shell, cylindrical, against the well
      const botL=p.Xjddd>p.Xj?[{N:p.Nddd,t:(p.Xjddd-p.Xj)*nm},{N:p.Nsd,t:Infinity}]:[{N:p.Nsd,t:Infinity}];
      avBot=layeredBV(botL,p.Nwell,vt*Math.log(botL[0].N*p.Nwell/(ni*ni)),T,Math.max(p.Xjddd,p.Xj)*nm);
    }
    // punch-through: drain-induced barrier lowering drives the V_GS = 0 channel current to the criterion.
    // (The 1D "depletion regions touch" voltage is kept as an indicator only; checked against 2D Poisson it
    //  is far too pessimistic for short channels, while the current criterion agrees within ~10%.)
    const Ws=Math.sqrt(2*eSi*jSide.Vb/(q*p.Na));
    const vreach=Leff>Ws?Math.max(q*p.Na*(Leff-Ws)**2/(2*eSi)-jSide.Vb,0):0;
    // HV: 1D reach-through of the lateral depletion (drift included) across L_eff — a conservative rule, since
    // the HV compact model has no short-channel subthreshold current (see vthAt)
    let vpt;
    if(hv){ const Ws=Math.sqrt(2*eSi*Vbi/(q*p.Na)*p.Next/(p.Next+p.Na));
      const span=V=>deplLayers(latLayers,p.Na,Vbi+V+Vsb).xp+Ws;
      vpt=span(0)>=Leff?0:(span(500)<Leff?Infinity:bisectUp(V=>span(V)-Leff,0,0,500,40)); }
    else vpt=bisectUp(Vd=>idi(0,Vd),Icrit,0.05,500);
    const list=hv?[["gate-edge / drift surface avalanche",gdAv],["LDD corner avalanche (channel side)",avExtHV],["bottom junction avalanche (n⁺/DDD corner)",avBot],
      ["junction tunnelling (Zener)",tun],["gated-diode tunnelling (GIDL)",gdTun],["punch-through bound (1D reach-through, conservative; not in BV_dss)",Math.max(vpt,0)]]
     :[["junction avalanche (extension edge)",avExt],["junction avalanche (S/D edge)",avSD],["junction tunnelling (Zener)",tun],
      ["gated-diode tunnelling (GIDL)",gdTun],["gated-diode avalanche",gdAv],["punch-through",Math.max(vpt,0)]];
    // HV: the 1D reach-through voltage is a conservative bound, not a breakdown voltage. On all 48 rows of the 2D
    // punch-through set it is below the 2D onset (usually far below: 2D onset > 40 V where the bound gives 20–30 V),
    // so it is reported separately (VRT) and kept out of the minimum. LV: the current criterion is validated (±10%).
    const best=list.filter(x=>!(hv&&/reach-through/.test(x[0]))).reduce((a,b)=>b[1]<a[1]?b:a);
    // on-state snapback trigger: I_sub·R_sub turns on the parasitic npn (V_BE ≈ 0.7 V)
    const vt1=bisectUp(Vd=>hotCarrier(V,Vd).Isub*Rsub,0.7,V,Math.max(V,best[1]),24);
    bvCache={BVdss:best[1],mech:best[0],list,avExt,avSD,avExtHV,avBot,tun,gdTun,gdAv,vpt:Math.max(vpt,0),vreach,snapOn:vt1,snapLimited:vt1<best[1]};
    return bvCache;
  }

  /* ---- layout footprint (per device pitch: isolation shared half-and-half with neighbours) ---- */
  const areaUm2=(p.Lg+2*p.Lsd+p.SL)*(p.W+p.SW)*1e-6;
  // nm; < 0 means the contact does not fit in the active (HV: also inside the n⁺, which starts L_off from the gate)
  const actMargin=Math.min(p.Lsd-(p.dpg+p.CD+p.eAct), hv?p.dpg-(Loff+p.eAct):Infinity);
  const RonA=Ron*areaUm2/1e3;                          // specific on-resistance, mΩ·mm² (1 mΩ·mm² = 1e3 Ω·µm²)
  /* ---- pass-gate transfer (body tied to V_SB below the source): with the gate at V_DD the output node can
     rise only until V_G − V_out = V_th(V_SB + V_out). Long-channel V_th with body effect + the low-V_DS SCE shift. */
  const sceLin=vthAt(0.05)-VthL;
  const vthBody=Vx=>Vfb+2*phiF+Math.sqrt(2*q*eSi*p.Na*(2*phiF+Math.max(Vx,0)))/Cox+sceLin;
  const Vpass=(()=>{let lo=0,hi=Math.max(V,0);for(let i=0;i<40;i++){const m=(lo+hi)/2; if(V-m-vthBody(Vsb+m)>0) lo=m; else hi=m;} return lo;})();
  const VgReq=V+vthBody(Vsb+V);                          // gate voltage needed to pass V_DD fully
  /* ---- field transistor: poly over the field oxide between two n⁺ regions, channel-stop doping N_fld ---- */
  const phiFf=vt*Math.log(p.Nfld/ni), Cfox=eOx/(p.tfox*nm);
  const VthFld=(p.gate==="poly"?-(eg/2+phiFf):p.phiM-(4.05+eg/2+phiFf))-q*p.Qf/Cfox+2*phiFf+Math.sqrt(2*q*eSi*p.Nfld*(2*phiFf+Vsb))/Cfox;
  const out={p,hv,Loff,Oeff,latLayers,edgeV,edgeField,Vedge,driftDrop,internalV,Rdrift,RtlmO,RcPl,sheet,RonA,Vpass,VgReq,VthFld,vthBody,Vsb,dVfbQf,Cit,lClm,core,Igen,lHu,hotCarrier,idsM,hcOn,hcWorst,Rsub,AVT,sigmaVth,breakdown,Icrit,areaUm2,actMargin,Igc,Iedt,Igidl,Ibtbt,IoffTot,VoxOn,nSS,SCE,thetaDibl,Racc,ReExt,RspW,frontW,VfbOv,CofShield,CofOpen,plugFrac,CpgSide,CpgTop,vgsteff,muEff,vsat,Csub,epsEff,palW:pal(wF),palH:pal(hF),Qd,rhoExt,rhoSD,jParts,T,Leff,tphys,rmax,r1,hF,wF,dG,
    vt,ni,EOT,Toxe,tpd,Cox,Cinv,phiF,Wd,Vfb,VthL,m,LeffNm,lam,theta,Vbi,vthAt,idi,ids,
    Rspr,Rext,Rsd,Rc,Rplug,Rs,rhoc,RshSD,Rg,RshG,Cch,Cov,Cof,Cif,Cpg,Cj0,CjAvg,CggOn,CggOff,CgbOff,Cgd,Cdrain,
    VthLin,VthSat,DIBL,SS,Ion,Ion0,Ioff,Ieff,Ron,gm,gds,tau,tpHL,tauG,fT,fmax,Eox,W:p.W};
  // breakdown numbers are costly (ionisation integrals): expose them as lazy properties
  // VRT: HV punch-through bound (1D reach-through across L_eff, drift included), V; LV: the punch-through voltage
  ["BVdss","snapOn","VRT"].forEach(k=>Object.defineProperty(out,k,{get(){const b=breakdown(); return k==="VRT"?b.vpt:b[k];},enumerable:false}));
  out.IsubRatio=hcWorst.ratio; out.EmaxHC=hcWorst.Em; out.IonM=idsM(V,V);
  out.VA=gds>0?Ion/gds:Infinity;                      // Early voltage at the on point
  return out;
}


return {PARAMS,GROUPS,DEF,HVDEF,PRESETS,paramsFor,model,
  helpers:{muCT,rhoN,niT,EgT,E00,rhoCraw,RHOC0,softplus,gateTunnelJ,btbtJ,TUN,ionCoef,ionIntegral,junctionField,avalancheBV,deplLayers,layeredProfile,layeredBV,surfaceProfile,surfaceBV},
  consts:{q,kB,e0,eSi,eOx,nm}};
});
