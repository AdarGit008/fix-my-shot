# Evidence base — cross-verified research

Research batches (2026-07-20/21), each fanned across lenses and **independently re-verified** (every source re-fetched; the verbatim quote confirmed to appear and to support the claim). Verdicts: **CONFIRMED** (quote found + supports), **PARTIAL** (substance ok, quote/number off — see correction), **REFUTED** (do not rely on).

> Re-verification pass (2026-07-21): all 17 load-bearing claims below were re-fetched a second time. Fourteen held as CONFIRMED; three were **downgraded to PARTIAL** and are corrected in place (contact-artifact localization, "competitors" framing, self-controlled-feedback scope). Research batch 4 additionally closed the principle-baseline numeric gaps (issue #3) — see [principles-baseline.md](../principles-baseline.md) *Resolved gaps*; the batch-4 corrections to the baseline's own numbers are folded into that document.

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
- **PARTIAL — contact artifacts are common in HOI motion-capture data, with hand capture a frequently cited cause** (the earlier "concentrate at the hand–object interface" localization overstated the source). "Contact artifacts are common, causing expected contacts to fluctuate instead of maintaining consistent zero distance… often due to MoCap limitations or missing hand capture." The source (InterMimic) names hands as a *cause* and a separate challenge area but makes no concentration claim. — arXiv:2502.20390v1
  - *Design consequence unchanged:* the hand–ball interface is still the hardest contact to get right, which is why we route around live contact-rich dynamics.
- **CONFIRMED — realistic + real-time + interactive humanoid motion with contact is an unsolved problem.** "…real-time prediction of diverse and safety-guaranteed humanoid reactions … remains a critical, unsolved challenge." — arXiv:2508.02106v1
  - *Design consequence:* we route around live contact-rich dynamics (quasi-static pose grading, no ball flight).

## Biomechanics / scoring parameters

- **CONFIRMED — no single optimal shot; consistency > conformance.** "Shooting a basketball is more complex than simply identifying one optimal release since it's a redundant task resulting in an infinite set of successful release conditions." — PMC8256521, https://pmc.ncbi.nlm.nih.gov/articles/PMC8256521/
- **PARTIAL — release ANGLE does not distinguish makes from misses; release height/velocity weakly do** (the "580-shot" figure was invented; real n≈710 ball-kinematic trials; science holds). — PMC12641682, https://pmc.ncbi.nlm.nih.gov/articles/PMC12641682/
- **PARTIAL — proficient-vs-novice joint angles mostly NOT significant** (knee p=0.183; elbow essentially identical 159.6 vs 159.8; only normalized release height significant, p=0.010). Do not hard-code these as ideals. — Frontiers, https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1208915/full
- **CONFIRMED — BEEF (Balance, Eyes, Elbow, Follow-through) is the canonical coaching checklist**, self-admittedly a beginner framework. Useful as report scaffold, not the scorer. — https://www.basketballforcoaches.com/beef-basketball/
- **CONFIRMED — optimal release angle shifts with height/release-height** (~1–2° per height band) → anthropometric normalization is real (for height/release-height). — https://coachdavelove.com/launch-angle-and-velocity-in-basketball-shooting/
- **PARTIAL — biomechanics from phone video of a real shot is already demonstrated** (the cited example is a **student club project**, not a commercial competitor — the "competitors" framing overgeneralizes). "…pose estimation in order to measure the elbow angle of a basketball player when releasing a free throw." — https://aggiesportsanalytics.com/projects/shot-form-corrector. *Commercial* CV incumbents exist (HomeCourt, NEX, Noah) but this source does not establish them; the substance (CV-from-video shot analysis is an occupied space) holds.
- *(Out of scope per reframe, retained for record):* Noah 45/11/0 entry-geometry target and the 33° launch floor were CONFIRMED; backspin ~2–3 rev/s optimum CONFIRMED — but these are ball-outcome/rim-collision facts, not form-grading inputs.

## Fix hierarchy (leverage)

- Local gradients/sensitivities are valid only near the current point, ignore parameter interactions, degrade at contact/constraint events, and are fragile (small input changes can flip the top-ranked feature).
  - *Design consequence:* ship a **hybrid** (engine leverage, stability-gated, grouped, expert-labeled) — never raw gradients, never a fixed expert ranking.

## Transfer / knowing → doing

- **PARTIAL (pro) — *self-controlled* feedback (learner chooses when to receive it) aids retention & transfer, not acquisition** (the finding is about *who schedules* feedback, not feedback-vs-none in general). "Although SC feedback did not bring a significant advantage in the acquisition phase, it facilitated motor skill learning in both the retention and transfer phases." — PMC12467369, https://pmc.ncbi.nlm.nih.gov/articles/PMC12467369/. Read as: self-controlled feedback scheduling beats experimenter-controlled for retention/transfer; do not overstate it as "feedback aids retention but not acquisition" in general.
- **Pro case (moderate):** quiet-eye / gaze training and observational video modeling have improved real basketball shooting; knowledge-of-performance (form feedback) beats outcome-only feedback; durable learning depends on building the user's own error-detection eye.
- **Skeptic case (real):** motor acuity is built by physical repetition and is dissociable from declarative knowledge (Stanley & Krakauer); far transfer from generic off-court perceptual training is empirically unsupported (2024 Sports Medicine review); reinvestment / internal-focus (Wulf, Masters) shows conscious rule-based mechanical focus can degrade skilled execution **under pressure**.
  - *Design consequence:* CONDITIONAL-GO. Scaffold framing, external-focus cues, and a validating RCT. "Passive improvement just by being aware" is **not** supported as a standalone claim; awareness is, however, a necessary learning phase — the caveat is specifically about conscious mechanical focus during live, under-pressure execution.

## What verification caught (do not resurrect)

- Fabricated: SimBenchmark cross-engine accuracy quote; the "580-shot" sample size; a HomeCourt metrics quote.
- Misattributed: ball drag law / Cd≈0.5 / mass 0.62 kg attributed to Silverberg (correct physics, wrong source).
- Overstated: proficient-vs-novice joint angles presented as significant when they were not.
- Re-verification pass (2026-07-21) downgraded three claims from CONFIRMED to PARTIAL (corrected in place above): contact-artifact *localization* to the hand–object interface; the "competitors" framing of a student-club CV demo; and generalizing *self-controlled* feedback benefits to feedback in general.
- Batch-4 baseline corrections (folded into [principles-baseline.md](../principles-baseline.md)): dropped as false precision / unsourced — shoulder-elevation 59.7–85.3°, head-axis ±15°, follow-through head-tilt 10–15°, hip upper bound 160°, the ~80–100/75–110° set-elbow bands, the "1.0–1.5× hip-width" stance basis (replaced by stature normalization), and the 2–3 rev/s backspin range (the modeled optimum is ~3 Hz; ~2 Hz is *typical*, not optimal). The `~159.6°` release-elbow mean and `1.17× vs 1.12×` release-height ratio were **re-confirmed** verbatim (Cabarkapa et al. 2023), with "novice" corrected to "non-proficient" and the free-throw context noted.
