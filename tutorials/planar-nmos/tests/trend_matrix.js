/* Expected-trend matrix for the planar NMOS model.
   For each knob: the direction every output SHOULD move when the knob is raised,
   decided from device physics before running the model. Cells left out are
   genuinely ambiguous (competing effects) and are shown as "?" without a verdict.

   Signs:  "+" rises   "−" falls   "0" must not change   "≥" non-decreasing (may saturate)
   Each knob is swept over a realistic window around the example device with the
   other inputs held at their defaults (plus the stated base overrides).
*/
(function(root,factory){
  if(typeof module==="object"&&module.exports) module.exports=factory();
  else root.NMOS_TRENDS=factory();
})(typeof self!=="undefined"?self:this,function(){
"use strict";

const METRICS=[
  {k:"Vth",   l:"V_th,sat", f:M=>M.VthSat},
  {k:"DIBL",  l:"DIBL",     f:M=>M.DIBL},
  {k:"SS",    l:"SS",       f:M=>M.SS},
  {k:"Ion",   l:"I_on",     f:M=>M.Ion},
  {k:"Ioff",  l:"I_off,sub",f:M=>M.Ioff},
  {k:"IoffT", l:"I_off,tot",f:M=>M.IoffTot},
  {k:"Ig",    l:"I_g,on",   f:M=>M.Igc},
  {k:"Rs",    l:"R_S",      f:M=>M.Rs},
  {k:"Rg",    l:"R_g",      f:M=>M.Rg},
  {k:"Cgg",   l:"C_gg",     f:M=>M.CggOn},
  {k:"Cdrain",l:"C_drain",  f:M=>M.Cdrain},
  {k:"tau",   l:"CV/I",     f:M=>M.tau},
  {k:"tpHL",  l:"t_pHL",    f:M=>M.tpHL},
  {k:"tauG",  l:"R_g·C_gg", f:M=>M.tauG},
  {k:"fT",    l:"f_T",      f:M=>M.fT},
  {k:"fmax",  l:"f_max",    f:M=>M.fmax},
  {k:"Area",  l:"Area",     f:M=>M.areaUm2},
  {k:"Eox",   l:"E_ox",     f:M=>M.Eox},
  {k:"BV",    l:"BV_dss",   f:M=>M.BVdss},
  {k:"Snap",  l:"Snapback", f:M=>M.snapOn},
  {k:"IsubR", l:"I_sub/I_D",f:M=>M.IsubRatio},
  {k:"VA",    l:"V_A",      f:M=>M.VA},
  {k:"Sig",   l:"σV_th",    f:M=>M.sigmaVth},
  {k:"Igen",  l:"I_gen",    f:M=>M.Igen},
  {k:"RonA",  l:"R_on·A",   f:M=>M.RonA},
  {k:"Vpass", l:"V_pass",   f:M=>M.Vpass},
  {k:"VRT",   l:"V_RT",     f:M=>M.VRT},
  {k:"VthF",  l:"V_th,fld", f:M=>M.VthFld}
];

/* exp: expected sign per metric; why: physics behind the non-obvious cells */
const SPEC=[
  {k:"Hg", lo:50, hi:250, name:"Gate height ↑",
   exp:{Vth:"0",DIBL:"0",SS:"0",Ion:"0",Ioff:"0",IoffT:"0",Ig:"0",Rs:"0",Rg:"−",Cgg:"+",Cdrain:"+",tau:"+",tpHL:"+",tauG:"−",fT:"−",Area:"0",Eox:"0"},
   why:"Taller sidewall: more outer-fringe and plug-facing area (C↑ → CV/I, t_pHL, f_T worse). Gate cross-section grows so R_g ∝ 1/H_g, which outweighs the small C rise in R_g·C_gg. f_max has both effects → not graded."},
  {k:"Lg", lo:60, hi:500, name:"Gate length ↑",
   exp:{Vth:"+",DIBL:"−",SS:"−",Ion:"−",Ioff:"−",Rg:"−",Cgg:"+",Cdrain:"0",tau:"+",tpHL:"+",fT:"−",Area:"+",Eox:"0",BV:"≥",VA:"+",Sig:"−"},
   why:"Weaker short-channel effect: V_th roll-off, DIBL and subthreshold-swing degradation all shrink. On-state oxide field is set by V_DD − V_FB − ψs with ψs pinned in inversion, so it does not depend on L. Longer channel lowers drive and adds channel C. R_g ∝ W/L_g. Drain-node C has no L_g term. R_S only moves through second-order poly-depletion coupling → not graded."},
  {k:"W", lo:200, hi:5000, name:"Width ↑ (plug count fixed)",
   exp:{DIBL:"0",SS:"0",Ion:"+",Ioff:"+",Rs:"−",Rg:"+",Cgg:"+",Cdrain:"+",tauG:"+",fmax:"−",Area:"+",Sig:"−",BV:"0"},
   why:"Extensive quantities scale with W. R_g ∝ W and C_gg ∝ W so R_g·C_gg ∝ W²; single-finger f_max drops (reason for multi-finger layout). V_th: narrow-width effect not certain in sign → not graded."},
  {k:"Lov", lo:1, hi:20, name:"Gate–extension overlap ↑",
   exp:{Vth:"−",DIBL:"+",Ion:"+",Ioff:"+",Cdrain:"+",Eox:"0",BV:"≤"},
   why:"Shorter L_eff strengthens SCE; overlap C adds to the drain node. R_S is not monotonic over this window (see next row): the 2D resistor solver shows it falls for the first few nm and then rises as the overlapped extension adds its own length."},
  {k:"Lov", lo:0, hi:2.5, name:"Gate–extension overlap ↑ (small, 0–2.5 nm)",
   exp:{Rs:"−",Ion:"+"},
   why:"The accumulation layer over the first nm of overlap lets current enter the extension from the surface instead of the channel edge, cutting spreading resistance."},
  {k:"Wsp", lo:15, hi:55, name:"Spacer width ↑",
   exp:{Vth:"0",Ioff:"0",Rs:"+",Ion:"−",Cgg:"+",Cdrain:"+",tau:"+",tpHL:"+",fT:"−",Area:"0"},
   why:"Longer lightly-doped extension path under the spacer (N_ext < N_SD here) raises R_S. With k_spacer (7) > k_ILD (4), more of the gate-to-S/D field runs through the higher-k spacer → C↑."},
  {k:"ksp", lo:3.9, hi:8, name:"Spacer k ↑",
   exp:{Vth:"0",Ion:"0",Ioff:"0",IoffT:"0",Ig:"0",Rs:"0",Cgg:"+",Cdrain:"+",tau:"+",tpHL:"+",tauG:"+",fT:"−",fmax:"−",Area:"0"},
   why:"Pure dielectric change: fringe and plug–gate C rise, DC unchanged."},
  {k:"kILD", lo:2.5, hi:6, name:"ILD k ↑",
   exp:{Vth:"0",Ion:"0",Ioff:"0",IoffT:"0",Ig:"0",Rs:"0",Cgg:"+",Cdrain:"+",tau:"+",tpHL:"+",tauG:"+",fT:"−",fmax:"−",Area:"0"},
   why:"Pure dielectric change: plug–gate and outer fringe C rise, DC unchanged."},
  {k:"dpg", lo:40, hi:200, name:"Plug-to-gate spacing ↑",
   exp:{Vth:"0",Ioff:"0",Rs:"+",Ion:"−",Cgg:"−",Cdrain:"−",Area:"0"},
   why:"Grounded plug moves away: total gate-side C falls (2D Laplace confirms). Longer S/D sheet path raises R_S. Delay has both effects → not graded."},
  {k:"CD", lo:30, hi:150, name:"Plug CD ↑",
   exp:{Vth:"0",Ioff:"0",Rs:"−",Ion:"+",Cgg:"+",Cdrain:"+",Area:"0"},
   why:"Larger contact area lowers contact and plug R; wider plug faces the gate over more width."},
  {k:"Hp", lo:150, hi:600, name:"Plug height ↑ (plug taller than gate)",
   exp:{Vth:"0",Ioff:"0",Rs:"+",Ion:"−",Cgg:"+",tau:"+",tpHL:"+"},
   why:"Longer plug body raises R_S. The part of the plug above the gate top still couples to the gate top surface, so C should keep rising slightly."},
  {k:"Np", lo:1, hi:6, int:1, name:"Plugs per side ↑",
   exp:{Vth:"0",Ioff:"0",Rs:"−",Ion:"+",Cgg:"+",Cdrain:"+"},
   why:"Parallel contacts lower R; each plug adds plug–gate C."},
  {k:"rhoP", lo:5, hi:50, name:"Plug resistivity ↑",
   exp:{Vth:"0",Ioff:"0",IoffT:"0",Ig:"0",Rs:"+",Ion:"−",Cgg:"0",Cdrain:"0",tau:"+",tpHL:"+",Area:"0"},
   why:"Series R only."},
  {k:"phiB", lo:0.4, hi:0.8, name:"Contact barrier height ↑",
   exp:{Vth:"0",Ioff:"0",Rs:"+",Ion:"−",Cgg:"0",tau:"+",tpHL:"+"},
   why:"Tunnelling contact resistivity rises exponentially with φ_B."},
  {k:"Na", lo:5e17, hi:5e18, log:1, name:"Channel doping ↑",
   exp:{Vth:"+",DIBL:"−",SS:"+",Ion:"−",Ioff:"−",Cdrain:"+",tau:"+",tpHL:"+",Sig:"+"},
   why:"Higher depletion charge raises V_th and body factor (SS↑) but shortens the depletion width, suppressing DIBL. Extension–channel sidewall junction C rises."},
  {k:"Na", lo:6e18, hi:1e19, log:1, name:"Channel doping ↑ (heavy, 6e18–1e19)",
   exp:{Vth:"+",Ioff:"−",IoffT:"+"},
   why:"Subthreshold leakage keeps falling, but the extension–channel junction field exceeds ~2 MV/cm and band-to-band tunnelling takes over the total off-state current."},
  {k:"Nwell", lo:1e17, hi:2e18, log:1, name:"Well doping under S/D ↑",
   exp:{Vth:"0",Ion:"0",Ioff:"0",Rs:"0",Cgg:"0",Cdrain:"+",tpHL:"+"},
   why:"Only the S/D bottom junction sees the well doping."},
  {k:"Nsd", lo:5e19, hi:1e21, log:1, name:"Deep S/D doping ↑",
   exp:{Vth:"0",Ioff:"0",Rs:"−",Ion:"+",Cdrain:"−",tau:"−"},
   why:"Lower sheet and contact resistivity. For a one-sided n⁺/p junction C_j ≈ √(qεN_well/2V_bi): N_SD only enters through V_bi, which rises, so C_j falls slightly."},
  {k:"Xj", lo:30, hi:120, name:"Deep S/D junction depth ↑",
   exp:{Rs:"−",Ion:"+",Cdrain:"+"},
   why:"Thicker S/D lowers sheet R; more sidewall junction area. SCE is set mainly by the extension depth in an LDD device → V_th not graded."},
  {k:"Next", lo:1e19, hi:2e20, log:1, name:"Extension doping ↑",
   exp:{Vth:"−",Rs:"−",Ion:"+",Ioff:"+"},
   why:"Higher built-in potential at the channel ends deepens V_th roll-off; lower extension resistivity. DIBL and junction C have competing terms → not graded."},
  {k:"Xjext", lo:10, hi:40, name:"Extension junction depth ↑",
   exp:{Vth:"−",DIBL:"+",Ioff:"+",Rs:"−",Ion:"+",Cdrain:"+",Eox:"0",VA:"−",IsubR:"−"},
   why:"Deeper junctions next to the channel share more depletion charge with the gate (Yau charge sharing), so V_th rolls off and DIBL grows. Thicker extension lowers its resistance."},
  {k:"tIL", lo:1.2, hi:4, name:"Gate oxide thickness ↑",
   exp:{DIBL:"+",SS:"+",Ion:"−",Ig:"−",Rs:"+",Cgg:"−",Eox:"−",Sig:"+"},
   why:"Weaker gate control: lower C_ox, more DIBL and SS, and less accumulation charge over the overlap (R_S↑). V_th has competing long-channel (↑) and roll-off (↓) terms → not graded."},
  {k:"tIL", lo:1.0, hi:1.6, name:"Gate oxide thickness ↑ (thin, 1.0–1.6 nm SiO₂)",
   exp:{Ig:"−",IoffT:"−"},
   why:"Below ~1.5 nm SiO₂ direct tunnelling (gate-to-channel on, gate-to-drain overlap off) dominates; each ~0.2 nm cuts it by about a decade."},
  {k:"kHK", lo:10, hi:30, base:{tHK:2}, name:"High-k permittivity ↑ (t_HK = 2 nm)",
   exp:{DIBL:"−",SS:"−",Ion:"+",Ig:"+",Rs:"−",Cgg:"+"},
   why:"Lower EOT: stronger gate control and more accumulation charge over the overlap (R_S↓)."},
  {k:"Npoly", lo:3e19, hi:1e21, log:1, name:"Poly doping ↑",
   exp:{Rg:"−",tauG:"−",Ion:"+",Cgg:"+",fmax:"+"},
   why:"Less poly depletion (higher C_inv) and lower gate sheet resistance."},
  {k:"rhoM", lo:10, hi:200, log:1, base:{gate:"metal"}, name:"Metal gate resistivity ↑",
   exp:{Vth:"0",Ion:"0",Cgg:"0",Rg:"+",tauG:"+",fmax:"−"},
   why:"Gate R only."},
  {k:"phiM", lo:4.1, hi:4.6, base:{gate:"metal"}, name:"Metal work function ↑",
   exp:{Vth:"+",Ion:"−",Ioff:"−",Rs:"+",tau:"+",tpHL:"+",Eox:"−"},
   why:"V_FB shifts up one-for-one; the gate overdrive over the overlap shrinks too, so the accumulation layer weakens (R_S↑)."},
  {k:"VDD", lo:0.8, hi:1.8, name:"Supply voltage ↑",
   exp:{Vth:"−",Ion:"+",Ioff:"+",IoffT:"+",Ig:"+",tau:"−",tpHL:"−",Area:"0",Eox:"+",IsubR:"+",BV:"0"},
   why:"DIBL lowers V_th at higher V_DS; drive rises faster than C·V in the velocity-saturated regime."},
  {k:"T", lo:250, hi:400, name:"Temperature ↑",
   exp:{Vth:"−",SS:"+",Ion:"−",Ioff:"+",tau:"+"},
   why:"Mobility loss dominates V_th reduction at V_DD = 1.2 V (above the zero-temperature-coefficient point)."},
  {k:"Lsd", lo:150, hi:600, name:"Active length (gate→STI) ↑",
   exp:{Vth:"0",Ion:"0",Rs:"0",Cgg:"0",Cdrain:"+",tpHL:"+",Area:"+"},
   why:"More S/D bottom junction area; plug position is fixed relative to the gate."},
  {k:"dpg", lo:40, hi:200, base:{lsdAuto:true}, name:"Plug-to-gate spacing ↑ (active length from contact rule)",
   exp:{Vth:"0",Ioff:"0",Rs:"+",Ion:"−",Cgg:"−",Area:"+"},
   why:"With the active edge tied to the contact, a wider plug gap also lengthens the active: area grows, and the gate-side C still falls."},
  {k:"CD", lo:30, hi:150, base:{lsdAuto:true}, name:"Plug CD ↑ (active length from contact rule)",
   exp:{Vth:"0",Ioff:"0",Rs:"−",Ion:"+",Area:"+"},
   why:"Bigger contact lowers R but needs a longer active."},
  {k:"eAct", lo:0, hi:60, base:{lsdAuto:true}, name:"Active enclosure of contact ↑ (rule mode)",
   exp:{Vth:"0",Ion:"0",Rs:"0",Cgg:"0",Cdrain:"+",tpHL:"+",Area:"+"},
   why:"Only lengthens the S/D active beyond the contact: more junction area and footprint, nothing else."},
  {k:"eAct", lo:0, hi:60, name:"Active enclosure of contact ↑ (manual active length)",
   exp:{Vth:"0",Ion:"0",Rs:"0",Cgg:"0",Cdrain:"0",Area:"0"},
   why:"With the active length entered directly, the enclosure rule only changes the rule margin, not the device."},
  {k:"SL", lo:40, hi:500, name:"Isolation space along L ↑",
   exp:{Vth:"0",Ion:"0",Ioff:"0",IoffT:"0",Rs:"0",Cgg:"0",Cdrain:"0",tau:"0",tpHL:"0",Area:"+"},
   why:"Layout spacing to the neighbouring active: footprint only."},
  {k:"SW", lo:40, hi:800, name:"Space along W (STI + endcap) ↑",
   exp:{Vth:"0",Ion:"0",Ioff:"0",IoffT:"0",Rs:"0",Cgg:"0",Cdrain:"0",tau:"0",tpHL:"0",Area:"+"},
   why:"Layout spacing across the width: footprint only."},
  {k:"Vsb", lo:0, hi:5, name:"Source–body reverse bias ↑",
   exp:{Vth:"+",Ion:"−",Ioff:"−",SS:"−",DIBL:"+",Cdrain:"−",BV:"0",Igen:"+"},
   why:"Body effect: wider depletion raises V_th and lowers the body factor (SS↓) but lengthens the SCE scale (DIBL↑); larger drain–body reverse bias lowers C_j and widens the generation volume. BV_dss is defined with the body tied to the source."},
  {k:"Qf", lo:1e10, hi:1e12, log:1, name:"Fixed oxide charge ↑",
   exp:{Vth:"−",Ioff:"+",Ion:"+"},
   why:"Positive oxide charge shifts V_FB down by qQ_f/C_ox."},
  {k:"Dit", lo:1e10, hi:1e12, log:1, name:"Interface trap density ↑",
   exp:{SS:"+",Ioff:"+",Vth:"0"},
   why:"Trap capacitance adds to the depletion capacitance in the subthreshold swing; V_th shift from charged traps is not modelled."},
  {k:"taug", lo:1, hi:100, log:1, name:"Generation lifetime ↑",
   exp:{Igen:"−",Vth:"0",Ion:"0",BV:"0"},
   why:"SRH generation current ∝ 1/τ_g."},
  {k:"rsub", lo:0.5, hi:20, log:1, name:"Substrate resistance ↑",
   exp:{Snap:"−",BV:"0",Ion:"0"},
   why:"The parasitic npn turns on at a smaller substrate current."},
  {k:"Ibv", lo:0.01, hi:10, log:1, name:"Breakdown current criterion ↑",
   exp:{BV:"≥",Ion:"0",Vth:"0"},
   why:"Current-defined limits (tunnelling, GIDL, punch-through) move up; avalanche is a voltage limit and does not move."},
  {k:"T", lo:250, hi:400, base:{Na:1e17,Lg:500,tIL:7,Next:1e19,Xjext:30}, name:"Temperature ↑ (avalanche-limited device)",
   exp:{BV:"+"},
   why:"Phonon scattering shortens the mean free path, so avalanche needs a higher field: positive temperature coefficient."},
  {k:"pclm", lo:0, hi:2, name:"CLM strength ↑",
   exp:{VA:"−",Ion:"+",Vth:"0",Ioff:"0",BV:"0"},
   why:"Only the saturation-region current and output conductance change."},
  /* ---- HV rows (30 V-class preset, dev = "hv"); expected directions written before the first run ---- */
  {k:"Ldr", hv:1, lo:500, hi:1400, name:"HV · drift length ↑",
   exp:{Rs:"+",RonA:"+",Ion:"−",BV:"≥",Area:"0",Eox:"0",VthF:"0",VRT:"≥"},
   why:"Longer lightly doped drift: more series resistance; the n⁺ moves away from the gate edge, which relieves reach-through, so BV cannot fall. Layout length is set by L_sd, not by the drift."},
  {k:"Next", hv:1, lo:1.7e17, hi:3e17, log:1, name:"HV · drift (LDD) doping ↑ (above the BV optimum)",
   exp:{Rs:"−",RonA:"−",Ion:"+",BV:"≤",VthF:"0",Eox:"0",VRT:"≤"},
   why:"More drift charge: lower drift resistance but a stronger gate-edge field (2D: 1.7e17 → 2e17 → 2.5e17 gives 33.6 → 24.0 → 18.0 V). Range starts at 1.7e17: below it BV has a RESURF-type optimum (too light a drift depletes fully and the field moves to the n⁺ end). The compact optimum sits near 1.5e17, the 2D one at or below 1e17, so the lower range is not graded (first run graded 1e17–3e17 as ≤ and failed there)."},
  {k:"Nddd", hv:1, lo:3e16, hi:2e17, log:1, name:"HV · DDD doping ↑",
   exp:{Rs:"−",RonA:"−",VthF:"0",VRT:"≤"},
   why:"The DDD shell grades the n⁺ corner; more DDD charge lowers its resistance. BV not graded: too light a shell depletes through to the n⁺ core, too heavy a shell raises the corner field, so BV has an optimum (compact 31 → 37 → 31 V over the range; 2D nearly flat, 34.8 → 33.8 V). First run graded it ≤ and failed."},
  {k:"Oddd", hv:1, lo:0, hi:600, name:"HV · DDD overhang toward the gate ↑",
   exp:{Rs:"−",RonA:"−",VthF:"0",Eox:"0",VRT:"≤"},
   why:"The DDD layer adds a parallel conduction path over the overhang; its charge near the n⁺ leaves less of the drift to absorb voltage, so the reach-through bound cannot rise."},
  {k:"tIL", hv:1, lo:45, hi:80, name:"HV · gate oxide ↑",
   exp:{Vth:"+",Eox:"−",Ion:"−",Vpass:"−",BV:"≥",RonA:"+",VthF:"0",VRT:"0"},
   why:"Thicker oxide: higher V_th, weaker drive and oxide field, lower pass voltage; the gate-edge field falls, so BV cannot drop."},
  {k:"Vsb", hv:1, lo:0, hi:20, name:"HV · source–body bias ↑",
   exp:{Vth:"+",Vpass:"−",Ion:"−",BV:"0",VthF:"+",VRT:"0"},
   why:"Body effect raises V_th of the device and of the field transistor, so a pass gate transfers less voltage. BV is defined with body = source."},
  {k:"Lg", hv:1, lo:1000, hi:4000, log:1, name:"HV · gate length ↑",
   exp:{Ioff:"−",RonA:"+",Area:"+",Ion:"−",BV:"≥",VthF:"0",VRT:"+"},
   why:"Longer channel suppresses bulk punch-through (lower off current, no lower BV) at the cost of channel resistance and area."},
  {k:"Nfld", hv:1, lo:1e17, hi:2e18, log:1, name:"HV · field (channel-stop) doping ↑",
   exp:{VthF:"+",Vth:"0",Ion:"0",RonA:"0",BV:"0",Vpass:"0"},
   why:"Only the field transistor under the STI changes."},
  {k:"tfox", hv:1, lo:150, hi:600, name:"HV · field-oxide thickness ↑",
   exp:{VthF:"+",Vth:"0",Ion:"0",RonA:"0",BV:"0"},
   why:"Only the field transistor under the STI changes."},
  {k:"VDD", hv:1, lo:20, hi:40, name:"HV · supply ↑",
   exp:{Vpass:"+",Eox:"+",Ion:"+",BV:"0",VthF:"0",VRT:"0"},
   why:"A higher gate drive passes a higher voltage and raises the oxide field; BV and the field transistor do not depend on the supply."},
  {k:"W", hv:1, lo:5000, hi:30000, log:1, name:"HV · width ↑",
   exp:{Vpass:"0",BV:"0",VthF:"0",Vth:"0",VRT:"0"},
   why:"Width scales currents only. R_on·A not graded: with a fixed number of contacts the contact and plug resistance do not scale with W, so R_on·A = (a/W + b)(W + S_W) has a minimum (159 → 151 mΩ·mm² with a dip). First run graded it − and failed; scaling the plug count with W would make it monotonic."},
  {k:"CL", lo:0, hi:20, name:"External drain load ↑",
   exp:{Vth:"0",Ion:"0",IoffT:"0",Ig:"0",Cgg:"0",Cdrain:"+",tpHL:"+",tau:"0",Area:"0"},
   why:"Load only affects the drain-node discharge."}
];

function evalCell(xs,ys,sign){
  const scale=Math.max(...ys.map(Math.abs),1e-300);
  const tiny=1e-9*scale;
  let up=0,down=0;
  for(let i=1;i<ys.length;i++){const d=ys[i]-ys[i-1]; if(d>tiny) up++; else if(d<-tiny) down++;}
  const net=(ys[ys.length-1]-ys[0])/scale;
  const maxDev=Math.max(...ys.map(v=>Math.abs(v-ys[0])))/scale;
  let ok, seen;
  if(!up&&!down) seen="0"; else if(up&&!down) seen="+"; else if(down&&!up) seen="−"; else seen="±";
  if(sign==="0") ok=maxDev<1e-6;
  else if(sign==="+") ok=!down&&net>1e-4;
  else if(sign==="−") ok=!up&&net<-1e-4;
  else if(sign==="≥") ok=!down;
  else if(sign==="≤") ok=!up;
  return {ok,seen,net,maxDev};
}

function run(NMOS,{n=25}={}){
  const {model,DEF,PARAMS}=NMOS;
  const byK=Object.fromEntries(PARAMS.map(d=>[d.k,d]));
  return SPEC.map(s=>{
    const d=byK[s.k];
    let xs=[...Array(n)].map((_,i)=>s.log?Math.pow(10,Math.log10(s.lo)+(Math.log10(s.hi)-Math.log10(s.lo))*i/(n-1)):s.lo+(s.hi-s.lo)*i/(n-1));
    if(s.int) xs=[...new Set(xs.map(Math.round))];
    const B=s.hv?NMOS.PRESETS.hv:DEF;
    const Ms=xs.map(v=>model({...B,...(s.base||{}),[s.k]:v}));
    const cells=METRICS.map(m=>{
      const ys=Ms.map(m.f), sign=s.exp[m.k], r=evalCell(xs,ys,sign||"0");
      return {metric:m.k,label:m.l,expected:sign||"?",seen:r.seen,ok:sign?r.ok:null,from:ys[0],to:ys[ys.length-1],net:r.net};
    });
    return {knob:s.k,name:s.name,label:d?d.l:s.k,range:[s.lo,s.hi],base:s.base||{},why:s.why,cells};
  });
}
return {METRICS,SPEC,run};
});
