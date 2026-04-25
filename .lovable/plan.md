
# Reja: AI Radar MVP — Hybrid (Lokal + Cloud) Tizim

## Tahliliy xulosa (xolisona)

| Savol | Javob |
|---|---|
| Google AI Studio tekin? | ❌ Faqat 20 so'rov/kun (2025-da qisqartirilgan) |
| O'z AI'ni qurish? | ❌ MVP uchun emas (6-12 oy, juda qimmat) |
| Lokal model ishlatish? | ✅ Tekin, cheksiz, 80% aniqlik |
| OS'ga ulash? | ⚠️ MVP'da Android fork yo'q, lekin Windows/Linux tray app + extension yetarli |
| Lovable kredit yetadimi? | ✅ Bitta sessiyada (bugun) tugatamiz |

## Yechim arxitekturasi: 3 qatlamli (tekin + tez + aniq)

```
┌─────────────────────────────────────────────────────┐
│ Qatlam 1: WHITELIST/BLACKLIST (0ms, tekin)         │
│ - Wikipedia, YouTube, GitHub, .edu → o'tkaz        │
│ - Pornhub, xvideos → darhol blok                    │
├─────────────────────────────────────────────────────┤
│ Qatlam 2: LOKAL AI (50-200ms, tekin, cheksiz)      │
│ - NSFWJS (TensorFlow.js, browser ichida)           │
│ - Hash cache (oldin ko'rilgan rasmlar)             │
│ - Skin-tone + face detection                       │
│ → 80% holatlarda aniq qaror chiqaradi              │
├─────────────────────────────────────────────────────┤
│ Qatlam 3: CLOUD AI (1-3s, kvota-cheklangan)        │
│ - Faqat shubhali (50-80% confidence) holatlarda    │
│ - Gemini Flash-Lite (Lovable Gateway)              │
│ - 4-bosqichli neyropsixologik reasoning            │
└─────────────────────────────────────────────────────┘
```

**Kutilayotgan natija**: 95% rasmlar lokal hal qilinadi → cloud chaqiruvlar 20x kamayadi → kreditingiz oylab yetadi.

---

## Vazifalar

### 1️⃣ Lokal NSFW Model qo'shish (eng muhim)
**Fayl**: `public/extension/content.js`, `public/monitor.js`
- **NSFWJS** kutubxonasini extensionga qo'shish (`@tensorflow/tfjs` + `nsfwjs`, ~5MB, 1 marta yuklanadi)
- 5 toifa qaytaradi: `Drawing, Hentai, Neutral, Porn, Sexy`
- Threshold: `Porn > 0.6 || Hentai > 0.6 || Sexy > 0.7` → **darhol blok**
- `Neutral > 0.85` → **darhol o'tkaz**
- Oraliq → cloud AI'ga yuborish
- Browser ichida ishlaydi → kreditga teginmaydi

### 2️⃣ Smart Cache + Whitelist + Blacklist
**Fayl**: `public/extension/content.js`
- **LocalStorage cache**: rasm URL hash → natija (7 kun saqlanadi)
- **Whitelist domains**: youtube.com, wikipedia.org, github.com, stackoverflow.com, .edu, .gov → AI'siz o'tkaz
- **Blacklist domains**: pornhub.com, xvideos.com, onlyfans.com → darhol blok (AI'siz)
- **Min size filter**: 150x150'dan kichik rasmlarni e'tiborsiz qoldirish (icons, avatars)

### 3️⃣ Cloud AI promptini muvozanatga keltirish
**Fayl**: `supabase/functions/analyze-image/index.ts`
- Hozirgi "1% shubha = blok" → BMW ham bloklanmoqda
- Yangi: **kontekstga asoslangan** qaror:
  - **Aniq blok**: nudity, underwear, sexual poses, violence, gore, weapons in action
  - **Aniq xavfsiz**: cars, food, nature, tech, clothed people in normal contexts
  - **Shubhali**: tight clothing in fitness context, dancing, beach photos → kontekstga qarab
- Behavioral reasoning saqlanadi, lekin "false positive"larni kamaytirish uchun balanced
- Sport/fitness/beach detection qo'shish (legitimate context'da bloklanmasin)

### 4️⃣ Bloklangan ikonkani ochib bo'lmaydigan qilish
**Fayl**: `public/extension/content.js`, `public/extension/shield.css`
- **Hozirgi muammo**: faqat blur, lekin click ishlaydi → video/rasm ochiladi
- **Yechim**:
  - `pointer-events: none` blok qatlamiga
  - Rasm/video elementining `src` ni `data-original-src` ga ko'chirish, asl `src` ni 1x1 transparent pixel qilish
  - Click event'larni `capture: true` bilan to'xtatish
  - Video uchun `pause()` + `removeAttribute('src')` + `load()`
  - Parent `<a>` tagidagi `href` ni vaqtincha o'chirish

### 5️⃣ Video tahlili kuchaytirish
**Fayl**: `supabase/functions/analyze-video/index.ts`, `public/extension/content.js`
- Lokal: video birinchi frame'ini canvas'ga chizib NSFWJS'dan o'tkazish (cloud'siz)
- Har 2 sekundda yangi frame tekshirish (faqat play bo'layotganda)
- Shubhali bo'lsa → cloud AI'ga 3 ta frame yuborish (boshi, o'rtasi, oxiri)
- Dancing/seductive movement detection: ketma-ket frame'larda pose o'zgarishini kuzatish

### 6️⃣ Behavioral reasoning kengaytirish
**Fayl**: `supabase/functions/analyze-image/index.ts`
Quyidagi kombinatsiyalarni promptga qo'shish:
- **Lust triggers**: cleavage angle, lip emphasis, eye contact + suggestive pose, "selfie in mirror" + minimal clothing
- **Dance/movement**: hip emphasis, slow-motion editing, camera pan on body parts
- **Profile photo red flags**: bikini in profile, suggestive caption + revealing photo
- **Dress observation**: see-through, body-hugging in non-fitness context, micro-skirts
- **Edge cases**: "art" nudity (still blok), "fitness" but seductive framing (blok), beach family photo (xavfsiz)

### 7️⃣ Matn tahlili (oddiy rasmlar bloklanish muammosi)
**Fayl**: `public/extension/content.js`
- **Muammo**: hozirgi tizim har bir rasmni AI'ga yuboradi, hatto BMW ham
- **Yechim**: 
  - Avval lokal model qaror chiqarsin
  - Cloud faqat 50-80% confidence oraliqida ishlasin
  - "BLOCK" qarori uchun `confidence > 0.75` shart bo'lsin (juda agressiv emas)

### 8️⃣ OS-ready arxitektura (kelajak uchun zamin)
**Yangi fayl**: `public/os-agent/README.md` + `public/os-agent/agent-protocol.json`
- Edge function'larni **standart REST API** sifatida hujjatlashtirish
- OS agent (Electron/Tauri/Rust) ekranni har 2 sekundda screenshot qilib API'ga yuboradi
- Bu bosqichda faqat **API spec va integration guide** yozamiz (real OS app keyingi bosqichda)
- Browser extension va kelajakdagi OS app **bir xil API'dan** foydalanadi

### 9️⃣ Extension qayta paketlash
**Fayl**: `public/ai-radar-extension.zip`
- NSFWJS qo'shilgan yangi versiya
- Manifest v3 yangilanishi (TensorFlow.js permissions)
- README yangilash (qanday o'rnatish)

### 🔟 Chuqur test va o'zim tanqid
Implementatsiyadan so'ng:
- 10 xil saytda test: Pinterest, Instagram, YouTube, DuckDuckGo, Wikipedia, Pornhub, Reddit, Twitter, TikTok, Google Images
- Edge case'lar: BMW (xavfsiz bo'lishi kerak), Anna Sedokova (blok), bolalar rasmi (xavfsiz), fitness video (kontekstga qarab)
- False positive rate va false negative rate o'lchash
- Topilgan xatolarni darhol tuzatish

---

## Kredit va vaqt baholash

| Bosqich | Xabarlar | Kredit |
|---|---|---|
| 1-2 (lokal model + cache/whitelist) | 1 katta xabar | ~0.3 |
| 3-4 (prompt + UI fix) | 1 katta xabar | ~0.2 |
| 5-6 (video + reasoning) | 1 xabar | ~0.2 |
| 7-9 (matn + OS spec + zip) | 1 xabar | ~0.2 |
| 10 (test + tuzatish) | 2-3 xabar | ~0.5 |
| **JAMI** | **6-7 xabar** | **~1.4 kredit** |

✅ **4 kreditingiz 2-3 marta to'liq qayta qilishga yetadi**

---

## Tashqi muammolar (oldindan ogohlantirish)

| Muammo | Yechim |
|---|---|
| NSFWJS modeli ~5MB, birinchi yuklanish sekin | CDN'dan yuklab cache'lash, 1 marta |
| TensorFlow.js extension Manifest v3'da cheklangan | Offscreen document API ishlatish |
| Ba'zi saytlar CSP'si tashqi script bloklaydi | Modelni extension ichiga packaging qilish |
| Lovable kredit tugashi | Lokal model 95% holatlarni hal qiladi → kredit oylab yetadi |
| OS-level monitoring uchun Electron app kerak | Bu bosqichda API spec yozamiz, real app keyingi MVP |

---

## Foydalanuvchidan kerakli narsa
**Hech narsa.** Boshlayman, bitta sessiyada tugataman, oxirida o'zim test qilib xatolarni tuzataman, sizga tayyor natija beraman.

