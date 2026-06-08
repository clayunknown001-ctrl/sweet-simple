# PROJECT_CONTEXT.md

## Project Name
Safe Internet AI Ecosystem

## Goal
AI-powered browser and filtering ecosystem that blocks harmful content while allowing useful and educational content.

## Current Stack
- Electron browser
- React frontend
- Supabase backend
- Real-time monitoring
- AI moderation system

## Current Features
- Pornographic website blocking
- Harmful image detection
- Harmful video detection (partial)
- Real-time user content monitoring
- Browser prototype

## Rules
- Keep architecture modular
- Avoid unnecessary dependencies
- Prioritize performance
- Do not rewrite working systems unless necessary
- Keep responses short
- Ask before major refactors

## AI Behavior Rules
- Responses max 2 lines unless explanation requested
- Start implementation immediately
- Do not overexplain
- Only report:
  - completed
  - error
  - need user action
- If terminal/user action required, state it briefly

## Current Priority
1. Stable harmful-content detection
2. Browser performance
3. UI cleanup
4. Realtime moderation optimization

## Long-Term Vision
- AI safety ecosystem
- Secure browser
- Custom Android/Linux-based OS
---

## CRITICAL RULE — Selective Blocking (Harmful-Only)

New blocking/filtering features apply **only** to confirmed harmful content.
Safe/normal content must keep working exactly as before — no blur, no
click interception, no URL/thumbnail rewrite.

- Harmful → fully block: hide, prevent click, prevent opening URL/image,
  prevent right-click bypass.
- Safe/unknown-safe → pass through untouched.
- False positives on ordinary videos/images/pages are regressions.

Applies to: extension (`monitor.js`, `content.js`), `SafeNetGuard`,
edge functions (`analyze-image`, `analyze-video`, `analyze-text`,
`moderation-feedback`), OS agent, and all future modules.

Every AI assistant (any model, any session) must follow this rule.
