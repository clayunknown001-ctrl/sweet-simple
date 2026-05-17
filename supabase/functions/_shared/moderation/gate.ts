// Context-aware moderation gate — post-processes raw AI analysis.
// Stages:
//   1. Fast filter:    obvious-safe short-circuit
//   2. Context check:  classify category, detect harmful signals
//   3. Confidence fuse: combine AI confidence with adaptive threshold
//   4. Decide:         allow | warn | block + reasoning

import { analyzeContext, isHardHarmfulSignal, type ContentCategory } from "./context.ts";
import { getThreshold } from "./memory.ts";

export interface GateInput {
  analysis: any;
  rawInput?: string;       // original text or descriptor (helps context detection)
  kind: "text" | "image" | "video";
  contentHash?: string;
}

export interface GateOutput {
  analysis: any;            // possibly mutated (should_block / harmful_content downgraded)
  verdict: "allow" | "warn" | "block";
  category: ContentCategory;
  confidence: number;
  threshold: number;
  reasoning: string;
  contentHash?: string;
}

export function runGate(input: GateInput): GateOutput {
  const a = { ...input.analysis };
  const ctx = analyzeContext(a, input.rawInput);
  const rawConf = typeof a.confidence === "number" ? a.confidence : 0.6;
  const threshold = getThreshold(ctx.category);

  // Adjust confidence: if model says block but category is clearly safe and
  // no harmful signals, dampen confidence heavily.
  let confidence = rawConf;
  if (ctx.isSafeCategory && a.should_block) {
    confidence = confidence * 0.5;
  }
  // If hard harmful signal present, give a small boost
  if (isHardHarmfulSignal(ctx)) {
    confidence = Math.min(1, confidence * 1.1 + 0.05);
  }

  const wantsBlock = !!a.should_block || !!a?.harmful_content?.is_harmful;
  let verdict: "allow" | "warn" | "block" = "allow";
  let reasoning = "";

  if (!wantsBlock) {
    verdict = "allow";
    reasoning = `Model approved (${ctx.category}).`;
  } else if (ctx.isSafeCategory && !isHardHarmfulSignal(ctx)) {
    // Safe category without harmful signal → override block, never punish benign content
    verdict = "allow";
    reasoning = `Context "${ctx.category}" is benign — block overridden.`;
    a.should_block = false;
    if (a.harmful_content) {
      a.harmful_content.is_harmful = false;
      a.harmful_content.severity = "none";
    }
    a.block_reason = reasoning;
  } else if (confidence >= threshold) {
    verdict = "block";
    reasoning = `Confidence ${confidence.toFixed(2)} ≥ threshold ${threshold.toFixed(2)} for ${ctx.category}.`;
    a.should_block = true;
  } else if (confidence >= threshold - 0.15) {
    verdict = "warn";
    reasoning = `Confidence ${confidence.toFixed(2)} in caution zone (threshold ${threshold.toFixed(2)}).`;
    a.should_block = false;
    a.block_reason = reasoning;
  } else {
    verdict = "allow";
    reasoning = `Confidence ${confidence.toFixed(2)} below threshold ${threshold.toFixed(2)} — approved.`;
    a.should_block = false;
    if (a.harmful_content) {
      a.harmful_content.is_harmful = false;
      a.harmful_content.severity = "none";
    }
    a.block_reason = reasoning;
  }

  return {
    analysis: { ...a, _gate: { verdict, category: ctx.category, confidence, threshold, reasoning } },
    verdict,
    category: ctx.category,
    confidence,
    threshold,
    reasoning,
    contentHash: input.contentHash,
  };
}
