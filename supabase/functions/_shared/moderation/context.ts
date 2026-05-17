// Context engine: classify content into a high-level category from analysis output.
// Used by gate.ts to decide whether to soften or harden the moderation verdict.

export type ContentCategory =
  | "vehicle"
  | "fitness"
  | "education"
  | "fashion"
  | "product"
  | "scenery"
  | "food"
  | "family"
  | "news"
  | "tech"
  | "entertainment"
  | "social-bait"
  | "adult"
  | "violence"
  | "drugs"
  | "hate"
  | "scam"
  | "selfharm"
  | "neutral";

// Categories considered SAFE by default — never block unless explicit harmful signal
const SAFE_CATEGORIES: ContentCategory[] = [
  "vehicle", "fitness", "education", "product", "scenery",
  "food", "family", "news", "tech", "entertainment",
];

const PATTERNS: Array<{ cat: ContentCategory; rx: RegExp }> = [
  { cat: "vehicle", rx: /\b(car|auto|bmw|mercedes|toyota|ferrari|engine|motor|vehicle|truck|bike|motorcycle|tesla|driving|garage|wheel|moshina|avto)\b/i },
  { cat: "fitness", rx: /\b(gym|workout|fitness|exercise|training|squat|deadlift|yoga|crossfit|bodybuild|cardio|sport|athlet|sportzal|mashq)\b/i },
  { cat: "education", rx: /\b(tutorial|lesson|lecture|course|study|school|university|math|physics|chemistry|programming|code|learn|how.?to|dars|ta'lim|o'qish|maktab)\b/i },
  { cat: "fashion", rx: /\b(fashion|model|runway|outfit|clothing|dress|wear|brand|style|moda|kiyim)\b/i },
  { cat: "product", rx: /\b(product|item|sale|buy|shop|store|ecommerce|catalog|mahsulot|sotuv)\b/i },
  { cat: "scenery", rx: /\b(landscape|mountain|forest|beach|sky|sunset|nature|river|ocean|tabiat|manzara)\b/i },
  { cat: "food", rx: /\b(food|recipe|cook|kitchen|restaurant|cuisine|meal|dish|ovqat|taom)\b/i },
  { cat: "family", rx: /\b(family|child|kid|baby|wedding|parent|oila|bola|to'y)\b/i },
  { cat: "news", rx: /\b(news|report|journalist|press|politic|election|government|yangilik|siyosat)\b/i },
  { cat: "tech", rx: /\b(software|app|tech|ui|ux|api|server|database|code|gadget|phone|computer|laptop)\b/i },
  { cat: "entertainment", rx: /\b(movie|film|music|game|gaming|concert|stream|youtube|tiktok|comedy|meme)\b/i },
  // harmful signals
  { cat: "adult", rx: /\b(nud|porn|genital|nipple|sex(ual)?|penetrat|hentai|erotic|onlyfans|thirst|lingerie|fetish|cum|orgasm)\b/i },
  { cat: "violence", rx: /\b(gore|blood|wound|corpse|behead|kill|murder|massacre|execution|torture)\b/i },
  { cat: "drugs", rx: /\b(cocain|heroin|meth|crack|syringe|needle.*arm)\b/i },
  { cat: "hate", rx: /\b(swastika|kkk|nazi|slur|racial.?slur|ethnic.?hate)\b/i },
  { cat: "selfharm", rx: /\b(suicide|self.?harm|cutting|hanging)\b/i },
  { cat: "scam", rx: /\b(scam|phish|fraud|fake.?giveaway|crypto.?giveaway)\b/i },
  { cat: "social-bait", rx: /\b(thirst.?trap|onlyfans|bait|clickbait|ragebait)\b/i },
];

export interface ContextSignals {
  category: ContentCategory;
  isSafeCategory: boolean;
  harmfulSignals: ContentCategory[];
  rawText: string;
}

// Extract a single descriptive string from any analyze-* response shape
function extractText(analysis: any, rawInput?: string): string {
  const parts: string[] = [];
  if (rawInput) parts.push(rawInput);
  for (const k of ["description", "summary", "scene_type", "content_type", "mood", "category", "tone", "speech_summary"]) {
    if (typeof analysis?.[k] === "string") parts.push(analysis[k]);
  }
  for (const k of ["objects", "tags", "topics", "actions", "key_entities"]) {
    if (Array.isArray(analysis?.[k])) parts.push(analysis[k].join(" "));
  }
  if (Array.isArray(analysis?.harmful_content?.categories)) parts.push(analysis.harmful_content.categories.join(" "));
  if (typeof analysis?.harmful_content?.details === "string") parts.push(analysis.harmful_content.details);
  if (typeof analysis?.block_reason === "string") parts.push(analysis.block_reason);
  return parts.join(" ").toLowerCase();
}

export function analyzeContext(analysis: any, rawInput?: string): ContextSignals {
  const text = extractText(analysis, rawInput);
  const matched: ContentCategory[] = [];
  for (const { cat, rx } of PATTERNS) if (rx.test(text)) matched.push(cat);

  const harmful = matched.filter((c) =>
    ["adult", "violence", "drugs", "hate", "selfharm", "scam", "social-bait"].includes(c)
  );
  // Pick the strongest non-harmful category, prefer safe ones
  const safe = matched.find((c) => SAFE_CATEGORIES.includes(c)) ?? "neutral";
  const category: ContentCategory = harmful[0] ?? safe;

  return {
    category,
    isSafeCategory: SAFE_CATEGORIES.includes(category) && harmful.length === 0,
    harmfulSignals: harmful,
    rawText: text.slice(0, 500),
  };
}

export function isHardHarmfulSignal(signals: ContextSignals): boolean {
  return signals.harmfulSignals.some((c) =>
    ["adult", "violence", "drugs", "selfharm", "hate"].includes(c)
  );
}
