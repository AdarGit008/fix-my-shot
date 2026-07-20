# fix-my-shot — Principles Baseline (the form scorer)

**Version:** 0.1 (draft for review) · **Lane:** `lane/2` (issue #2, stacked on `lane/1`) · **Date:** 2026-07-20

The concrete instantiation of [ADR-0004](decisions/0004-scoring-model.md): the phase-aware set of shooting principles the scorer grades a pose against. Derived and **cross-verified** in research batch 3 (44 agents; every numeric range independently re-fetched — fabricated numbers were dropped, see [evidence](research/evidence.md)). Open numeric gaps are tracked in **issue #3**.

## How the scorer reads this

- **Phase-conditional.** Every pose is first classified into one of the 5 phases; a marker is only judged where it applies (a lifted heel is correct at release, a fault at the set; a bent elbow is correct at the dip, a fault at follow-through).
- **Range-based, not ideal-based.** Score **membership-in-range** and **left/right symmetry**, never distance from a single "perfect" value. In-range **style** is never penalized; only **out-of-range** divergence (a conflict with a principle) reduces the score. *(Locked finding: there is no single optimal shot — a shooter's own in-range consistency predicts accuracy better than conformance to any ideal.)*
- **Tiers.** `written-in-stone` = near-universal fundamentals; `guideline` = supported but soft/context-dependent; `style-variant` = legitimate individual variation (wide band, never penalized in-range).
- **Gentle where the sensor is weak.** Head/gaze principles use head orientation as an unknown-fidelity proxy for true gaze → scored gently. **Temporal** constructs (tempo, sequence timing, one-motion continuity, quiet-eye duration) are **not** derived from a single frame.

## Phase taxonomy (pose-classifiable; nests in the peer-reviewed 3-phase model)

| # | Phase | What it is |
|---|---|---|
| 1 | **Stance / Preparation** | Balanced base set, ball gathered to the shot pocket, lower body loaded. (Academic *preparation*.) |
| 2 | **Dip / Gather** | Ball at its lowest, deepest knee/hip load, rhythm build. (Coaching subdivision; depth is style.) |
| 3 | **Loading / Ball-elevation** | Triple extension drives up as the ball rises toward the set point; elbow travels under the ball. (Academic *jump*.) |
| 4 | **Set point / Release** | Ball at highest set, arm extends, wrist snaps, ball off the fingertips with backspin. |
| 5 | **Follow-through / Inertia** | Arm held to target, gooseneck wrist, balanced landing. (Academic *follow-through*; largely post-release inertia.) |

Classify a frozen frame from six readings: ball height/position, shooting-elbow flexion + under-ball, arm/shoulder flexion, knee/hip/ankle flexion, wrist state, foot-floor contact.

## Written-in-stone (the non-negotiables — deliberately few)

1. **Balance** — the COM ground-projection (~55% of stature, mid-pelvis) falls **inside the base of support** at every phase. *(strong)*
2. **Ground contact is the force source** — both feet in floor contact through Stance→Loading; heels rise only into release. *(strong, qualitative; exact weight-split / heel-off timing not sourced)*
3. **Near-full elbow extension at release/follow-through** (~150–175°) — the phase-appropriate extension **direction** is universal (the exact angle does *not* discriminate skill). *(strong)*
4. **Kinetic-chain sequencing** — force flows proximal→distal (legs→trunk→shoulder→elbow→wrist), leg drive vertical, COM over the base. *(strong, qualitative; inter-segment timing is temporal/soft)*
5. **No single optimal shot** — reward stable in-range consistency; never penalize in-range variation. *(strong; applies to every region/phase)*
6. **Ball on the finger pads with a palm-clearance gap, hand behind-and-under** — near-universal geometry. *(moderate; all associated cm values were fabricated and dropped)*

## Principles by phase

### 1 · Stance / Preparation
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| COM inside base (balance) | COM projection inside foot base, ~centered front/back at set | **written-in-stone** | vertical from mid-pelvis (~55% stature) lands between foot edges |
| Both feet grounded | full sole contact through set/dip/load | **written-in-stone** | both soles on floor plane; COM between contact patches |
| Stance width | ~1.0–1.5× hip width | guideline | inter-foot distance ÷ hip width (self-normalizing; absolute cm dropped) |
| Foot stagger / turn-out | squared → moderate dominant stagger | style-variant | fore/aft offset + turn-out; only confirm coherence, never score toward one |
| Erect torso at set | relatively upright; penalize marked hunch only | guideline | trunk-to-vertical angle (no degree band established) |
| Trunk inclination (idiosyncratic) | stable, wide band; flag extremes only | **written-in-stone** | trunk-to-floor angle; reward stability, not a template |
| Shoulders/hips "squared" | ~square, but consistent rotation is fine | style-variant | shoulder/hip line vs ball→basket; penalize only fully-sideways |
| Head/eyes toward hoop | head axis ~±15° of body→basket, pitched up | guideline | head-forward vector vs chest→hoop (head only; scored gently) |
| Early target acquisition | head hoop-aimed from stance/dip | guideline | apply head test to an early pose (QE duration is temporal → excluded) |

### 2 · Dip / Gather
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Knee flexion at load | ~90–130° (3-pt proficient ~94° vs ~113°) | guideline *(contested)* | knee 3-point angle; **wide band** — n.s. for 2-pt, distance-dependent, app is distance-blind |
| Hip flexion / lowered COM | hip ~140–160°; COM ~0.49–0.56× stature | guideline | hip angle + COM/stature; hip flexes *with* knee, chest up |
| Deep elbow flexion at dip | ~55–70° included | guideline | elbow angle at lowest-ball pose only (SD large, n.s. by skill → broad band) |

### 3 · Loading / Ball-elevation
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Sequential vertical leg extension | knee → ~160–175° near release; drive vertical | **written-in-stone** *(qualitative)* | legs near-extended, on toes, COM over take-off spot (numbers carried at guideline confidence) |
| Elbow under ball / minimal flare | forearm ~5–20° off the vertical plane (indicative) | guideline | frontal-view ball-wrist-elbow-shoulder stack; penalize only large/unstable flare |
| Shoulder / upper-arm elevation | ~59.7–85.3° (corrected) | style-variant *(contested)* | trunk-vs-upper-arm angle; wide, never a scored ideal |
| Wrist cocked back at set | "wrinkle" heuristic; **no firm angle** | guideline *(weak)* | back-of-hand vs forearm; cocked not neutral (target angle → gap, issue #3) |
| Guide hand passive on the side | vertical on lateral side, fingers up, off by release | guideline | off-hand on side (not top/under/front), not steering |
| Proximal→distal activation | skilled: distal completes last | guideline *(temporal)* | weak single-frame proxy; flag only gross decoupling |
| One-motion continuity | ball rises with leg drive | guideline *(temporal/weak)* | flag, don't penalize; one- vs two-motion is a style choice |

### 4 · Set point / Release
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Near-full elbow extension | ~150–175° (~159.6°) | **written-in-stone** | elbow 3-point angle; <~150° at release = fault (value doesn't rank skill) |
| High set/release height (÷ stature) | higher favorable (~1.17 vs ~1.12, p=.010) | guideline | ball height/stature vs head/reach — **only supported anthropometric normalization**; don't hard-penalize a repeatable lower set |
| Elbow ~90° "L" at set | ~80–100° (band ~75–110°) | guideline *(weak)* | elbow at set-point pose; coaching cue, ±15–20° fine |
| Near-vertical trunk at release | ~−5°…+5° of vertical | guideline | trunk vs gravity; slight backward lean not a fault; penalize pronounced forward flexion |
| Ball on finger pads + palm gap | visible gap, pads not palm, fingers spread | **written-in-stone** *(moderate)* | gap between palm and ball; cm value dropped |
| Hand behind-and-under; index last | hand under/behind, index ~centerline | **written-in-stone** *(moderate)* | placement behind/beneath ball (off-center cm dropped) |
| Square hand, no lateral twist | twist about vertical ~zero | guideline | palm/fingers in the ball-target plane — **static** backspin-alignment mechanic (spin rate/axis excluded) |
| Wrist snaps to flexion; gooseneck | forward flexion, fingers down | guideline *(contested)* | score **presence** of completed flexion, not a degree (2D-source bias; 3D range = gap) |
| Eyes/head stay on target | head still hoop-aimed (~±15°) at release | guideline | head pitch/azimuth; gentle — brief post-ball glance harmless |
| Unobstructed sightline | hoop visible around/over ball | style-variant *(weak)* | eye→hoop line vs ball silhouette; flag only full occlusion |
| Set-point height one-/two-motion | chin/forehead → above head — full band | style-variant | classify, don't score |
| Base extended before distal release | knee near extension at release | guideline | wide band; flag only gross load-at-release mismatch (heel-off **not** universal; free throw is planted) |

### 5 · Follow-through / Inertia
| Principle | Range | Tier | Read from pose |
|---|---|---|---|
| Terminal wrist flexion (gooseneck) | wrist flexed/down, elbow extended, shoulder up | guideline | clearest single-frame fingerprint of a completed cascade; read presence, not degree |
| Head stabilized over base | head projection within base, tilt <~10–15° | guideline | head projection to floor; only gross displacement informative (sway doesn't discriminate) |
| Repeatable, symmetric hand/ball geometry | in-range + L/R symmetric, no single ideal | style-variant *(strong)* | score membership + symmetry (consistency predicts accuracy; mean ideal does not) |

## Style-tolerant (wide bands — never penalized in-range)
Foot stagger/turn-out · shoulder/hip rotation ("squaring") · shoulder/upper-arm elevation · set-point/release ball **height** (one- vs two-motion) · hand/ball micro-geometry (finger spread, cock angle, index offset, guide-hand contact/timing) · trunk inclination · head yaw/tilt & dominant-eye offset · dip depth & one-/two-motion rhythm · jump height & exact release-knee angle.

## Excluded (out of scope, folklore, or non-discriminating — not graded)
- **Ball trajectory / entry angle / depth / left-right / make probability** — flight & aim; out of scope. (Release *angle* doesn't distinguish makes.)
- **Spin-axis direction & measured in-flight spin** — ball-flight measurements, not read from a static pose. *(Backspin **rate** is **not** excluded — it should be accounted for; deriving a static proxy/estimate for it from hand-finger-wrist-ball geometry is a forward research task → open gaps / issue #3.)*
- **Ground-reaction-force magnitude** — a force, not pose-readable, and n.s. by skill.
- **Quiet-eye duration / variability, shot tempo, joint & COM velocities, one-motion pause detection, inter-segment timing** — temporal; need video, not a frame.
- **Rim aiming point** — needs eye-tracking; head orientation too coarse.
- **Fore/aft weight-distribution %** — no defensible range (only "COM inside base" holds).
- **Ball seam/valve orientation, postural sway, craniocervical angle** — folklore / non-discriminating / no defensible pose range.
- **Fabricated numbers dropped:** ball-to-palm gap ~1–3 cm, index offset ~1–2 cm, stance-width cm + p=0.048, foot-lead "half a foot-length", wrist-cock ~60–90°. Qualitative principles kept; unsupported numbers removed.

## How each principle is measured from one pose
Joint angles as 3-point angles on skeleton keypoints; segment-vs-gravity angles using the floor plane as reference; balance by projecting the COM to the floor and testing it inside the foot-contact polygon; foot-floor contact by which soles touch and whether heels are lifted (judged against the detected phase); ball position as the floor-referenced centroid height (÷ stature) and its location vs head/eye landmarks and the eye→hoop line (position, never flight); hand/ball geometry from the contact region (palm gap, pad vs palm, finger spread, index vs midline, guide-hand side, hand twist about the vertical target plane).

## Open gaps → issue #3
Wrist-cock & release-flexion ranges · elbow-flare threshold · set-point elbow band · stance-width normalization basis + turn-out/lead ranges · load-depth band without shot-distance · phase-boundary heel-off rule · ball-gap/finger-spread in defensible units · guide-hand separation criterion · **backspin rate — how to account for it in the score from static hand/finger/wrist/ball geometry (a "produced-backspin" proxy) so it factors in rather than being ignored**. Each needs an evidence-backed range/proxy or an explicit deferral.

## Provenance
Derived in research batch 3 (phase taxonomy → 6 kinetic-chain/BEEF region lenses → per-range cross-verification → synthesis). Sources are cited per claim in the batch record; the load-bearing verified set and the refuted/dropped claims are summarized in [research/evidence.md](research/evidence.md).
