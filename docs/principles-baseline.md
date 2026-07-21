# fix-my-shot — Principles Baseline (the form scorer)

**Version:** 0.2 — accepted, on `main` · **Instantiates:** [ADR-0004](decisions/0004-scoring-model.md) · scored via [ADR-0008](decisions/0008-score-semantics.md) · **Date:** 2026-07-21

The concrete instantiation of [ADR-0004](decisions/0004-scoring-model.md): the phase-aware set of shooting principles the scorer grades a pose against. Derived and **cross-verified** across research batches 3 and 4 (every numeric range independently re-fetched; fabricated numbers dropped — see [evidence](research/evidence.md)). Batch 4 (2026-07-21) closed the open numeric gaps from issue #3: each is now a **pinned** range, a **static proxy**, or an **honest deferral with rationale** — recorded inline below and summarized under *Resolved gaps*.

## How the scorer reads this

- **Phase is fixed, not inferred.** Every pose is **labeled with its phase at generation** and that label is pinned through editing; the editor bounds each joint / touch-point / ball position within phase-appropriate ranges so a pose cannot be dragged out of its phase (ADR-0009). A marker is only judged where it applies (a lifted heel is correct at release, a fault at the set; a bent elbow is correct at the dip, a fault at follow-through). A frame-from-readings classifier is **not** built for v1 (deferred — see *Resolved gaps*).
- **Range-based, not ideal-based.** Score **membership-in-range** and **left/right symmetry**, never distance from a single "perfect" value. In-range **style** is never penalized; only **out-of-range** divergence (a conflict with a principle) reduces the score. *(Locked finding: there is no single optimal shot — a shooter's own in-range consistency predicts accuracy better than conformance to any ideal.)*
- **Tiers.** `written-in-stone` = near-universal fundamentals; `guideline` = supported but soft/context-dependent; `style-variant` = legitimate individual variation (wide band, never penalized in-range).
- **Aggregation = gate + weighted deductions** (ADR-0008). Output is a **0–100 form grade**, not a make probability. A **written-in-stone** violation **caps** the score (the ceiling falls with violation depth) so a broken fundamental can never be buried under many small greens; **guideline** violations subtract graded, band-width-normalized deductions; **style-variant** and in-range values are never deducted. Deductions are computed per phase against phase-appropriate ranges.
- **Gentle where the sensor is weak.** Head/gaze principles use head orientation as an unknown-fidelity proxy for true gaze → scored gently, **presence/direction only, no degree band** (no head-angle tolerance is evidence-backed). **Temporal** constructs (tempo, sequence timing, one-motion continuity, quiet-eye duration) are **not** derived from a single frame.

## Phase taxonomy (pose-classifiable; nests in the peer-reviewed 3-phase model)

| # | Phase | What it is |
|---|---|---|
| 1 | **Stance / Preparation** | Balanced base set, ball gathered to the shot pocket, lower body loaded. (Academic *preparation*.) |
| 2 | **Dip / Gather** | Ball at its lowest, deepest knee/hip load, rhythm build. (Coaching subdivision; depth is style.) |
| 3 | **Loading / Ball-elevation** | Triple extension drives up as the ball rises toward the set point; elbow travels under the ball. (Academic *jump*.) |
| 4 | **Set point / Release** | Ball at highest set, arm extends, wrist snaps, ball off the fingertips with backspin. |
| 5 | **Follow-through / Inertia** | Arm held to target, gooseneck wrist, balanced landing. (Academic *follow-through*; largely post-release inertia.) |

The five phases nest inside the peer-reviewed **preparation / jump / follow-through** model. Each generated pose carries its phase label; the six readings that *characterize* a phase (ball height/position, shooting-elbow flexion + under-ball, arm/shoulder flexion, knee/hip/ankle flexion, wrist state, foot-floor contact) are retained as the specification a future classifier would implement.

## The virtual target
Many principles are "toward the hoop," but the scene has only body + ball + floor. A **fixed virtual target direction** (azimuth + a nominal free-throw geometry: rim 3.05 m high, 4.57 m ahead of the stance) is attached to the scene (ADR-0009). Every "hoop"-referenced reading resolves against this target direction; pitch-dependent checks that are too coarse for a fixed geometry use **direction only**. No ball flight is computed — the target orients the body, it is never a thing the ball travels to.

## Written-in-stone (the non-negotiables — deliberately few)

1. **Balance** — the COM ground-projection (~55% of stature, mid-pelvis) falls **inside the base of support** at every phase. *(strong)*
2. **Ground contact is the force source** — both feet in floor contact through Stance→Loading; heels rise only into release. *(strong, qualitative; exact weight-split / heel-off timing not sourced — see deferral)*
3. **Near-full elbow extension at release/follow-through** (~150–175°, mean ~159.6°) — the phase-appropriate extension **direction** is universal; the exact angle does *not* discriminate skill. *(strong)*
4. **Kinetic-chain sequencing** — force flows proximal→distal (legs→trunk→shoulder→elbow→wrist), leg drive vertical, COM over the base. *(strong, qualitative; inter-segment timing is temporal/soft)*
5. **No single optimal shot** — reward stable in-range consistency; never penalize in-range variation. *(strong; applies to every region/phase)*
6. **Ball on the finger pads with a palm-clearance gap, hand behind-and-under** — near-universal geometry, scored as a present/absent binary. *(moderate; all associated cm values were fabricated and dropped — units remain deferred)*

## Principles by phase

### 1 · Stance / Preparation
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| COM inside base (balance) | COM projection inside foot base, ~centered front/back at set | **written-in-stone** | vertical from mid-pelvis (~55% stature, ~55% F / ~57% M) lands between foot edges |
| Both feet grounded | full sole contact through set/dip/load | **written-in-stone** | both soles on floor plane; COM between contact patches |
| Stance width | ~0.15–0.20× **stature** (never-penalized band ~0.11–0.22×) | guideline | inter-foot distance ÷ estimated stature; wider end mildly favored, repeatable narrower base never penalized *(stature is the only sourced normalizer; hip-width basis was unsourced — resolved gap)* |
| Foot stagger / turn-out | dominant foot slightly fore (~8–13 cm); turn-out unmeasured | style-variant | fore/aft offset + turn-out; confirm L/R coherence only, never score toward a value (stagger n.s. by skill; turn-out has no pose measurement) |
| Erect torso at set | relatively upright; penalize marked hunch only | guideline | trunk-to-vertical angle (no degree band established) |
| Trunk inclination (idiosyncratic) | stable, wide band; flag extremes only | style-variant | trunk-to-floor angle; reward stability (via stone #5), not a template — *retiered from written-in-stone; the stability requirement flows from #5* |
| Shoulders/hips "squared" | ~square, but consistent rotation is fine | style-variant | shoulder/hip line vs ball→target; penalize only fully-sideways |
| Head/eyes toward hoop | head axis oriented toward target, pitched up — **presence/direction only** | guideline | head-forward vector vs chest→target (head only; scored gently; **no degree band** — ±15° was unsourced and dropped) |
| Early target acquisition | head target-aimed from stance/dip | guideline | apply head-direction test to an early pose (QE duration is temporal → excluded) |

### 2 · Dip / Gather
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Knee flexion at load | ~90–130° (3-pt proficient 94.3±5.4° vs 113.2±4.2°, p<.001) | guideline *(contested)* | knee 3-point angle; **wide band, not scored toward a target** — n.s. for 2-pt, distance-dependent, app is distance-blind (see load-depth proxy) |
| Hip flexion / lowered COM | hip ~130–145° (internal torso–thigh, 180°=straight); COM lowers from standing ~0.55× stature | guideline | hip angle + COM drop; hip flexes *with* knee, chest up *(160° upper bound dropped as unsupported; no stature-normalized loaded COM band is sourced — treat COM drop qualitatively)* |
| Deep elbow flexion at dip | ~55–70° included (pro mean ~58–64°) | guideline | elbow angle at lowest-ball pose only (SD large ~14–22°, n.s. by skill → broad band) |
| **Load presence + coherence + symmetry** (the scored quantity) | knee not near-straight (fault only if >~155°); knee↔hip co-flexion; L/R symmetric | guideline *(proxy)* | flag an unloaded straight knee, a stiff-knee hip-only "bow," or L/R asymmetry — never score toward a depth (distance-blind by construction; resolves the load-depth gap) |

### 3 · Loading / Ball-elevation
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Sequential vertical leg extension | knee → ~160–175° near release; drive vertical | **written-in-stone** *(qualitative)* | legs near-extended, on toes, COM over take-off spot (numbers carried at guideline confidence) |
| Elbow under ball / minimal flare | forearm converges toward vertical by release; ~35° off vertical during the gather is normal | guideline | frontal-view forearm-vs-vertical; **do not enforce a near-vertical band before release**; penalize only gross flare at release (resolved: see the Set/Release row) |
| Shoulder / upper-arm elevation | wide, non-discriminating; prep means ~66–79° (SD ~26–31°) | style-variant | trunk-vs-upper-arm angle; never a scored ideal *(false-precision 59.7–85.3° band dropped — no source)* |
| Wrist cocked back at set | **direction only**: dorsiflexed (extended), not neutral/palmar-flexed; magnitude capped at anatomical ROM ~70° | guideline | signed sagittal back-of-hand-vs-forearm angle: score the **sign** (cocked = correct); clamp magnitude 0–~70°, flag >~75° as measurement error; never score toward a degree *(the ~60–90° figure was unsourced and exceeds anatomical ROM — resolved as a proxy)* |
| Guide hand passive on the side | vertical on lateral side, fingers up, off by release | guideline | off-hand on side (not top/under/front), not steering (categorical — see Set/Release proxy) |
| Proximal→distal activation | skilled: distal completes last | guideline *(temporal)* | weak single-frame proxy; flag only gross decoupling |
| One-motion continuity | ball rises with leg drive | guideline *(temporal/weak)* | flag, don't penalize; one- vs two-motion is a style choice |

### 4 · Set point / Release
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Near-full elbow extension | ~150–175° descriptor; empirical mean ~159.6° (proficient 159.6±1.4 vs non-proficient 159.8±1.3, p=.336) | **written-in-stone** | elbow 3-point angle; <~150° at release = fault (the value does **not** rank skill; 150–175 is a near-full-extension descriptor, not a statistical band) |
| High set/release height (÷ stature) | ~1.17× (proficient, ≥70% FT) vs ~1.12× (non-proficient), p=.010, d=.438 (free throw) | guideline | ball/hand height ÷ stature vs head/reach — **the only supported anthropometric normalization**; don't hard-penalize a repeatable lower set |
| Elbow-under-ball flare | ~5–20° off vertical at release (proficient FT mean ~13.6±4.7°; made ~7° vs missed ~11°, p=.004) | guideline | frontal forearm-vs-vertical; treat as a **monotonic scale** (≤~8° good, ~8–15° caution), penalize only **gross** flare >~25°; never penalize in-range (non-discriminating; **free-throw-scoped** — for jump/3-pt keep only the >25° gross penalty) |
| Elbow ~90° "L" at set | **folded into the Dip elbow band** — no discrete 90° event | *(deferred)* | 90° is an arbitrary transit value on the continuous load→release sweep; the only pose-readable conflict is an elbow near-extended while the ball is still low (pushing, not loading) |
| Near-vertical trunk at release | ~−5°…+5° of vertical (proficient −1.1±3.5° vs non-proficient +1.9±3.3°, p=.016) | guideline | trunk vs gravity; slight backward lean not a fault; penalize pronounced forward flexion |
| Ball on finger pads + palm gap | visible gap, pads not palm, fingers spread — **binary present/absent** | **written-in-stone** *(moderate)* | gap between palm and ball, scored present/absent; **no cm or hand-fraction value** (units deferred) |
| Hand behind-and-under; index near centerline | hand under/behind, index ~centerline | **written-in-stone** *(moderate)* | placement behind/beneath ball (off-center cm dropped) |
| Square hand, no lateral twist | twist about vertical ~zero; fingers vertical, palm facing target | guideline | palm/fingers in the ball→target plane — the **static spin-axis-alignment** mechanic (in-flight spin rate/axis measurement excluded; see the produced-backspin proxy) |
| Wrist snaps to flexion; gooseneck | **presence** of completed forward flexion, fingers down | guideline *(contested)* | score presence, **not a degree** (2D/3D sources report no defensible instantaneous release-flexion angle — resolved as presence-only, numeric range deferred) |
| Eyes/head stay on target | head still target-aimed — **presence/direction only** | guideline | head pitch/azimuth vs target; gentle, no degree band; brief post-ball glance harmless |
| Unobstructed sightline | hoop-direction visible around/over ball | style-variant *(weak)* | eye→target line vs ball silhouette; flag only full occlusion |
| Set-point height one-/two-motion | chin/forehead → above head — full band | style-variant | classify, don't score |
| Base extended before distal release | knee near extension at release | guideline | wide band; flag only gross load-at-release mismatch (heel-off **not** universal; free throw is planted) |

### 5 · Follow-through / Inertia
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Terminal wrist flexion (gooseneck) | wrist flexed/down, elbow extended, shoulder up — **presence** | guideline | clearest single-frame fingerprint of a completed cascade; read presence, not degree |
| Head stabilized over base | head projection within base — **presence/gross-displacement only** | guideline | head projection to floor; only gross sway informative (no validated degree cutoff — the ~10–15° tilt figure was unsourced and dropped) |
| Repeatable, symmetric hand/ball geometry | in-range + L/R symmetric, no single ideal | style-variant *(strong)* | score membership + symmetry (consistency predicts accuracy; a mean ideal does not) |

## Produced-backspin geometry (the backspin proxy)
Backspin is **accounted for** by scoring the static geometry that *produces* it — never by estimating a spin rate from a frozen frame (that would be fabrication). A phase-conditional cluster over existing features, at **guideline** tier (it certifies backspin-*capable* geometry, not spin produced):

- **(a) Roll-off contact** (Set/Release): ball on the finger pads, palm-clearance gap, hand behind-and-under the ball centroid relative to the ball→target line, index near centerline (reuses stone #6). *Physics:* under no-slip fingertip contact the release angular velocity equals the sweep rate of the ball-center→fingertip line, so pads-contact behind/under the ball starts the roll arc. Soft sub-check: final push toward the ball's lower-rear quarter-radius (weakest marker — flag, don't penalize).
- **(b) Spin-axis alignment** (Set/Release): shooting fingers ~vertical in the ball→target plane, palm facing the target, ~zero lateral twist (finger-orientation + twist modes dominate axis misalignment, R²≈0.63 vertical / 0.77 all modes; palm orientation is recoverable from a single frame via 21-landmark hand inference).
- **(c) Wrist state vs phase** (presence, not degree): cocked back at Loading/Set (roll amplitude in reserve), flexed gooseneck at Follow-through (amplitude spent).

**Scored:** membership/presence only; penalize only mechanism conflicts (palming / no gap, hand on side or top of ball, marked lateral twist, flat wrist at set, absent terminal flexion). Output a "backspin-capable geometry: in/out of range" sub-result at guideline weight — **never a rev/s, never a spin-axis measurement.** *Honesty note:* a shooter can pass this geometry and still spin the ball poorly (the accelerations that set rate are unknowable from one frame) — hence guideline, not written-in-stone.

## Style-tolerant (wide bands — never penalized in-range)
Foot stagger/turn-out · shoulder/hip rotation ("squaring") · shoulder/upper-arm elevation · set-point/release ball **height** (one- vs two-motion) · hand/ball micro-geometry (finger spread, cock magnitude, index offset, guide-hand contact/timing) · trunk inclination · head yaw/tilt & dominant-eye offset · dip depth & one-/two-motion rhythm · jump height & exact release-knee angle.

## Excluded (out of scope, folklore, or non-discriminating — not graded)
- **Ball trajectory / entry angle / depth / left-right / make probability** — flight & aim; out of scope. (Release *angle* doesn't distinguish makes.)
- **Measured in-flight spin rate & spin-axis direction** — ball-flight measurements, not read from a static pose. *(Backspin is now **accounted for** via the static produced-backspin proxy above; only in-flight measurement is excluded — resolves the former "backspin rate" gap.)*
- **Ground-reaction-force magnitude** — a force, not pose-readable, and n.s. by skill.
- **Quiet-eye duration / variability, shot tempo, joint & COM velocities, one-motion pause detection, inter-segment timing, pre-spin twist mode** — temporal; need video, not a frame.
- **Rim aiming point** — needs eye-tracking; head orientation too coarse.
- **Fore/aft weight-distribution %** — no defensible range (only "COM inside base" holds).
- **Ball seam/valve orientation, postural sway, craniocervical angle** — folklore / non-discriminating / no defensible pose range.
- **Fabricated numbers dropped (never resurrect):** ball-to-palm gap ~1–3 cm, index offset ~1–2 cm, stance-width cm + p=0.048, foot-lead "half a foot-length", wrist-cock ~60–90°, shoulder-elevation 59.7–85.3°, head axis ±15°, follow-through head-tilt 10–15°, hip upper bound 160°. Qualitative principles kept; unsupported numbers removed.

## How each principle is measured from one pose
Joint angles as 3-point angles on skeleton keypoints; segment-vs-gravity angles using the floor plane as reference; balance by projecting the COM to the floor and testing it inside the foot-contact polygon; foot-floor contact by which soles touch and whether heels are lifted (judged against the labeled phase); ball position as the floor-referenced centroid height (÷ stature) and its location vs head/eye landmarks and the eye→target line (position, never flight); hand/ball geometry from the contact region (palm gap present/absent, pad vs palm, finger spread, index vs midline, guide-hand side, hand twist about the vertical target plane).

## Resolved gaps (issue #3, research batch 4)
Every gap flagged in batch 3 is now closed as **pinned**, **proxy**, or **deferred with rationale + what-would-pin-it** (all evidence re-fetched and adversarially verified):

| Gap | Resolution | Outcome |
|---|---|---|
| Wrist-cock angle at set | **proxy** | Score direction (dorsiflexed) only; clamp magnitude to anatomical ROM ~70° (AAOS); no target degree. |
| Wrist flexion at release | **deferred** | No defensible 3D instantaneous range; score gooseneck **presence** only. Pin: a marker-based 3D release-frame study. |
| Elbow-under-ball flare | **pinned** | ~5–20° off vertical at release (mean ~13.6°), gross-flare penalty >~25°, free-throw-scoped; ~35° during the gather is normal. |
| Set-point elbow "L" | **deferred** | 90° is a transit value, not an event; folded into the Dip elbow band. |
| Stance-width normalization | **pinned** | Normalize to **stature** (~0.15–0.20×), not hip width; stagger/turn-out stay style-variant. |
| Load depth without distance | **proxy** | Score load **presence + knee↔hip coherence + L/R symmetry**; fault only an unloaded straight knee (>~155°). |
| Heel-off phase boundary | **deferred** | Temporal + shot-type-dependent; coherence check only (lifted heel must co-occur with an extended drive leg); never penalize a planted stance. Pin: shot-type context + temporal heel kinematics. |
| Ball-to-palm gap / finger spread | **deferred** | Below single-frame sensor resolution; keep **present/absent** binary, no cm. Pin: calibrated hand+ball capture normalized to hand span, linked to outcome. |
| Guide-hand separation | **proxy** | Categorical contact-state + lateral placement/orientation; no separation distance. |
| **Backspin rate** | **proxy** | Static **produced-backspin geometry** cluster (above); in-flight rate/axis stay excluded. Pin: regress single-frame pose against in-ball-IMU spin ground truth. |

## Provenance
Derived in research batch 3 (phase taxonomy → 6 kinetic-chain/BEEF region lenses → per-range cross-verification → synthesis) and completed in batch 4 (2026-07-21: one researcher per open gap; backspin via 3 angles + synthesis; every kept range/proxy re-fetched and adversarially verified). Sources are cited per claim in the batch records; the load-bearing verified set and the refuted/dropped claims are summarized in [research/evidence.md](research/evidence.md).
