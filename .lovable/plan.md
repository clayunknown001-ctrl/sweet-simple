# Adaptive Context-Aware Moderation Engine

Refactor existing `analyze-text`, `analyze-image`, `analyze-video` edge functions into a layered moderation pipeline with memory + feedback. No browser/architecture rewrite.

## 1. New shared module: `supabase/functions/_shared/moderation/`
- `context-engine.ts` — builds context object (page category, surrounding text, intent hints, prior signals)
- `pipeline.ts` — 4 stages: fast-filter → context-validate → AI-reason → decide
- `confidence.ts` — weighted fusion (NSFW model score, AI verdict, keyword hits, history bias), thresholds per category
- `thresholds.ts` — adaptive thresholds loaded from DB, updated by feedback
- `prompts.ts` — strict reasoning prompt: emphasize intent/severity, list explicit non-block examples (cars, gym, swimsuit ads, edu, fashion)
- `memory.ts` — read/write moderation_history + false_positive corrections

## 2. DB tables (Lovable Cloud)
- `moderation_decisions` (id, content_hash, type, url, category, verdict, confidence, stages jsonb, created_at)
- `moderation_feedback` (id, decision_id, kind: wrong_block|missed_harm, note, created_at)
- `moderation_thresholds` (category pk, block_threshold, warn_threshold, updated_at)
- `moderation_patterns` (id, pattern, label: safe|harmful, weight, hits)

All RLS: public insert feedback, read own; service role full.

## 3. Pipeline stages
1. **Fast**: hash lookup in `moderation_decisions` + cheap keyword/NSFW score → if clearly safe (score<0.2 + no flags) short-circuit allow; if clearly extreme (>0.95 + multi-flag) short-circuit block.
2. **Context validate**: classify page/content category (vehicle, fitness, education, fashion, entertainment, adult, violence…). Adjust weights — e.g. swimsuit + fashion category lowers sexual weight.
3. **AI reason**: single Gemini call with structured Output schema {intent, severity 0-1, category, reasoning, recommended_action, confidence}. Prompt forbids blocking benign categories without explicit harmful intent.
4. **Decide**: fuse scores using `confidence.ts`; compare to adaptive threshold; produce verdict allow|warn|block + reason + confidence.

## 4. Feedback loop
- New endpoint `supabase/functions/moderation-feedback/index.ts` accepts {decision_id, kind, note}.
- Updates `moderation_patterns` weights (decrease for false positives, increase for missed harm).
- Recomputes category threshold (EMA) into `moderation_thresholds`.

## 5. Frontend
- Add small "Wrong decision?" button on Text/Image/Video result cards → calls feedback function.
- Show confidence % and category in result badge.
- No layout overhaul.

## 6. Orchestration
- Multi-key fallback already exists (Gemini/OpenRouter/Groq). Use them for fusion: if Gemini block confidence <0.7, query OpenRouter (Llama) as second opinion; majority + weighted average decides.

## 7. Performance
- Hash short-circuit avoids re-analysis.
- Stage 1 runs locally (no AI call) for clearly safe.
- Stage 3 only when stage 1+2 uncertain.

## Files to add/modify
- ADD: `supabase/functions/_shared/moderation/*` (6 files above)
- ADD: `supabase/functions/moderation-feedback/index.ts` + config.toml entry
- MODIFY: `analyze-text/index.ts`, `analyze-image/index.ts`, `analyze-video/index.ts` → delegate to `pipeline.run(input, kind)`
- MODIFY: `src/pages/TextAnalysis.tsx`, `ImageAnalysis.tsx`, `VideoAnalysis.tsx` → add feedback button + confidence display
- MIGRATION: 4 new tables + RLS + seed default thresholds

Proceed?
