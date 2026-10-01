/* Guide content and help placement for the planar NMOS tutorial (read by ../_kit/shell.js) */
window.TUTORIAL={
id:"planar-nmos",
title:"Planar NMOS bench",
tests:"tests.html",
hint:"This is a compact model of one planar NMOS. Change any input on the left and every result updates. Press <b>?</b> or a small ? next to a panel title for what it shows and how it is computed.",
help:[
  [".grp-h h2",/Gate stack/i,"g-stack"],[".grp-h h2",/Geometry/i,"g-geo"],[".grp-h h2",/Doping/i,"g-dop"],
  [".grp-h h2",/Contact plug/i,"g-plug"],[".grp-h h2",/Layout/i,"g-layout"],[".grp-h h2",/Operating/i,"g-op"],
  [".panel h3",/^DC characteristics/i,"dc"],[".panel h3",/^Parasitics/i,"para"],[".panel h3",/^Speed/i,"speed"],
  [".panel h3",/^Breakdown/i,"bv"],[".panel h3",/^Cross-section/i,"xs"],[".panel h3",/^Layout \(top/i,"layout"],[".panel h3",/^Capacitance breakdown/i,"cap"],
  [".panel h3",/^Series resistance/i,"res"],[".panel h3",/–VGS|–V\s*GS/i,"iv"],[".panel h3",/–VDS|–V\s*DS/i,"iv"],
  [".panel h3",/^Parameter sweep/i,"sweep"],[".panel h3",/^Design optimizer/i,"opt"]
],
guide:`
<section id="start" data-short="Start">
  <h3>Getting started</h3>
  <p>This page is a compact model of a single planar NMOS: closed-form device equations, the kind circuit simulators use, rather than a field solver. One evaluation takes well under a millisecond, so every result follows your inputs as you type or drag.</p>
  <ul>
    <li>Inputs are on the left, grouped by what they describe. Click a group title to fold it away; its key derived value stays visible.</li>
    <li>Key results sit at the top. <b>Show all metrics</b> expands each panel to the full list.</li>
    <li>The cross-section and the top-view layout below them are drawn to scale from the inputs.</li>
    <li>Detailed analyses are in the tabs further down: I–V curves, C and R breakdown, breakdown, parameter sweep, the optimizer and the model notes.</li>
    <li>The switch at the top changes between a low-voltage, 90 nm-class device (<b>LV NMOS</b>) and a 30 V-class high-voltage device (<b>HV NMOS</b>).</li>
    <li><b>Reset to example device</b> returns to the defaults.</li>
  </ul>
  <div class="try">Try this first: drag <b>Gate length</b> down from 90 nm. V<sub>th</sub> falls and I<sub>off</sub> climbs (short-channel effects) while CV/I gets faster. Then raise <b>Gate height</b>: C<sub>gg</sub> grows through the sidewall fringe, but the gate resistance falls.</div>
  <div class="caveat">Built on textbook physics and example values, not calibrated to any real process. Use it to see which knob moves which output and why, not for sign-off numbers. Known gaps are listed under <a href="#guide:limits">Limits</a>.</div>
</section>

<section id="inputs" data-short="Inputs">
  <h3>Inputs</h3>
  <h4 id="g-stack">Gate stack</h4>
  <p>Interfacial oxide and optional high-k layer (thickness and k), n⁺ poly or metal gate, gate height, fixed oxide charge Q<sub>f</sub> and interface traps D<sub>it</sub>. The stack is reduced to an equivalent oxide thickness:</p>
  <div class="eq">EOT = t<sub>IL</sub>·3.9/k<sub>IL</sub> + t<sub>HK</sub>·3.9/k<sub>HK</sub></div>
  <h4 id="g-geo">Geometry</h4>
  <p>Gate length, width, gate–extension overlap (L<sub>eff</sub> = L<sub>g</sub> − 2·overlap), spacer width and k, and the active length from gate edge to isolation. HV adds the drift length: the distance from the gate edge to the n⁺.</p>
  <h4 id="g-dop">Doping</h4>
  <p>Channel and well doping, the shallow extension (LDD) and the deep source/drain with their junction depths, and the SRH generation lifetime. HV adds the deep, light DDD layer under the n⁺.</p>
  <h4 id="g-plug">Contact plug and ILD</h4>
  <p>Plug size, distance to the gate, height, count per side, resistivity, contact barrier height and the dielectric between plug and gate. These set the contact and plug resistance and the plug-to-gate capacitance.</p>
  <h4 id="g-layout">Layout and area</h4>
  <p>Spacing to the neighbouring devices and the contact's enclosure in the active. The footprint is the device pitch, (L<sub>g</sub> + 2·L<sub>sd</sub> + S<sub>L</sub>)·(W + S<sub>W</sub>). With the active length set from the contact rule, shrinking the plug gap or plug size also shrinks the active, the drain junction and the area.</p>
  <h4 id="g-op">Operating point</h4>
  <p>Supply V<sub>DD</sub>, temperature, source–body reverse bias V<sub>SB</sub>, external load on the drain, the breakdown criterion current, and the strength of channel-length modulation (see <a href="#guide:iv">I–V</a>).</p>
</section>

<section id="dc" data-short="DC">
  <h3>DC characteristics</h3>
  <p><b>Threshold.</b> Long-channel V<sub>th</sub> = V<sub>FB</sub> + 2φ<sub>F</sub> + √(2qε<sub>Si</sub>N<sub>A</sub>(2φ<sub>F</sub> + V<sub>SB</sub>))/C<sub>ox</sub>, with V<sub>FB</sub> shifted by −qQ<sub>f</sub>/C<sub>ox</sub>. It matches an exact 1D Poisson solution to better than 0.01 mV, with and without body bias.</p>
  <p><b>Short channels.</b> As L shrinks, source and drain take over part of the depletion charge under the gate (V<sub>th</sub> roll-off), and the drain lowers the source barrier (DIBL). The model uses the BSIM3 form</p>
  <div class="eq">ΔV<sub>th</sub> = −DVT0·θ(L)·(V<sub>bi</sub> − 2φ<sub>F</sub>) − ETA0·θ<sub>DIBL</sub>(L)·V<sub>DS</sub></div>
  <p>whose five constants were fitted to a 2D Poisson solver written for this project and checked on five devices left out of the fit. The subthreshold swing includes the Taur–Ning short-channel degradation and D<sub>it</sub>.</p>
  <p><b>Currents.</b> I<sub>on</sub> at V<sub>GS</sub> = V<sub>DS</sub> = V<sub>DD</sub> including series resistance; I<sub>off</sub> at V<sub>GS</sub> = 0, split into subthreshold, gate tunnelling, GIDL, junction tunnelling and SRH generation, with the dominant one named. HV adds R<sub>on</sub>·A, pass voltage and field-transistor V<sub>th</sub> (see <a href="#guide:hv">HV device</a>).</p>
</section>

<section id="para" data-short="Parasitics">
  <h3>Parasitics</h3>
  <p>Whole-device capacitances and resistances: gate capacitance in the on and off states, the extrinsic gate–drain part (overlap, fringe, plug), the drain junction averaged over the 0 → V<sub>DD</sub> swing, series resistance per side, gate resistance, contact resistivity and footprint. The breakdown of C and R into parts is in the panels further down (<a href="#guide:cap">C and R</a>).</p>
</section>

<section id="speed" data-short="Speed">
  <h3>Speed</h3>
  <table>
    <tr><th>Metric</th><th>Definition</th></tr>
    <tr><td>CV/I</td><td>C<sub>gg</sub>·V<sub>DD</sub>/I<sub>on</sub>, the intrinsic delay</td></tr>
    <tr><td>t<sub>pHL</sub></td><td>C<sub>drain</sub>·V<sub>DD</sub>/(2I<sub>eff</sub>), discharging the drain node; I<sub>eff</sub> averages I(V<sub>DD</sub>, V<sub>DD</sub>/2) and I(V<sub>DD</sub>/2, V<sub>DD</sub>)</td></tr>
    <tr><td>R<sub>g</sub>C<sub>gg</sub></td><td>distributed gate RC, R<sub>g</sub> = R<sub>sh</sub>·W/(3L<sub>g</sub>)</td></tr>
    <tr><td>f<sub>T</sub></td><td>g<sub>m</sub>/(2πC<sub>gg</sub>)</td></tr>
    <tr><td>f<sub>max</sub></td><td>f<sub>T</sub>/2√(g<sub>ds</sub>(R<sub>g</sub>+R<sub>S</sub>) + 2πf<sub>T</sub>R<sub>g</sub>C<sub>gd</sub>)</td></tr>
  </table>
  <p>Delays are in seconds: a larger number is a slower device. The oxide field is reported in SiO<sub>2</sub>-equivalent MV/cm and flagged above 7 MV/cm.</p>
</section>

<section id="bv" data-short="Breakdown">
  <h3>Breakdown and hot carriers</h3>
  <p>Each breakdown mechanism is computed on its own, with gate, source and body grounded; the lowest sets BV<sub>dss</sub>. The bars show all of them so you can see what limits the device.</p>
  <ul>
    <li><b>Junction avalanche</b>: ionisation integral ∫α dx = 1 (Van Overstraeten–de Man coefficients, with temperature) over the field of a cylindrical junction edge. Within 1% of a full 1D Poisson field with the same coefficients.</li>
    <li><b>Gated-diode avalanche</b>: the same, with the gate-induced field added at the drain edge.</li>
    <li><b>Zener and GIDL</b>: tunnelling current reaches the criterion current (an input, 1 µA/µm by default).</li>
    <li><b>Punch-through</b>: the V<sub>GS</sub> = 0 channel current reaches the criterion.</li>
  </ul>
  <p>Hot carriers: substrate current from Hu's model; on-state snapback when that current through the substrate resistance forward-biases the source by 0.7 V. The local-field model overestimates I<sub>sub</sub> below about 1.5 V. V<sub>th</sub> mismatch follows Pelgrom, σ = A<sub>VT</sub>/√(W·L<sub>eff</sub>).</p>
</section>

<section id="xs" data-short="Device views">
  <h3>Cross-section and layout</h3>
  <h4>Cross-section A–A′</h4>
  <p>Drawn to scale in nm along the channel, except the gate dielectric, which is exaggerated so it stays visible. Colours: poly gate, oxide and isolation, spacer, plugs, the n⁺ source/drain, the extension, and (HV) the drift and DDD layers. Use it to check that the geometry you typed is the device you meant: a plug inside the spacer or an extension deeper than the S/D shows up immediately.</p>
  <h4 id="layout">Layout (top view)</h4>
  <p>The same device seen from above, to scale: the active area (n⁺ source and drain, with the lightly doped part next to the gate), the poly gate with its spacers, the contact plugs spread evenly along the width, and the isolation around it. The dashed box is one device pitch, (L<sub>g</sub> + 2·L<sub>sd</sub> + S<sub>L</sub>)·(W + S<sub>W</sub>), which is the area used everywhere else on the page.</p>
  <p>The blue line A–A′ marks where the cross-section is cut: through the first row of contacts.</p>
  <div class="try">Switch the active length to <b>From contact rule</b> under Layout and area, then shrink the plug gap: the active, the drain junction and the pitch all shrink together.</div>
</section>

<section id="cap" data-short="C and R">
  <h3>Capacitance and resistance</h3>
  <h4>Capacitance</h4>
  <ul>
    <li>Channel and overlap from the inversion and oxide capacitance.</li>
    <li>Outer fringe from the gate sidewall through spacer then ILD, cut off by a grounded plug only over the width the plugs cover.</li>
    <li>Plug-to-gate: plate plus edge fringes, spacer and ILD in series.</li>
    <li>Junctions: one-sided abrupt, averaged over the drain swing.</li>
  </ul>
  <p>Fringe plus plug-to-gate agrees with a 2D Laplace solver within about 16% over eleven geometries.</p>
  <h4 id="res">Series resistance</h4>
  <ul>
    <li>Front end: the gate-induced accumulation layer and the extension form two coupled sheets over the overlap, in parallel with the spreading resistance at the gate edge. The coupling was calibrated against a 2D resistor solver.</li>
    <li>Extension and deep S/D sheets, contact resistance from thermionic-field emission, and the plug body.</li>
  </ul>
  <div class="try">Sweep the overlap from 0 to 20 nm against R<sub>S</sub>: it first falls (less spreading), then rises (the overlap itself has resistance). The 2D solver shows the same minimum.</div>
</section>

<section id="iv" data-short="I–V">
  <h3>I–V curves</h3>
  <p>One expression runs from subthreshold to strong inversion (BSIM's effective overdrive), with universal mobility and velocity saturation:</p>
  <div class="eq">I = (W/L)·µ<sub>eff</sub>·C<sub>inv</sub>·V<sub>gsteff</sub>·[1 − m·V<sub>dseff</sub>/2(V<sub>gsteff</sub>+2v<sub>t</sub>)]·V<sub>dseff</sub>/(1 + V<sub>dseff</sub>/E<sub>sat</sub>L)</div>
  <p>Series resistance is solved self-consistently: the terminal current is the one the intrinsic device carries at V<sub>GS</sub> − IR<sub>S</sub> and V<sub>DS</sub> − 2IR<sub>S</sub>. Beyond saturation, a velocity-saturated region of length ΔL forms at the drain and the current is multiplied by (1 + ΔL/L).</p>
  <div class="caveat">The <b>CLM strength</b> input scales that ΔL. Its default of 1 is the textbook form and has not been fitted; at 1 the example device's I<sub>on</sub> is about 27% higher than with CLM off. Set it to 0 to compare without it.</div>
</section>

<section id="sweep" data-short="Sweep">
  <h3>Parameter sweep</h3>
  <p>Pick any input and any output to plot the full curve over the input's range, with every other input held at its current value. The dashed line marks where you are now. This is the quickest way to see a trade-off or an optimum, such as the overlap minimum in R<sub>S</sub>.</p>
</section>

<section id="opt" data-short="Optimizer">
  <h3>Design optimizer</h3>
  <p>NSGA-II, a genetic algorithm that evolves a population of designs toward the Pareto front: designs where neither goal can improve without the other getting worse.</p>
  <ol>
    <li>Switch on the inputs it may change and set their ranges. Everything else stays at your current values.</li>
    <li>Choose one or two goals and add limits (for example V<sub>th</sub> ≥ 0.25 V, oxide field ≤ 6 MV/cm).</li>
    <li>Optionally require robustness to gate-length variation: each design is judged at its worst ±ΔL corner.</li>
    <li>Run, then click a point on the front to compare it with the current design, apply it, or re-check it with the 2D solvers.</li>
  </ol>
  <p>A limit that none of the chosen inputs can move is reported before the run. Designs outside the range where the fitted parts of the model were checked are flagged.</p>
</section>

<section id="hv" data-short="HV device">
  <h3>The 30 V-class HV device</h3>
  <p>High-voltage transistors, such as those that pass program and erase voltages in non-volatile memory, use a thick oxide (65 nm here), a long channel and a drain built to spread the field.</p>
  <ul>
    <li><b>Drain</b>: a shallow light drift (LDD) from under the gate, an n⁺ a drift length away, and a deep light DDD around the n⁺ reaching toward the gate.</li>
    <li><b>Drift resistance</b>: parallel sheets thinned by the drift–body depletion at the local bias (JFET), capped at the Kirk current q·N·v<sub>sat</sub>·t with space-charge-limited conduction beyond it. Within 4% of a 2D resistor at low current.</li>
    <li><b>Breakdown</b> at the gate edge and drift surface (a quasi-2D surface model with the gate field and the body's depletion, the RESURF effect), the LDD corner and the n⁺/DDD bottom corner. Against 103 2D Poisson runs: 7–17% rms by data set.</li>
    <li><b>Pass voltage</b>: with the gate at V<sub>DD</sub> the output rises only until V<sub>G</sub> − V<sub>out</sub> = V<sub>th</sub>(V<sub>SB</sub> + V<sub>out</sub>).</li>
    <li><b>Field transistor</b>: poly over the isolation oxide can invert the surface between neighbouring n⁺ regions; flagged when its V<sub>th</sub> nears V<sub>DD</sub>.</li>
    <li><b>Punch-through</b> is shown as a conservative 1D bound, not inside BV<sub>dss</sub>; the HV model has no short-channel current.</li>
  </ul>
</section>

<section id="checks" data-short="How it's checked">
  <h3>How it was checked</h3>
  <p>Every part is compared with something that does not reuse the model's own equations, with the expected result and tolerance written down before running.</p>
  <table>
    <tr><th>Reference</th><th>Checks</th></tr>
    <tr><td>Exact 1D MOS charge</td><td>threshold, body effect, inversion charge</td></tr>
    <tr><td>1D pn Poisson</td><td>junction capacitance, avalanche field</td></tr>
    <tr><td>2D Laplace</td><td>fringe and plug-to-gate capacitance</td></tr>
    <tr><td>2D resistor</td><td>overlap, spreading and drift resistance</td></tr>
    <tr><td>2D nonlinear Poisson</td><td>short-channel effects, punch-through, avalanche along field lines</td></tr>
  </table>
  <p>A trend matrix adds the expected direction of every output for every input, written from physics first: 56 rows, 386 graded cells. Of 302 tests, 293 pass, 5 report a value only, and 4 fail on known model limits. <a href="tests.html">Run them yourself</a>.</p>
</section>

<section id="limits" data-short="Limits">
  <h3>Limits</h3>
  <ul>
    <li>Strong-inversion charge is 25–45% high against the exact 1D solution, so I<sub>on</sub> is likely high by a similar amount.</li>
    <li>The CLM strength is not fitted. Poisson's equation fixes charge, not carrier transport, so saturation current and output conductance need drift-diffusion or measured curves to calibrate.</li>
    <li>No calibration to a real process: mobility, strain, halo profiles and quantum effects are textbook or absent.</li>
    <li>HV: no short-channel current and no impact ionisation in the drift region.</li>
    <li>10<sup>20</sup> cm<sup>−3</sup> silicon resistivity is 22% low against Masetti; avalanche BV is 36% above Sze's fit at 10<sup>17</sup> cm<sup>−3</sup>.</li>
  </ul>
</section>
`};
