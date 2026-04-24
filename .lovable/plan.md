

## Reja: Google AI Studio bilan tekin AI radar

### Maqsad
Lovable AI Gateway (kredit talab qiladi) o'rniga **Google AI Studio'ning bepul Gemini API'siga** to'g'ridan-to'g'ri ulanish. Natija: kuniga 15,000 bepul rasm tahlili, kreditsiz.

### Foydalanuvchi qadami (1 marta, 2 daqiqa)
1. `https://aistudio.google.com/apikey` ga kiring (Google account bilan)
2. **"Create API Key"** bosing → kalit nusxa oling
3. Menga bering — men Lovable Cloud secret sifatida saqlayman: `GEMINI_API_KEY`

### Texnik o'zgarishlar

**1. `supabase/functions/analyze-image/index.ts` — ikki provayderli (dual-provider) qiling**
   - Avval `GEMINI_API_KEY` (Google AI Studio) orqali urinib ko'radi → bepul
   - Agar mavjud bo'lmasa yoki 429/quota xatosi qaytsa → `LOVABLE_API_KEY` (Lovable Gateway) ga fallback
   - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`
   - `fast: true` rejimida `gemini-2.5-flash-lite` (15K/kun bepul)
   - `fast: false` rejimida `gemini-2.5-flash` (1.5K/kun bepul, sifatli)
   - 4-bosqichli neyropsixologik reasoning prompt o'zgarmaydi
   - Tool calling formatini Google API formatiga moslash (`functionDeclarations`, `function_call`)

**2. `supabase/functions/analyze-video/index.ts` — xuddi shunday yangilash**
   - Videoning kadrlarini bir xil dual-provider mantiq bilan tahlil qilish

**3. `public/extension/content.js` va `public/monitor.js`**
   - O'zgarishsiz — ular Edge Function'ga so'rov yuboradi, qaysi provayder ishlatilgani backend ichida hal qilinadi
   - `aiDisabled` flag faqat ikkala provayder ham yiqilganda yoqiladi

**4. `public/ai-radar-extension.zip` — qayta paketlash**

### Xavfsizlik va cheklovlar
- `GEMINI_API_KEY` faqat Edge Function ichida ishlatiladi (clientga chiqmaydi)
- Rate limit kuzatuv: agar 429 kelsa, avtomatik Lovable Gateway'ga o'tadi
- Bepul kvota: Flash-Lite 15K/kun, Flash 1.5K/kun — radar uchun yetarli

### Test rejasi
Implementatsiyadan so'ng:
1. `curl_edge_functions` orqali `analyze-image` ni test qilish (bikini.jpg URL bilan)
2. `should_block: true` qaytishini tasdiqlash
3. Lovable kreditga tegmaganini Edge Function loglarida tekshirish

### Foydalanuvchi keyingi qadami
Faqat **bitta narsa kerak**: Google AI Studio API kalitini olib menga bering. Boshqa hech narsa shart emas — karta, billing, tekshiruv yo'q.

