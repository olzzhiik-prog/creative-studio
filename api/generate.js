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

  if (mode === "usp_improve") {
    if (!usp) return res.status(400).json({ error: "Впишите своё УТП, чтобы его улучшить" });
  } else if (!product) {
    return res.status(400).json({ error: "Опишите продукт (поле product)" });
  }

  try {
    // ---------- Улучшить готовое УТП ----------
    if (mode === "usp_improve") {
      const p = `Вот черновик УТП: "${usp}". Улучши его — дай 3 более сильных, продающих варианта на русском, СОХРАНИВ исходный смысл. Каждый — одна ёмкая фраза до 12 слов. Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown и пояснений.`;
      const arr = parseJson(await geminiText(key, p));
      return res.status(200).json({ options: Array.isArray(arr) ? arr.slice(0, 3) : [] });
    }

    // ---------- УТП ----------
    if (mode === "usp") {
      const p = `На основе описания продукта предложи 3 коротких сильных варианта УТП на русском.
Описание: "${product}".
Каждое УТП — одна ёмкая фраза до 12 слов, конкретное и убедительное.
Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown и пояснений.`;
      const arr = parseJson(await geminiText(key, p));
      return res.status(200).json({ options: Array.isArray(arr) ? arr.slice(0, 3) : [] });
    }

    // ---------- Креативы ----------
    const copyPrompt = `Ты — элитный перформанс-маркетолог и арт-директор рекламы для соцсетей.

Продукт/услуга: ${product}
УТП: ${usp || "не указано — выведи сам из продукта"}
Целевая аудитория: ${audience || "не указана — определи сам"}
Площадка: ${platform} (вертикальный контент, сторис/reels)

${usp ? `КЛЮЧЕВОЕ ТРЕБОВАНИЕ: заголовок (headline) и текст (primary_text) КАЖДОГО креатива должны прямо доносить это УТП — "${usp}". Не подменяй его другим смыслом. В одном из двух заголовков отрази суть УТП почти дословно.` : ""}

Сгенерируй РОВНО 2 рекламных креатива под разные маркетинговые углы${usp ? ", но оба раскрывают указанное УТП" : ""}.
Верни ТОЛЬКО валидный JSON-массив, без markdown и пояснений. Формат элемента:
{
 "angle": "краткое название угла на русском",
 "headline": "цепляющий заголовок до 7 слов",
 "primary_text": "текст объявления 2-3 коротких предложения",
 "cta": "призыв к действию 2-4 слова",
 "bg_prompt": "детальный промпт ФОНА на английском для AI-генератора. Это должна быть ПРЕМИАЛЬНАЯ рекламная фотография высокого качества: профессиональный свет, кинематографичная глубина, чёткий фокус, дорогая атмосфера, релевантная продукту сцена или фактура. Один сильный визуальный центр. Подбери цветовую гамму, гармоничную с брендом, и оставь верхний-левый угол спокойным/однотонным под логотип. ВАЖНО: на фоне НЕ должно быть никакого текста, букв, цифр, логотипов и кнопок (текст наложим отдельно). Нижнюю треть, верх и правый край оставь спокойными/затемнёнными для читаемости наложенного текста.",
 "palette": {"bg": "#hex тёмный фон", "fg": "#hex светлый контрастный текст", "accent": "#hex яркий акцент"}
}`;

    const concepts = parseJson(await geminiText(key, copyPrompt));
    const list = Array.isArray(concepts) ? concepts.slice(0, 2) : [];

    // Фон через ИИ — только если включено (иначе фронт рисует градиент бесплатно).
    if (process.env.USE_AI_IMAGES === "true") {
      await Promise.all(
        list.map(async (c) => {
          try {
            // Один фон 9:16 на концепт; формат 1:1 фронт получает кропом по центру (дешевле и быстрее).
            c.bg = await geminiImage(key, c.bg_prompt + " Vertical 9:16 composition.", "9:16");
          } catch (e) {
            c.bg = null;
            c.bgError = String(e.message || e);
          }
        })
      );
    } else {
      list.forEach((c) => (c.bg = null));
    }

    return res.status(200).json({ concepts: list });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
