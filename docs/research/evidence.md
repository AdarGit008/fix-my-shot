# Evidence base — cross-verified research

Two research batches (2026-07-20), each fanned across lenses and **independently re-verified** (every source re-fetched; the verbatim quote confirmed to appear and to support the claim). Verdicts: **CONFIRMED** (quote found + supports), **PARTIAL** (substance ok, quote/number off — see correction), **REFUTED** (do not rely on).

> Scope note: much of this evidence concerns ball trajectory / make-quality, which the [spec](../SPEC.md) later scoped **out** (we grade *form*, not outcome). It is retained because it (a) established the engine choice and (b) established the biomechanical parameters and the motor-learning reality that the form baseline and positioning still rest on.

## Engine architecture

- **CONFIRMED — MuJoCo pairs articulated (joint-coordinate) dynamics with an optimization-based contact solver.** "MuJoCo pioneered the combination of simulation in generalized coordinates with optimization-based contact dynamics." — MuJoCo docs, https://mujoco.readthedocs.io/en/stable/overview.html
- **CONFIRMED — MuJoCo is deterministic** (reproducible re-grading). "MuJoCo simulations are deterministic … The pipeline output of two mjData instances with the same integration state will be identical." — https://mujoco.readthedocs.io/en/stable/programming/simulation.html
- **CONFIRMED — official WebAssembly build runs MuJoCo in-browser.** "Simulate and Render MuJoCo Models in the Browser!" / "Load and Run MuJoCo 3.3.8 Models using JavaScript and the official MuJoCo WebAssembly Bindings" — https://github.com/zalo/mujoco_wasm/
- **CONFIRMED — unified actuator model keeps muscle fidelity as an optional later dial.** "These components can be instantiated so as to model motors … biological muscles and many other actuators in a unified way." — https://mujoco.readthedocs.io/en/stable/overview.html
- **CONFIRMED — MJX is differentiable but ~10× slower per single scene → offline only.** "Simulating a single scene, MJX-JAX can be 10x slower than MuJoCo … works best when simulating thousands or tens of thousands of scenes in parallel." — https://mujoco.readthedocs.io/en/stable/mjx.html
- **PARTIAL — OpenSim→MuJoCo conversion "up to 600 times faster"** (the "60×–4000×" range and the tendon-mechanism rationale were NOT in the source). — arXiv:2006.10618, https://arxiv.org/abs/2006.10618
- **REFUTED — "MuJoCo beats PhysX/Unity/PyBullet on accuracy."** Quote fabricated; SimBenchmark tests only RaiSim/Bullet/ODE/MuJoCo/DART. Real finding: MuJoCo/DART strong on multibody; Bullet models frictional slip best; MuJoCo has consistent slip. — https://leggedrobotics.github.io/SimBenchmark/

## Pose editing & contact (feasibility)

- **CONFIRMED — pose editing is an IK/constraint-solving problem** that can respect joint limits & contacts via a differentiable optimizer. — arXiv:2507.00792v2, https://arxiv.org/html/2507.00792v2
- **CONFIRMED — unconstrained IK produces biomechanically invalid poses** (error accumulates through the kinematic tree; SMPL permits impossible joint configs). — MANIKIN, https://siplab.org/projects/MANIKIN
- **CONFIRMED — contact artifacts (fluctuate/float/penetrate) concentrate at the hand–object interface.** "Contact artifacts are common, causing expected contacts to fluctuate instead of maintaining consistent zero distance…" — arXiv:2502.20390v1
- **CONFIRMED — realistic + real-time + interactive humanoid motion with contact is an unsolved problem.** "…real-time prediction of diverse and safety-guaranteed humanoid reactions … remains a critical, unsolved challenge." — arXiv:2508.02106v1
  - *Design consequence:* we route around live contact-rich dynamics (quasi-static pose grading, no ball flight).

## Biomechanics / scoring parameters

- **CONFIRMED — no single optimal shot; consistency > conformance.** "Shooting a basketball is more complex than simply identifying one optimal release since it's a redundant task resulting in an infinite set of successful release conditions." — PMC8256521, https://pmc.ncbi.nlm.nih.gov/articles/PMC8256521/
- **PARTIAL — release ANGLE does not distinguish makes from misses; release height/velocity weakly do** (the "580-shot" figure was invented; real n≈710 ball-kinematic trials; science holds). — PMC12641682, https://pmc.ncbi.nlm.nih.gov/articles/PMC12641682/
- **PARTIAL — proficient-vs-novice joint angles mostly NOT significant** (knee p=0.183; elbow essentially identical 159.6 vs 159.8; only normalized release height significant, p=0.010). Do not hard-code these as ideals. — Frontiers, https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1208915/full
- **CONFIRMED — BEEF (Balance, Eyes, Elbow, Follow-through) is the canonical coaching checklist**, self-admittedly a beginner framework. Useful as report scaffold, not the scorer. — https://www.basketballforcoaches.com/beef-basketball/
- **CONFIRMED — optimal release angle shifts with height/release-height** (~1–2° per height band) → anthropometric normalization is real (for height/release-height). — https://coachdavelove.com/launch-angle-and-velocity-in-basketball-shooting/
- **CONFIRMED — competitors already extract biomechanics from phone video of the user's real shot.** "…pose estimation in order to measure the elbow angle of a basketball player when releasing a free throw." — https://aggiesportsanalytics.com/projects/shot-form-corrector
- *(Out of scope per reframe, retained for record):* Noah 45/11/0 entry-geometry target and the 33° launch floor were CONFIRMED; backspin ~2–3 rev/s optimum CONFIRMED — but these are ball-outcome/rim-collision facts, not form-grading inputs.

## Fix hierarchy (leverage)

- Local gradients/sensitivities are valid only near the current point, ignore parameter interactions, degrade at contact/constraint events, and are fragile (small input changes can flip the top-ranked feature).
  - *Design consequence:* ship a **hybrid** (engine leverage, stability-gated, grouped, expert-labeled) — never raw gradients, never a fixed expert ranking.

## Transfer / knowing → doing

- **CONFIRMED (pro) — feedback aids retention & transfer, not acquisition.** "Although SC feedback did not bring a significant advantage in the acquisition phase, it facilitated motor skill learning in both the retention and transfer phases." — PMC12467369, https://pmc.ncbi.nlm.nih.gov/articles/PMC12467369/
- **Pro case (moderate):** quiet-eye / gaze training and observational video modeling have improved real basketball shooting; knowledge-of-performance (form feedback) beats outcome-only feedback; durable learning depends on building the user's own error-detection eye.
- **Skeptic case (real):** motor acuity is built by physical repetition and is dissociable from declarative knowledge (Stanley & Krakauer); far transfer from generic off-court perceptual training is empirically unsupported (2024 Sports Medicine review); reinvestment / internal-focus (Wulf, Masters) shows conscious rule-based mechanical focus can degrade skilled execution **under pressure**.
  - *Design consequence:* CONDITIONAL-GO. Scaffold framing, external-focus cues, and a validating RCT. "Passive improvement just by being aware" is **not** supported as a standalone claim; awareness is, however, a necessary learning phase — the caveat is specifically about conscious mechanical focus during live, under-pressure execution.

## What verification caught (do not resurrect)

- Fabricated: SimBenchmark cross-engine accuracy quote; the "580-shot" sample size; a HomeCourt metrics quote.
- Misattributed: ball drag law / Cd≈0.5 / mass 0.62 kg attributed to Silverberg (correct physics, wrong source).
- Overstated: proficient-vs-novice joint angles presented as significant when they were not.
