// Visual Behavior + Erotic Context Engine
// Modular detectors that turn structured AI visual signals into a multi-factor
// erotic-intent score. Works on whatever fields the vision model returns —
// missing fields default to 0 so safe content stays safe.
//
// All detectors are pure functions. No network. No state.

export interface VisualSignals {
  // 0..1 ranges expected from the model (we clamp defensively)
  skin_exposure?: number;        // amount of visible skin
  cleavage_emphasis?: number;    // chest area emphasis
  midriff_exposure?: number;
  buttocks_emphasis?: number;
  crotch_emphasis?: number;
  thigh_exposure?: number;

  clothing_tightness?: number;   // bodycon / leggings / yoga pants tightness
  clothing_transparency?: number;
  clothing_revealing?: number;   // lingerie / bikini / underwear / micro-skirt

  pose_suggestiveness?: number;  // arching, bending, kneeling, crawling, body-rub
  camera_body_focus?: number;    // framing lingers on body parts, not activity
  mirror_selfie?: boolean;

  // video-specific
  hip_motion_emphasis?: number;  // twerk / grind / hip-thrust
  slow_sensual_motion?: number;  // slow pans, slow body movement
  repeated_erotic_motion?: number;
  motion_consistency?: number;   // higher = consistent erotic motion across frames

  // context flags (used to dampen false positives)
  is_sport_activity?: boolean;
  is_medical_or_educational?: boolean;
  is_fashion_runway?: boolean;
  is_minor_present?: boolean;    // any child / minor visible

  // category hint from the model
  scene_context?: string;        // "gym", "beach", "bedroom", "street", "studio", ...
}

export interface BehaviorScore {
  exposure: number;          // 0..1
  emphasis: number;          // 0..1 (body-part focus)
  clothing: number;          // 0..1
  pose: number;              // 0..1
  framing: number;           // 0..1 (camera intent)
  motion: number;            // 0..1 (video only)
  erotic_intent: number;     // fused 0..1
  triggers: string[];
  shouldBlock: boolean;
  reason: string;
}

function clamp(n: any, d = 0): number {
  const x = typeof n === "number" && isFinite(n) ? n : d;
  return Math.max(0, Math.min(1, x));
}

// ---------------- Modular detectors ----------------

export function exposureDetector(s: VisualSignals): number {
  return Math.max(
    clamp(s.skin_exposure),
    clamp(s.clothing_revealing) * 0.95,
    clamp(s.midriff_exposure) * 0.7,
    clamp(s.thigh_exposure) * 0.6,
  );
}

export function emphasisDetector(s: VisualSignals): number {
  return Math.max(
    clamp(s.cleavage_emphasis),
    clamp(s.buttocks_emphasis),
    clamp(s.crotch_emphasis),
  );
}

export function clothingDetector(s: VisualSignals): number {
  return Math.max(
    clamp(s.clothing_revealing),
    clamp(s.clothing_transparency) * 0.9,
    clamp(s.clothing_tightness) * 0.7,
  );
}

export function eroticPoseDetector(s: VisualSignals): number {
  let v = clamp(s.pose_suggestiveness);
  if (s.mirror_selfie && (clamp(s.clothing_revealing) > 0.3 || clamp(s.clothing_tightness) > 0.4)) {
    v = Math.max(v, 0.6);
  }
  return v;
}

export function visualFocusAnalyzer(s: VisualSignals): number {
  return clamp(s.camera_body_focus);
}

export function movementIntentEngine(s: VisualSignals): number {
  return Math.max(
    clamp(s.hip_motion_emphasis),
    clamp(s.slow_sensual_motion) * 0.8,
    clamp(s.repeated_erotic_motion) * 0.9,
  ) * (0.7 + 0.3 * clamp(s.motion_consistency, 0.5));
}

// ---------------- Contextual reasoning ----------------

function contextDampen(s: VisualSignals, base: number): { v: number; note?: string } {
  // Sport / fitness with no body emphasis → strong dampen
  if (s.is_sport_activity && clamp(s.camera_body_focus) < 0.5 && clamp(s.buttocks_emphasis) < 0.4) {
    return { v: base * 0.5, note: "sport-context" };
  }
  if (s.is_medical_or_educational) {
    return { v: base * 0.3, note: "medical-or-educational" };
  }
  if (s.is_fashion_runway && clamp(s.clothing_revealing) < 0.5) {
    return { v: base * 0.7, note: "fashion-runway" };
  }
  return { v: base };
}

// ---------------- Multi-factor scoring ----------------

export function scoreBehavior(signals: VisualSignals | undefined, kind: "image" | "video"): BehaviorScore {
  const s = signals ?? {};
  const exposure = exposureDetector(s);
  const emphasis = emphasisDetector(s);
  const clothing = clothingDetector(s);
  const pose = eroticPoseDetector(s);
  const framing = visualFocusAnalyzer(s);
  const motion = kind === "video" ? movementIntentEngine(s) : 0;

  // Weighted fusion — emphasis & framing matter more than raw exposure
  // because we want to catch "fully clothed but sexualized" content.
  const weights = kind === "video"
    ? { exposure: 0.18, emphasis: 0.22, clothing: 0.16, pose: 0.16, framing: 0.14, motion: 0.14 }
    : { exposure: 0.22, emphasis: 0.26, clothing: 0.20, pose: 0.18, framing: 0.14, motion: 0   };

  let fused =
    exposure * weights.exposure +
    emphasis * weights.emphasis +
    clothing * weights.clothing +
    pose     * weights.pose +
    framing  * weights.framing +
    motion   * weights.motion;

  // Synergy boost: emphasis + framing together = engineered arousal
  if (emphasis > 0.5 && framing > 0.5) fused = Math.min(1, fused + 0.1);
  if (kind === "video" && motion > 0.55 && emphasis > 0.45) fused = Math.min(1, fused + 0.1);

  const damp = contextDampen(s, fused);
  let erotic_intent = damp.v;

  // Minor present → escalate to maximum, never approve
  if (s.is_minor_present && (exposure > 0.2 || emphasis > 0.2 || clothing > 0.2 || pose > 0.2)) {
    erotic_intent = 1;
  }

  const triggers: string[] = [];
  if (exposure  >= 0.5) triggers.push("exposure");
  if (emphasis  >= 0.45) triggers.push("body-emphasis");
  if (clothing  >= 0.5) triggers.push("revealing-clothing");
  if (pose      >= 0.5) triggers.push("suggestive-pose");
  if (framing   >= 0.5) triggers.push("camera-body-focus");
  if (motion    >= 0.5) triggers.push("eroticized-motion");
  if (s.mirror_selfie) triggers.push("mirror-selfie");
  if (s.is_minor_present) triggers.push("minor-present");
  if (damp.note) triggers.push(`ctx:${damp.note}`);

  // Threshold: child-safe — block at 0.42 unless sport/medical dampening pushed it down
  const threshold = 0.42;
  const shouldBlock = erotic_intent >= threshold;
  const reason = shouldBlock
    ? `Erotic intent ${erotic_intent.toFixed(2)} ≥ ${threshold} (${triggers.join(", ") || "fused"})`
    : `Erotic intent ${erotic_intent.toFixed(2)} < ${threshold}`;

  return {
    exposure, emphasis, clothing, pose, framing, motion,
    erotic_intent, triggers, shouldBlock, reason,
  };
}

// Pull visual signals out of whatever shape the model returned.
// Supports flat fields, nested visual_signals/behavior objects.
export function extractVisualSignals(analysis: any): VisualSignals {
  const src = analysis?.visual_signals ?? analysis?.behavior ?? analysis ?? {};
  return {
    skin_exposure:           src.skin_exposure,
    cleavage_emphasis:       src.cleavage_emphasis,
    midriff_exposure:        src.midriff_exposure,
    buttocks_emphasis:       src.buttocks_emphasis,
    crotch_emphasis:         src.crotch_emphasis,
    thigh_exposure:          src.thigh_exposure,
    clothing_tightness:      src.clothing_tightness,
    clothing_transparency:   src.clothing_transparency,
    clothing_revealing:      src.clothing_revealing,
    pose_suggestiveness:     src.pose_suggestiveness,
    camera_body_focus:       src.camera_body_focus,
    mirror_selfie:           !!src.mirror_selfie,
    hip_motion_emphasis:     src.hip_motion_emphasis,
    slow_sensual_motion:     src.slow_sensual_motion,
    repeated_erotic_motion:  src.repeated_erotic_motion,
    motion_consistency:      src.motion_consistency,
    is_sport_activity:       !!src.is_sport_activity,
    is_medical_or_educational: !!src.is_medical_or_educational,
    is_fashion_runway:       !!src.is_fashion_runway,
    is_minor_present:        !!src.is_minor_present,
    scene_context:           src.scene_context,
  };
}
