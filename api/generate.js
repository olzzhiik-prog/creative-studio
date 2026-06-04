// api/generate.js — серверная функция (Vercel). Ключ Gemini живёт ТОЛЬКО здесь.
// Делает три вещи:
//   mode: "usp"       -> 3 варианта УТП по описанию продукта
//   mode: "creatives" -> 2 концепта (текст + промпт фона) + сам фон (Nano Banana Pro)
//
// Переменные окружения (задаются в Vercel → Settings → Environment Variables):
//   GEMINI_API_KEY   — обязателен. Ключ из https://aistudio.google.com/apikey
//   USE_AI_IMAGES    — "true" чтобы рисовать фон через ИИ (платно ~$0.13/картинка),
//                      "false" (по умолчанию) — фон не генерится, фронт рисует градиент (бесплатно).
//   IMAGE_MODEL      — по умолчанию "gemini-3-pro-image-preview" (Nano Banana Pro).
//                      Для бесплатных тестов поставь "gemini-2.5-flash-image" (Nano Banana, есть free tier).
//   TEXT_MODEL       — по умолчанию "gemini-2.5-flash" (тексты, бесплатный тариф).

export const config = { maxDuration: 60 };

const GEN_URL = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return await new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
  });
}

// ---- Vercel KV (Upstash REST) для одноразовых кодов ----
async function kvGet(key) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) throw new Error("KV не подключён");
  const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${tok}` } });
  const d = await r.json();
  return d.result ?? null;
}
async function kvSet(key, val) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}`, { headers: { Authorization: `Bearer ${tok}` } });
}
function codeList() { return (process.env.ACCESS_CODES || "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean); }
function isMaster(code) { return !!process.env.MASTER_CODE && code === process.env.MASTER_CODE; }
async function checkCode(code) {
  if (!code) return { ok: false, reason: "Введите код доступа" };
  if (isMaster(code)) return { ok: true, master: true };
  if (!codeList().includes(code)) return { ok: false, reason: "Неверный код" };
  let used = false;
  try { used = !!(await kvGet("used:" + code)); } catch (e) { /* KV не настроен — пропускаем */ }
  if (used) return { ok: false, reason: "Этот код уже использован" };
  return { ok: true, master: false };
}

function parseJson(text) {
  const clean = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
  // вырезаем первый JSON-массив, если модель добавила лишний текст
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  const slice = start !== -1 && end !== -1 ? clean.slice(start, end + 1) : clean;
  return JSON.parse(slice);
}

async function geminiText(key, prompt) {
  const model = process.env.TEXT_MODEL || "gemini-2.5-flash";
  const r = await fetch(GEN_URL(model, key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!r.ok) throw new Error("text " + r.status + ": " + (await r.text()).slice(0, 300));
  const d = await r.json();
  const parts = d?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

// Фон через Nano Banana Pro. Возвращает data:image/...;base64,...
async function geminiImage(key, prompt, aspect) {
  const model = process.env.IMAGE_MODEL || "gemini-3-pro-image-preview";
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    // Если ответ придёт без картинки — поправь этот блок под актуальную доку Gemini Image.
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: aspect }, // "9:16" | "1:1"
    },
  };
  const r = await fetch(GEN_URL(model, key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("image " + r.status + ": " + (await r.text()).slice(0, 300));
  const d = await r.json();
  const parts = d?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error("в ответе нет изображения");
  return `data:${img.inlineData.mimeType || "image/png"};base64,${img.inlineData.data}`;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY не задан в настройках Vercel" });

  const body = await readBody(req);
  const mode = body.mode || "creatives";
  const product = (body.product || "").trim();
  const usp = (body.usp || "").trim();
  const audience = (body.audience || "").trim();
  const platform = body.platform || "Instagram";
  const code = (body.code || "").trim();

  try {
    // ---------- Проверка кода для экрана входа (без списания) ----------
    if (mode === "check_code") {
      return res.status(200).json(await checkCode(code));
    }

    // Все рабочие режимы требуют валидный код доступа
    const chk = await checkCode(code);
    if (!chk.ok) return res.status(403).json({ error: chk.reason });

    // ---------- Улучшить готовое УТП ----------
    if (mode === "usp_improve") {
      if (!usp) return res.status(400).json({ error: "Впишите своё УТП, чтобы его улучшить" });
      const p = `Вот черновик УТП: "${usp}". Улучши его — дай 3 более сильных, продающих варианта на русском, СОХРАНИВ исходный смысл. Каждый — одна ёмкая фраза до 12 слов. Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown и пояснений.`;
      const arr = parseJson(await geminiText(key, p));
      return res.status(200).json({ options: Array.isArray(arr) ? arr.slice(0, 3) : [] });
    }

    // ---------- УТП ----------
    if (mode === "usp") {
      if (!product) return res.status(400).json({ error: "Опишите продукт" });
      const p = `На основе описания продукта предложи 3 коротких сильных варианта УТП на русском.
Описание: "${product}".
Каждое УТП — одна ёмкая фраза до 12 слов, конкретное и убедительное.
Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown и пояснений.`;
      const arr = parseJson(await geminiText(key, p));
      return res.status(200).json({ options: Array.isArray(arr) ? arr.slice(0, 3) : [] });
    }

    // ---------- Креативы ----------
    if (!product) return res.status(400).json({ error: "Опишите продукт" });
    const useImg = process.env.USE_AI_IMAGES === "true";
    const N = 10;
    const fields = [
      ' "angle": "краткое название угла на русском"',
      ' "headline": "цепляющий заголовок до 7 слов"',
      ' "primary_text": "текст объявления 2-3 коротких предложения"',
      ' "cta": "призыв к действию 2-4 слова"',
      useImg ? ' "bg_prompt": "детальный промпт ФОНА на английском: премиальная рекламная фотография, профессиональный свет, кинематографичная глубина, чёткий фокус. Гамма гармонична с брендом, верхний-левый угол спокойный под логотип. БЕЗ текста, букв, цифр, логотипов и кнопок. Низ, верх и правый край спокойные/затемнённые."' : null,
      ' "palette": {"bg": "#hex тёмный фон", "fg": "#hex светлый контрастный текст", "accent": "#hex яркий акцент"}',
    ].filter(Boolean).join(",\n");

    const copyPrompt = `Ты — элитный перформанс-маркетолог и арт-директор рекламы для соцсетей.

Продукт/услуга: ${product}
УТП: ${usp || "не указано — выведи сам из продукта"}
Целевая аудитория: ${audience || "не указана — определи сам"}
Площадка: ${platform} (вертикальный контент, сторис/reels)
${usp ? `КЛЮЧЕВОЕ ТРЕБОВАНИЕ: заголовок и текст КАЖДОГО креатива должны прямо доносить УТП — "${usp}". В нескольких заголовках отрази суть УТП почти дословно.` : ""}

Сгенерируй РОВНО ${N} РАЗНЫХ рекламных креативов — каждый под свой маркетинговый угол (боль/решение, выгода, результат, эмоция, срочность, социальное доказательство, любопытство и т.д.). Заголовки НЕ должны повторяться.
Верни ТОЛЬКО валидный JSON-массив из ${N} элементов, без markdown и пояснений. Формат элемента:
{
${fields}
}`;

    const concepts = parseJson(await geminiText(key, copyPrompt));
    const list = Array.isArray(concepts) ? concepts.slice(0, N) : [];

    if (useImg) {
      await Promise.all(list.map(async (c) => {
        try { c.bg = await geminiImage(key, (c.bg_prompt || "premium advertising background") + " Vertical 9:16 composition.", "9:16"); }
        catch (e) { c.bg = null; c.bgError = String(e.message || e); }
      }));
    } else {
      list.forEach((c) => (c.bg = null));
    }

    // списываем код (мастер-код не сгорает)
    if (!chk.master) { try { await kvSet("used:" + code, String(Date.now())); } catch (e) {} }

    return res.status(200).json({ concepts: list, master: !!chk.master });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
