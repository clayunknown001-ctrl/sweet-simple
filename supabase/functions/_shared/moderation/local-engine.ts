// =============================================================================
// LOCAL INTELLIGENCE LAYER — 100% offline moderation engine.
// Zero external API calls. Deterministic. Fast. Production-grade.
//
// This file is the SOLE moderation brain after all external AI providers
// (Groq / OpenRouter / Google AI Studio / Gemini / Lovable Gateway) were removed.
//
// Pipelines:
//   - analyzeTextLocal()  → reasons over text (URLs, captions, page text)
//   - analyzeUrlLocal()   → reasons over a URL (domain + path + query + filename)
//   - analyzeImageLocal() → combines URL + alt/title/context to score an image
//   - analyzeVideoLocal() → combines URL + title/context to score a video
//   - buildLocalTextAnalysis() / Image / Video → produce the response object
//     in the same JSON shape the UI/extension already consumes.
//
// Visual pixel analysis is handled CLIENT-SIDE by the bundled NSFWJS model
// in public/extension/nsfw-loader.js — that runs in the user's browser/extension
// and never leaves the device.
// =============================================================================

import { analyzeContext } from "./context.ts";

export type LocalVerdict = "safe" | "uncertain" | "harmful";

export interface LocalResult {
  verdict: LocalVerdict;
  confidence: number;       // 0..1
  signals: string[];
  category: string;
  shouldBlock: boolean;
  severity: "none" | "low" | "medium" | "high" | "critical";
}

// ============================ PATTERN BANK ===================================
// Tuned for English + Russian + Uzbek transliteration.

// HARD explicit / illegal — auto-block at high confidence
const ILLEGAL_RX = /\b(child.{0,5}(porn|sex|abuse)|cp|csam|pedo(phil)?|loli(con)?|shota|underage.{0,5}(sex|nude)|jailbait)\b/i;

const SEVERE_HARM_RX = /\b(suicide.{0,5}method|kill.{0,5}yourself|kys|how.{0,5}to.{0,5}(suicide|hang|kill|overdose)|behead(ing)?|massacre|terror.{0,5}attack|bomb.{0,15}(making|recipe|instruction)|school.{0,5}shoot)\b/i;

const EXPLICIT_RX = /\b(porn|pornhub|xvideos|xnxx|xhamster|youporn|redtube|brazzers|onlyfans|chaturbate|stripchat|spankbang|tnaflix|cam4|livejasmin|myfreecams|hentai|rule34|e621|nhentai|sex(ual)?|nude|nudes|naked|topless|sexy|erotic|erotica|fetish|kink|bdsm|blowjob|handjob|deepthroat|anal|incest|gangbang|threesome|orgy|orgasm|cum(shot|ming)?|jizz|sperm|ejaculat|penetrat|fuck(ing|ed|er)?|pussy|vagina|clit(oris)?|penis|dick|cock|boobs?|tits|nipple|areola|genital|masturbat|fap|nsfw|xxx|18\+|porno|seks|porn(ografi[ya]|ushki)?)\b/i;

const SUGGESTIVE_RX = /\b(lingerie|underwear|thong|bikini|swimsuit|swimwear|micro.?skirt|crop.?top|see.?through|transparent|tight|bodycon|yoga.?pants|leggings|booty|butt|ass|cleavage|midriff|thirst.?trap|thirsty|sexy|hot.?girl|hot.?guy|sensual|seductive|provocative|revealing|risque|spicy|naughty|kinky|striptease|pole.?dance|twerk(ing)?|grind(ing)?|hump(ing)?|cosplay|tiktok.?challenge|hot|baddie|thicc|curvy)\b/i;

const HATE_RX = /\b(nigg(er|a)|chink|spic|kike|faggot|tranny|retard|swastika|heil.?hitler|white.?power|14\/88|kkk|nazi|sieg.?heil)\b/i;

const VIOLENCE_RX = /\b(gore|gory|blood(y)?|wound|corpse|dead.?body|murder|massacre|torture|behead|execution|lynch|stab(bing)?|shoot(ing|er)?|gun.?down|killed|brutal)\b/i;

const DRUGS_RX = /\b(cocaine|heroin|meth(amphetamine)?|crack|fentanyl|crystal.?meth|inject.{0,5}drug|smoke.{0,5}(crack|meth)|drug.?deal)\b/i;

const SCAM_RX = /\b(scam|phish(ing)?|fraud|fake.?giveaway|crypto.?giveaway|wire.?transfer.?nigeria|prince|lottery.?winner|click.?here.?to.?claim)\b/i;

const SELFHARM_RX = /\b(self.?harm|cutting.?myself|wrist.?cut|hang.?myself|overdose.{0,5}pills|end.?my.?life)\b/i;

const MILD_PROFANITY_RX = /\b(damn|hell|shit|crap|wtf|stfu|bloody|piss(ed)?)\b/i;

const SAFE_INTENT_RX = /\b(hello|hi|hey|thanks|thank.?you|please|good.?morning|good.?night|how.?are.?you|salom|rahmat|привет|спасибо|news|tutorial|how.?to|recipe|lesson|review|update|release|version|launch|documentation|api|guide|manual|education|study|learn|school|university|college|course|science|math|physics|chemistry|biology|history|geography|programming|developer)\b/i;

// =========================== DOMAIN BANK =====================================

const UNSAFE_DOMAIN_RX = /\b(pornhub|xvideos|xnxx|xhamster|redtube|youporn|onlyfans|chaturbate|stripchat|brazzers|hentai\w*|rule34|e621|nhentai|spankbang|tnaflix|cam4|livejasmin|myfreecams|fapello|erome|motherless|hclips|porn\.com|sex\.com|adult\w*\.tube|nudostar|thothub|fapachi|coomer|kemono\.party)\b/i;

const ADULT_HINT_DOMAIN_RX = /(porn|xxx|adult|nsfw|nude|sex|18plus|escort|cam(girl|boy)?s?|fetish)/i;

const SAFE_DOMAIN_RX = /\b(youtube\.com|youtu\.be|wikipedia\.org|github\.com|stackoverflow\.com|google\.com|bing\.com|duckduckgo\.com|microsoft\.com|apple\.com|coursera\.org|udemy\.com|khanacademy\.org|w3schools\.com|developer\.mozilla\.org|mdn\.io|npmjs\.com|docs\.\w+|gov\.\w+|edu\.\w+)\b/i;

// =========================== SCORING =========================================

interface Score {
  illegal: number;
  explicit: number;
  suggestive: number;
  hate: number;
  violence: number;
  drugs: number;
  scam: number;
  selfharm: number;
  safe: number;
}

function emptyScore(): Score {
  return { illegal: 0, explicit: 0, suggestive: 0, hate: 0, violence: 0, drugs: 0, scam: 0, selfharm: 0, safe: 0 };
}

function scoreText(text: string, weight = 1): Score {
  const s = emptyScore();
  if (!text) return s;
  if (ILLEGAL_RX.test(text)) s.illegal += 1 * weight;
  if (SEVERE_HARM_RX.test(text)) s.selfharm += 1 * weight;
  if (EXPLICIT_RX.test(text)) s.explicit += 1 * weight;
  if (SUGGESTIVE_RX.test(text)) s.suggestive += 0.7 * weight;
  if (HATE_RX.test(text)) s.hate += 1 * weight;
  if (VIOLENCE_RX.test(text)) s.violence += 0.8 * weight;
  if (DRUGS_RX.test(text)) s.drugs += 0.9 * weight;
  if (SCAM_RX.test(text)) s.scam += 0.7 * weight;
  if (SELFHARM_RX.test(text)) s.selfharm += 1 * weight;
  if (SAFE_INTENT_RX.test(text)) s.safe += 0.5 * weight;
  return s;
}

function mergeScore(a: Score, b: Score): Score {
  return {
    illegal: Math.max(a.illegal, b.illegal),
    explicit: Math.max(a.explicit, b.explicit),
    suggestive: Math.max(a.suggestive, b.suggestive),
    hate: Math.max(a.hate, b.hate),
    violence: Math.max(a.violence, b.violence),
    drugs: Math.max(a.drugs, b.drugs),
    scam: Math.max(a.scam, b.scam),
    selfharm: Math.max(a.selfharm, b.selfharm),
    safe: a.safe + b.safe,
  };
}

function decide(score: Score): LocalResult {
  const signals: string[] = [];
  let category = "neutral";
  let severity: LocalResult["severity"] = "none";
  let confidence = 0;
  let shouldBlock = false;

  if (score.illegal >= 0.9) {
    signals.push("illegal-content");
    category = "illegal"; severity = "critical"; confidence = 0.99; shouldBlock = true;
  } else if (score.selfharm >= 0.9) {
    signals.push("severe-harm");
    category = "selfharm"; severity = "critical"; confidence = 0.95; shouldBlock = true;
  } else if (score.explicit >= 0.9) {
    signals.push("explicit-content");
    category = "adult"; severity = "high"; confidence = 0.9; shouldBlock = true;
  } else if (score.hate >= 0.9) {
    signals.push("hate-speech");
    category = "hate"; severity = "high"; confidence = 0.9; shouldBlock = true;
  } else if (score.violence >= 0.8) {
    signals.push("violence");
    category = "violence"; severity = "high"; confidence = 0.85; shouldBlock = true;
  } else if (score.drugs >= 0.9) {
    signals.push("drugs");
    category = "drugs"; severity = "medium"; confidence = 0.8; shouldBlock = true;
  } else if (score.suggestive >= 0.7 && score.safe < 0.5) {
    // Suggestive without strong safe-intent → warn / soft block
    signals.push("suggestive-content");
    category = "adult"; severity = "medium"; confidence = 0.72; shouldBlock = true;
  } else if (score.scam >= 0.7) {
    signals.push("scam");
    category = "scam"; severity = "medium"; confidence = 0.75; shouldBlock = true;
  } else if (score.safe >= 0.5) {
    signals.push("safe-intent");
    category = "neutral"; severity = "none"; confidence = 0.85; shouldBlock = false;
  } else {
    signals.push("no-strong-signal");
    category = "neutral"; severity = "none"; confidence = 0.5; shouldBlock = false;
  }

  return {
    verdict: shouldBlock ? "harmful" : (confidence >= 0.75 ? "safe" : "uncertain"),
    confidence, signals, category, shouldBlock, severity,
  };
}

// ============================ PUBLIC API =====================================

export function analyzeTextLocal(text: string): LocalResult {
  const t = (text || "").trim();
  if (!t) {
    return { verdict: "safe", confidence: 1, signals: ["empty"], category: "neutral", shouldBlock: false, severity: "none" };
  }
  if (t.length <= 3) {
    return { verdict: "safe", confidence: 1, signals: ["trivial-length"], category: "neutral", shouldBlock: false, severity: "none" };
  }
  const ctx = analyzeContext({}, t);
  const score = scoreText(t, 1);
  // Safe context bonus (vehicle/fitness/education/etc.)
  if (ctx.isSafeCategory) score.safe += 0.4;
  const res = decide(score);
  if (MILD_PROFANITY_RX.test(t) && !res.shouldBlock) res.signals.push("mild-profanity");
  return res;
}

export function analyzeUrlLocal(url?: string): LocalResult {
  const u = (url || "").toLowerCase();
  if (!u) return { verdict: "uncertain", confidence: 0.3, signals: ["no-url"], category: "neutral", shouldBlock: false, severity: "none" };

  if (UNSAFE_DOMAIN_RX.test(u)) {
    return { verdict: "harmful", confidence: 0.97, signals: ["unsafe-domain"], category: "adult", shouldBlock: true, severity: "critical" };
  }
  if (SAFE_DOMAIN_RX.test(u)) {
    // Even on safe domains, an explicit search query should still warn
    const score = scoreText(u, 0.8);
    if (score.illegal || score.explicit >= 0.9 || score.selfharm >= 0.9) {
      const d = decide(score);
      d.signals.push("explicit-on-safe-domain");
      return d;
    }
    return { verdict: "safe", confidence: 0.85, signals: ["safe-domain"], category: "tech", shouldBlock: false, severity: "none" };
  }
  if (ADULT_HINT_DOMAIN_RX.test(u)) {
    return { verdict: "harmful", confidence: 0.85, signals: ["adult-hint-domain"], category: "adult", shouldBlock: true, severity: "high" };
  }
  // Score URL path/query as text
  const score = scoreText(u.replace(/[/?&=._-]/g, " "), 0.9);
  const res = decide(score);
  if (!res.shouldBlock && res.confidence < 0.6) res.signals.push("unknown-domain");
  return res;
}

// Combined analysis used by analyze-image edge function.
// Inputs: optional URL, optional caption/alt/title/page context, optional client-side NSFW probabilities.
export function analyzeImageLocal(opts: {
  url?: string;
  caption?: string;        // alt / title / surrounding text from page
  pageUrl?: string;
  nsfw_probs?: { porn?: number; hentai?: number; sexy?: number; neutral?: number; drawing?: number };
}): LocalResult {
  let score = emptyScore();
  score = mergeScore(score, scoreText(opts.url ?? "", 0.9));
  score = mergeScore(score, scoreText(opts.caption ?? "", 1));
  score = mergeScore(score, scoreText(opts.pageUrl ?? "", 0.7));

  const urlRes = analyzeUrlLocal(opts.url);
  if (urlRes.shouldBlock) {
    if (urlRes.signals.includes("unsafe-domain")) score.explicit = Math.max(score.explicit, 1);
    if (urlRes.signals.includes("adult-hint-domain")) score.explicit = Math.max(score.explicit, 0.9);
  }
  const pageRes = analyzeUrlLocal(opts.pageUrl);
  if (pageRes.shouldBlock && pageRes.signals.includes("unsafe-domain")) {
    score.explicit = Math.max(score.explicit, 0.95);
  }

  // Client-supplied NSFW model probabilities (e.g. from nsfw-loader.js / NSFWJS)
  if (opts.nsfw_probs) {
    const p = opts.nsfw_probs;
    if ((p.porn ?? 0) >= 0.6 || (p.hentai ?? 0) >= 0.6) score.explicit = Math.max(score.explicit, 1);
    else if ((p.porn ?? 0) >= 0.35 || (p.hentai ?? 0) >= 0.35) score.explicit = Math.max(score.explicit, 0.9);
    if ((p.sexy ?? 0) >= 0.6) score.suggestive = Math.max(score.suggestive, 0.85);
    else if ((p.sexy ?? 0) >= 0.4) score.suggestive = Math.max(score.suggestive, 0.7);
  }

  return decide(score);
}

export function analyzeVideoLocal(opts: {
  url?: string;
  title?: string;
  description?: string;
  pageUrl?: string;
  nsfw_probs?: { porn?: number; hentai?: number; sexy?: number };
  frame_signals?: { explicit_frames?: number; sexy_frames?: number; total_frames?: number };
}): LocalResult {
  let score = emptyScore();
  score = mergeScore(score, scoreText(opts.url ?? "", 0.9));
  score = mergeScore(score, scoreText(opts.title ?? "", 1));
  score = mergeScore(score, scoreText(opts.description ?? "", 0.8));
  score = mergeScore(score, scoreText(opts.pageUrl ?? "", 0.7));

  const urlRes = analyzeUrlLocal(opts.url);
  if (urlRes.shouldBlock && urlRes.signals.includes("unsafe-domain")) score.explicit = Math.max(score.explicit, 1);
  const pageRes = analyzeUrlLocal(opts.pageUrl);
  if (pageRes.shouldBlock && pageRes.signals.includes("unsafe-domain")) score.explicit = Math.max(score.explicit, 0.95);

  if (opts.nsfw_probs) {
    const p = opts.nsfw_probs;
    if ((p.porn ?? 0) >= 0.5 || (p.hentai ?? 0) >= 0.5) score.explicit = Math.max(score.explicit, 1);
    if ((p.sexy ?? 0) >= 0.5) score.suggestive = Math.max(score.suggestive, 0.85);
  }
  if (opts.frame_signals?.total_frames && opts.frame_signals.total_frames > 0) {
    const ratio = (opts.frame_signals.explicit_frames ?? 0) / opts.frame_signals.total_frames;
    if (ratio >= 0.15) score.explicit = Math.max(score.explicit, 1);
    const sexyRatio = (opts.frame_signals.sexy_frames ?? 0) / opts.frame_signals.total_frames;
    if (sexyRatio >= 0.3) score.suggestive = Math.max(score.suggestive, 0.85);
  }

  return decide(score);
}

// ============================ RESPONSE BUILDERS ==============================
// Same shape as previous external-AI responses so the UI doesn't need changes.

export function buildLocalTextAnalysis(text: string, language: string): any {
  const local = analyzeTextLocal(text);
  return {
    summary: local.shouldBlock
      ? `Local engine: ${local.category} content detected`
      : "Local engine: content appears safe",
    language,
    sentiment: "neutral",
    sentiment_score: 0,
    topics: [],
    word_count: text.trim().split(/\s+/).filter(Boolean).length,
    reading_time_minutes: Math.max(0.1, text.length / 1000),
    content_type: local.category,
    tone: "neutral",
    key_entities: [],
    harmful_content: {
      is_harmful: local.shouldBlock,
      severity: local.severity,
      categories: local.shouldBlock ? [local.category] : [],
      details: local.signals.join(", "),
      flagged_phrases: [],
    },
    should_block: local.shouldBlock,
    block_reason: local.shouldBlock ? `Local engine: ${local.signals.join(", ")}` : "",
    confidence: local.confidence,
    _local_only: true,
    _signals: local.signals,
  };
}

export function buildLocalImageAnalysis(opts: Parameters<typeof analyzeImageLocal>[0]): any {
  const local = analyzeImageLocal(opts);
  return {
    description: local.shouldBlock
      ? `Local engine flagged image as ${local.category}`
      : "Local engine: image appears safe (URL/context heuristic)",
    objects: [],
    scene_type: local.category,
    mood: "neutral",
    colors: [],
    text_in_image: opts.caption ?? "",
    nsfw_probability: local.shouldBlock ? Math.max(0.85, local.confidence) : Math.min(0.15, 1 - local.confidence),
    harmful_content: {
      is_harmful: local.shouldBlock,
      severity: local.severity,
      categories: local.shouldBlock ? [local.category] : [],
      details: local.signals.join(", "),
    },
    visual_signals: {
      skin_exposure: 0, cleavage_emphasis: 0, midriff_exposure: 0,
      buttocks_emphasis: 0, crotch_emphasis: 0, thigh_exposure: 0,
      clothing_tightness: 0, clothing_transparency: 0, clothing_revealing: 0,
      pose_suggestiveness: 0, camera_body_focus: 0,
      mirror_selfie: false, is_sport_activity: false,
      is_medical_or_educational: false, is_fashion_runway: false,
      is_minor_present: false, scene_context: local.category,
    },
    should_block: local.shouldBlock,
    block_reason: local.shouldBlock ? `Local engine: ${local.signals.join(", ")}` : "",
    confidence: local.confidence,
    _local_only: true,
    _signals: local.signals,
  };
}

export function buildLocalVideoAnalysis(opts: Parameters<typeof analyzeVideoLocal>[0]): any {
  const local = analyzeVideoLocal(opts);
  return {
    description: local.shouldBlock
      ? `Local engine flagged video as ${local.category}`
      : "Local engine: video appears safe (URL/title heuristic)",
    duration_estimate: "unknown",
    scene_type: local.category,
    actions: [],
    objects: [],
    speech_summary: opts.description ?? "",
    mood: "neutral",
    nsfw_probability: local.shouldBlock ? Math.max(0.85, local.confidence) : Math.min(0.15, 1 - local.confidence),
    harmful_content: {
      is_harmful: local.shouldBlock,
      severity: local.severity,
      categories: local.shouldBlock ? [local.category] : [],
      details: local.signals.join(", "),
    },
    visual_signals: {
      skin_exposure: 0, cleavage_emphasis: 0, midriff_exposure: 0,
      buttocks_emphasis: 0, crotch_emphasis: 0, thigh_exposure: 0,
      clothing_tightness: 0, clothing_transparency: 0, clothing_revealing: 0,
      pose_suggestiveness: 0, camera_body_focus: 0,
      hip_motion_emphasis: 0, slow_sensual_motion: 0,
      repeated_erotic_motion: 0, motion_consistency: 0,
      mirror_selfie: false, is_sport_activity: false,
      is_medical_or_educational: false, is_fashion_runway: false,
      is_minor_present: false, scene_context: local.category,
    },
    should_block: local.shouldBlock,
    block_reason: local.shouldBlock ? `Local engine: ${local.signals.join(", ")}` : "",
    confidence: local.confidence,
    _local_only: true,
    _signals: local.signals,
  };
}

// Back-compat aliases (older imports)
export const buildEmergencyTextAnalysis = buildLocalTextAnalysis;
export const buildEmergencyImageAnalysis = (url?: string) => buildLocalImageAnalysis({ url });
export const buildEmergencyVideoAnalysis = (url?: string) => buildLocalVideoAnalysis({ url });
