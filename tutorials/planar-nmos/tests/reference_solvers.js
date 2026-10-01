/* Independent numerical reference solvers used to check the compact model.
   None of these reuse the compact-model formulas: they solve the underlying
   electrostatics directly so that agreement is meaningful.

   1) mos1d   : exact 1D MOS charge (integrated Poisson, Boltzmann statistics, uniform NA)
   2) pn1d    : nonlinear 1D Poisson for an abrupt n+/p junction (Newton, FD) -> Cj(V)
   3) fringe2d: 2D Laplace finite-volume solver for the gate sidewall/fringe/plug
                capacitance in the L–z cross-section (per unit width, line-contact limit)
*/
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.NMOS_REF=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";
const q=1.602176634e-19, kB=1.380649e-23, e0=8.8541878e-14, eSi=11.7*e0, eOx=3.9*e0;

/* ---------- 1) exact 1D MOS charge ----------
   Qs(ψs) = sign(ψs)·√(2qε_Si N_A)·√[ vt·e^{−ψs/vt} + ψs − vt + (ni²/N_A²)(vt·e^{ψs/vt} − ψs − vt) ]
   V_G = V_FB + ψs + Qs/C_ox. Inversion charge = Qs − Q_B, Q_B = √(2qε N_A (ψs − vt)).  */
function mos1d({Na,ni,T,Cox,Vfb,Vsb=0}){
  // with a source–body reverse bias the electron quasi-Fermi level sits V_SB above the hole level
  const vt=kB*T/q, r=(ni/Na)**2*Math.exp(-Vsb/vt), A=Math.sqrt(2*q*eSi*Na);
  const Qs=psi=>A*Math.sqrt(Math.max(vt*Math.exp(-psi/vt)+psi-vt+r*(vt*Math.exp(psi/vt)-psi-vt),0));
  const Vg=psi=>Vfb+psi+Qs(psi)/Cox;
  const psiOfVg=V=>{ // Vg(ψ) is monotonic -> bisection on ψ in (0, 1.6)
    let lo=1e-6, hi=1.6;
    hi=1.6+Vsb;
    for(let i=0;i<200;i++){const mid=(lo+hi)/2; if(Vg(mid)<V) lo=mid; else hi=mid;}
    return (lo+hi)/2;
  };
  const Qinv=V=>{const psi=psiOfVg(V); return Math.max(Qs(psi)-Math.sqrt(2*q*eSi*Na*Math.max(psi-vt,0)),0);};
  const phiF=vt*Math.log(Na/ni);
  // strong-inversion onset: surface electron density equals N_A, i.e. ψs = 2φ_F + V_SB
  return {Qs,Vg,psiOfVg,Qinv,phiF,VthExact:Vg(2*phiF+Vsb)};
}


/* ---------- impact ionisation for the reference solvers ----------
   Same Van Overstraeten–de Man coefficients as the model (they are material data, not the thing under test);
   what the references check is the field: full Poisson (1D) and 2D field lines instead of the compact
   triangular/cylindrical profiles.                                                                         */
function refAlpha(E,T){
  if(E<1e4) return [0,0];
  const g=Math.tanh(0.063/(2*kB*300/q))/Math.tanh(0.063/(2*kB*T/q));
  const hp=E<4e5?[1.582e6,2.036e6]:[6.71e5,1.693e6];
  return [g*7.03e5*Math.exp(-g*1.231e6/E), g*hp[0]*Math.exp(-g*hp[1]/E)];
}
// path given as arrays of step lengths ds (cm) and |E| (V/cm), ordered from the n side to the p side
function ionPath(ds,Es,T){ let acc=0,I=0; for(let i=0;i<ds.length;i++){const [an,ap]=refAlpha(Es[i],T); I+=ap*Math.exp(-acc)*ds[i]; acc+=(ap-an)*ds[i];} return I; }

/* ---------- 2) nonlinear 1D Poisson, abrupt n+/p junction ----------
   Reverse bias Vr applied to n side. Quasi-Fermi levels: φn = Vr, φp = 0 (flat, no current).
   Solves  d/dx(ε dφ/dx) = −q(p − n + N_D⁺ − N_A⁻)  with Newton on a graded grid.
   Returns depletion charge per area on the p side; C = dQ/dV by central difference. */
function pn1d({Nd,Na,ni,T,Vmax=3}){
  const vt=kB*T/q;
  // one fixed grid for every bias, so dQ/dV is not polluted by re-meshing noise
  const Vbi0=vt*Math.log(Nd*Na/ni/ni);
  const LDp=Math.sqrt(eSi*vt/(q*Na)), LDn=Math.sqrt(eSi*vt/(q*Nd));
  const Wp=Math.sqrt(2*eSi*(Vbi0+Vmax)/(q*Na))*1.5+20*LDp;
  const Wn=Math.sqrt(2*eSi*(Vbi0+Vmax)/(q*Nd))*3+40*LDn;
  const grid=[];
  { const h0=Math.min(LDn,LDp)/20;
    let x=0,h=h0; const neg=[0]; while(x<Wn){x+=h;neg.push(-x);h=Math.min(h*1.05,Wn/200);}
    x=0;h=h0; const pos=[]; while(x<Wp){x+=h;pos.push(x);h=Math.min(h*1.05,Wp/600);}
    neg.reverse().forEach(v=>grid.push(v)); pos.forEach(v=>grid.push(v)); }
  let lastPhi=null;
  function solve(Vr){
    const N=grid.length, Ndop=grid.map(v=>v<0?Nd:(v>0?-Na:(Nd-Na)/2));
    const phiL=Vr+vt*Math.log(Nd/ni), phiR=-vt*Math.log(Na/ni);
    // initial guess: depletion-approximation-like step
    let phi=grid.map(v=>v<0?phiL:phiR);
    const nC=ph=>ni*Math.exp((ph-Vr)/vt), pC=ph=>ni*Math.exp(-ph/vt);
    for(let it=0;it<400;it++){
      const a=new Float64Array(N),b=new Float64Array(N),c=new Float64Array(N),d=new Float64Array(N);
      b[0]=1;d[0]=0;b[N-1]=1;d[N-1]=0;
      let maxd=0;
      for(let i=1;i<N-1;i++){
        const hl=grid[i]-grid[i-1], hr=grid[i+1]-grid[i], hm=(hl+hr)/2;
        const n=nC(phi[i]), p=pC(phi[i]);
        const F=eSi*((phi[i+1]-phi[i])/hr-(phi[i]-phi[i-1])/hl)/hm + q*(p-n+Ndop[i]);
        a[i]=eSi/(hl*hm); c[i]=eSi/(hr*hm); b[i]=-(a[i]+c[i]) + q*(-p/vt - n/vt);
        d[i]=-F;
      }
      // Thomas
      for(let i=1;i<N;i++){const w=a[i]/b[i-1]; b[i]-=w*c[i-1]; d[i]-=w*d[i-1];}
      const dx=new Float64Array(N); dx[N-1]=d[N-1]/b[N-1];
      for(let i=N-2;i>=0;i--) dx[i]=(d[i]-c[i]*dx[i+1])/b[i];
      // damping: 5 kT/q per step, widened at high reverse bias so the solution can move tens of volts
      const cl=Math.max(5*vt,Vr/20);
      for(let i=0;i<N;i++){const s=Math.max(-cl,Math.min(cl,dx[i])); phi[i]+=s; maxd=Math.max(maxd,Math.abs(s));}
      if(maxd<1e-10) break;
    }
    lastPhi=phi;
    // depletion charge on the p side
    let Q=0;
    for(let i=1;i<N;i++){
      if(grid[i]<=0) continue;
      const f=j=>Na-pC(phi[j]); // ionised acceptors not neutralised by holes (electron spill-over belongs to the n side)
      Q+=q*0.5*(f(i)+f(i-1))*(grid[i]-Math.max(grid[i-1],0));
    }
    return Q;
  }
  const C=V=>{const dV=0.01; return (solve(V+dV)-solve(Math.max(V-dV,0)))/(V+dV-Math.max(V-dV,0));};
  // electric field profile E(x) = −dφ/dx (V/cm) at reverse bias Vr, on cell midpoints
  const field=Vr=>{solve(Vr); const x=[],E=[]; for(let i=1;i<grid.length;i++){x.push((grid[i]+grid[i-1])/2); E.push(-(lastPhi[i]-lastPhi[i-1])/(grid[i]-grid[i-1]));} return {x,E};};
  return {solve,C,field};
}

/* ---------- 3) 2D Laplace finite-volume solver ----------
   Half structure (x ≥ 0, symmetry plane at the gate centre), coordinates in nm.
   Electrodes: gate (x ≤ Lg/2, tox ≤ z ≤ tox+Hg) at 1 V; Si surface z = 0 and the
   plug (gE+dpg ≤ x ≤ gE+dpg+CD, z ≤ Hp) at 0 V. Other outer boundaries Neumann.
   Media: gate dielectric (k_ox) under the gate, spacer (k_sp) for gE ≤ x ≤ gE+Wsp,
   z ≤ tox+Hg, ILD (k_ild) elsewhere. Plug is treated as a line along W (2D limit).
   Returns C per unit width (F/cm) of the half gate, and the extrinsic part after
   subtracting the ideal bottom plate ε_ox·(Lg/2)/tox.  */
function axis(breaks,hminAt,hmax,r){
  const pts=[breaks[0]];
  for(let s=0;s<breaks.length-1;s++){
    const a=breaks[s], b=breaks[s+1], mid=(a+b)/2;
    const L=[],R=[];
    let x=a,h=hminAt(a); while(x+h<mid-1e-9){x+=h;L.push(x);h=Math.min(h*r,hmax);}
    x=b;h=hminAt(b); while(x-h>mid+1e-9){x-=h;R.push(x);h=Math.min(h*r,hmax);}
    const inner=L.concat(R.reverse());
    // merge points that are too close around the middle
    const seg=[];
    inner.forEach(v=>{if(!seg.length||v-seg[seg.length-1]>1e-6) seg.push(v);});
    seg.forEach(v=>{if(v-pts[pts.length-1]>1e-6&&b-v>1e-6) pts.push(v);});
    pts.push(b);
  }
  return pts;
}
/* Generic 2D finite-volume Laplace solver on a tensor grid.
   X, Z: node coordinates. K(i,j): material coefficient of cell (i,j) (ε_r or σ).
   fixed/phi: Dirichlet mask and values (modified in place). Returns stored "energy" Σ g·Δφ²,
   which is C/ε0 for electrostatics or the conductance for a resistor (per unit depth). */
function fv2d(X,Z,K,fixed,phi){
  const nx=X.length, nz=Z.length, N=nx*nz;
  const id=(i,j)=>i*nz+j;
  // edge conductances (relative ε units, dimensionless for 2D)
  const gx=new Float64Array(N), gz=new Float64Array(N); // gx[id(i,j)]: between (i,j) and (i+1,j)
  for(let i=0;i<nx-1;i++)for(let j=0;j<nz;j++){
    const hx=X[i+1]-X[i], hzl=j>0?Z[j]-Z[j-1]:0, hzu=j<nz-1?Z[j+1]-Z[j]:0;
    gx[id(i,j)]=(K(i,j-1)*hzl/2+K(i,j)*hzu/2)/hx;
  }
  for(let i=0;i<nx;i++)for(let j=0;j<nz-1;j++){
    const hz=Z[j+1]-Z[j], hxl=i>0?X[i]-X[i-1]:0, hxr=i<nx-1?X[i+1]-X[i]:0;
    gz[id(i,j)]=(K(i-1,j)*hxl/2+K(i,j)*hxr/2)/hz;
  }
  // Matrix-free PCG on free nodes
  const diag=new Float64Array(N);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j);
    diag[n]=(i<nx-1?gx[n]:0)+(i>0?gx[id(i-1,j)]:0)+(j<nz-1?gz[n]:0)+(j>0?gz[id(i,j-1)]:0);}
  function Amul(v,out){ // out = A v restricted to free nodes (fixed entries zero in v)
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j);
      if(fixed[n]){out[n]=0;continue;}
      let s=diag[n]*v[n];
      if(i<nx-1) s-=gx[n]*v[id(i+1,j)];
      if(i>0) s-=gx[id(i-1,j)]*v[id(i-1,j)];
      if(j<nz-1) s-=gz[n]*v[id(i,j+1)];
      if(j>0) s-=gz[id(i,j-1)]*v[id(i,j-1)];
      out[n]=s;}
  }
  // rhs: b = -A_free,fixed * phi_fixed
  // nodes touching no conducting cell are decoupled: pin them
  for(let n=0;n<N;n++) if(!fixed[n]&&diag[n]===0){fixed[n]=1;phi[n]=0;}
  const b=new Float64Array(N), tmp=new Float64Array(N);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j); if(fixed[n]) continue;
    let s=0;
    if(i<nx-1&&fixed[id(i+1,j)]) s+=gx[n]*phi[id(i+1,j)];
    if(i>0&&fixed[id(i-1,j)]) s+=gx[id(i-1,j)]*phi[id(i-1,j)];
    if(j<nz-1&&fixed[id(i,j+1)]) s+=gz[n]*phi[id(i,j+1)];
    if(j>0&&fixed[id(i,j-1)]) s+=gz[id(i,j-1)]*phi[id(i,j-1)];
    b[n]=s;}
  const xv=new Float64Array(N), rv=Float64Array.from(b), zv=new Float64Array(N), pv=new Float64Array(N);
  for(let n=0;n<N;n++){ if(!fixed[n]) zv[n]=rv[n]/diag[n]; }
  pv.set(zv); let rz=0; for(let n=0;n<N;n++) rz+=rv[n]*zv[n];
  const b2=Math.sqrt(b.reduce((s,v)=>s+v*v,0)); let it=0;
  for(it=0;it<20000;it++){
    Amul(pv,tmp); let pAp=0; for(let n=0;n<N;n++) pAp+=pv[n]*tmp[n];
    const al=rz/pAp; let rr=0;
    for(let n=0;n<N;n++){xv[n]+=al*pv[n]; rv[n]-=al*tmp[n]; rr+=rv[n]*rv[n];}
    if(Math.sqrt(rr)<1e-11*b2) break;
    let rz2=0; for(let n=0;n<N;n++){ if(!fixed[n]){zv[n]=rv[n]/diag[n]; rz2+=rv[n]*zv[n];} }
    const be=rz2/rz; rz=rz2; for(let n=0;n<N;n++) pv[n]=zv[n]+be*pv[n];
  }
  for(let n=0;n<N;n++) if(!fixed[n]) phi[n]=xv[n];
  let E=0;
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j);
    if(i<nx-1){const d=phi[n]-phi[id(i+1,j)]; E+=gx[n]*d*d;}
    if(j<nz-1){const d=phi[n]-phi[id(i,j+1)]; E+=gz[n]*d*d;}}
  return {E,iters:it};
}
function fringe2d(g,opt={}){
  const {Lg,tox,Hg,Wsp,dpg,CD,Hp,kox,ksp,kild}=g;
  const hasPlug=dpg!=null&&isFinite(dpg);
  const gE=Lg/2;
  const refine=opt.refine||1;
  const hmin=Math.min(tox/4,0.5)/refine, hmax=6/refine, r=1+0.18/refine;
  const Xmax=hasPlug?gE+dpg+CD+Math.max(150,2*Hg):gE+Math.max(6*Hg,600);
  const Zmax=Math.max(hasPlug?Hp:0,tox+Hg)+Math.max(250,2*Hg);
  const xb=[0,gE]; [gE+Wsp].concat(hasPlug?[gE+dpg,gE+dpg+CD]:[]).forEach(v=>{if(v>gE)xb.push(v);});
  xb.push(Xmax); xb.sort((a,b)=>a-b);
  const zb=[0,tox,tox+Hg]; if(hasPlug) zb.push(Hp); zb.push(Zmax); zb.sort((a,b)=>a-b);
  const uniq=a=>a.filter((v,i)=>i===0||v-a[i-1]>1e-6);
  const near=(v,list,h)=>list.some(b=>Math.abs(b-v)<1e-9)?h:hmin*4;
  const X=axis(uniq(xb),v=>Math.abs(v-gE)<1e-9||(hasPlug&&Math.abs(v-(gE+dpg))<1e-9)?hmin:(v===0?hmax:hmin*3),hmax,r);
  const Z=axis(uniq(zb),v=>(v<=tox+1e-9)?hmin:(v>=Zmax-1e-9?hmax:hmin*3),hmax,r);
  const nx=X.length, nz=Z.length;
  // cell permittivity (relative) for cell (i,j) between X[i],X[i+1], Z[j],Z[j+1]
  const kc=new Float64Array((nx-1)*(nz-1));
  for(let i=0;i<nx-1;i++){const xc=(X[i]+X[i+1])/2;
    for(let j=0;j<nz-1;j++){const zc=(Z[j]+Z[j+1])/2; let k=kild;
      if(xc<gE&&zc<tox) k=kox;
      else if(xc>gE&&xc<gE+Wsp&&zc<tox+Hg) k=ksp;
      kc[i*(nz-1)+j]=k;}}
  const K=(i,j)=>(i<0||j<0||i>=nx-1||j>=nz-1)?0:kc[i*(nz-1)+j];
  // Dirichlet map
  const N=nx*nz, fixed=new Int8Array(N), phi=new Float64Array(N);
  const id=(i,j)=>i*nz+j;
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
    const x=X[i],z=Z[j],n=id(i,j);
    if(z<=1e-12){fixed[n]=1;phi[n]=0;}
    if(x<=gE+1e-9&&z>=tox-1e-9&&z<=tox+Hg+1e-9){fixed[n]=1;phi[n]=1;}
    if(hasPlug&&x>=gE+dpg-1e-9&&x<=gE+dpg+CD+1e-9&&z<=Hp+1e-9){fixed[n]=1;phi[n]=0;}
  }
  const {E,iters:it}=fv2d(X,Z,K,fixed,phi);
  const Ctot=E*e0;                    // F/cm (per unit width), half gate
  const Cbottom=kox*e0*gE/tox;        // ideal parallel plate under half gate
  return {Ctot,Cext:Ctot-Cbottom,nodes:N,iters:it,nx,nz};
}

/* ---------- 4) 2D resistor: channel end → overlap → extension under the spacer ----------
   Cross-section in x (along L) and z (depth, 0 = Si surface), per unit width, coordinates nm.
   x < 0          : channel inversion layer, thickness t_l, sheet R_inv, p-substrate below (insulating)
   0 ≤ x ≤ L_ov   : n extension (depth X_j,ext, resistivity ρ_ext) + gate-induced accumulation layer
                    in the top t_l (sheet R_acc) in parallel
   L_ov < x ≤ end : extension only (under the spacer), length W_sp
   Contacts: V = 1 on the inversion layer at x = −L_c; V = 0 across the extension at the far end.
   Returns R·W (Ω·cm) of the whole path and the "front" part after removing the plain
   channel-sheet and spacer-extension resistances, i.e. overlap + spreading.            */
function resistor2d({Lov,Wsp,Xj,rhoExt,Rinv,Racc,tl=2,Lc=40},opt={}){
  const refine=opt.refine||1, hmin=0.2/refine, hmax=3/refine, r=1+0.15/refine;
  const xEnd=Lov+Wsp;
  const xb=[-Lc,0]; if(Lov>1e-6) xb.push(Lov); xb.push(xEnd);
  const X=axis(xb,v=>(Math.abs(v)<1e-9||Math.abs(v-Lov)<1e-9)?hmin:hmin*4,hmax,r);
  const Z=axis([0,tl,Xj],v=>v<=tl+1e-9?hmin:hmin*3,hmax,r);
  const nx=X.length, nz=Z.length, cm=1e-7;
  const sExt=1/rhoExt, sInv=1/(Rinv*tl*cm), sAcc=1/(Racc*tl*cm);
  const kc=new Float64Array((nx-1)*(nz-1));
  for(let i=0;i<nx-1;i++){const xc=(X[i]+X[i+1])/2;
    for(let j=0;j<nz-1;j++){const zc=(Z[j]+Z[j+1])/2; let k=0;
      if(xc<0){ if(zc<tl) k=sInv; }
      else if(xc<Lov){ k=sExt+(zc<tl?sAcc:0); }
      else k=sExt;
      kc[i*(nz-1)+j]=k;}}
  const K=(i,j)=>(i<0||j<0||i>=nx-1||j>=nz-1)?0:kc[i*(nz-1)+j];
  const N=nx*nz, fixed=new Int8Array(N), phi=new Float64Array(N);
  for(let j=0;j<nz;j++){ if(Z[j]<=tl+1e-9){fixed[j]=1;phi[j]=1;} fixed[(nx-1)*nz+j]=1; phi[(nx-1)*nz+j]=0; }
  const {E}=fv2d(X,Z,K,fixed,phi);
  const RW=1/E;                                  // Ω·cm
  const front=RW-Rinv*Lc*cm-(rhoExt/(Xj*cm))*Wsp*cm;
  return {RW,front};
}

/* ---------- 5) 2D nonlinear Poisson, subthreshold MOSFET ----------
   Half-plane cross-section (x along L, z depth; z<0 is the gate dielectric), Boltzmann statistics.
   Rectangular n⁺ extension (depth X_j,ext, reaching L_ov under the gate) and deep S/D (depth X_j,
   starting at the spacer edge); uniform p channel N_A. Gate electrode on top of an EOT-thick SiO₂
   layer over the gate length; Si surface outside the gate is Neumann (spacer).
   Quasi-Fermi levels: holes 0 everywhere; electrons 0 on the source side, V_DS on the drain side
   (valid in subthreshold, where channel electrons do not perturb the potential).
   Subthreshold current from the channel electron sheet density Q_n(x):
       I ∝ (1 − e^{−V_DS/vt}) / ∫ dx / Q_n(x)          (Taur & Ning, 2-D subthreshold current)
   Returns log10 of that current (arbitrary units, same for every call) for a list of gate voltages. */
function mos2d(g,Vgs,Vds,opt={}){
  const {Lg,Lov,Wsp,Xj,Xjext,EOT,Na,Next,Nsd,Vfb,ni,T}=g;
  const vt=kB*T/q, phiF=vt*Math.log(Na/ni), cm=1e-7;
  const refine=opt.refine||1, hmin=0.5/refine, hmax=Math.max(3,Lg/25)/refine, r=1+0.15/refine;
  const gE=Lg/2, xj0=gE-Lov, Lend=gE+Wsp+40;
  const Wd=Math.sqrt(2*eSi*2*phiF/(q*Na))/cm;
  const D=opt.depth||Math.max(3*Wd,Xj+2*Wd);
  const X=axis([-Lend,-gE-Wsp,-gE,-xj0,0,xj0,gE,gE+Wsp,Lend].filter((v,i,a)=>i===0||v>a[i-1]+1e-6),
    v=>Math.abs(Math.abs(v)-xj0)<1e-9||Math.abs(Math.abs(v)-gE)<1e-9?hmin:hmin*3,hmax,r);
  const Z=axis([-EOT,0,Xjext,Xj,D].filter((v,i,a)=>i===0||v>a[i-1]+1e-6),v=>v<=1e-9?Math.min(hmin,EOT/3):hmin*3,hmax,r);
  const nx=X.length,nz=Z.length,N=nx*nz,id=(i,j)=>i*nz+j;
  // cells: ε (F/cm·cm units handled via cm lengths)
  const eps=new Float64Array((nx-1)*(nz-1));
  for(let i=0;i<nx-1;i++){const xc=(X[i]+X[i+1])/2;
    for(let j=0;j<nz-1;j++){const zc=(Z[j]+Z[j+1])/2;
      eps[i*(nz-1)+j]= zc<0 ? (Math.abs(xc)<gE?eOx:0) : eSi;}}
  const E=(i,j)=>(i<0||j<0||i>=nx-1||j>=nz-1)?0:eps[i*(nz-1)+j];
  const gx=new Float64Array(N),gz=new Float64Array(N),area=new Float64Array(N);
  for(let i=0;i<nx-1;i++)for(let j=0;j<nz;j++){const hx=(X[i+1]-X[i])*cm,hzl=j>0?(Z[j]-Z[j-1])*cm:0,hzu=j<nz-1?(Z[j+1]-Z[j])*cm:0;
    gx[id(i,j)]=(E(i,j-1)*hzl/2+E(i,j)*hzu/2)/hx;}
  for(let i=0;i<nx;i++)for(let j=0;j<nz-1;j++){const hz=(Z[j+1]-Z[j])*cm,hxl=i>0?(X[i]-X[i-1])*cm:0,hxr=i<nx-1?(X[i+1]-X[i])*cm:0;
    gz[id(i,j)]=(E(i-1,j)*hxl/2+E(i,j)*hxr/2)/hz;}
  const dop=new Float64Array(N), qfn=new Float64Array(N), fixed=new Int8Array(N), phi=new Float64Array(N);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j),x=X[i],z=Z[j],ax=Math.abs(x);
    // Si dual-cell area (charge lives only in Si)
    const hxl=i>0?(X[i]-X[i-1])*cm:0,hxr=i<nx-1?(X[i+1]-X[i])*cm:0,hzl=j>0?(Z[j]-Z[j-1])*cm:0,hzu=j<nz-1?(Z[j+1]-Z[j])*cm:0;
    area[n]=(z>=0?((z>0?hzl/2:0)+hzu/2):0)*(hxl+hxr)/2;
    let Nd=0; if(z>=0){ if(ax>=gE+Wsp-1e-9&&z<=Xj+1e-9) Nd=Nsd; else if(ax>=xj0-1e-9&&z<=Xjext+1e-9) Nd=Next; }
    dop[n]=Nd-Na;
    qfn[n]= x>0 ? Vds : 0;
    const eq=Nd>0? vt*Math.log(Nd/ni) : -phiF;
    phi[n]=(z<0?-phiF:eq)+(Nd>0?qfn[n]:0);
    if(z<=-EOT+1e-9&&ax<=gE+1e-9){fixed[n]=1;}
    if(z>=D-1e-9){fixed[n]=1;phi[n]=-phiF;}
    if(i===0||i===nx-1){ if(Nd>0){fixed[n]=1;phi[n]=vt*Math.log(Nd/ni)+qfn[n];} }
  }
  const diagK=new Float64Array(N);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j);diagK[n]=(i<nx-1?gx[n]:0)+(i>0?gx[id(i-1,j)]:0)+(j<nz-1?gz[n]:0)+(j>0?gz[id(i,j-1)]:0);}
  for(let n=0;n<N;n++) if(!fixed[n]&&diagK[n]===0){fixed[n]=1;}
  const nE=n=>ni*Math.exp((phi[n]-qfn[n])/vt), pH=n=>ni*Math.exp(-phi[n]/vt);
  const Kmul=(v,out)=>{for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j);let s=diagK[n]*v[n];
      if(i<nx-1)s-=gx[n]*v[id(i+1,j)]; if(i>0)s-=gx[id(i-1,j)]*v[id(i-1,j)]; if(j<nz-1)s-=gz[n]*v[id(i,j+1)]; if(j>0)s-=gz[id(i,j-1)]*v[id(i,j-1)]; out[n]=s;}};
  const res=[], voxC=[], ionI=[]; const tmp=new Float64Array(N);
  for(const Vg of Vgs){
    const phiG=Vg-Vfb-phiF;
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j); if(Z[j]<=-EOT+1e-9&&Math.abs(X[i])<=gE+1e-9) phi[n]=phiG;}
    for(let it=0;it<100;it++){
      // F = -K φ + q A ρ ; solve (K + D) δ = F on free nodes
      Kmul(phi,tmp);
      const F=new Float64Array(N), Dg=new Float64Array(N);
      for(let n=0;n<N;n++){ if(fixed[n]) continue; const nn=nE(n),pp=pH(n);
        F[n]=-tmp[n]+q*area[n]*(pp-nn+dop[n]); Dg[n]=diagK[n]+q*area[n]*(nn+pp)/vt; }
      // PCG
      const x=new Float64Array(N), rr=Float64Array.from(F), zz=new Float64Array(N), pp=new Float64Array(N), Ap=new Float64Array(N);
      for(let n=0;n<N;n++) if(!fixed[n]) zz[n]=rr[n]/Dg[n];
      pp.set(zz); let rz=0; for(let n=0;n<N;n++) rz+=rr[n]*zz[n];
      const b2=Math.sqrt(F.reduce((a,v)=>a+v*v,0)); if(b2===0) break;
      for(let k=0;k<4000;k++){
        for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j); if(fixed[n]){Ap[n]=0;continue;}
          let s=Dg[n]*pp[n]; const a1=i<nx-1?id(i+1,j):-1,a2=i>0?id(i-1,j):-1,a3=j<nz-1?id(i,j+1):-1,a4=j>0?id(i,j-1):-1;
          if(a1>=0&&!fixed[a1])s-=gx[n]*pp[a1]; if(a2>=0&&!fixed[a2])s-=gx[a2]*pp[a2]; if(a3>=0&&!fixed[a3])s-=gz[n]*pp[a3]; if(a4>=0&&!fixed[a4])s-=gz[a4]*pp[a4];
          Ap[n]=s;}
        let pAp=0; for(let n=0;n<N;n++) pAp+=pp[n]*Ap[n];
        const al=rz/pAp; let r2=0;
        for(let n=0;n<N;n++){x[n]+=al*pp[n]; rr[n]-=al*Ap[n]; r2+=rr[n]*rr[n];}
        if(Math.sqrt(r2)<1e-10*b2) break;
        let rz2=0; for(let n=0;n<N;n++) if(!fixed[n]){zz[n]=rr[n]/Dg[n]; rz2+=rr[n]*zz[n];}
        const be=rz2/rz; rz=rz2; for(let n=0;n<N;n++) pp[n]=zz[n]+be*pp[n];
      }
      let md=0; for(let n=0;n<N;n++){ if(fixed[n]) continue; const d=Math.max(-0.1,Math.min(0.1,x[n])); phi[n]+=d; md=Math.max(md,Math.abs(d)); }
      if(md<1e-7) break;
    }
    // channel electron sheet density with source quasi-Fermi level (subthreshold)
    let integ=0;
    for(let i=0;i<nx-1;i++){ const xc=(X[i]+X[i+1])/2; if(Math.abs(xc)>=xj0) continue;
      let Qa=0,Qb=0;
      for(let j=0;j<nz-1;j++){ if(Z[j]<0) continue; const dz=(Z[j+1]-Z[j])*cm;
        Qa+=0.5*(Math.exp(phi[id(i,j)]/vt)+Math.exp(phi[id(i,j+1)]/vt))*ni*dz;
        Qb+=0.5*(Math.exp(phi[id(i+1,j)]/vt)+Math.exp(phi[id(i+1,j+1)]/vt))*ni*dz; }
      integ+=(X[i+1]-X[i])*cm*0.5*(1/Qa+1/Qb); }
    res.push(Math.log10((1-Math.exp(-Vds/vt))/integ));
    if(opt.ionize) ionI.push(fieldLineIonisation());
    // oxide voltage at the channel centre: gate potential minus Si surface potential under x = 0
    { let ic=0; for(let i=1;i<nx;i++) if(Math.abs(X[i])<Math.abs(X[ic])) ic=i;
      let js=0; for(let j=0;j<nz;j++) if(Math.abs(Z[j])<Math.abs(Z[js])) js=j;
      voxC.push(phiG-phi[id(ic,js)]); }
  }
  return {logI:res,voxCentre:voxC,ionI,nodes:N};

  /* maximum hole-initiated ionisation integral over field lines through the high-field region of the Si */
  function fieldLineIonisation(){
    // nodal field in Si (V/cm) by central differences
    const Ex=new Float64Array(N), Ez=new Float64Array(N);
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){ if(Z[j]<0) continue; const n=id(i,j);
      const i0=Math.max(i-1,0), i1=Math.min(i+1,nx-1), j0=Math.max(j-1,0), j1=Math.min(j+1,nz-1);
      const zj0=Z[j0]<0?j:j0;
      Ex[n]=-(phi[id(i1,j)]-phi[id(i0,j)])/((X[i1]-X[i0])*cm);
      Ez[n]=-(phi[id(i,j1)]-phi[id(i,zj0)])/(((Z[j1]-Z[zj0])||1e-9)*cm); }
    const findCell=(A,v)=>{let lo=0,hi=A.length-2; if(v<=A[0]) return 0; if(v>=A[A.length-1]) return A.length-2;
      while(hi-lo>1){const m=(lo+hi)>>1; if(A[m]<=v) lo=m; else hi=m;} return lo;};
    const Eat=(x,z)=>{ if(z<0||z>D||x<X[0]||x>X[nx-1]) return null;
      const i=findCell(X,x), j=findCell(Z,z), tx=(x-X[i])/(X[i+1]-X[i]), tz=(z-Z[j])/(Z[j+1]-Z[j]);
      const w=[(1-tx)*(1-tz),tx*(1-tz),(1-tx)*tz,tx*tz], ns=[id(i,j),id(i+1,j),id(i,j+1),id(i+1,j+1)];
      let ex=0,ez=0; for(let k=0;k<4;k++){ex+=w[k]*Ex[ns[k]];ez+=w[k]*Ez[ns[k]];} return [ex,ez]; };
    // trace from (x,z) along +E (sign=+1, hole direction) or −E (electron direction); returns list of {ds,E}
    // field lines that reach the Si surface continue along it (carriers cannot enter the oxide)
    const trace=(x,z,sign)=>{const out=[]; for(let k=0;k<4000;k++){const e=Eat(x,z); if(!e) break; const m=Math.hypot(e[0],e[1]); if(m<2e4) break;
        const h=0.4; let dx=sign*e[0]/m*h, dz=sign*e[1]/m*h;
        if(z+dz<0){ if(Math.abs(e[0])<0.05*m) break; dx=Math.sign(sign*e[0])*h; dz=-z; }
        x+=dx; z+=dz; out.push({ds:h*cm,E:m});} return out;};
    let Emx=0; for(let n=0;n<N;n++) Emx=Math.max(Emx,Math.hypot(Ex[n],Ez[n]));
    let best=0; let bestInfo=null;
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){ if(Z[j]<0||X[i]<0) continue; const n=id(i,j);
      if(Math.hypot(Ex[n],Ez[n])<0.25*Emx||(i+j)%2) continue;
      const back=trace(X[i],Z[j],-1).reverse(), fwd=trace(X[i],Z[j],+1);
      const path=back.concat(fwd);                         // n side → p side
      const v=ionPath(path.map(p=>p.ds),path.map(p=>p.E),T); if(v>best){best=v;bestInfo={x:X[i],z:Z[j],len:path.length*0.4,Emax:Math.max(...path.map(p=>p.E))};}
    }
    if(opt.debug) console.log('Emx',Emx.toExponential(2),'best',best.toFixed(3),JSON.stringify(bestInfo));
    return best;
  }
}

/* ---------- 5b) 2D resistor for the HV drift (low current, no depletion) ----------
   x from the gate edge (0) to the contact at L_off + L_c, z depth. Conductivity σ = qµ(N)N of the local
   donor sum: LDD (z ≤ X_j,ext, all x), DDD (x ≥ L_off − O_ddd, z ≤ X_j,ddd), n⁺ (x ≥ L_off, z ≤ X_j).
   Current injected uniformly across the LDD depth at x = 0; contact across the n⁺ depth at the far end.
   Returns R·W (Ω·cm); subtracting the n⁺ sheet over L_c gives the drift part.                         */
function drift2d({Loff,Oddd,Xjext,Xjddd,Xj,Next,Nddd,Nsd,mu},opt={}){
  const Lc=opt.Lc||300, refine=opt.refine||1, hmin=2/refine, hmax=20/refine, r=1+0.15/refine;
  const xO=Math.max(Loff-Oddd,0), xb=[0]; if(xO>1e-6&&xO<Loff-1e-6) xb.push(xO); xb.push(Loff,Loff+Lc);
  const X=axis(xb,v=>hmin*2,hmax,r);
  const Zmax=Math.max(Xjext,Xjddd,Xj);
  const Z=axis([0,Xj,Xjext,Xjddd].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b).filter((v,i,a)=>i===0||v>a[i-1]+1e-6),v=>hmin*2,hmax,r);
  const nx=X.length,nz=Z.length,cm=1e-7;
  const kc=new Float64Array((nx-1)*(nz-1));
  for(let i=0;i<nx-1;i++){const xc=(X[i]+X[i+1])/2; for(let j=0;j<nz-1;j++){const zc=(Z[j]+Z[j+1])/2;
    let Nd=0; if(zc<Xjext) Nd+=Next; if(xc>=xO&&zc<Xjddd) Nd+=Nddd; if(xc>=Loff&&zc<Xj) Nd+=Nsd;
    kc[i*(nz-1)+j]=Nd>0?q*mu(Nd)*Nd:0;}}
  const K=(i,j)=>(i<0||j<0||i>=nx-1||j>=nz-1)?0:kc[i*(nz-1)+j];
  const N=nx*nz, fixed=new Int8Array(N), phi=new Float64Array(N);
  for(let j=0;j<nz;j++){ if(Z[j]<=Xjext+1e-9){fixed[j]=1;phi[j]=1;} if(Z[j]<=Xj+1e-9){fixed[(nx-1)*nz+j]=1;phi[(nx-1)*nz+j]=0;} }
  const {E}=fv2d(X,Z,K,fixed,phi);
  const RW=1/E;                                   // Ω·cm (2D conductance per unit depth is dimensionless·σ)
  const RshSD=1/(q*mu(Nsd+Nddd*0)*Nsd*Xj*cm);
  return {RW,drift:RW-RshSD*Lc*cm,Zmax};
}

/* ---------- 6) 2D nonlinear Poisson for HV drains (DDD, offset n⁺), drain-voltage sweep ----------
   Full cross-section (source and drain), x along L, z depth (z < 0: gate dielectric of thickness EOT under
   the gate only; the Si surface elsewhere is Neumann). Uniform p body N_A (take N_A = N_well). Donors add:
     LDD  N_ext  for |x| ≥ L_g/2 − L_ov,          z ≤ X_j,ext
     DDD  N_ddd  for |x| ≥ L_g/2 + L_off − O_ddd, z ≤ X_j,ddd
     n⁺   N_sd   for |x| ≥ L_g/2 + L_off,         z ≤ X_j
   Holes at φp = 0 everywhere (they may invert the drift surface under the gate), electrons at 0 on the
   source half and V_D on the drain half. Newton with a banded Cholesky solve (exact, no iteration count
   issues on graded meshes); continuation in V_D with linear extrapolation of the previous two solutions.
   For each V_D returns the hole-initiated ionisation integral maximised over field lines (field lines that
   reach the surface continue along it) and the subthreshold channel-current integral (as in mos2d).        */
function hv2d(g,VdList,opt={}){
  const {Lg,Lov,Loff,Oddd=0,Xjext,Xjddd=0,Xj,EOT,Na,Next,Nddd=0,Nsd,Vfb,ni,T,Vg=0}=g;
  const vt=kB*T/q, phiF=vt*Math.log(Na/ni), cm=1e-7;
  const refine=opt.refine||1, hmin=(opt.hmin||8)/refine, hmax=(opt.hmax||80)/refine, r=1+0.2/refine;
  const gE=Lg/2, Lnp=opt.Lnp||800, Lend=gE+Loff+Lnp;
  const Vmax=Math.max(...VdList);
  const D=opt.depth||Math.max(1.4*Math.sqrt(2*eSi*(Vmax+1)/(q*Na))/cm, 3*Math.max(Xj,Xjddd,Xjext), 600);
  const xjL=gE-Lov, xO=gE+Loff-Oddd, xN=gE+Loff;
  const xbr=[0,xjL,gE,xO,xN,Lend].filter(v=>v>=0).sort((a,b)=>a-b).filter((v,i,a)=>i===0||v>a[i-1]+1e-6);
  const xs=xbr.slice(1).map(v=>-v).reverse().concat(xbr);
  const fine=v=>{const a=Math.abs(v); return (Math.abs(a-xjL)<1e-9||Math.abs(a-gE)<1e-9||Math.abs(a-xN)<1e-9||Math.abs(a-xO)<1e-9)?hmin:hmax;};
  const X=axis(xs,fine,hmax,r);
  const zb=[-EOT,0,Xjext,Xj,Xjddd,D].filter(v=>v>=-EOT).sort((a,b)=>a-b).filter((v,i,a)=>i===0||v>a[i-1]+1e-6);
  const Z=axis(zb,v=>v<=1e-9?Math.min(hmin/2,EOT/3):(v>=D-1e-9?hmax*2:hmin*1.5),hmax*2,r);
  const nx=X.length,nz=Z.length,N=nx*nz,id=(i,j)=>i*nz+j;
  const eps=new Float64Array((nx-1)*(nz-1));
  for(let i=0;i<nx-1;i++){const xc=(X[i]+X[i+1])/2; for(let j=0;j<nz-1;j++){const zc=(Z[j]+Z[j+1])/2;
    eps[i*(nz-1)+j]= zc<0 ? (Math.abs(xc)<gE?eOx:0) : eSi;}}
  const Ec=(i,j)=>(i<0||j<0||i>=nx-1||j>=nz-1)?0:eps[i*(nz-1)+j];
  const gx=new Float64Array(N),gz=new Float64Array(N),area=new Float64Array(N);
  for(let i=0;i<nx-1;i++)for(let j=0;j<nz;j++){const hx=(X[i+1]-X[i])*cm,hzl=j>0?(Z[j]-Z[j-1])*cm:0,hzu=j<nz-1?(Z[j+1]-Z[j])*cm:0;
    gx[id(i,j)]=(Ec(i,j-1)*hzl/2+Ec(i,j)*hzu/2)/hx;}
  for(let i=0;i<nx;i++)for(let j=0;j<nz-1;j++){const hz=(Z[j+1]-Z[j])*cm,hxl=i>0?(X[i]-X[i-1])*cm:0,hxr=i<nx-1?(X[i+1]-X[i])*cm:0;
    gz[id(i,j)]=(Ec(i-1,j)*hxl/2+Ec(i,j)*hxr/2)/hz;}
  const dop=new Float64Array(N), Ndn=new Float64Array(N), right=new Int8Array(N), fixed=new Int8Array(N), phi=new Float64Array(N);
  const NdAt=(ax,z)=>{ if(z<0) return 0; let d=0; if(ax>=xjL-1e-9&&z<=Xjext+1e-9) d+=Next; if(Nddd>0&&ax>=xO-1e-9&&z<=Xjddd+1e-9) d+=Nddd; if(ax>=xN-1e-9&&z<=Xj+1e-9) d+=Nsd; return d; };
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j),x=X[i],z=Z[j],ax=Math.abs(x);
    const hxl=i>0?(X[i]-X[i-1])*cm:0,hxr=i<nx-1?(X[i+1]-X[i])*cm:0,hzl=j>0?(Z[j]-Z[j-1])*cm:0,hzu=j<nz-1?(Z[j+1]-Z[j])*cm:0;
    area[n]=(z>=0?((z>0?hzl/2:0)+hzu/2):0)*(hxl+hxr)/2;
    const Nd=NdAt(ax,z); Ndn[n]=Nd; dop[n]=Nd-Na; right[n]=x>0?1:0;
    phi[n]= z<0 ? -phiF : (Nd>Na? vt*Math.log((Nd-Na)/ni) : -vt*Math.log(Math.max(Na-Nd,ni)/ni));
    if(z<=-EOT+1e-9&&ax<=gE+1e-9) fixed[n]=1;
    if(z>=D-1e-9){fixed[n]=1;}
    // ohmic contact only inside the n⁺ (a contact across the depleted DDD would pin it and crowd the field)
    if((i===0||i===nx-1)&&z<=Xj+1e-9) fixed[n]=1;
  }
  const diagK=new Float64Array(N);
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j);diagK[n]=(i<nx-1?gx[n]:0)+(i>0?gx[id(i-1,j)]:0)+(j<nz-1?gz[n]:0)+(j>0?gz[id(i,j-1)]:0);}
  for(let n=0;n<N;n++) if(!fixed[n]&&diagK[n]===0) fixed[n]=1;
  const bw=nz; // band (lower) width
  const Lb=new Float64Array(N*(bw+1));
  const out=[]; let prev=null, prev2=null, Vprev=null, Vprev2=null;
  const setBC=Vd=>{ const phiG=Vg-Vfb-phiF;
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j); if(!fixed[n]) continue; const z=Z[j];
      if(z<0) phi[n]=phiG; else if(z>=D-1e-9) phi[n]=-phiF; else phi[n]=vt*Math.log((Ndn[n]-Na)/ni)+(right[n]?Vd:0);} };
  for(const Vd of VdList){
    if(prev&&prev2){ const f=(Vd-Vprev)/(Vprev-Vprev2); for(let n=0;n<N;n++) phi[n]=prev[n]+f*(prev[n]-prev2[n]); }
    else if(!prev){ for(let n=0;n<N;n++) if(right[n]&&Ndn[n]>Na) phi[n]+=Vd; }
    setBC(Vd);
    const qfn=n=>right[n]?Vd:0;
    let conv=false;
    for(let it=0;it<80;it++){
      // residual F and Jacobian (K + q·A·(n+p)/vt) on free nodes
      const F=new Float64Array(N), Dg=new Float64Array(N);
      for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const n=id(i,j); if(fixed[n]) continue;
        let s=diagK[n]*phi[n];
        if(i<nx-1)s-=gx[n]*phi[id(i+1,j)]; if(i>0)s-=gx[id(i-1,j)]*phi[id(i-1,j)]; if(j<nz-1)s-=gz[n]*phi[id(i,j+1)]; if(j>0)s-=gz[id(i,j-1)]*phi[id(i,j-1)];
        const ne=ni*Math.exp((phi[n]-qfn(n))/vt), ph=ni*Math.exp(-phi[n]/vt);
        F[n]=-s+q*area[n]*(ph-ne+dop[n]); Dg[n]=diagK[n]+q*area[n]*(ne+ph)/vt; }
      // banded Cholesky of the SPD Jacobian (fixed nodes: identity rows)
      Lb.fill(0);
      for(let n=0;n<N;n++){ const b=n*(bw+1);
        if(fixed[n]){ Lb[b]=1; continue; }
        Lb[b]=Dg[n]; const i=Math.floor(n/nz), j=n%nz;
        if(j>0&&!fixed[n-1]) Lb[b+1]=-gz[n-1];
        if(i>0&&!fixed[n-nz]) Lb[b+nz]=-gx[n-nz]; }
      for(let jn=0;jn<N;jn++){ const bj=jn*(bw+1);
        let d=Lb[bj]; for(let k=1;k<=bw&&k<=jn;k++){const v=Lb[bj+k]; d-=v*v;}
        d=Math.sqrt(d); Lb[bj]=d;
        const iMax=Math.min(N-1,jn+bw);
        for(let i2=jn+1;i2<=iMax;i2++){ const bi=i2*(bw+1), off=i2-jn; let a=Lb[bi+off]; if(a===0&&fixed[i2]) continue;
          for(let k=1;off+k<=bw&&k<=jn;k++) a-=Lb[bi+off+k]*Lb[bj+k];
          Lb[bi+off]=a/d; } }
      const y=new Float64Array(N);
      for(let n=0;n<N;n++){ const b=n*(bw+1); let s=F[n]; for(let k=1;k<=bw&&k<=n;k++) s-=Lb[b+k]*y[n-k]; y[n]=s/Lb[b]; }
      for(let n=N-1;n>=0;n--){ let s=y[n]; for(let k=1;k<=bw&&n+k<N;k++) s-=Lb[(n+k)*(bw+1)+k]*y[n+k]; y[n]=s/Lb[n*(bw+1)]; }
      let md=0; for(let n=0;n<N;n++){ if(fixed[n]) continue; const d=Math.max(-0.5,Math.min(0.5,y[n])); phi[n]+=d; md=Math.max(md,Math.abs(d)); }
      if(md<1e-6){conv=true;break;}
    }
    prev2=prev; Vprev2=Vprev; prev=Float64Array.from(phi); Vprev=Vd;
    // channel current integral (subthreshold, as in mos2d)
    let integ=0;
    for(let i=0;i<nx-1;i++){ const xc=(X[i]+X[i+1])/2; if(Math.abs(xc)>=xjL) continue;
      let Qa=0,Qb=0;
      for(let j=0;j<nz-1;j++){ if(Z[j]<0) continue; const dz=(Z[j+1]-Z[j])*cm;
        Qa+=0.5*(Math.exp(phi[id(i,j)]/vt)+Math.exp(phi[id(i,j+1)]/vt))*ni*dz;
        Qb+=0.5*(Math.exp(phi[id(i+1,j)]/vt)+Math.exp(phi[id(i+1,j+1)]/vt))*ni*dz; }
      integ+=(X[i+1]-X[i])*cm*0.5*(1/Qa+1/Qb); }
    const rec={Vd,conv,logI:Math.log10((1-Math.exp(-Vd/vt))/integ)};
    if(opt.ionize!==false) Object.assign(rec,ionise());
    out.push(rec);
    if(opt.stopAt&&rec.ion>=opt.stopAt) break;
  }
  return {rows:out,nodes:N,nx,nz,D,...(opt.dump?{X,Z,phi:Float64Array.from(phi),dop,id}:{})};

  function ionise(){
    const Ex=new Float64Array(N), Ez=new Float64Array(N);
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){ if(Z[j]<0) continue; const n=id(i,j);
      const i0=Math.max(i-1,0), i1=Math.min(i+1,nx-1), j0=Math.max(j-1,0), j1=Math.min(j+1,nz-1);
      const zj0=Z[j0]<0?j:j0;
      Ex[n]=-(phi[id(i1,j)]-phi[id(i0,j)])/((X[i1]-X[i0])*cm);
      Ez[n]=-(phi[id(i,j1)]-phi[id(i,zj0)])/(((Z[j1]-Z[zj0])||1e-9)*cm); }
    const findCell=(A,v)=>{let lo=0,hi=A.length-2; if(v<=A[0]) return 0; if(v>=A[A.length-1]) return A.length-2;
      while(hi-lo>1){const m=(lo+hi)>>1; if(A[m]<=v) lo=m; else hi=m;} return lo;};
    const Eat=(x,z)=>{ if(z<0||z>D||x<X[0]||x>X[nx-1]) return null;
      const i=findCell(X,x), j=findCell(Z,z), tx=(x-X[i])/(X[i+1]-X[i]), tz=(z-Z[j])/(Z[j+1]-Z[j]);
      const w=[(1-tx)*(1-tz),tx*(1-tz),(1-tx)*tz,tx*tz], ns=[id(i,j),id(i+1,j),id(i,j+1),id(i+1,j+1)];
      let ex=0,ez=0; for(let k=0;k<4;k++){ex+=w[k]*Ex[ns[k]];ez+=w[k]*Ez[ns[k]];} return [ex,ez]; };
    const h=opt.step||1.5;
    const trace=(x,z,sign)=>{const o=[]; for(let k=0;k<6000;k++){const e=Eat(x,z); if(!e) break; const m=Math.hypot(e[0],e[1]); if(m<2e4) break;
        let dx=sign*e[0]/m*h, dz=sign*e[1]/m*h;
        if(z+dz<0){ if(Math.abs(e[0])<0.05*m) break; dx=Math.sign(sign*e[0])*h; dz=-z; }
        x+=dx; z+=dz; o.push({ds:h*cm,E:m});} return o;};
    let Emx=0, at=null; for(let n=0;n<N;n++){const m=Math.hypot(Ex[n],Ez[n]); if(m>Emx){Emx=m;at=n;}}
    // separate maxima for field lines starting near the drain-side gate edge and elsewhere
    const nearGate=(x,z)=>Math.abs(x-gE)<(opt.gateWin||200)&&z<(opt.gateWin||200);
    let best=0, where=null, bestG=0, bestO=0;
    for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){ if(Z[j]<0||X[i]<0) continue; const n=id(i,j);
      if(Math.hypot(Ex[n],Ez[n])<0.3*Emx*(opt.startFrac||1)||(i+j)%2) continue;
      const path=trace(X[i],Z[j],-1).reverse().concat(trace(X[i],Z[j],+1));
      const v=ionPath(path.map(p=>p.ds),path.map(p=>p.E),T); if(v>best){best=v;where={x:X[i],z:Z[j]};}
      if(nearGate(X[i],Z[j])) bestG=Math.max(bestG,v); else bestO=Math.max(bestO,v);
    }
    return {ion:best,ionGate:bestG,ionOther:bestO,Emax:Emx,EmaxAt:at==null?null:{x:X[Math.floor(at/nz)],z:Z[at%nz]},ionAt:where};
  }
}
// breakdown voltage from an hv2d sweep: first V_D where the ionisation integral reaches 1 (log interpolation)
function hvBV2d(g,opt={}){
  const Vs=[]; const V0=opt.v0||2, dV=opt.dV||2, Vmax=opt.vmax||60;
  for(let v=V0;v<=Vmax+1e-9;v+=dV) Vs.push(v);
  const r=hv2d(g,Vs,{...opt,stopAt:opt.split?null:1});
  const rows=r.rows;
  const cross=key=>{ const k=rows.findIndex(x=>x[key]>=1); if(k<0) return Infinity; if(k===0) return rows[0].Vd;
    const a=rows[k-1], b=rows[k], la=Math.log(Math.max(a[key],1e-30)), lb=Math.log(b[key]); return a.Vd+(0-la)*(b.Vd-a.Vd)/(lb-la); };
  const k=rows.findIndex(x=>x.ion>=1), b=k>=0?rows[k]:rows[rows.length-1];
  return {BV:cross("ion"),BVgate:cross("ionGate"),BVother:cross("ionOther"),rows,nodes:r.nodes,where:b.ionAt,Emax:b.Emax,EmaxAt:b.EmaxAt};
}

/* ---------- design verification: re-check a compact-model design point with the 2D references ----------
   NMOS: the nmos_model module. p: full parameter set. Returns rows with compact vs reference and a verdict
   using the same tolerances as the test suite. Takes a few seconds (2D Poisson dominates).            */
async function verifyDesign(NMOS,p,onStep=()=>{}){
  const tick=async(msg)=>{onStep(msg); await new Promise(r=>setTimeout(r,0));};
  if(p.dev==="hv") return verifyHV(NMOS,p,tick);
  const cm=1e-7, rows=[], M=NMOS.model(p), ML=NMOS.model({...p,Lg:400});
  const rel=(a,b)=>Math.abs(a/b-1);
  // 1) short-channel effects
  const VGOFF=[-0.75,-0.65,-0.55,-0.45,-0.35,-0.25,-0.15,-0.05];
  const curve=(q,Mq,Vds)=>{const g={Lg:q.Lg,Lov:q.Lov,Wsp:q.Wsp,Xj:q.Xj,Xjext:q.Xjext,EOT:Mq.EOT/cm,Na:q.Na,Next:q.Next,Nsd:q.Nsd,Vfb:Mq.Vfb,ni:Mq.ni,T:q.T};
    const Vg=VGOFF.map(v=>v+Mq.VthL); const r=mos2d(g,Vg,Vds); return {Vg,y:r.logI.map(v=>v+Math.log10(q.Lg-2*q.Lov))};};
  const cross=(c,t)=>{const {Vg,y}=c;let i=0;for(;i<y.length-2;i++) if((y[i]-t)*(y[i+1]-t)<=0) break;
    return {V:Vg[i]+(t-y[i])*(Vg[i+1]-Vg[i])/(y[i+1]-y[i]),S:(Vg[i+1]-Vg[i])/(y[i+1]-y[i])*1000};};
  await tick("2D Poisson: long reference, V_DS = 0.05 V"); const la=curve({...p,Lg:400},ML,0.05);
  await tick("2D Poisson: long reference, V_DS = V_DD");    const lb=curve({...p,Lg:400},ML,p.VDD);
  await tick("2D Poisson: design, V_DS = 0.05 V");          const sa=curve(p,M,0.05);
  await tick("2D Poisson: design, V_DS = V_DD");            const sb=curve(p,M,p.VDD);
  const ref=ML.VthL-0.15, A=cross(sa,la.y[6]), B=cross(sb,lb.y[6]);
  const fd={dV:(A.V-ref)*1000, dibl:(A.V-B.V)/(p.VDD-0.05)*1000, ssr:A.S/cross(la,la.y[6]).S};
  const c={dV:(M.vthAt(0.05)-ML.vthAt(0.05))*1000, dibl:M.DIBL-ML.DIBL, ssr:M.nSS/ML.nSS};
  rows.push({name:"V_th roll-off vs L = 400 nm",unit:"mV",compact:c.dV,ref:fd.dV,tol:"±25% or 15 mV",ok:Math.abs(c.dV-fd.dV)<=Math.max(15,0.25*Math.abs(fd.dV))});
  rows.push({name:"DIBL (short − long)",unit:"mV/V",compact:c.dibl,ref:fd.dibl,tol:"±30% or 8 mV/V",ok:Math.abs(c.dibl-fd.dibl)<=Math.max(8,0.3*Math.abs(fd.dibl))});
  rows.push({name:"SS(L) / SS(long)",unit:"",compact:c.ssr,ref:fd.ssr,tol:"±8%",ok:rel(c.ssr,fd.ssr)<=0.08});
  // 2) overlap + spreading resistance
  const vg=M.vgsteff(p.VDD,0.05), Rinv=1/(M.muEff(vg,M.vthAt(0.05))*M.Cinv*vg);
  await tick("2D resistor: overlap + spreading");
  const fr=resistor2d({Lov:p.Lov,Wsp:p.Wsp,Xj:p.Xjext,rhoExt:M.rhoExt,Rinv,Racc:M.Racc}).front;
  rows.push({name:"Overlap + spreading R",unit:"Ω·µm",compact:M.frontW*1e4,ref:fr*1e4,tol:"±25%",ok:rel(M.frontW,fr)<=0.25});
  // 3) gate fringe + plug–gate C (line-contact limit)
  const comp=M.CofShield+M.epsEff*M.hF/M.dG*M.palH+e0*p.kILD/Math.PI*Math.log(1+Math.min(Math.max(p.Hp-p.Hg,0),p.dpg)/p.dpg);
  await tick("2D Laplace: fringe + plug–gate C");
  const fc=fringe2d({Lg:p.Lg,tox:p.tIL+p.tHK,Hg:p.Hg,Wsp:p.Wsp,dpg:p.dpg,CD:p.CD,Hp:p.Hp,kox:p.kIL,ksp:p.ksp,kild:p.kILD}).Cext;
  rows.push({name:"Fringe + plug–gate C per width",unit:"fF/µm",compact:comp*1e11,ref:fc*1e11,tol:"±20%",ok:rel(comp,fc)<=0.2});
  return rows;
}

/* HV design re-check: breakdown, off-state (punch-through) current at V_DD, low-current drift resistance */
function hvGeom(M,p){ return {Lg:p.Lg,Lov:p.Lov,Loff:p.Ldr,Oddd:Math.min(p.Oddd,p.Ldr),Xjext:p.Xjext,Xjddd:p.Xjddd,Xj:p.Xj,EOT:M.EOT/1e-7,Na:p.Na,Next:p.Next,Nddd:p.Nddd,Nsd:p.Nsd,Vfb:M.Vfb,ni:M.ni,T:p.T}; }
async function verifyHV(NMOS,p,tick){
  const rows=[], M=NMOS.model(p), g=hvGeom(M,p), Wum=p.W/1000, rel=(a,b)=>Math.abs(a/b-1);
  await tick("2D Poisson: drain sweep with ionisation integrals");
  const r=hvBV2d(g,{dV:2,vmax:Math.min(80,Math.max(40,2*p.VDD))});
  const b=M.breakdown(), av=b.list.filter(x=>/avalanche/.test(x[0])).map(x=>x[1]), cBV=Math.min(...av);
  rows.push({name:"Avalanche breakdown (V_G = 0)",unit:"V",compact:cBV,ref:r.BV,tol:"±25%",ok:isFinite(r.BV)?rel(cBV,r.BV)<=0.25:cBV>0.8*Math.min(80,Math.max(40,2*p.VDD))});
  await tick("2D Poisson: off-state current at V_DD");
  const s=hv2d(g,[Math.min(2,p.VDD),p.VDD],{ionize:false}), q=1.602176634e-19;
  const I2=q*M.muEff(0,M.VthL)*M.vt*1e-4*Math.pow(10,s.rows[1].logI), Ic=M.idi(0,p.VDD)/Wum;
  const floor=1e-14, both=I2<floor&&Ic<floor;
  rows.push({name:"Channel current at V_GS = 0, V_DS = V_DD (punch-through)",unit:"A/µm",compact:Ic,ref:I2,tol:"±1 decade (both < 1e-14 counts as agreement)",ok:both||Math.abs(Math.log10(Ic/I2))<=1});
  await tick("2D resistor: drift region");
  const d=drift2d({Loff:p.Ldr,Oddd:Math.min(p.Oddd,p.Ldr),Xjext:p.Xjext,Xjddd:p.Xjddd,Xj:p.Xj,Next:p.Next,Nddd:p.Nddd,Nsd:p.Nsd,mu:NMOS.helpers.muCT}).drift;
  const Mn=NMOS.model({...p,_noDep:1}), cd=Mn.Rdrift*p.W*1e-7;
  rows.push({name:"Drift resistance, low current (no depletion on either side)",unit:"Ω·µm",compact:cd*1e4,ref:d*1e4,tol:"±20%",ok:rel(cd,d)<=0.2});
  return rows;
}
return {mos1d,pn1d,fringe2d,hvGeom,verifyHV,resistor2d,drift2d,fv2d,mos2d,hv2d,hvBV2d,verifyDesign,ionPath,refAlpha};
});
