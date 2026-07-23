// The principle baseline as data, transcribed verbatim from docs/principles-baseline.md
// (the five per-phase tables). Each row keeps the doc's exact `name` / `range` / `tierText`
// / `readFrom` cells so test/principles-drift.test.ts can round-trip the data against the
// doc, plus a parsed `tier` and a structural `criterion` the scorer consumes. The doc is the
// single source of truth (ADR-0004); the `criterion` is a first-pass structural reading —
// full measurement + deduction semantics land with the scorer (#11).

import type { Criterion, FormObjective, Principle, PrincipleTier } from '@fix-my-shot/core';
import type { PhaseId } from './phases';

/** Tier as transcribed, including the doc's `deferred` rows (folded elsewhere, never scored). */
export type BaselineTier = PrincipleTier | 'deferred';

/** One transcribed row of the principle baseline (a `docs/principles-baseline.md` table row). */
export interface BaselinePrinciple {
  readonly id: string;
  readonly phase: PhaseId;
  /** Verbatim `Principle` cell. */
  readonly name: string;
  /** Verbatim `Range` cell. */
  readonly range: string;
  /** Verbatim `Tier` cell (raw markdown, e.g. `**written-in-stone** *(moderate)*`). */
  readonly tierText: string;
  /** Verbatim `Read from pose` cell. */
  readonly readFrom: string;
  /** Parsed tier (`deferred` for the folded 90°-"L" row). */
  readonly tier: BaselineTier;
  /** Structural reading the scorer checks (provisional — refined by the scorer, #11). */
  readonly criterion: Criterion;
}

export const BASELINE: readonly BaselinePrinciple[] = [
  // --- 1 · Stance / Preparation ---
  {
    id: 'com-inside-base',
    phase: 'stance',
    name: `COM inside base (balance)`,
    range: `COM projection inside foot base, ~centered front/back at set`,
    tierText: `**written-in-stone**`,
    readFrom: `vertical from mid-pelvis (~55% stature, ~55% F / ~57% M) lands between foot edges`,
    tier: 'written-in-stone',
    criterion: { kind: 'presence' },
  },
  {
    id: 'both-feet-grounded',
    phase: 'stance',
    name: `Both feet grounded`,
    range: `full sole contact through set/dip/load`,
    tierText: `**written-in-stone**`,
    readFrom: `both soles on floor plane; COM between contact patches`,
    tier: 'written-in-stone',
    criterion: { kind: 'presence' },
  },
  {
    id: 'stance-width',
    phase: 'stance',
    name: `Stance width`,
    range: `~0.15–0.20× **stature** (never-penalized band ~0.11–0.22×)`,
    tierText: `guideline`,
    readFrom: `inter-foot distance ÷ estimated stature; wider end mildly favored, repeatable narrower base never penalized *(stature is the only sourced normalizer; hip-width basis was unsourced — resolved gap)*`,
    tier: 'guideline',
    criterion: { kind: 'band', min: 0.15, max: 0.2, unit: 'stature' },
  },
  {
    id: 'foot-stagger',
    phase: 'stance',
    name: `Foot stagger / turn-out`,
    range: `dominant foot slightly fore (~8–13 cm); turn-out unmeasured`,
    tierText: `style-variant`,
    readFrom: `fore/aft offset + turn-out; confirm L/R coherence only, never score toward a value (stagger n.s. by skill; turn-out has no pose measurement)`,
    tier: 'style-variant',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'erect-torso',
    phase: 'stance',
    name: `Erect torso at set`,
    range: `relatively upright; penalize marked hunch only`,
    tierText: `guideline`,
    readFrom: `trunk-to-vertical angle (no degree band established)`,
    tier: 'guideline',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'trunk-inclination',
    phase: 'stance',
    name: `Trunk inclination (idiosyncratic)`,
    range: `stable, wide band; flag extremes only`,
    tierText: `style-variant`,
    readFrom: `trunk-to-floor angle; reward stability (via stone #5), not a template — *retiered from written-in-stone; the stability requirement flows from #5*`,
    tier: 'style-variant',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'shoulders-squared',
    phase: 'stance',
    name: `Shoulders/hips "squared"`,
    range: `~square, but consistent rotation is fine`,
    tierText: `style-variant`,
    readFrom: `shoulder/hip line vs ball→target; penalize only fully-sideways`,
    tier: 'style-variant',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'head-toward-target',
    phase: 'stance',
    name: `Head/eyes toward hoop`,
    range: `head axis oriented toward target, pitched up — **presence/direction only**`,
    tierText: `guideline`,
    readFrom: `head-forward vector vs chest→target (head only; scored gently; **no degree band** — ±15° was unsourced and dropped)`,
    tier: 'guideline',
    criterion: { kind: 'direction' },
  },
  {
    id: 'early-target-acquisition',
    phase: 'stance',
    name: `Early target acquisition`,
    range: `head target-aimed from stance/dip`,
    tierText: `guideline`,
    readFrom: `apply head-direction test to an early pose (QE duration is temporal → excluded)`,
    tier: 'guideline',
    criterion: { kind: 'direction' },
  },

  // --- 2 · Dip / Gather ---
  {
    id: 'knee-flexion',
    phase: 'dip',
    name: `Knee flexion at load`,
    range: `~90–130° (3-pt proficient 94.3±5.4° vs 113.2±4.2°, p<.001)`,
    tierText: `guideline *(contested)*`,
    readFrom: `knee 3-point angle; **wide band, not scored toward a target** — n.s. for 2-pt, distance-dependent, app is distance-blind (see load-depth proxy)`,
    tier: 'guideline',
    criterion: { kind: 'band', min: 90, max: 130, unit: 'deg' },
  },
  {
    id: 'hip-flexion',
    phase: 'dip',
    name: `Hip flexion / lowered COM`,
    range: `hip ~130–145° (internal torso–thigh, 180°=straight); COM lowers from standing ~0.55× stature`,
    tierText: `guideline`,
    readFrom: `hip angle + COM drop; hip flexes *with* knee, chest up *(160° upper bound dropped as unsupported; no stature-normalized loaded COM band is sourced — treat COM drop qualitatively)*`,
    tier: 'guideline',
    criterion: { kind: 'band', min: 130, max: 145, unit: 'deg' },
  },
  {
    id: 'deep-elbow-flexion',
    phase: 'dip',
    name: `Deep elbow flexion at dip`,
    range: `~55–70° included (pro mean ~58–64°)`,
    tierText: `guideline`,
    readFrom: `elbow angle at lowest-ball pose only (SD large ~14–22°, n.s. by skill → broad band)`,
    tier: 'guideline',
    criterion: { kind: 'band', min: 55, max: 70, unit: 'deg' },
  },
  {
    id: 'load-presence',
    phase: 'dip',
    name: `**Load presence + coherence + symmetry** (the scored quantity)`,
    range: `knee not near-straight (fault only if >~155°); knee↔hip co-flexion; L/R symmetric`,
    tierText: `guideline *(proxy)*`,
    readFrom: `flag an unloaded straight knee, a stiff-knee hip-only "bow," or L/R asymmetry — never score toward a depth (distance-blind by construction; resolves the load-depth gap)`,
    tier: 'guideline',
    criterion: { kind: 'presence' },
  },

  // --- 3 · Loading / Ball-elevation ---
  {
    id: 'sequential-leg-extension',
    phase: 'loading',
    name: `Sequential vertical leg extension`,
    range: `knee → ~160–175° near release; drive vertical`,
    tierText: `**written-in-stone** *(qualitative)*`,
    readFrom: `legs near-extended, on toes, COM over take-off spot (numbers carried at guideline confidence)`,
    tier: 'written-in-stone',
    criterion: { kind: 'band', min: 160, max: 175, unit: 'deg' },
  },
  {
    id: 'elbow-under-loading',
    phase: 'loading',
    name: `Elbow under ball / minimal flare`,
    range: `forearm converges toward vertical by release; ~35° off vertical during the gather is normal`,
    tierText: `guideline`,
    readFrom: `frontal-view forearm-vs-vertical; **do not enforce a near-vertical band before release**; penalize only gross flare at release (resolved: see the Set/Release row)`,
    tier: 'guideline',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'shoulder-elevation',
    phase: 'loading',
    name: `Shoulder / upper-arm elevation`,
    range: `wide, non-discriminating; prep means ~66–79° (SD ~26–31°)`,
    tierText: `style-variant`,
    readFrom: `trunk-vs-upper-arm angle; never a scored ideal *(false-precision 59.7–85.3° band dropped — no source)*`,
    tier: 'style-variant',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'wrist-cocked',
    phase: 'loading',
    name: `Wrist cocked back at set`,
    range: `**direction only**: dorsiflexed (extended), not neutral/palmar-flexed; magnitude capped at anatomical ROM ~70°`,
    tierText: `guideline`,
    readFrom: `signed sagittal back-of-hand-vs-forearm angle: score the **sign** (cocked = correct); clamp magnitude 0–~70°, flag >~75° as measurement error; never score toward a degree *(the ~60–90° figure was unsourced and exceeds anatomical ROM — resolved as a proxy)*`,
    tier: 'guideline',
    criterion: { kind: 'direction' },
  },
  {
    id: 'guide-hand',
    phase: 'loading',
    name: `Guide hand passive on the side`,
    range: `vertical on lateral side, fingers up, off by release`,
    tierText: `guideline`,
    readFrom: `off-hand on side (not top/under/front), not steering (categorical — see Set/Release proxy)`,
    tier: 'guideline',
    criterion: { kind: 'presence' },
  },
  {
    id: 'proximal-distal',
    phase: 'loading',
    name: `Proximal→distal activation`,
    range: `skilled: distal completes last`,
    tierText: `guideline *(temporal)*`,
    readFrom: `weak single-frame proxy; flag only gross decoupling`,
    tier: 'guideline',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'one-motion-continuity',
    phase: 'loading',
    name: `One-motion continuity`,
    range: `ball rises with leg drive`,
    tierText: `guideline *(temporal/weak)*`,
    readFrom: `flag, don't penalize; one- vs two-motion is a style choice`,
    tier: 'guideline',
    criterion: { kind: 'qualitative' },
  },

  // --- 4 · Set point / Release ---
  {
    id: 'near-full-elbow-extension',
    phase: 'set-release',
    name: `Near-full elbow extension`,
    range: `~150–175° descriptor; empirical mean ~159.6° (proficient 159.6±1.4 vs non-proficient 159.8±1.3, p=.336)`,
    tierText: `**written-in-stone**`,
    readFrom: `elbow 3-point angle; <~150° at release = fault (the value does **not** rank skill; 150–175 is a near-full-extension descriptor, not a statistical band)`,
    tier: 'written-in-stone',
    criterion: { kind: 'band', min: 150, max: 175, unit: 'deg' },
  },
  {
    id: 'set-release-height',
    phase: 'set-release',
    name: `High set/release height (÷ stature)`,
    range: `~1.17× (proficient, ≥70% FT) vs ~1.12× (non-proficient), p=.010, d=.438 (free throw)`,
    tierText: `guideline`,
    readFrom: `ball/hand height ÷ stature vs head/reach — **the only supported anthropometric normalization**; don't hard-penalize a repeatable lower set`,
    tier: 'guideline',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'elbow-flare-release',
    phase: 'set-release',
    name: `Elbow-under-ball flare`,
    range: `~5–20° off vertical at release (proficient FT mean ~13.6±4.7°; made ~7° vs missed ~11°, p=.004)`,
    tierText: `guideline`,
    readFrom: `frontal forearm-vs-vertical; treat as a **monotonic scale** (≤~8° good, ~8–15° caution), penalize only **gross** flare >~25°; never penalize in-range (non-discriminating; **free-throw-scoped** — for jump/3-pt keep only the >25° gross penalty)`,
    tier: 'guideline',
    criterion: { kind: 'band', min: 5, max: 20, unit: 'deg' },
  },
  {
    id: 'elbow-l-at-set',
    phase: 'set-release',
    name: `Elbow ~90° "L" at set`,
    range: `**folded into the Dip elbow band** — no discrete 90° event`,
    tierText: `*(deferred)*`,
    readFrom: `90° is an arbitrary transit value on the continuous load→release sweep; the only pose-readable conflict is an elbow near-extended while the ball is still low (pushing, not loading)`,
    tier: 'deferred',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'trunk-at-release',
    phase: 'set-release',
    name: `Near-vertical trunk at release`,
    range: `~−5°…+5° of vertical (proficient −1.1±3.5° vs non-proficient +1.9±3.3°, p=.016)`,
    tierText: `guideline`,
    readFrom: `trunk vs gravity; slight backward lean not a fault; penalize pronounced forward flexion`,
    tier: 'guideline',
    criterion: { kind: 'band', min: -5, max: 5, unit: 'deg' },
  },
  {
    id: 'ball-on-finger-pads',
    phase: 'set-release',
    name: `Ball on finger pads + palm gap`,
    range: `visible gap, pads not palm, fingers spread — **binary present/absent**`,
    tierText: `**written-in-stone** *(moderate)*`,
    readFrom: `gap between palm and ball, scored present/absent; **no cm or hand-fraction value** (units deferred)`,
    tier: 'written-in-stone',
    criterion: { kind: 'presence' },
  },
  {
    id: 'hand-behind-under',
    phase: 'set-release',
    name: `Hand behind-and-under; index near centerline`,
    range: `hand under/behind, index ~centerline`,
    tierText: `**written-in-stone** *(moderate)*`,
    readFrom: `placement behind/beneath ball (off-center cm dropped)`,
    tier: 'written-in-stone',
    criterion: { kind: 'presence' },
  },
  {
    id: 'square-hand',
    phase: 'set-release',
    name: `Square hand, no lateral twist`,
    range: `twist about vertical ~zero; fingers vertical, palm facing target`,
    tierText: `guideline`,
    readFrom: `palm/fingers in the ball→target plane — the **static spin-axis-alignment** mechanic (in-flight spin rate/axis measurement excluded; see the produced-backspin proxy)`,
    tier: 'guideline',
    criterion: { kind: 'direction' },
  },
  {
    id: 'wrist-snap-gooseneck',
    phase: 'set-release',
    name: `Wrist snaps to flexion; gooseneck`,
    range: `**presence** of completed forward flexion, fingers down`,
    tierText: `guideline *(contested)*`,
    readFrom: `score presence, **not a degree** (2D/3D sources report no defensible instantaneous release-flexion angle — resolved as presence-only, numeric range deferred)`,
    tier: 'guideline',
    criterion: { kind: 'presence' },
  },
  {
    id: 'eyes-on-target',
    phase: 'set-release',
    name: `Eyes/head stay on target`,
    range: `head still target-aimed — **presence/direction only**`,
    tierText: `guideline`,
    readFrom: `head pitch/azimuth vs target; gentle, no degree band; brief post-ball glance harmless`,
    tier: 'guideline',
    criterion: { kind: 'direction' },
  },
  {
    id: 'unobstructed-sightline',
    phase: 'set-release',
    name: `Unobstructed sightline`,
    range: `hoop-direction visible around/over ball`,
    tierText: `style-variant *(weak)*`,
    readFrom: `eye→target line vs ball silhouette; flag only full occlusion`,
    tier: 'style-variant',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'set-point-height-motion',
    phase: 'set-release',
    name: `Set-point height one-/two-motion`,
    range: `chin/forehead → above head — full band`,
    tierText: `style-variant`,
    readFrom: `classify, don't score`,
    tier: 'style-variant',
    criterion: { kind: 'qualitative' },
  },
  {
    id: 'base-extended',
    phase: 'set-release',
    name: `Base extended before distal release`,
    range: `knee near extension at release`,
    tierText: `guideline`,
    readFrom: `wide band; flag only gross load-at-release mismatch (heel-off **not** universal; free throw is planted)`,
    tier: 'guideline',
    criterion: { kind: 'qualitative' },
  },

  // --- 5 · Follow-through / Inertia ---
  {
    id: 'terminal-wrist-flexion',
    phase: 'follow-through',
    name: `Terminal wrist flexion (gooseneck)`,
    range: `wrist flexed/down, elbow extended, shoulder up — **presence**`,
    tierText: `guideline`,
    readFrom: `clearest single-frame fingerprint of a completed cascade; read presence, not degree`,
    tier: 'guideline',
    criterion: { kind: 'presence' },
  },
  {
    id: 'head-stabilized',
    phase: 'follow-through',
    name: `Head stabilized over base`,
    range: `head projection within base — **presence/gross-displacement only**`,
    tierText: `guideline`,
    readFrom: `head projection to floor; only gross sway informative (no validated degree cutoff — the ~10–15° tilt figure was unsourced and dropped)`,
    tier: 'guideline',
    criterion: { kind: 'presence' },
  },
  {
    id: 'repeatable-symmetric-geometry',
    phase: 'follow-through',
    name: `Repeatable, symmetric hand/ball geometry`,
    range: `in-range + L/R symmetric, no single ideal`,
    tierText: `style-variant *(strong)*`,
    readFrom: `score membership + symmetry (consistency predicts accuracy; a mean ideal does not)`,
    tier: 'style-variant',
    criterion: { kind: 'symmetry' },
  },
];

/**
 * The scorer-facing objective: the baseline's scored principles as core `Principle`s
 * (deferred rows excluded). The scorer only applies phase-appropriate principles per pose.
 */
export const PRINCIPLES: readonly Principle[] = BASELINE.filter(
  (p): p is BaselinePrinciple & { tier: PrincipleTier } => p.tier !== 'deferred',
).map(({ id, phase, tier, criterion }) => ({ id, phase, tier, criterion }));

/** The basketball form objective handed to the sport-agnostic scorer. */
export const OBJECTIVE: FormObjective = { principles: PRINCIPLES };
