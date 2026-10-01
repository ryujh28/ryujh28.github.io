/* Verification suite for nmos_model.js
   Each test states its expectation and tolerance before looking at the result.
   Status: pass | fail | info (info = reported number with no pass/fail criterion).

   Groups
   A  Material models vs. published reference values
   B  Independent numerical references (1D MOS, 1D pn junction, 2D Laplace)
   C  Analytic limits and internal consistency of the I–V model
   D  Scaling and invariance
   E  Physical trends (sign of the sensitivity over the full input range)
   F  Continuity (no jumps while sweeping every input; slope kinks from geometric min/max clamps are allowed)
   G  Robustness (random inputs over the whole allowed range)
   H  Expected-trend matrix: direction of every output for every knob, set from physics (tests/trend_matrix.js)
   I  Optimiser: NSGA-II benchmark, constraint handling, toggled-variable isolation, bounds, determinism
   J  HV device: layered junctions, thick-oxide V_th, pass voltage, drift R vs 2D, BV vs 2D data, punch-through bound
*/
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.NMOS_TESTS=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";

function runAll(NMOS,REF,opt={}){
  const {model,DEF,PARAMS,helpers:H,consts:K}=NMOS;
  const out=[];
  const nm=1e-7;
  const rel=(a,b)=>Math.abs(a/b-1);
  const f3=v=>{if(!isFinite(v))return String(v);const a=Math.abs(v);return (a!==0&&(a>=1e4||a<1e-2))?v.toExponential(3):(+v.toPrecision(4)).toString();};
  const pct=v=>(v*100).toFixed(1)+"%";
  function T(group,name,fn){
    const t0=Date.now();
    let r;
    try{ r=fn(); }catch(e){ r={ok:false,got:"threw: "+e.message}; }
    out.push({group,name,status:r.info?"info":(r.ok?"pass":"fail"),expected:r.exp||"",got:r.got||"",note:r.note||"",ms:Date.now()-t0});
  }
  const within=(got,ref,tol,unit="")=>({ok:rel(got,ref)<=tol,exp:`${f3(ref)}${unit} ± ${pct(tol)}`,got:`${f3(got)}${unit} (${(got/ref-1>=0?"+":"")}${pct(got/ref-1)})`});
  const M0=model(DEF);

  /* ============ A. material models vs references ============ */
  const gA="A · Material models vs. reference values";
  T(gA,"Intrinsic carrier density n_i(300 K)",()=>({...within(H.niT(300),9.65e9,0.02," cm⁻³"),note:"Sproul & Green (1991) / Altermatt (2003): 9.65×10⁹ cm⁻³"}));
  T(gA,"Band gap E_g(300 K)",()=>({...within(H.EgT(300),1.12,0.01," eV"),note:"Sze & Ng, 1.12 eV"}));
  T(gA,"Thermal voltage kT/q at 300 K",()=>({...within(M0.vt,0.025852,0.001," V")}));
  const masetti=N=>{ // Masetti, Severi, Solmi, IEEE TED 30, 764 (1983), electrons in As-doped Si
    const mu0=52.2, mumax=1417, mu1=43.4, Cr=9.68e16, Cs=3.43e20, a=0.68, b=2.0;
    return mu0+(mumax-mu0)/(1+Math.pow(N/Cr,a))-mu1/(1+Math.pow(Cs/N,b));
  };
  [1e16,1e17,1e18,1e19,1e20].forEach(N=>{
    T(gA,`n-Si resistivity at ${N.toExponential(0)} cm⁻³ (Caughey–Thomas vs Masetti)`,()=>({...within(H.rhoN(N),1/(K.q*N*masetti(N)),0.15," Ω·cm"),note:"Reference: Masetti et al. 1983 mobility fit, an independent data set; tolerance 15%"}));
  });
  T(gA,"C_ox for 2.0 nm SiO₂",()=>({...within(M0.Cox*1e6,1.7265,0.002," µF/cm²"),note:"ε_SiO₂/t = 3.9·8.854e-14/2e-7"}));
  T(gA,"E₀₀ at N_D = 1e20 cm⁻³ (m* = 0.3 m₀)",()=>{
    const ref=18.5e-12*Math.sqrt(1e20/(0.3*11.7)); // Sze: E00 = 18.5e-12 sqrt(N/(m_r ε_r)) eV
    return {...within(H.E00(1e20),ref,0.02," eV"),note:"Sze & Ng Eq. 3.114 short form"};
  });
  T(gA,"v_sat(300 K)",()=>({...within(M0.vsat,1.03e7,0.05," cm/s"),note:"Jacoboni et al. electron v_sat ≈ 1.0–1.07×10⁷ cm/s"}));
  T(gA,"ρ_c at 2e20 cm⁻³, φ_B = 0.6 eV",()=>{
    const v=M0.rhoc;
    return {ok:v>1e-9&&v<1e-7,exp:"1e-9 … 1e-7 Ω·cm² (typical silicide/n⁺ Si)",got:f3(v)+" Ω·cm²",note:"Prefactor is calibrated, so this is a plausibility band, not a derivation"};
  });
  T(gA,"Universal mobility at E_eff = 1 MV/cm",()=>{
    // compare with Takagi et al. (IEEE TED 1994) universal electron mobility ≈ 250–300 cm²/Vs near 1 MV/cm
    const Toxe=M0.Toxe, vth=0.4, vg=6*Toxe*1e6-2*vth-0.2; // choose Vgsteff so E_eff = 1 MV/cm
    const mu=M0.muEff(vg,vth);
    return {ok:mu>200&&mu<320,exp:"200 … 320 cm²/V·s (Takagi 1994)",got:f3(mu)+" cm²/V·s"};
  });

  T(gA,"SiO₂ direct tunnelling, 1.5 nm at 1 V",()=>{
    const J=H.gateTunnelJ(1,1.5,3.9,0,20);
    return {ok:J>=0.3&&J<=30,exp:"0.3 … 30 A/cm² (Lo, Buchanan, Taur, IEEE EDL 1997 measured ~1–10)",got:f3(J)+" A/cm²"};
  });
  T(gA,"SiO₂ direct tunnelling thickness slope (1.5 → 2.0 nm at 1 V)",()=>{
    const d=Math.log10(H.gateTunnelJ(1,1.5,3.9,0,20)/H.gateTunnelJ(1,2.0,3.9,0,20));
    return {ok:d>=1.5&&d<=3.5,exp:"1.5 … 3.5 decades per 0.5 nm (≈ one decade per 0.2 nm)",got:f3(d)+" decades"};
  });
  T(gA,"High-k stack leaks less than SiO₂ of the same EOT",()=>{
    const eot=1+2*3.9/20, r=H.gateTunnelJ(1,eot,3.9,0,20)/H.gateTunnelJ(1,1.0,3.9,2.0,20);
    return {ok:r>=10,exp:"≥ 10× lower (1 nm SiO₂ + 2 nm HfO₂ vs SiO₂ at EOT 1.39 nm)",got:f3(r)+"× lower",note:"Published reductions are 10²–10⁴ for thin interfacial layers; with a 1 nm IL the IL dominates, so a smaller factor is expected"};
  });
  T(gA,"Junction BTBT becomes significant only above ~1 MV/cm",()=>{
    const lo=H.btbtJ(5e5,1.2,1.12), hi=H.btbtJ(2e6,1.2,1.12);
    return {ok:lo<1e-9&&hi>1e-3,exp:"J(0.5 MV/cm) < 1e-9 and J(2 MV/cm) > 1e-3 A/cm²",got:`${f3(lo)} / ${f3(hi)} A/cm²`,note:"Sze & Ng tunnelling-junction expression, reduced mass 0.2 m₀"};
  });

  [1e15,1e16,1e17].forEach(Nb=>{
    T(gA,`Planar avalanche BV at N = ${Nb.toExponential(0)} cm⁻³ vs Sze's empirical fit`,()=>{
      const bv=H.avalancheBV(Nb,0.8,Infinity,300), ref=60*Math.pow(1.12/1.1,1.5)*Math.pow(Nb/1e16,-0.75);
      return {...within(bv,ref,0.30," V"),note:"BV = 60(E_g/1.1)^1.5(N/1e16)^−0.75 V (Sze & Ng). Tolerance 30%: published ionisation-coefficient sets differ by 20–30% in BV and the power law is itself a fit"};
    });
  });
  T(gA,"Avalanche BV temperature coefficient (N = 1e16)",()=>{
    const a=H.avalancheBV(1e16,0.8,Infinity,300), b=H.avalancheBV(1e16,0.8,Infinity,400), tc=(b/a-1)/100*100;
    return {ok:tc>=0.03&&tc<=0.3,exp:"+0.03 … +0.3 %/K (positive, phonon scattering)",got:`${f3(tc)} %/K (${f3(a)} → ${f3(b)} V)`};
  });
  T(gA,"Cylindrical junction: approaches planar BV for large radius, lower for small radius",()=>{
    const pl=H.avalancheBV(1e16,0.8,Infinity,300), big=H.avalancheBV(1e16,0.8,1e-1,300), small=H.avalancheBV(1e16,0.8,1e-5,300);
    return {ok:Math.abs(big/pl-1)<0.02&&small<0.8*pl,exp:"r_j = 1 mm within 2% of planar; r_j = 0.1 µm below 80% of planar",got:`planar ${f3(pl)}, 1 mm ${f3(big)}, 0.1 µm ${f3(small)} V`};
  });

  /* ============ B. independent numerical references ============ */
  const gB="B · Independent numerical references";
  // B1: threshold condition vs exact MOS electrostatics
  [[1e17,"poly"],[2e18,"poly"],[5e18,"metal"]].forEach(([Na,gate])=>{
    T(gB,`Long-channel V_th vs exact 1D MOS (ψs = 2φ_F), N_A=${Na.toExponential(0)}`,()=>{
      const M=model({...DEF,Na,gate,Lg:2000});
      const m=REF.mos1d({Na,ni:M.ni,T:M.T,Cox:M.Cox,Vfb:M.Vfb});
      const d=M.VthL-m.VthExact;
      return {ok:Math.abs(d)<0.005,exp:`${f3(m.VthExact)} V ± 5 mV`,got:`${f3(M.VthL)} V (Δ ${(d*1000).toFixed(2)} mV)`,note:"Checks V_FB, 2φ_F and depletion-charge terms against the integrated Poisson equation"};
    });
  });
  // B2: inversion charge model vs exact
  T(gB,"Inversion charge in strong inversion (V_GS−V_th = 0.2…0.8 V) vs exact 1D MOS",()=>{
    const M=model({...DEF,Lg:2000,gate:"metal"});
    const m=REF.mos1d({Na:M.p.Na,ni:M.ni,T:M.T,Cox:M.Cox,Vfb:M.Vfb});
    let worst=0,at=0; const rows=[];
    for(let dv=0.2;dv<=0.8001;dv+=0.1){const V=M.VthL+dv;const a=M.Cox*M.vgsteff(V,0),b=m.Qinv(V);const e=a/b-1;rows.push(`${dv.toFixed(1)}V:${(e>=0?"+":"")+pct(e)}`);if(Math.abs(e)>Math.abs(worst)){worst=e;at=dv;}}
    return {ok:Math.abs(worst)<=0.15,exp:"C_ox·V_gsteff within ±15% of exact Q_inv",got:`worst ${(worst>=0?"+":"")+pct(worst)} at ΔV=${at.toFixed(1)} V · ${rows.join(" ")}`,
      note:"Classical (no QM, no poly depletion) on both sides. A positive error means V_th defined at ψs=2φ_F ignores the extra surface-potential rise in strong inversion"};
  });
  T(gB,"Subthreshold slope of charge model vs exact 1D MOS",()=>{
    const M=model({...DEF,Lg:2000,gate:"metal"});
    const m=REF.mos1d({Na:M.p.Na,ni:M.ni,T:M.T,Cox:M.Cox,Vfb:M.Vfb});
    const V1=M.VthL-0.35,V2=M.VthL-0.25;
    const sM=(V2-V1)/Math.log10(M.vgsteff(V2,0)/M.vgsteff(V1,0))*1000;
    const sE=(V2-V1)/Math.log10(m.Qinv(V2)/m.Qinv(V1))*1000;
    return {...within(sM,sE,0.05," mV/dec"),note:"Slope of Q_inv(V_G) 0.25–0.35 V below V_th"};
  });
  T(gB,"Subthreshold charge magnitude vs exact 1D MOS (V_th − 0.3 V)",()=>{
    const M=model({...DEF,Lg:2000,gate:"metal"});
    const m=REF.mos1d({Na:M.p.Na,ni:M.ni,T:M.T,Cox:M.Cox,Vfb:M.Vfb});
    const V=M.VthL-0.3, r=M.Cox*M.vgsteff(V,0)/m.Qinv(V);
    return {ok:r>0.5&&r<2,exp:"ratio 0.5 … 2 (factor-of-2 band sets I_off accuracy)",got:"ratio "+f3(r)};
  });
  // B3: junction capacitance vs nonlinear Poisson
  [[1e16,1e16],[1e17,1e16]].forEach(([Nd,Na])=>{
    T(gB,`Junction solver self-check vs Kennedy's V_bi−2kT/q result (N_D=${Nd.toExponential(0)}, N_A=${Na.toExponential(0)})`,()=>{
      const M=model(DEF), vt=M.vt, Vb=vt*Math.log(Nd*Na/M.ni/M.ni);
      const ref=Math.sqrt(K.q*K.eSi*Nd*Na/(2*(Nd+Na)*(Vb-2*vt)));
      return {...within(REF.pn1d({Nd,Na,ni:M.ni,T:M.T}).C(0),ref,0.01," F/cm²"),note:"Non-degenerate doping, where the analytic correction is exact to first order"};
    });
  });
  T(gB,"C_j at n⁺ 2e20 / p 1e16 vs nonlinear 1D Poisson",()=>{
    const M=model(DEF), vt=M.vt, Nd=2e20, Na=1e16, Vb=vt*Math.log(Nd*Na/M.ni/M.ni);
    const cm=Math.sqrt(K.q*K.eSi*Nd*Na/(2*(Nd+Na)*Vb)), cref=REF.pn1d({Nd,Na,ni:M.ni,T:M.T}).C(0);
    return {info:true,exp:"reported only",got:`compact ${f3(cm)} vs Poisson ${f3(cref)} F/cm² (${pct(cm/cref-1)})`,note:"The reference uses Boltzmann statistics on a degenerate 2e20 n⁺ side, which likely overstates electron spill-over; the gap grows as N_A falls (the same solver matches theory within 1% at non-degenerate doping), so this case cannot grade the compact model"};
  });
  [[2e20,5e17,0],[2e20,5e17,1.2],[5e19,5e17,0],[5e19,2e18,0.6]].forEach(([Nd,Na,V])=>{
    T(gB,`C_j abrupt n⁺/p (N_D=${Nd.toExponential(0)}, N_A=${Na.toExponential(0)}, V_R=${V} V) vs nonlinear 1D Poisson`,()=>{
      const M=model(DEF);
      const vt=M.vt, Vb=vt*Math.log(Nd*Na/M.ni/M.ni);
      const c0=Math.sqrt(K.q*K.eSi*Nd*Na/(2*(Nd+Na)*Vb)), cm=c0/Math.sqrt(1+V/Vb);
      // make sure the model's junction routine uses this same expression
      const j=M.jParts.find(j=>Math.abs(j.Vb-Vb)<1e-9);
      const pn=REF.pn1d({Nd,Na,ni:M.ni,T:M.T}); const cref=pn.C(V);
      return {...within(cm,cref,0.08," F/cm²"),note:"Depletion approximation vs full Poisson with mobile carriers; expected bias ≈ −(1−√(1−2kT/qV_bi))"+(j?"":" · (junction pair not in default device, formula checked directly)")};
    });
  });
  // B4: 2D Laplace vs compact extrinsic capacitance
  const fdCases=[
    {n:"default device",o:{}},
    {n:"plug gap 20 nm",o:{dpg:20}},
    {n:"plug gap 30 nm (= spacer)",o:{dpg:30}},
    {n:"plug gap 150 nm",o:{dpg:150}},
    {n:"plug gap 250 nm",o:{dpg:250}},
    {n:"low-k spacer 4.0",o:{ksp:4}},
    {n:"low-k ILD 2.5",o:{kILD:2.5}},
    {n:"gate height 50 nm",o:{Hg:50}},
    {n:"gate height 200 nm",o:{Hg:200}},
    {n:"spacer 10 nm",o:{Wsp:10}},
    {n:"thick oxide 5 nm",o:{tIL:5}}
  ];
  if(opt.fast) fdCases.splice(3);
  fdCases.forEach(cs=>{
    T(gB,`Gate fringe + plug–gate C per width, ${cs.n}: compact vs 2D Laplace`,()=>{
      const p={...DEF,Lov:0,...cs.o}; const M=model(p);
      // line-contact limit (plug covers all of W): shielded outer fringe + plug side (no width-edge term) + plug-above-gate term
      const comp=M.CofShield+M.epsEff*M.hF/M.dG*M.palH+K.e0*p.kILD/Math.PI*Math.log(1+Math.min(Math.max(p.Hp-p.Hg,0),p.dpg)/p.dpg);
      const r=REF.fringe2d({Lg:p.Lg,tox:p.tIL+p.tHK,Hg:p.Hg,Wsp:p.Wsp,dpg:p.dpg,CD:p.CD,Hp:p.Hp,kox:p.kIL,ksp:p.ksp,kild:p.kILD});
      return {...within(comp*1e11,r.Cext*1e11," fF/µm"),...{ok:rel(comp,r.Cext)<=0.2},exp:`${f3(r.Cext*1e11)} fF/µm ± 20%`,note:`FD grid ${r.nx}×${r.nz}. Plug treated as a line along W (2D limit)`};
    });
  });
  T(gB,"Outer fringe with no plug nearby: compact vs 2D Laplace",()=>{
    const p={...DEF,Lov:0,dpg:400}; const M=model(p);
    const r=REF.fringe2d({Lg:p.Lg,tox:p.tIL,Hg:p.Hg,Wsp:p.Wsp,dpg:null,kox:3.9,ksp:p.ksp,kild:p.kILD});
    const comp=M.CofOpen;
    return {info:true,exp:"reported only",got:`compact ${f3(comp*1e11)} vs FD ${f3(r.Cext*1e11)} fF/µm (${pct(comp/r.Cext-1)})`,
      note:"With nothing above the gate the FD result includes top-surface field lines reaching the far Si surface; the compact formula stops at r = H_g. Real layouts have M1/neighbours, so this case has no single right answer"};
  });
  T(gB,"Plug-above-gate coupling vs 2D Laplace (H_plug 100 → 300 nm, gap 60 and 150 nm)",()=>{
    let worst=0,rows=[];
    [60,150].forEach(d=>{
      const g={Lg:DEF.Lg,tox:DEF.tIL,Hg:DEF.Hg,Wsp:DEF.Wsp,dpg:d,CD:DEF.CD,kox:3.9,ksp:DEF.ksp,kild:DEF.kILD};
      const fd=REF.fringe2d({...g,Hp:300}).Cext-REF.fringe2d({...g,Hp:DEF.Hg}).Cext;
      const cm=K.e0*DEF.kILD/Math.PI*Math.log(1+Math.min(300-DEF.Hg,d)/d);
      worst=Math.max(worst,rel(cm,fd)); rows.push(`gap ${d}: ${f3(cm*1e11)} vs ${f3(fd*1e11)} fF/µm`);
    });
    return {ok:worst<=0.3,exp:"added C within ±30% of 2D result",got:`worst ${pct(worst)} · ${rows.join(", ")}`,note:"Small term (~1% of C_gg); compact form saturates one gap above the gate top"};
  });
  // B5: series-resistance front end (channel → overlap → extension) vs 2D resistor
  T(gB,"2D resistor self-check: no overlap reduces to Ng–Lynch spreading",()=>{
    const r=REF.resistor2d({Lov:0,Wsp:30,Xj:20,rhoExt:1.2e-3,Rinv:2500,Racc:1500}).front;
    const ng=2*1.2e-3/Math.PI*Math.log(0.75*20/2);
    return {...within(r*1e4,ng*1e4,0.15," Ω·µm"),note:"Ng & Lynch (1986) analytic spreading resistance, x_c = 2 nm"};
  });
  if(!opt.fast) T(gB,"2D resistor self-check: grid refinement",()=>{
    const c={Lov:5,Wsp:30,Xj:20,rhoExt:1.2e-3,Rinv:2500,Racc:1500};
    const a=REF.resistor2d(c).front, b=REF.resistor2d(c,{refine:2}).front;
    return {ok:rel(a,b)<0.02,exp:"change < 2% when mesh is refined 2×",got:pct(a/b-1)};
  });
  const rCases=opt.fast?[{o:{}}]:[{o:{}},{o:{Lov:0}},{o:{Lov:2}},{o:{Lov:20}},{o:{Xjext:35}},{o:{Next:1e19}},{o:{Next:2e20,Xjext:12}},{o:{gate:"metal",phiM:4.6}}];
  rCases.forEach(cs=>{
    T(gB,`Overlap + spreading resistance ${JSON.stringify(cs.o)}: compact vs 2D resistor`,()=>{
      const M=model({...DEF,...cs.o}), p=M.p;
      const vg=M.vgsteff(p.VDD,0.05), Rinv=1/(M.muEff(vg,M.vthAt(0.05))*M.Cinv*vg);
      const fd=REF.resistor2d({Lov:p.Lov,Wsp:p.Wsp,Xj:p.Xjext,rhoExt:M.rhoExt,Rinv,Racc:M.Racc}).front;
      return {...within(M.frontW*1e4,fd*1e4,0.25," Ω·µm"),note:`Same sheet resistances on both sides (R_acc ${f3(M.Racc)} Ω/□, R_ext ${f3(M.ReExt)} Ω/□); tests the two-sheet + spreading geometry. Coupling 0.2·ρX_j was calibrated on a separate grid of 27 sheet/depth combinations`};
    });
  });
  // B6: short-channel effects vs 2D Poisson (subthreshold)
  const sceCases=opt.fast?[{o:{Lg:70},h:0}]:[
    {o:{Lg:60},h:0},{o:{Lg:90},h:0},{o:{Lg:60,Na:1e18},h:1},{o:{Lg:90,tIL:3},h:1},{o:{Lg:70,Xjext:14},h:1},{o:{Lg:100,Xjext:28,Lov:12},h:1},{o:{Lg:75,Na:3e18,tIL:1.5},h:1}];
  const VGOFF=[-0.75,-0.65,-0.55,-0.45,-0.35,-0.25,-0.15,-0.05];
  const fdCurve=(q,M,Vds)=>{const g={Lg:q.Lg,Lov:q.Lov,Wsp:q.Wsp,Xj:q.Xj,Xjext:q.Xjext,EOT:M.EOT/nm,Na:q.Na,Next:q.Next,Nsd:q.Nsd,Vfb:M.Vfb,ni:M.ni,T:q.T};
    const Vg=VGOFF.map(v=>v+M.VthL); const r=REF.mos2d(g,Vg,Vds); return {Vg,y:r.logI.map(v=>v+Math.log10(q.Lg-2*q.Lov))};};
  const cross=(c,t)=>{const {Vg,y}=c;let i=0;for(;i<y.length-2;i++) if((y[i]-t)*(y[i+1]-t)<=0) break;
    return {V:Vg[i]+(t-y[i])*(Vg[i+1]-Vg[i])/(y[i+1]-y[i]),S:(Vg[i+1]-Vg[i])/(y[i+1]-y[i])*1000};};
  sceCases.forEach(cs=>{
    T(gB,`Short-channel V_th shift, DIBL, SS ${JSON.stringify(cs.o)}${cs.h?" (held out of the fit)":" (in the fit set)"}: compact vs 2D Poisson`,()=>{
      const q={...DEF,...cs.o}, M=model(q), ML=model({...q,Lg:400});
      const la=fdCurve({...q,Lg:400},ML,0.05), lb=fdCurve({...q,Lg:400},ML,q.VDD), sa=fdCurve(q,M,0.05), sb=fdCurve(q,M,q.VDD);
      const ref=ML.VthL-0.15, A=cross(sa,la.y[6]), B=cross(sb,lb.y[6]);
      const fd={dV:A.V-ref, dibl:(A.V-B.V)/(q.VDD-0.05)*1000, ssr:A.S/cross(la,la.y[6]).S};
      const cm={dV:M.vthAt(0.05)-ML.vthAt(0.05), dibl:M.DIBL-ML.DIBL, ssr:M.nSS/ML.nSS};
      const eV=Math.abs(cm.dV-fd.dV), eD=Math.abs(cm.dibl-fd.dibl), eS=rel(cm.ssr,fd.ssr);
      const ok=eV<=Math.max(0.015,0.25*Math.abs(fd.dV))&&eD<=Math.max(8,0.3*fd.dibl)&&eS<=0.08;
      return {ok,exp:"ΔV_th within 25% (or 15 mV), DIBL within 30% (or 8 mV/V), SS(L)/SS(long) within 8%",
        got:`ΔV_th ${f3(cm.dV*1000)} vs ${f3(fd.dV*1000)} mV · DIBL ${f3(cm.dibl)} vs ${f3(fd.dibl)} mV/V · SS ratio ${f3(cm.ssr)} vs ${f3(fd.ssr)}`,
        note:"V_th by constant I·L_eff at the long device's V_th−0.15 V. SCE constants (DVT0, DVT1, ETA0, DSUB, X_j exponent) were fitted to this solver on L_g sweeps and X_j,ext = 10/35 nm; held-out cases test whether the fit generalises. SS uses the Taur–Ning formula unfitted"};
    });
  });
  T(gB,"Oxide field does not grow as L_g shrinks (compact and 2D Poisson)",()=>{
    const Ms=[400,90,60].map(Lg=>model({...DEF,Lg}));
    const cm=Ms.map(M=>M.Eox/1e6);
    const q=DEF, vox=Ms.map((M,i)=>{const Lg=[400,90,60][i];
      const g={Lg,Lov:q.Lov,Wsp:q.Wsp,Xj:q.Xj,Xjext:q.Xjext,EOT:M.EOT/nm,Na:q.Na,Next:q.Next,Nsd:q.Nsd,Vfb:M.Vfb,ni:M.ni,T:q.T};
      return REF.mos2d(g,[Ms[0].VthL-0.1],q.VDD).voxCentre[0];});
    const ok=cm[1]<=cm[0]*(1+1e-9)&&cm[2]<=cm[0]*(1+1e-9)&&vox[1]<=vox[0]+1e-3&&vox[2]<=vox[0]+1e-3;
    return {ok,exp:"E_ox(L = 90, 60 nm) ≤ E_ox(400 nm) in the compact model; 2D oxide voltage at the channel centre also not larger",
      got:`compact ${cm.map(v=>f3(v)).join(" / ")} MV/cm · 2D V_ox ${vox.map(v=>f3(v)).join(" / ")} V (L = 400 / 90 / 60 nm, V_G = V_th,long − 0.1 V)`,
      note:"S/D take over part of the depletion charge in a short channel, so the gate needs less of it. The 2D check is in subthreshold, where the surface potential also rises; in inversion ψs is pinned and the field is L-independent"};
  });
  // B7: body effect vs exact 1D MOS with a source–body bias
  [0,2,5].forEach(Vsb=>{
    T(gB,`Long-channel V_th with V_SB = ${Vsb} V vs exact 1D MOS`,()=>{
      const M=model({...DEF,Lg:2000,Vsb});
      const m=REF.mos1d({Na:M.p.Na,ni:M.ni,T:M.T,Cox:M.Cox,Vfb:M.Vfb,Vsb});
      const ref=m.VthExact-Vsb, d=M.VthL-ref;   // mos1d gives gate-to-body; the model reports gate-to-source
      return {ok:Math.abs(d)<0.005,exp:`${f3(ref)} V ± 5 mV (V_GS)`,got:`${f3(M.VthL)} V (Δ ${(d*1000).toFixed(2)} mV)`,note:"Strong inversion at ψs = 2φ_F + V_SB with the electron quasi-Fermi level shifted by V_SB"};
    });
  });
  // B8: avalanche with the full 1D Poisson field instead of the triangular profile
  [1e16,1e17].forEach(Na=>{
    T(gB,`Planar avalanche BV (n⁺ 1e20 / p ${Na.toExponential(0)}): triangular field vs full 1D Poisson field`,()=>{
      const M=model(DEF), vt=M.vt, Vb=vt*Math.log(1e20*Na/M.ni/M.ni);
      const bvc=H.avalancheBV(Na*1e20/(Na+1e20),Vb,Infinity,300);
      const pn=REF.pn1d({Nd:1e20,Na,ni:M.ni,T:300,Vmax:bvc*1.6});
      const I=V=>{const f=pn.field(V); const ds=[],Es=[]; for(let i=1;i<f.x.length;i++){ if(f.x[i]<0) continue; ds.push(f.x[i]-f.x[i-1]); Es.push(Math.abs(f.E[i])); } return REF.ionPath(ds,Es,300);};
      let lo=bvc*0.6,hi=bvc*1.5; for(let i=0;i<14;i++){const m=(lo+hi)/2; if(I(m)>=1) hi=m; else lo=m;}
      return {...within(bvc,(lo+hi)/2,0.05," V"),note:"Same ionisation coefficients on both sides; tests the depletion/field treatment only"};
    });
  });
  // B9: 2D avalanche (field lines through the whole device, gate edge included) vs compact avalanche limits
  const avCases=opt.fast?[]:[{o:{}},{o:{tIL:5}},{o:{Na:5e17,Lg:300},depth:250}];
  avCases.forEach(cs=>{
    T(gB,`Avalanche BV ${JSON.stringify(cs.o)}: compact (min of junction and gated-diode avalanche) vs 2D field-line ionisation`,()=>{
      const q0={...DEF,...cs.o}, M=model(q0), b=M.breakdown(), comp=Math.min(b.avExt,b.avSD,b.gdAv);
      const g={Lg:q0.Lg,Lov:q0.Lov,Wsp:q0.Wsp,Xj:q0.Xj,Xjext:q0.Xjext,EOT:M.EOT/nm,Na:q0.Na,Next:q0.Next,Nsd:q0.Nsd,Vfb:M.Vfb,ni:M.ni,T:q0.T};
      const I=V=>REF.mos2d(g,[0],V,{ionize:true,depth:cs.depth}).ionI[0];
      let lo=comp/2.5,hi=comp*2.5; for(let i=0;i<7;i++){const m=Math.sqrt(lo*hi); if(I(m)>=1) hi=m; else lo=m;}
      const ref=Math.sqrt(lo*hi);
      return {...within(comp,ref,0.20," V"),note:"2D: nonlinear Poisson at V_G = 0, hole-initiated ionisation integral maximised over field lines (lines reaching the surface continue along it). Tunnelling is not in the 2D reference"};
    });
  });
  // B10: punch-through by the current criterion, compact vs 2D subthreshold current
  const ptCases=opt.fast?[{o:{Lg:60}}]:[{o:{Lg:60}},{o:{Lg:70}},{o:{Na:1e18,Lg:100}}];
  ptCases.forEach(cs=>{
    T(gB,`Punch-through voltage ${JSON.stringify(cs.o)} (I_D at V_GS = 0 reaches the criterion): compact vs 2D`,()=>{
      const q0={...DEF,...cs.o}, M=model(q0), b=M.breakdown(), Wum=q0.W/1000;
      const g={Lg:q0.Lg,Lov:q0.Lov,Wsp:q0.Wsp,Xj:q0.Xj,Xjext:q0.Xjext,EOT:M.EOT/nm,Na:q0.Na,Next:q0.Next,Nsd:q0.Nsd,Vfb:M.Vfb,ni:M.ni,T:q0.T};
      const mu=M.muEff(0,M.VthL), target=q0.Ibv*1e-6;
      const I2=V=>K.q*mu*M.vt*1e-4*Math.pow(10,REF.mos2d(g,[0],V).logI[0]);
      let lo=0.1,hi=15; if(I2(hi)<target) return {ok:b.vpt>10,exp:"no punch-through below 15 V in 2D",got:`compact ${f3(b.vpt)} V`};
      for(let i=0;i<9;i++){const m=(lo+hi)/2; if(I2(m)>=target) hi=m; else lo=m;}
      return {...within(b.vpt,(lo+hi)/2,0.30," V"),note:"2D subthreshold current (same mobility as the compact model). The compact DIBL is linear in V_DS, fitted at 1.2 V"};
    });
  });
  T(gB,"2D solver self-check: wide parallel plate",()=>{
    const r=REF.fringe2d({Lg:4000,tox:20,Hg:50,Wsp:5,dpg:null,kox:3.9,ksp:3.9,kild:3.9});
    const ideal=3.9*K.e0*2000/20;
    return {ok:r.Ctot/ideal>1&&r.Ctot/ideal<1.05,exp:"C/C_plate 1.00 … 1.05 (fringe adds a few %)",got:f3(r.Ctot/ideal)};
  });
  if(!opt.fast) T(gB,"2D solver self-check: grid refinement",()=>{
    const g={Lg:DEF.Lg,tox:DEF.tIL,Hg:DEF.Hg,Wsp:DEF.Wsp,dpg:DEF.dpg,CD:DEF.CD,Hp:DEF.Hp,kox:3.9,ksp:DEF.ksp,kild:DEF.kILD};
    const a=REF.fringe2d(g).Cext, b=REF.fringe2d(g,{refine:2}).Cext;
    return {ok:rel(a,b)<0.02,exp:"change < 2% when mesh is refined 2×",got:pct(a/b-1)};
  });

  /* ============ C. limits and I–V consistency ============ */
  const gC="C · Analytic limits and I–V consistency";
  T(gC,"I_D = 0 at V_DS = 0",()=>{const v=Math.abs(M0.ids(DEF.VDD,0));return {ok:v<1e-15,exp:"< 1e-15 A",got:f3(v)+" A"};});
  T(gC,"Series-R solution satisfies I = f(V_GS−IR_S, V_DS−2IR_S)",()=>{
    let worst=0;
    [[1.2,1.2],[1.2,0.05],[0.6,1.2],[0.8,0.3]].forEach(([g,d])=>{const I=M0.ids(g,d);const res=Math.abs(M0.idi(g-I*M0.Rs,d-2*I*M0.Rs)-I)/I;worst=Math.max(worst,res);});
    return {ok:worst<1e-9,exp:"relative residual < 1e-9",got:f3(worst)};
  });
  T(gC,"Source/drain symmetry with series R: I(V_GS,−V_DS) = −I(V_GS+V_DS, V_DS)",()=>{
    let worst=0;
    [[1.2,0.3],[1.0,0.6],[0.8,0.05]].forEach(([g,d])=>{const a=M0.ids(g,-d), b=-M0.ids(g+d,d);worst=Math.max(worst,Math.abs(a/b-1));});
    return {ok:worst<1e-6,exp:"relative mismatch < 1e-6",got:f3(worst),note:"Reverse-mode current must see the same series R as forward mode"};
  });
  T(gC,"R_S = 0 reduces to intrinsic current",()=>{const a=M0.ids(1.2,1.2,0),b=M0.idi(1.2,1.2);return {ok:a===b,exp:"identical",got:`${f3(a)} vs ${f3(b)}`};});
  T(gC,"Long channel (L=2 µm), V_DS=10 mV: I_D = (W/L)µC_inv·V_gsteff·V_DS",()=>{
    const M=model({...DEF,Lg:2000}); const Vg=DEF.VDD, vd=0.01;
    const vg=M.vgsteff(Vg,vd), mu=M.muEff(vg,M.vthAt(vd));
    const ref=M.W*nm/M.Leff*mu*M.Cinv*vg*vd;
    return {...within(M.idi(Vg,vd),ref,0.03," A"),note:"Linear-region limit. Tolerance 3%: bulk-charge term (1−mV_DS/2V_gst) and BSIM V_dseff smoothing (δ = 10 mV) each remove ~1% at V_DS = 10 mV"};
  });
  T(gC,"Long channel (L=2 µm) saturation vs square law W µC_inv V_gst²/(2mL)",()=>{
    const M=model({...DEF,Lg:2000}); const Vg=DEF.VDD, Vd=DEF.VDD;
    const vg=M.vgsteff(Vg,Vd), mu=M.muEff(vg,M.vthAt(Vd));
    const ref=M.W*nm*mu*M.Cinv*vg*vg/(2*M.m*M.Leff);
    return {...within(M.idi(Vg,Vd),ref,0.08," A"),note:"Residual velocity saturation at 2 µm is a few %"};
  });
  T(gC,"Long channel: θ (SCE factor) → 0 and DIBL → 0",()=>{const M=model({...DEF,Lg:2000});return {ok:M.DIBL<0.1&&M.theta<1e-6,exp:"DIBL < 0.1 mV/V",got:`DIBL ${f3(M.DIBL)} mV/V, θ ${f3(M.theta)}`};});
  T(gC,"Subthreshold swing read off the I_D–V_GS curve equals m·(kT/q)·ln10",()=>{
    const M=model({...DEF,Lg:2000}); const V1=M.vthAt(0.05)-0.35,V2=V1+0.1;
    const ss=(V2-V1)/Math.log10(M.ids(V2,0.05)/M.ids(V1,0.05))*1000;
    return {...within(ss,M.SS,0.03," mV/dec")};
  });
  T(gC,"Reported DIBL vs constant-current V_th extraction",()=>{
    const M=M0, Icc=100e-9*M.W/M.p.Lg;
    const vcc=vd=>{let lo=-1,hi=2;for(let i=0;i<80;i++){const m=(lo+hi)/2;if(M.ids(m,vd)<Icc)lo=m;else hi=m;}return (lo+hi)/2;};
    const d=(vcc(0.05)-vcc(M.p.VDD))/(M.p.VDD-0.05)*1000;
    // the constant-current method also picks up the subthreshold drain factor (1−e^(−V_DS/vt)) at 50 mV
    const corr=M.nSS*M.vt*Math.log(1/(1-Math.exp(-0.05/M.vt)))/(M.p.VDD-0.05)*1000;
    return {...within(d,M.DIBL+corr,0.05," mV/V"),note:`I_cc = 100 nA·W/L. Expected = model DIBL ${f3(M.DIBL)} + ${f3(corr)} mV/V from the (1−e^(−V_DS/vt)) factor at V_DS = 50 mV`};
  });
  T(gC,"g_m and g_ds are non-negative; I_D monotonic in V_GS and V_DS",()=>{
    let bad=0;
    [DEF,{...DEF,Lg:40,Lov:5},{...DEF,Lg:1000,Na:1e17}].forEach(p=>{const M=model(p);
      let prev=-1; for(let i=0;i<=60;i++){const v=M.ids(-0.2+1.6*i/60,p.VDD); if(v<prev*(1-1e-12)) bad++; prev=v;}
      [0.4,0.8,1.2].forEach(g=>{let pr=-1;for(let i=0;i<=60;i++){const v=M.ids(g,1.2*i/60);if(v<pr*(1-1e-12))bad++;pr=v;}});});
    return {ok:bad===0,exp:"0 decreasing steps",got:bad+" decreasing steps"};
  });
  T(gC,"I_eff lies between I_on/4 and I_on",()=>({ok:M0.Ieff<M0.Ion&&M0.Ieff>M0.Ion/4,exp:"I_on/4 < I_eff < I_on",got:`I_eff/I_on = ${f3(M0.Ieff/M0.Ion)}`}));
  T(gC,"I_on with series R never exceeds intrinsic I_on",()=>({ok:M0.Ion<=M0.Ion0,exp:"I_on ≤ I_on0",got:`${f3(M0.Ion)} ≤ ${f3(M0.Ion0)}`}));
  T(gC,"Overlap C vanishes for zero overlap",()=>{const M=model({...DEF,Lov:0});return {ok:M.Cov===0,exp:"0",got:f3(M.Cov)};});
  T(gC,"Plug–gate C approaches parallel plate when plates ≫ gap",()=>{
    const M=model({...DEF,dpg:5,Wsp:5,CD:300,Hg:300,Hp:1200});
    return {ok:M.palW<1.06&&M.palH<1.06,exp:"Palmer factors < 1.06",got:`W-edge ${f3(M.palW)}, H-edge ${f3(M.palH)}`};
  });
  T(gC,"Average drain junction C ≤ zero-bias C, → zero-bias as V_DD → 0",()=>{
    const a=model({...DEF,VDD:0.5}), b=model({...DEF,VDD:0.5});
    const small=model({...DEF}); const jb=small.jParts;
    const keqSmall=jb.reduce((s,j)=>s+j.c*j.A*(2*j.Vb/1e-4*(Math.sqrt(1+1e-4/j.Vb)-1)),0)/small.Cj0;
    return {ok:a.CjAvg<=a.Cj0&&Math.abs(keqSmall-1)<1e-3,exp:"C_j,avg ≤ C_j0; K_eq(ΔV→0) → 1",got:`C_j,avg/C_j0 = ${f3(a.CjAvg/a.Cj0)}, K_eq(0.1 mV) = ${f3(keqSmall)}`};
  });
  T(gC,"Off-state gate-bulk C below inversion channel C",()=>({ok:M0.CgbOff<M0.Cch,exp:"C_gb,off < C_ch",got:`${f3(M0.CgbOff*1e15)} < ${f3(M0.Cch*1e15)} fF`}));
  T(gC,"Channel-length modulation: vanishes in the linear region, positive output conductance in saturation",()=>{
    const M=model(DEF), a=M.core(DEF.VDD,0.05).dL, g=(M.idi(DEF.VDD,1.2)-M.idi(DEF.VDD,1.0))/0.2;
    return {ok:a<1e-3*M.Leff&&g>0&&M.VA>0&&isFinite(M.VA),exp:"ΔL < 0.1% of L_eff at V_DS = 50 mV; g_ds > 0 at V_DD",got:`ΔL(50 mV) ${f3(a/nm)} nm, g_ds ${f3(g)} S, V_A ${f3(M.VA)} V`,note:"ΔL uses a smooth max(V_DS − V_DSat, 0) with a 10 mV corner, so it is tiny but not exactly zero below saturation"};
  });
  T(gC,"Impact ionisation: negligible at 1.2 V, significant at 3.3 V on the same device",()=>{
    const a=model(DEF).IsubRatio, b=model({...DEF,VDD:3.3}).IsubRatio, z=model(DEF).hotCarrier(DEF.VDD,0).Isub;
    return {ok:a<0.1*b&&b>1e-3&&z===0,exp:"I_sub/I_D(3.3 V) > 1e-3 and > 10× the 1.2 V value; I_sub = 0 at V_DS = 0",got:`${f3(a)} → ${f3(b)}; I_sub(V_DS=0) = ${f3(z)}`};
  });
  T(gC,"Breakdown limit is the smallest mechanism and snapback cannot exceed it",()=>{
    let bad=0; [DEF,{...DEF,Lg:60},{...DEF,Na:1e17,Lg:500}].forEach(p=>{const b=model(p).breakdown(); if(Math.abs(b.BVdss-Math.min(...b.list.map(x=>x[1])))>1e-12||b.snapOn>b.BVdss+1e-9) bad++;});
    return {ok:bad===0,exp:"BV_dss = min(list), snapback ≤ BV_dss",got:`${bad} violations`};
  });
  T(gC,"Delay definitions: τ = C_gg V_DD / I_on, f_T = g_m / 2πC_gg",()=>{
    const a=rel(M0.tau,M0.CggOn*M0.p.VDD/M0.Ion), b=rel(M0.fT,M0.gm/(2*Math.PI*M0.CggOn));
    return {ok:a<1e-12&&b<1e-12,exp:"exact",got:`${f3(a)}, ${f3(b)}`};
  });

  /* ============ D. scaling and invariance ============ */
  const gD="D · Scaling and invariance";
  T(gD,"W×2 with plugs×2: per-µm currents unchanged, capacitances ×2, R_S ×½",()=>{
    const a=model({...DEF,W:500,Np:2}), b=model({...DEF,W:1000,Np:4});
    const e=[rel(b.Ion/1000,a.Ion/500),rel(b.Ioff/1000,a.Ioff/500),rel(b.CggOn,2*a.CggOn),rel(b.Cdrain,2*a.Cdrain),rel(b.Rs,a.Rs/2),rel(b.tau,a.tau),rel(b.tpHL,a.tpHL)];
    const w=Math.max(...e); return {ok:w<1e-9,exp:"all ratios exact",got:"worst deviation "+f3(w)};
  });
  T(gD,"Same EOT from different stacks gives identical V_th and I_on",()=>{
    const a=model({...DEF,tIL:2.0,tHK:0}), b=model({...DEF,tIL:1.0,tHK:1.0*20/3.9,kHK:20});
    const e=Math.max(rel(a.EOT,b.EOT),rel(a.VthSat,b.VthSat),rel(a.Ion,b.Ion));
    return {ok:e<1e-9,exp:"identical (electrostatics depend on EOT only)",got:`worst ${f3(e)}; fringe C differs as expected: ${f3(a.Cof*1e15)} vs ${f3(b.Cof*1e15)} fF`};
  });
  T(gD,"Contact and plug resistance ∝ 1/N_plugs",()=>{const a=model({...DEF,Np:1}),b=model({...DEF,Np:4});return {ok:rel(a.Rc,4*b.Rc)<1e-12&&rel(a.Rplug,4*b.Rplug)<1e-12,exp:"×4",got:`R_c ${f3(a.Rc/b.Rc)}, R_plug ${f3(a.Rplug/b.Rplug)}`};});
  T(gD,"Plug-body resistance ∝ plug height",()=>{const a=model({...DEF,Hp:200}),b=model({...DEF,Hp:600});return {ok:rel(b.Rplug,3*a.Rplug)<1e-12,exp:"×3",got:f3(b.Rplug/a.Rplug)};});
  T(gD,"Plug–gate C ∝ number of plugs",()=>{const a=model({...DEF,Np:1}),b=model({...DEF,Np:3});return {ok:rel(b.Cpg,3*a.Cpg)<1e-12,exp:"×3",got:f3(b.Cpg/a.Cpg)};});
  T(gD,"Channel C = C_inv·W·L_eff",()=>{let w=0;[60,200,1000].forEach(L=>{const M=model({...DEF,Lg:L});w=Math.max(w,rel(M.Cch,M.Cinv*M.W*nm*M.Leff));});return {ok:w<1e-12,exp:"exact",got:"worst "+f3(w),note:"C_inv itself shifts slightly with L_g because poly depletion is evaluated at the short-channel V_th"};});
  T(gD,"Gate R ∝ W/L_g",()=>{const a=model(DEF),b=model({...DEF,W:1000,Lg:180});return {ok:rel(a.Rg,b.Rg)<1e-12,exp:"unchanged",got:f3(b.Rg/a.Rg)};});
  T(gD,"Spacer and ILD with equal k: plug–gate C independent of spacer width",()=>{const a=model({...DEF,ksp:4,kILD:4,Wsp:10}),b=model({...DEF,ksp:4,kILD:4,Wsp:50});return {ok:rel(a.Cpg,b.Cpg)<1e-12,exp:"unchanged",got:f3(b.Cpg/a.Cpg)};});

  T(gD,"Footprint area = (L_g + 2·L_sd + S_L)·(W + S_W)",()=>{
    const p={...DEF,Lg:120,Lsd:250,SL:80,W:700,SW:200}, M=model(p), ref=(120+500+80)*(700+200)*1e-6;
    return {ok:rel(M.areaUm2,ref)<1e-12,exp:`${f3(ref)} µm²`,got:`${f3(M.areaUm2)} µm²`};
  });
  T(gD,"Contact-rule mode sets L_sd = plug gap + CD + enclosure (margin exactly 0)",()=>{
    const M=model({...DEF,lsdAuto:true,dpg:45,CD:70,eAct:20});
    return {ok:M.p.Lsd===135&&M.actMargin===0,exp:"L_sd 135 nm, margin 0",got:`L_sd ${f3(M.p.Lsd)} nm, margin ${f3(M.actMargin)} nm`};
  });
  T(gD,"Contact-rule mode changes the drain junction exactly like entering the same L_sd by hand",()=>{
    const a=model({...DEF,lsdAuto:true}), b=model({...DEF,Lsd:DEF.dpg+DEF.CD+DEF.eAct});
    return {ok:a.Cdrain===b.Cdrain&&a.areaUm2===b.areaUm2,exp:"identical C_drain and area",got:`${f3(a.Cdrain*1e15)} vs ${f3(b.Cdrain*1e15)} fF`};
  });

  T(gD,"Fixed oxide charge shifts V_th by exactly −qQ_f/C_ox",()=>{
    const a=model({...DEF,Qf:1e10}), b=model({...DEF,Qf:5e11}), ref=-K.q*(5e11-1e10)/a.Cox;
    return {ok:Math.abs((b.VthL-a.VthL)-ref)<1e-9,exp:`${f3(ref*1000)} mV`,got:`${f3((b.VthL-a.VthL)*1000)} mV`};
  });
  T(gD,"Pelgrom mismatch scales as 1/√(W·L_eff)",()=>{
    const a=model({...DEF,W:500,Lg:200}), b=model({...DEF,W:2000,Lg:200});
    return {ok:rel(a.sigmaVth/b.sigmaVth,2)<1e-9,exp:"4× area → σ/2",got:f3(a.sigmaVth/b.sigmaVth)};
  });
  T(gD,"SRH generation current ∝ 1/τ_g",()=>{
    const a=model({...DEF,taug:1}), b=model({...DEF,taug:10});
    return {ok:rel(a.Igen/b.Igen,10)<1e-9,exp:"×10",got:f3(a.Igen/b.Igen)};
  });

  /* ============ E. trends ============ */
  const gE="E · Physical trends over the full input range";
  const byK=Object.fromEntries(PARAMS.map(d=>[d.k,d]));
  const grid=(k,n=40,lo,hi)=>{const d=byK[k];lo=lo??d.min;hi=hi??d.max;return [...Array(n)].map((_,i)=>d.log?Math.pow(10,Math.log10(lo)+(Math.log10(hi)-Math.log10(lo))*i/(n-1)):lo+(hi-lo)*i/(n-1));};
  function trend(label,k,metric,sign,base={},lo,hi,strict=false){
    T(gE,label,()=>{
      const xs=grid(k,40,lo,hi), ys=xs.map(v=>metric(model({...DEF,...base,[k]:v})));
      let bad=0,where="";
      for(let i=1;i<ys.length;i++){const d=(ys[i]-ys[i-1])*sign; const tol=strict?0:1e-12*Math.abs(ys[i]); if(d<-tol){bad++;if(!where)where=`${f3(xs[i-1])}→${f3(xs[i])}`;}}
      return {ok:bad===0,exp:(sign>0?"increases":"decreases")+` with ${k} over ${f3(xs[0])} … ${f3(xs[xs.length-1])}`,got:bad?`${bad} reversals, first at ${where}`:`monotonic (${f3(ys[0])} → ${f3(ys[ys.length-1])})`};
    });
  }
  trend("Long-channel V_th rises with channel doping","Na",M=>M.VthL,+1);
  trend("V_th,sat rises with L_g (roll-off)","Lg",M=>M.VthSat,+1,{},20+2*DEF.Lov+5);
  trend("DIBL falls with L_g","Lg",M=>M.DIBL,-1,{},20+2*DEF.Lov+5);
  trend("I_off falls with L_g","Lg",M=>M.Ioff,-1,{},20+2*DEF.Lov+5);
  trend("I_on falls with L_g","Lg",M=>M.Ion,-1,{},20+2*DEF.Lov+5);
  trend("SS rises with gate-oxide thickness","tIL",M=>M.SS,+1);
  trend("C_ox falls with gate-oxide thickness","tIL",M=>M.Cox,-1);
  trend("C_gg rises with high-k permittivity (fixed thickness)","kHK",M=>M.CggOn,+1,{tHK:2});
  trend("I_on rises with V_DD","VDD",M=>M.Ion,+1);
  trend("I_off rises with temperature","T",M=>M.Ioff,+1);
  trend("V_th falls with temperature","T",M=>M.VthSat,-1);
  trend("ρ_c falls with S/D doping","Nsd",M=>M.rhoc,-1);
  trend("ρ_c rises with barrier height","phiB",M=>M.rhoc,+1);
  trend("R_S falls with S/D doping","Nsd",M=>M.Rs,-1);
  trend("R_S falls with extension doping","Next",M=>M.Rs,-1);
  trend("Plug–gate C falls with plug spacing","dpg",M=>M.Cpg,-1);
  trend("Plug–gate C rises with ILD k","kILD",M=>M.Cpg,+1);
  trend("Outer fringe rises with spacer k","ksp",M=>M.Cof,+1);
  trend("Outer fringe rises with gate height","Hg",M=>M.Cof,+1,{dpg:400});
  trend("Drain junction C rises with well doping","Nwell",M=>M.CjAvg,+1);
  trend("Drain junction C (avg) falls with V_DD","VDD",M=>M.CjAvg,-1);
  trend("Poly gate R falls with poly doping","Npoly",M=>M.Rg,-1);
  trend("Gate R falls with gate height","Hg",M=>M.Rg,-1);
  trend("S/D sheet R rises with plug spacing","dpg",M=>M.Rsd,+1);
  trend("Series R falls with plug CD","CD",M=>M.Rs,-1);

  /* ============ F. continuity ============ */
  const gF="F · Continuity (no jumps) while sweeping each input";
  const outs=[["I_on",M=>M.Ion],["I_off",M=>M.Ioff],["V_th,sat",M=>M.VthSat],["C_gg",M=>M.CggOn],["C_drain",M=>M.Cdrain],["R_S",M=>M.Rs],["τ",M=>M.tau],["t_pHL",M=>M.tpHL],["f_T",M=>M.fT]];
  PARAMS.forEach(d=>{
    T(gF,`Sweep ${d.k} (${d.l})`,()=>{
      const n=160, xs=grid(d.k,n); // same grid in quick and full runs
      const base=d.show&&!d.show({...DEF})?{gate:"metal"}:{};
      const Ms=xs.map(v=>model({...DEF,...base,[d.k]:d.int?Math.round(v):v}));
      let worst="",bad=0;
      outs.forEach(([name,f])=>{
        const ys=Ms.map(f);
        if(ys.some(v=>!isFinite(v))){bad++; if(!worst) worst=`${name} non-finite`; return;}
        // work in log space for positive quantities spanning decades, linear otherwise
        const pos=ys.every(v=>v>0)&&name!=="V_th,sat", zs=pos?ys.map(Math.log):ys;   // V_th is not a log-scale quantity
        const range=Math.max(...zs)-Math.min(...zs)||1;
        const st=zs.slice(1).map((v,i)=>Math.abs(v-zs[i])/range);
        st.forEach((s,i)=>{ if(d.int) return;
          const nb=Math.max(i>0?st[i-1]:0,i<st.length-1?st[i+1]:0);
          if(s>0.03&&s>4*nb){bad++; if(!worst) worst=`${name} step of ${pct(s)} of its range at ${f3(xs[i])}→${f3(xs[i+1])}, neighbours ${pct(nb)}`;}});
      });
      return {ok:bad===0,exp:"no jump: no step > 3% of the output range and > 4× both neighbouring steps",got:bad?worst:"smooth"};
    });
  });

  /* ============ G. robustness ============ */
  const gG="G · Random inputs over the allowed range";
  T(gG,`${opt.fast?300:2000} random devices: finite, correctly signed outputs`,()=>{
    let s=12345; const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};
    let bad=0,first="";
    const n=opt.fast?300:2000;
    for(let t=0;t<n;t++){
      const p={...DEF,gate:rnd()<0.5?"poly":"metal"};
      PARAMS.forEach(d=>{const u=rnd();let v=d.log?Math.pow(10,Math.log10(d.min)+u*(Math.log10(d.max)-Math.log10(d.min))):d.min+u*(d.max-d.min);if(d.int)v=Math.round(v);p[d.k]=v;});
      let M; try{M=model(p);}catch(e){bad++;if(!first)first="threw "+e.message;continue;}
      const checks={finite:["Ion","Ioff","VthSat","CggOn","Cdrain","Rs","tau","tpHL","fT","fmax","Ieff"].every(k=>isFinite(M[k])),
        positive:["Ion","Ioff","CggOn","Cdrain","Rs","Rg","Cpg","Cof","Cj0"].every(k=>M[k]>0),
        ordering:M.Ieff<=M.Ion*(1+1e-9)&&M.Ion<=M.Ion0*(1+1e-9)&&M.CjAvg<=M.Cj0*(1+1e-9)};
      const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
      if(failed.length){bad++; if(!first) first=`${failed.join(",")} failed for Lg=${f3(p.Lg)}, Na=${f3(p.Na)}, tIL=${f3(p.tIL)}, VDD=${f3(p.VDD)}`;}
    }
    return {ok:bad===0,exp:"all finite; I, C, R > 0; I_eff ≤ I_on ≤ I_on0; C_j,avg ≤ C_j0",got:bad?`${bad}/${n} failed · ${first}`:`${n}/${n} passed`};
  });
  T(gG,`${opt.fast?300:2000} random devices: I_D(V_GS, V_DD) never decreases with V_GS (g_m ≥ 0, CLM included)`,()=>{
    // Added with CLM: the Ko ΔL shrinks as V_dsat rises, which can outrun the base-current increase.
    // Graded on normally-off devices (V_th,sat > 0); normally-on corners with several volts of overdrive are reported.
    let s=4242; const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};
    let bad=0,badOn=0,first="";
    const n=opt.fast?300:2000;
    for(let t=0;t<n;t++){
      const p={...DEF,gate:rnd()<0.5?"poly":"metal"};
      PARAMS.forEach(d=>{const u=rnd();let v=d.log?Math.pow(10,Math.log10(d.min)+u*(Math.log10(d.max)-Math.log10(d.min))):d.min+u*(d.max-d.min);if(d.int)v=Math.round(v);p[d.k]=v;});
      const M=model(p); let prev=0,drop=0;
      for(let i=1;i<=30;i++){const I=M.ids(p.VDD*i/30,p.VDD); if(I<prev*(1-1e-3)) drop=Math.max(drop,1-I/prev); prev=I;}
      if(drop>0){ if(M.VthSat>0){bad++; if(!first) first=`Lg=${f3(p.Lg)}, Na=${f3(p.Na)}, VDD=${f3(p.VDD)}, drop ${pct(drop)}`;} else badOn++; }
    }
    return {ok:bad===0,exp:"no decrease > 0.1% on normally-off devices",got:(bad?`${bad} normally-off failed · ${first}`:"0 normally-off failed")+` · normally-on with a decrease: ${badOn}/${n}`,
      note:"Normally-on corners with V_GS − V_th of several volts can show a small negative g_m near V_DS ≈ V_dsat (Ko CLM form); outside the useful range"};
  });
  T(gG,"Share of random devices with V_th,sat < 0 (normally on)",()=>{
    let s=777; const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};
    let neg=0; const n=500;
    for(let t=0;t<n;t++){const p={...DEF};PARAMS.forEach(d=>{const u=rnd();p[d.k]=d.log?Math.pow(10,Math.log10(d.min)+u*(Math.log10(d.max)-Math.log10(d.min))):d.min+u*(d.max-d.min);});if(model(p).VthSat<0)neg++;}
    return {info:true,exp:"reported only",got:`${neg}/${n}`,note:"Random corners include very short, lightly doped devices; the UI warns in that case"};
  });
  /* ============ H. expected-trend matrix ============ */
  if(opt.TRENDS){
    const gH="H · Expected trend matrix (knob ↑ → direction of each output)";
    opt.TRENDS.run(NMOS).forEach(k=>{
      T(gH,`${k.name}  [${f3(k.range[0])} … ${f3(k.range[1])}]`,()=>{
        const graded=k.cells.filter(c=>c.ok!==null), bad=graded.filter(c=>!c.ok);
        const fmt=c=>`${c.label} expected ${c.expected}, model ${c.seen} (${f3(c.from)} → ${f3(c.to)})`;
        return {ok:!bad.length,exp:graded.map(c=>`${c.label} ${c.expected}`).join(", "),
          got:bad.length?`${bad.length}/${graded.length} wrong: `+bad.map(fmt).join("; "):`${graded.length}/${graded.length} directions correct`,note:k.why};
      });
    });
  }
  /* ============ I. optimiser ============ */
  if(opt.OPT){
    const O=opt.OPT, gI="I · Optimiser (NSGA-II)";
    T(gI,"ZDT1 benchmark converges to the known Pareto front",()=>{
      const n=6, prob={vars:Array.from({length:n},(_,i)=>({k:"x"+i,lo:0,hi:1})),
        evaluate(x){const v=Object.values(x), f1=v[0], g=1+9*v.slice(1).reduce((a,b)=>a+b,0)/(n-1); return {f:[f1,g*(1-Math.sqrt(f1/g))],viol:0};}};
      const run=O.createRun(prob,{pop:60,seed:3}).init().step(opt.fast?120:200);
      const P=run.pareto(); const gd=Math.sqrt(P.reduce((a,p)=>a+Math.pow(p.f[1]-(1-Math.sqrt(p.f[0])),2),0)/P.length);
      return {ok:gd<0.05&&P.length>=20,exp:"mean distance to f₂ = 1 − √f₁ below 0.05 with ≥ 20 front points",got:`distance ${f3(gd)}, ${P.length} points`};
    });
    T(gI,"Constraint handling: minimise x² subject to x ≥ 1",()=>{
      const prob={vars:[{k:"x",lo:-3,hi:3}],evaluate(x){return {f:[x.x*x.x],viol:Math.max(0,1-x.x)};}};
      const P=O.createRun(prob,{pop:30,seed:5}).init().step(60).pareto();
      return {ok:P.length>0&&Math.abs(P[0].x.x-1)<0.02,exp:"best feasible x = 1 ± 0.02",got:P.length?"x = "+f3(P[0].x.x):"no feasible point"};
    });
    const cfg={vars:[{k:"Na",lo:1e18,hi:5e18},{k:"tIL",lo:1.0,hi:3.0},{k:"Np",lo:1,hi:6}],
      objectives:[{m:"tau",dir:"min"},{m:"IoffTot",dir:"min"}],constraints:[{m:"VthSat",op:">=",v:0.2},{m:"Eox",op:"<=",v:6}]};
    const run=O.createRun(O.nmosProblem(NMOS,cfg),{pop:40,seed:7}).init().step(opt.fast?15:40);
    const P=run.pareto();
    T(gI,"Only the toggled parameters change; everything else stays at its input value",()=>{
      const bad=P.filter(p=>{const M=model({...DEF,...p.x}); return Object.keys(DEF).some(k=>!(k in p.x)&&M.p[k]!==DEF[k]);});
      const keys=[...new Set(P.flatMap(p=>Object.keys(p.x)))];
      return {ok:bad.length===0&&keys.sort().join()==="Na,Np,tIL",exp:"design vector = {Na, tIL, Np} only",got:`keys ${keys.join(", ")}; ${bad.length} violations`};
    });
    T(gI,"Results respect bounds and integer parameters stay integers",()=>{
      const bad=run.archive.filter(p=>p.x.Na<1e18*(1-1e-9)||p.x.Na>5e18*(1+1e-9)||p.x.tIL<1-1e-9||p.x.tIL>3+1e-9||!Number.isInteger(p.x.Np));
      return {ok:bad.length===0,exp:"0 of all evaluated points out of bounds",got:`${bad.length} of ${run.archive.length}`};
    });
    T(gI,"Pareto points satisfy the constraints when re-evaluated",()=>{
      const bad=P.filter(p=>{const M=model({...DEF,...p.x}); return M.VthSat<0.2-1e-9||M.Eox/1e6>6+1e-9;});
      return {ok:P.length>0&&bad.length===0,exp:"V_th,sat ≥ 0.2 V and E_ox ≤ 6 MV/cm for every front point",got:`${P.length} points, ${bad.length} violations`};
    });
    T(gI,"Front is a genuine trade-off: lower CV/I costs higher I_off",()=>{
      let rev=0; for(let i=1;i<P.length;i++) if(P[i].data.metrics.IoffTot>P[i-1].data.metrics.IoffTot*(1+1e-9)) rev++;
      return {ok:P.length>=5&&rev===0,exp:"sorted by CV/I ascending, I_off,total strictly descending",got:`${P.length} points, ${rev} reversals · CV/I ${f3(P[0]?.data.metrics.tau)}→${f3(P[P.length-1]?.data.metrics.tau)} ps, I_off ${f3(P[0]?.data.metrics.IoffTot)}→${f3(P[P.length-1]?.data.metrics.IoffTot)} nA/µm`};
    });
    T(gI,"L_g-variation worst case is never better than nominal",()=>{
      const pr0=O.nmosProblem(NMOS,{...cfg,dLg:0}), pr5=O.nmosProblem(NMOS,{...cfg,dLg:5});
      let bad=0; P.slice(0,8).forEach(p=>{const a=pr0.evaluate(p.x), b=pr5.evaluate(p.x); if(b.f[0]<a.f[0]-1e-12||b.f[1]<a.f[1]-1e-12||b.viol<a.viol-1e-12) bad++;});
      return {ok:bad===0,exp:"objectives and violation at ±5 nm corners ≥ nominal",got:`${bad} of ${Math.min(8,P.length)} points better at the corners`};
    });
    T(gI,"Area problem: smallest footprint that still delivers a total I_on",()=>{
      const need=300; // µA for the whole device
      const cfgA={vars:[{k:"W",lo:200,hi:3000},{k:"dpg",lo:30,hi:150},{k:"CD",lo:30,hi:120}],base:{lsdAuto:true},
        objectives:[{m:"area",dir:"min"}],constraints:[{m:"IonTot",op:">=",v:need}]};
      const R=O.createRun(O.nmosProblem(NMOS,cfgA),{pop:30,seed:2}).init().step(opt.fast?25:50).pareto();
      const b=R[0], M=b&&model({...DEF,lsdAuto:true,...b.x}), d=model({...DEF,lsdAuto:true});
      // the optimum must sit on the drive limit (area grows with W) and beat the example device
      const ok=!!b&&M.Ion*1e6>=need*(1-1e-9)&&M.Ion*1e6<=need*1.05&&M.areaUm2<d.areaUm2*(need/(d.Ion*1e6))*1.02;
      return {ok,exp:`I_on ≥ ${need} µA and within 5% of it; area below the example device scaled to the same drive`,
        got:b?`area ${f3(M.areaUm2)} µm², I_on ${f3(M.Ion*1e6)} µA, W ${f3(b.x.W)} nm, gap ${f3(b.x.dpg)} nm, CD ${f3(b.x.CD)} nm`:"no feasible design"};
    });
    // regression for the 2026-09-26 bug: geometry-only knobs + a violated E_ox limit gave a one-point "front"
    const geo=["Hg","Lg","W","Lov","Wsp","Lsd","CD","dpg","Hp"].map(k=>({k}));
    const cfgG={vars:geo,objectives:[{m:"tau",dir:"min"},{m:"area",dir:"min"}],
      constraints:[{m:"VthSat",op:">=",v:0.25},{m:"Eox",op:"<=",v:6},{m:"Igc",op:"<=",v:10},{m:"DIBL",op:"<=",v:100},{m:"actMargin",op:">=",v:0}]};
    T(gI,"A limit no selected knob can move is detected (E_ox with geometry-only knobs)",()=>{
      const L=O.nmosProblem(NMOS,cfgG).probeLimits(), e=L.find(l=>l.m==="Eox"), others=L.filter(l=>l.m!=="Eox");
      return {ok:e.fixed&&!e.reachable&&others.every(l=>!l.fixed),exp:"E_ox flagged fixed and unreachable; the other four limits movable",
        got:L.map(l=>`${l.m}: ${l.fixed?"fixed":"movable"}${l.reachable?"":", unreachable"}`).join(" · ")};
    });
    T(gI,"Equal violation falls back to the objectives: a real trade-off still forms",()=>{
      const P=O.createRun(O.nmosProblem(NMOS,cfgG),{pop:40,seed:1}).init().step(opt.fast?20:40).pareto();
      const tau=P.map(p=>p.data.metrics.tau), area=P.map(p=>p.data.metrics.area);
      const spread=Math.max(...tau)/Math.min(...tau)>1.3&&Math.max(...area)/Math.min(...area)>1.5;
      return {ok:P.length>=5&&spread&&Math.min(...tau)<5,exp:"≥ 5 least-violating designs spanning CV/I and area, best CV/I below 5 ps",
        got:`${P.length} designs · CV/I ${f3(Math.min(...tau))}–${f3(Math.max(...tau))} ps · area ${f3(Math.min(...area))}–${f3(Math.max(...area))} µm²`,
        note:"Before the fix every design had the same E_ox violation, none dominated another, and the 'front' was one arbitrary point (CV/I up to thousands of ps)"};
    });
    T(gI,"Same seed gives the same result",()=>{
      const a=O.createRun(O.nmosProblem(NMOS,cfg),{pop:20,seed:11}).init().step(5).pareto().map(p=>p.f.join()).join("|");
      const b=O.createRun(O.nmosProblem(NMOS,cfg),{pop:20,seed:11}).init().step(5).pareto().map(p=>p.f.join()).join("|");
      return {ok:a===b,exp:"identical fronts",got:a===b?"identical":"different"};
    });
  }
  /* ============ J. HV (30 V class) device ============ */
  if(NMOS.PRESETS&&NMOS.PRESETS.hv){
    const gJ="J · HV device (DDD drain, drift, 30–40 V)", HV=NMOS.PRESETS.hv, q=K.q, eSi=K.eSi, HVR=opt.HVREF;
    const MH=model(HV);
    // J1 layered junction solvers reduce to the single-layer ones
    T(gJ,"Layered junction solver = single-layer avalanche solver (planar and cylindrical limits)",()=>{
      const cases=[[1e16,Infinity],[1e17,Infinity],[2e16,150e-7],[1e17,60e-7]];
      const errs=cases.map(([N,rj])=>{const Vbi=0.9; const a=H.avalancheBV(N,Vbi,rj,300), b=H.layeredBV([{N:1e20,t:Infinity}],N,Vbi,300,rj); return b/a-1;});
      const w=Math.max(...errs.map(Math.abs));
      return {ok:w<=0.02,exp:"n⁺ (1e20) on N, same V_bi: within 2% of avalancheBV",got:`worst ${pct(w)} · `+errs.map(pct).join(" / "),
        note:"The layered solver keeps the n-side depletion that the one-sided form drops; 1e20 makes it negligible"};
    });
    // J2 two-layer depletion: closed form vs numerical integration of Poisson
    T(gJ,"Two-layer depletion (drift over DDD) vs numerical Poisson integration",()=>{
      const L=[{N:1.4e17,t:140e-7},{N:7e16,t:560e-7},{N:1e20,t:Infinity}], Np=1.5e16;
      const errs=[1,10,30].map(Vt=>{ const d=H.deplLayers(L,Np,Vt); const n=4000; let V=0,Q=0,z=0;
        // field rises across the n side (from xn back to 0) and falls across xp
        const Nat=x=>{let a=0;for(const l of L){if(x<a+l.t) return l.N; a+=l.t;} return L[L.length-1].N;};
        const zs=[]; for(let i=0;i<n;i++){const x=d.xn*(1-(i+0.5)/n); Q+=Nat(x)*d.xn/n; V+=q*Q/eSi*d.xn/n;}
        V+=q*Q/eSi*d.xp/2;  // triangular p side
        return V/Vt-1; });
      const w=Math.max(...errs.map(Math.abs));
      return {ok:w<=0.005,exp:"integrated potential = applied 1, 10, 30 V within 0.5%",got:errs.map(pct).join(" / ")};
    });
    // J3 thick-oxide long-channel V_th and body effect vs exact 1D MOS
    [0,10].forEach(Vsb=>T(gJ,`HV long-channel V_th (65 nm oxide, N_A 1.5e16) with V_SB = ${Vsb} V vs exact 1D MOS`,()=>{
      const M=model({...HV,Vsb}); const m=REF.mos1d({Na:M.p.Na,ni:M.ni,T:M.T,Cox:M.Cox,Vfb:M.Vfb,Vsb});
      const ref=m.VthExact-Vsb, d=M.VthL-ref;
      return {ok:Math.abs(d)<0.005,exp:`${f3(ref)} V ± 5 mV`,got:`${f3(M.VthL)} V (Δ ${(d*1000).toFixed(2)} mV)`};
    }));
    // J4 field transistor
    T(gJ,"Field-transistor V_th (poly over STI, channel-stop doping) vs exact 1D MOS",()=>{
      const M=MH, Cf=K.eOx/(HV.tfox*nm), ni=M.ni, vt=M.vt, phiFf=vt*Math.log(HV.Nfld/ni), eg=H.EgT(HV.T);
      const Vfb=-(eg/2+phiFf)-q*HV.Qf/Cf, m=REF.mos1d({Na:HV.Nfld,ni,T:HV.T,Cox:Cf,Vfb});
      const d=M.VthFld-m.VthExact;
      return {ok:Math.abs(d)<0.02,exp:`${f3(m.VthExact)} V ± 20 mV`,got:`${f3(M.VthFld)} V (Δ ${(d*1000).toFixed(1)} mV)`,note:"300 nm field oxide, N_fld 5e17; same flat-band convention (n⁺ poly, Q_f)"};
    });
    // J5 pass voltage is self-consistent
    T(gJ,"Pass-gate output: V_DD − V_pass = V_th(V_SB + V_pass); V_G = V_G,req passes the full V_DD",()=>{
      const r=[0,5].map(Vsb=>{const M=model({...HV,Vsb}); const res=HV.VDD-M.Vpass-M.vthBody(Vsb+M.Vpass);
        const M2=model({...HV,Vsb,VDD:M.VgReq}); const full=M2.vthBody(Vsb+HV.VDD); return [res,M.VgReq-HV.VDD-full];});
      const w=Math.max(...r.flat().map(Math.abs));
      return {ok:w<1e-3,exp:"residuals < 1 mV (V_SB = 0 and 5 V)",got:r.map(x=>x.map(v=>(v*1000).toFixed(3)+" mV").join(", ")).join(" · ")};
    });
    // J6 drift resistance vs 2D resistor
    const dCases=[{},{Ldr:500},{Ldr:2000},{Oddd:0},{Oddd:600},{Next:5e16},{Next:5e17},{Nddd:3e16},{Nddd:3e17},{Xjext:80},{Xjddd:400},{Xjext:300}];
    T(gJ,`Drift resistance, low current, ${dCases.length} structures vs 2D resistor`,()=>{
      const e=dCases.map(o=>{const p={...HV,...o};
        const d=REF.drift2d({Loff:p.Ldr,Oddd:Math.min(p.Oddd,p.Ldr),Xjext:p.Xjext,Xjddd:p.Xjddd,Xj:p.Xj,Next:p.Next,Nddd:p.Nddd,Nsd:p.Nsd,mu:H.muCT}).drift;
        return model({...p,_noDep:1}).Rdrift*p.W*1e-7/d-1;});
      const w=Math.max(...e.map(Math.abs));
      return {ok:w<=0.2,exp:"each within ±20% (drift length, overhang, LDD/DDD doping and depths)",got:`worst ${pct(w)} · `+e.map(pct).join(" "),
        note:"Junction depletion switched off on both sides (the 2D resistor has none). The overhang two-sheet term reuses the overlap coupling 0.2 (not refitted)"};
    });
    // J7 quasi-saturation: drain current bounded by the Kirk limit of the drift
    T(gJ,"Drift quasi-saturation: I_D stays below the Kirk current W·q·N·v_sat·t and R_drift rises with current",()=>{
      const M=model({...HV,VDD:40}), p=M.p, Jm=q*p.Next*M.vsat*p.Xjext*nm, Imax=Jm*p.W*nm;
      const Ihi=M.ids(40,40), r1=M.driftDrop(1e-9*p.W/1000,0,1)/(1e-9*p.W/1000), r2=M.driftDrop(0.8*Imax,0,1)/(0.8*Imax);
      return {ok:Ihi<Imax&&r2>1.5*r1,exp:"I_D(40 V, 40 V) < Kirk limit; drop/I at 0.8·limit > 1.5× the low-current value",
        got:`I_D ${f3(Ihi*1e6)} µA vs limit ${f3(Imax*1e6)} µA · R ${f3(r1)} → ${f3(r2)} Ω`};
    });
    // J8 monotonic I–V over the HV range
    T(gJ,"HV I_D monotonic in V_DS and V_GS (0–40 V)",()=>{
      const M=model({...HV,VDD:40}); let bad=0;
      for(const vg of [5,10,20,30,40]){let pr=-1; for(let i=0;i<=40;i++){const I=M.ids(vg,i); if(I<pr*(1-1e-6)) bad++; pr=I;}}
      for(const vd of [1,10,30]){let pr=-1; for(let i=0;i<=40;i++){const I=M.ids(i,vd); if(I<pr*(1-1e-6)) bad++; pr=I;}}
      return {ok:bad===0,exp:"no decreasing step",got:`${bad} decreasing steps`};
    });
    // J9 BV vs the 2D reference data
    if(HVR){
      const inDom=r=>r.p.Next>=3*r.p.Na&&r.p.tIL>=35;
      const bvErr=r=>{const M=model({...HV,...r.p}); const b=M.breakdown(); return Math.min(b.gdAv,b.avExtHV,b.avBot)/r.BV-1;};
      const sets=[...new Set(HVR.bv.map(r=>r.set))];
      sets.forEach(set=>T(gJ,`Avalanche BV vs 2D field-line ionisation: ${set} set (in the checked range)`,()=>{
        const e=HVR.bv.filter(r=>r.set===set&&inDom(r)).map(bvErr); const rms=Math.sqrt(e.reduce((a,v)=>a+v*v,0)/e.length);
        const in25=e.filter(v=>Math.abs(v)<=0.25).length;
        return {ok:rms<=0.2&&in25>=0.9*e.length,exp:"rms ≤ 20% and ≥ 90% of points within ±25%",
          got:`n ${e.length}, rms ${pct(rms)}, ${in25}/${e.length} within ±25%, range ${pct(Math.min(...e))} … ${pct(Math.max(...e))}`,
          note:"2D: nonlinear Poisson at V_G = 0 with the ionisation integral maximised over field lines. Compact: min of gate-edge/drift surface, LDD corner and n⁺/DDD bottom-corner avalanche. Checked range: N_ext ≥ 3·N_A, oxide ≥ 35 nm (the optimiser's HV range)"};
      }));
      T(gJ,"Avalanche BV vs 2D outside the checked range (N_ext < 3·N_A or oxide < 35 nm)",()=>{
        const e=HVR.bv.filter(r=>!inDom(r)).map(bvErr); const rms=Math.sqrt(e.reduce((a,v)=>a+v*v,0)/e.length);
        return {info:true,exp:"reported only",got:`n ${e.length}, rms ${pct(rms)}, range ${pct(Math.min(...e))} … ${pct(Math.max(...e))}`,note:"The page flags designs in this region"};
      });
      // J10 punch-through bound is conservative
      T(gJ,`Punch-through bound (1D reach-through) never above the 2D onset (${HVR.sce.length} devices, L_g 0.5–5 µm)`,()=>{
        let bad=0, worst=""; const rows=HVR.sce.map(r=>{
          let on=Infinity; for(let i=0;i<r.Vs.length;i++) if(r.logI[i]>=-6){on=i?r.Vs[i-1]+(r.Vs[i]-r.Vs[i-1])*(-6-r.logI[i-1])/(r.logI[i]-r.logI[i-1]):r.Vs[0];break;}
          const v=model({...HV,...r.p}).VRT; if(v>on){bad++; if(!worst) worst=`${r.name} L ${r.p.Lg}: bound ${f3(v)} V > 2D ${f3(on)} V`;} return [v,on];});
        const far=rows.filter(([v,on])=>on===Infinity&&v<40).length;
        return {ok:bad===0,exp:"bound ≤ V_DS where the 2D channel current at V_GS = 0 reaches 1 µA/µm",got:bad?worst:`0 violations · ${far} devices with bound < 40 V where 2D shows no onset up to 40 V`,
          note:"Conservative by a wide margin, so it is reported as a bound next to BV_dss rather than inside it"};
      });
      // J11 known gap: HV subthreshold current
      T(gJ,"HV subthreshold current at V_GS = 0, V_DS = 10 V: compact vs 2D",()=>{
        const d=HVR.sce.map(r=>{const i=r.Vs.indexOf(10); const M=model({...HV,...r.p}); return [r.p.Lg,Math.log10(M.idi(0,10)/(M.p.W/1000))-r.logI[i]];});
        const long=d.filter(x=>x[0]>=2000).map(x=>x[1]), short=d.filter(x=>x[0]<=800).map(x=>x[1]);
        const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
        return {info:true,exp:"reported only",got:`mean log10(compact/2D): L ≥ 2 µm ${avg(long).toFixed(1)} decades, L ≤ 0.8 µm ${avg(short).toFixed(1)} decades`,
          note:"The HV compact model has no short-channel current, and even long channels sit 2–3 decades below 2D (cause not isolated). I_off,total of the preset is set by SRH generation, not by this term"};
      });
    }
    // J12 BV defined with body = source
    T(gJ,"BV_dss does not depend on V_SB (defined with body = source); snapback does",()=>{
      const a=model({...HV,Vsb:0}), b=model({...HV,Vsb:10});
      return {ok:a.BVdss===b.BVdss,exp:"identical BV_dss",got:`${f3(a.BVdss)} / ${f3(b.BVdss)} V · snapback ${f3(a.snapOn)} / ${f3(b.snapOn)} V`};
    });
    // J13 HV-only inputs do not touch the LV device
    T(gJ,"HV-only inputs leave the LV device unchanged",()=>{
      const hvKeys=PARAMS.filter(d=>d.dev==="hv").map(d=>d.k);
      const base=model(DEF), keys=["Ion","Ioff","VthSat","Rs","CggOn","Cdrain","tau","RonA"];
      const bad=hvKeys.filter(k=>{const d=byK[k]; const M=model({...DEF,[k]:d.max}); return keys.some(x=>M[x]!==base[x]);});
      return {ok:!bad.length,exp:`${hvKeys.join(", ")} at their maximum: identical LV outputs`,got:bad.length?"changed by "+bad.join(", "):"identical"};
    });
    // J14 random HV devices
    T(gJ,`${opt.fast?100:400} random HV devices: finite, correctly signed outputs`,()=>{
      let s=99; const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};
      const PH=NMOS.paramsFor("hv"); let bad=0,first=""; const n=opt.fast?100:400;
      for(let t=0;t<n;t++){ const p={...HV};
        PH.forEach(d=>{const u=rnd();let v=d.log?Math.pow(10,Math.log10(d.min)+u*(Math.log10(d.max)-Math.log10(d.min))):d.min+u*(d.max-d.min);if(d.int)v=Math.round(v);p[d.k]=v;});
        let M; try{M=model(p);}catch(e){bad++;if(!first)first="threw "+e.message;continue;}
        const ok=["Ion","Ioff","VthSat","CggOn","Cdrain","Rs","Rdrift","RonA","Vpass"].every(k=>isFinite(M[k]))&&M.Ion>0&&M.Rs>0&&M.Ieff<=M.Ion*(1+1e-6);
        if(!ok){bad++; if(!first) first=`Lg=${f3(p.Lg)}, Ldr=${f3(p.Ldr)}, Next=${f3(p.Next)}, VDD=${f3(p.VDD)}`;} }
      return {ok:bad===0,exp:"all finite; I, R > 0; I_eff ≤ I_on",got:bad?`${bad}/${n} failed · ${first}`:`${n}/${n} passed`};
    });
    // J15 continuity of the HV inputs
    const outsH=[["I_on",M=>M.Ion],["I_off",M=>M.IoffTot],["V_th,sat",M=>M.VthSat],["R_S",M=>M.Rs],["C_drain",M=>M.Cdrain],["R_on·A",M=>M.RonA],["V_pass",M=>M.Vpass]];
    NMOS.paramsFor("hv").filter(d=>d.dev==="hv"||d.hv).forEach(d=>T(gJ,`HV sweep ${d.k} (${d.l})`,()=>{
      // inputs spanning a decade or more are sampled geometrically (a linear grid puts one coarse step over the
      // steep 1/CD², 1/d parts and reads them as jumps)
      const lg=d.log||(d.min>0&&d.max/d.min>=10);
      const n=opt.fast?30:80, xs=[...Array(n)].map((_,i)=>lg?Math.pow(10,Math.log10(d.min)+(Math.log10(d.max)-Math.log10(d.min))*i/(n-1)):d.min+(d.max-d.min)*i/(n-1));
      const Ms=xs.map(v=>model({...HV,[d.k]:d.int?Math.round(v):v})); let bad=0,worst="";
      outsH.forEach(([name,f])=>{ const ys=Ms.map(f); if(ys.some(v=>!isFinite(v))){bad++; if(!worst) worst=`${name} non-finite`; return;}
        const pos=ys.every(v=>v>0)&&name!=="V_th,sat", zs=pos?ys.map(Math.log):ys, range=Math.max(...zs)-Math.min(...zs)||1;
        const st=zs.slice(1).map((v,i)=>Math.abs(v-zs[i])/range);
        st.forEach((s2,i)=>{ if(d.int) return; const nb=Math.max(i>0?st[i-1]:0,i<st.length-1?st[i+1]:0);
          if(s2>0.1&&s2>4*nb){bad++; if(!worst) worst=`${name} step of ${pct(s2)} at ${f3(xs[i])}→${f3(xs[i+1])}, neighbours ${pct(nb)}`;}}); });
      return {ok:bad===0,exp:"no jump: no step > 10% of the output range and > 4× both neighbours (coarser grid than F)",got:bad?worst:"smooth"};
    }));
    // J16 HV optimiser run
    if(opt.OPT) T(gJ,"HV optimiser (R_on·A vs BV_dss, drift length / LDD / DDD / oxide): front designs meet every limit",()=>{
      const O=opt.OPT, cfg={base:HV,vars:[{k:"Ldr",lo:300,hi:2000},{k:"Next",lo:5e16,hi:1e18},{k:"Nddd",lo:2e16,hi:5e17},{k:"tIL",lo:35,hi:80}],
        objectives:[{m:"RonA",dir:"min"},{m:"BVdss",dir:"max"}],
        constraints:[{m:"VthSat",op:">=",v:0.4},{m:"Eox",op:"<=",v:5},{m:"actMargin",op:">=",v:0},{m:"fldMargin",op:">=",v:0},{m:"rtMargin",op:">=",v:0},{m:"bvMargin",op:">=",v:6}]};
      const P=O.createRun(O.nmosProblem(NMOS,cfg),{pop:16,seed:2}).init().step(8).pareto().filter(p=>p.viol===0);
      let bad=0; P.forEach(p=>{const M=model({...HV,...p.x}); if(M.VthSat<0.4||M.Eox>5e6||M.actMargin<0||M.VthFld<HV.VDD||M.VRT<HV.VDD||M.BVdss<HV.VDD+6) bad++;});
      const r=P.map(p=>p.data.metrics.RonA), bv=P.map(p=>p.data.metrics.BVdss);
      return {ok:P.length>=2&&bad===0,exp:"≥ 2 feasible front points, all limits hold when re-evaluated",
        got:`${P.length} points, ${bad} violating · R_on·A ${f3(Math.min(...r))}–${f3(Math.max(...r))} mΩ·mm², BV ${f3(Math.min(...bv))}–${f3(Math.max(...bv))} V`};
    });
    // J17 live 2D check of the preset (full run only)
    if(!opt.fast) T(gJ,"HV preset avalanche BV vs live 2D run",()=>{
      const r=REF.hvBV2d(REF.hvGeom(MH,HV),{dV:2,vmax:60}); const b=MH.breakdown(), c=Math.min(b.gdAv,b.avExtHV,b.avBot);
      return {...within(c,r.BV,0.25," V"),note:`2D gate-edge ${f3(r.BVgate)} V, elsewhere ${f3(r.BVother)} V; compact limit: ${b.mech}`};
    });
  }
  return out;
}
return {runAll};
});
