import React, { useState } from "react";

const PLATFORMS = ["Instagram", "TikTok"];

const FALLBACK = { bg: "#16161b", fg: "#f3f0e7", accent: "#d8ff3e" };

export default function AdCreativeGenerator() {
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [usp, setUsp] = useState("");
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creatives, setCreatives] = useState([]);
  const [copied, setCopied] = useState(null);
  const [logo, setLogo] = useState(null);
  const [productImg, setProductImg] = useState(null);
  const [uspLoading, setUspLoading] = useState(false);
  const [uspOptions, setUspOptions] = useState([]);

  async function genUsp() {
    if (!product.trim() || uspLoading) return;
    setUspLoading(true);
    setUspOptions([]);
    const p = `На основе описания продукта предложи 3 коротких, сильных варианта УТП (уникального торгового предложения) на русском. Описание: "${product.trim()}". Каждое УТП — одна ёмкая фраза до 12 слов, конкретное и убедительное, без воды. Верни ТОЛЬКО валидный JSON-массив из 3 строк, без markdown и пояснений. Пример: ["вариант 1", "вариант 2", "вариант 3"]`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: p }],
        }),
      });
      if (!res.ok) throw new Error("err");
      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const arr = JSON.parse(text.replace(/```json/g, "").replace(/```/g, "").trim());
      if (Array.isArray(arr)) setUspOptions(arr.slice(0, 3));
    } catch (e) {
      setError("Не удалось сгенерировать УТП — попробуй ещё раз.");
    } finally {
      setUspLoading(false);
    }
  }

  async function generate() {
    if (!product.trim() || loading) return;
    setLoading(true);
    setError("");
    setCreatives([]);

    const prompt = `Ты — элитный перформанс-маркетолог и арт-директор рекламы для соцсетей.

Продукт/услуга: ${product.trim()}
УТП (ключевое преимущество): ${usp.trim() || "не указано — выведи сам из продукта"}
Целевая аудитория: ${audience.trim() || "не указана — определи сам по продукту"}
Площадка: ${platform} (вертикальный контент, формат сторис/reels)

Сгенерируй РОВНО 2 рекламных креатива, каждый под свой маркетинговый угол (выбери 2 наиболее уместных из: боль→решение, выгода/результат, социальное доказательство, любопытство, срочность/дефицит).

Верни ТОЛЬКО валидный JSON-массив, без markdown, без пояснений, без текста до или после. Формат каждого элемента:
{
 "angle": "краткое название угла на русском",
 "headline": "цепляющий заголовок до 7 слов (текст, который ляжет НА картинку)",
 "primary_text": "текст объявления 2-3 коротких предложения, живой, без воды",
 "cta": "короткий призыв к действию, 2-4 слова",
 "image_prompt": "детальный промпт для AI-генератора изображений НА АНГЛИЙСКОМ: опиши сцену, ключевой объект по центру, стиль, композицию, освещение, настроение, цвета. ВАЖНО про безопасные зоны вертикали 9:16: оставь верхние ~12% и нижние ~20% и правые ~8% кадра спокойными/малодетальными (там платформа накладывает свой интерфейс — ник, подписи, кнопки лайков), а главный объект, заголовок и кнопку CTA размести строго в центральной безопасной зоне. Укажи, что на изображении крупным читаемым шрифтом размещён точный текст заголовка (приведи его дословно в кавычках на русском) и кнопка с текстом CTA. Стиль — современная реклама для Instagram и TikTok.",
 "palette": {"bg": "#hex насыщенный или тёмный фон", "fg": "#hex контрастный к фону текст", "accent": "#hex яркий акцент"}
}
Палитру подбери так, чтобы fg был читаем на bg.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) throw new Error("Сервис временно недоступен (" + res.status + ")");

      const data = await res.json();
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);

      if (!Array.isArray(parsed) || parsed.length === 0)
        throw new Error("Пустой ответ модели");

      setCreatives(parsed);
    } catch (e) {
      setError(
        "Не получилось сгенерировать: " +
          e.message +
          ". Попробуй ещё раз или переформулируй описание."
      );
    } finally {
      setLoading(false);
    }
  }

  function onLogo(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  }

  function onProductImg(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProductImg(reader.result);
    reader.readAsDataURL(file);
  }

  function copyStr(key, str) {
    try {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {
      try { navigator.clipboard.writeText(str); } catch (_) {}
    }
    setCopied(key);
    setTimeout(() => setCopied((p) => (p === key ? null : p)), 1600);
  }

  return (
    <div className="acg-root">
      <style>{CSS}</style>
      <div className="grain" />

      <div className="wrap">
        <header className="head">
          <h1>
            Креативная <span className="hl">студия</span>
          </h1>
          <p className="sub">
            Опиши продукт — получи готовые креативы под Instagram и TikTok по
            стандартам площадок: тексты, заголовки и AI-промпт для картинки в
            форматах 9:16 и 1:1 с учётом безопасных зон.
          </p>
        </header>

        <section className="panel">
          <label className="lbl">Что рекламируем?</label>
          <textarea
            className="ta"
            rows={3}
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Напр.: онлайн-курс английского для IT-специалистов, 3 месяца, разговорная практика с носителями, первый урок бесплатно"
          />

          <div className="row">
            <div className="field">
              <label className="lbl">Аудитория (необязательно)</label>
              <input
                className="inp"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Напр.: разработчики 25–40 лет, готовятся к работе в зарубежных компаниях"
              />
            </div>
          </div>

          <div className="field">
            <div className="lbl-row">
              <label className="lbl">УТП — чем вы лучше (необязательно)</label>
              <button
                className="mini"
                onClick={genUsp}
                disabled={!product.trim() || uspLoading}
                title={!product.trim() ? "Сначала опишите продукт" : ""}
              >
                {uspLoading ? "Генерирую…" : "✨ Сгенерить УТП"}
              </button>
            </div>
            <input
              className="inp"
              value={usp}
              onChange={(e) => setUsp(e.target.value)}
              placeholder="Напр.: первый результат за 2 недели, иначе вернём деньги"
            />
            {uspOptions.length > 0 && (
              <div className="usp-opts">
                <span className="usp-hint">Нажмите, чтобы выбрать:</span>
                {uspOptions.map((u, k) => (
                  <button key={k} className="usp-chip" onClick={() => setUsp(u)}>
                    {u}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label className="lbl">Площадка</label>
            <div className="seg">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  className={"seg-btn" + (platform === p ? " on" : "")}
                  onClick={() => setPlatform(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="lbl">Логотип (необязательно)</label>
            <div className="logo-row">
              <label className="logo-btn">
                {logo ? "Сменить логотип" : "Загрузить логотип"}
                <input type="file" accept="image/*" onChange={onLogo} hidden />
              </label>
              {logo && (
                <div className="logo-prev">
                  <img src={logo} alt="logo" />
                  <button className="logo-rm" onClick={() => setLogo(null)}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <label className="lbl">Фото товара (если рекламируете товар)</label>
            <div className="logo-row">
              <label className="logo-btn">
                {productImg ? "Сменить фото" : "Загрузить фото товара"}
                <input type="file" accept="image/*" onChange={onProductImg} hidden />
              </label>
              {productImg && (
                <div className="logo-prev">
                  <img src={productImg} alt="product" />
                  <button className="logo-rm" onClick={() => setProductImg(null)}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            className="go"
            onClick={generate}
            disabled={loading || !product.trim()}
          >
            {loading ? "Генерирую креативы…" : "Сгенерировать креативы →"}
          </button>
          {error && <div className="err">{error}</div>}
        </section>

        {loading && (
          <div className="skeleton-grid">
            {[0, 1].map((i) => (
              <div key={i} className="skel" style={{ animationDelay: i * 0.12 + "s" }} />
            ))}
          </div>
        )}

        {creatives.length > 0 && (
          <div className="grid">
            {creatives.map((c, i) => {
              const pal = { ...FALLBACK, ...(c.palette || {}) };
              return (
                <article
                  className="card"
                  key={i}
                  style={{ animationDelay: i * 0.09 + "s" }}
                >
                  <div className="mocks">
                    {["9:16", "1:1"].map((fmt) => (
                      <div
                        key={fmt}
                        className={"mock " + (fmt === "9:16" ? "v916" : "v11")}
                        style={{
                          background: `radial-gradient(120% 120% at 0% 0%, ${pal.accent}22, transparent 60%), linear-gradient(155deg, ${pal.bg}, ${shade(pal.bg, -18)})`,
                        }}
                      >
                        <span className="fmt-tag">{fmt}</span>
                        {fmt === "9:16" && (
                          <>
                            <div className="sz sz-top">
                              <span className="sz-l">профиль</span>
                            </div>
                            <div className="sz sz-bottom">
                              <span className="sz-l">подпись · кнопки</span>
                            </div>
                            <div className="sz sz-right" />
                          </>
                        )}
                        {fmt === "1:1" && <div className="sz-edge" />}
                        <div className="mock-top" style={{ color: pal.fg }}>
                          {logo ? (
                            <img className="logo-badge" src={logo} alt="" />
                          ) : (
                            <span className="dot" style={{ background: pal.accent }} />
                          )}
                          <span className="brand">ваш_бренд</span>
                        </div>
                        <div className="mock-mid">
                          <h2 className="mh" style={{ color: pal.fg }}>
                            {c.headline}
                          </h2>
                        </div>
                        <div className="mock-cta">
                          <span
                            className="cta-pill"
                            style={{ background: pal.accent, color: contrast(pal.accent) }}
                          >
                            {c.cta}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="body">
                    <span className="angle">{c.angle}</span>
                    <p className="ptext">{c.primary_text}</p>
                    <div className="visual">
                      <span className="vlabel">Промпт для AI-картинки → вставь в Gemini или ChatGPT</span>
                      {c.image_prompt}
                    </div>
                    <div className="btns">
                      <button
                        className="copy"
                        onClick={() => copyStr("p" + i, c.image_prompt)}
                      >
                        {copied === "p" + i ? "✓ Скопировано" : "Копировать промпт"}
                      </button>
                      <button
                        className="copy"
                        onClick={() =>
                          copyStr(
                            "t" + i,
                            c.headline + "\n\n" + c.primary_text + "\n\n👉 " + c.cta
                          )
                        }
                      >
                        {copied === "t" + i ? "✓ Скопировано" : "Копировать текст"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* затемнить/осветлить hex */
function shade(hex, amt) {
  try {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const num = parseInt(h, 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  } catch (e) {
    return hex;
  }
}

/* чёрный или белый текст для читаемости поверх цвета */
function contrast(hex) {
  try {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const num = parseInt(h, 16);
    const r = num >> 16, g = (num >> 8) & 0xff, b = num & 0xff;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#0b0b0c" : "#ffffff";
  } catch (e) {
    return "#0b0b0c";
  }
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:wght@400;500;600&display=swap');

.acg-root{
  --bg:#0b0b0c; --panel:#141417; --panel2:#1b1b1f; --line:#2a2a30;
  --ink:#f3f0e7; --dim:#97938a; --accent:#d8ff3e;
  position:relative; min-height:100%; background:
    radial-gradient(110% 80% at 100% 0%, #17170f 0%, transparent 55%),
    var(--bg);
  color:var(--ink); font-family:'Instrument Sans',sans-serif;
  padding:0; overflow-x:hidden;
}
.acg-root *{box-sizing:border-box;}
.grain{
  position:fixed; inset:0; pointer-events:none; opacity:.05; z-index:1;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.wrap{position:relative; z-index:2; max-width:1080px; margin:0 auto; padding:42px 22px 60px;}

.head{margin-bottom:30px;}
.badge{display:inline-block; font-size:11px; letter-spacing:.14em; text-transform:uppercase;
  color:#0b0b0c; background:var(--accent); padding:5px 11px; border-radius:100px; font-weight:600;}
.head h1{font-family:'Bricolage Grotesque',sans-serif; font-weight:800; font-size:clamp(34px,6vw,60px);
  line-height:.95; letter-spacing:-.02em; margin:16px 0 12px;}
.head .hl{color:var(--accent);}
.sub{color:var(--dim); max-width:560px; font-size:15.5px; line-height:1.5;}

.panel{background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:24px;
  box-shadow:0 24px 60px -30px #000;}
.lbl{display:block; font-size:12.5px; letter-spacing:.04em; text-transform:uppercase;
  color:var(--dim); font-weight:600; margin-bottom:8px;}
.ta,.inp{width:100%; background:var(--panel2); border:1px solid var(--line); border-radius:12px;
  color:var(--ink); padding:13px 14px; font:inherit; font-size:15px; resize:vertical; transition:.18s;}
.ta::placeholder,.inp::placeholder{color:#5f5c55;}
.ta:focus,.inp:focus{outline:none; border-color:var(--accent); box-shadow:0 0 0 3px #d8ff3e22;}
.row{margin-top:16px;} .field{margin-top:16px;}

.seg{display:flex; gap:8px; flex-wrap:wrap;}
.seg-btn{flex:1; min-width:120px; background:var(--panel2); border:1px solid var(--line);
  color:var(--dim); padding:11px 10px; border-radius:11px; font:inherit; font-weight:600; font-size:14px;
  cursor:pointer; transition:.16s;}
.seg-btn:hover{color:var(--ink); border-color:#3a3a42;}
.seg-btn.on{background:var(--ink); color:#0b0b0c; border-color:var(--ink);}

.go{margin-top:22px; width:100%; background:var(--accent); color:#0b0b0c; border:none;
  padding:16px; border-radius:13px; font-family:'Bricolage Grotesque',sans-serif; font-weight:700;
  font-size:17px; cursor:pointer; transition:.16s; letter-spacing:-.01em;}
.go:hover:not(:disabled){transform:translateY(-1px); box-shadow:0 14px 30px -12px #d8ff3e88;}
.go:disabled{opacity:.4; cursor:not-allowed;}
.err{margin-top:14px; color:#ff8b6b; font-size:14px; line-height:1.4;}

.grid,.skeleton-grid{display:grid; gap:18px; margin-top:30px;
  grid-template-columns:repeat(auto-fit,minmax(320px,1fr));}
.skel{height:430px; border-radius:18px; border:1px solid var(--line);
  background:linear-gradient(100deg,var(--panel) 30%,var(--panel2) 50%,var(--panel) 70%);
  background-size:200% 100%; animation:sh 1.3s ease-in-out infinite;}
@keyframes sh{to{background-position:-200% 0;}}

.card{border:1px solid var(--line); border-radius:18px; overflow:hidden; background:var(--panel);
  display:flex; flex-direction:column; opacity:0; transform:translateY(14px);
  animation:rise .5s cubic-bezier(.2,.7,.2,1) forwards;}
@keyframes rise{to{opacity:1; transform:none;}}

.mocks{display:flex; gap:12px; padding:16px; flex-wrap:wrap; align-items:flex-start; justify-content:center;
  background:radial-gradient(120% 100% at 50% 0%, #ffffff08, transparent 70%);}
.mock{position:relative; padding:13px; display:flex; flex-direction:column; border-radius:12px;
  overflow:hidden; box-shadow:0 10px 24px -14px #000;}
.mock.v916{width:148px; aspect-ratio:9/16;}
.mock.v11{width:224px; aspect-ratio:1/1;}
.fmt-tag{position:absolute; top:8px; right:8px; z-index:2; font-size:10px; font-weight:700;
  letter-spacing:.04em; background:rgba(0,0,0,.5); color:#fff; padding:2px 7px; border-radius:6px;}
.mock-top{display:flex; align-items:center; gap:7px; font-size:11px; opacity:.92; position:relative; z-index:2;}
.dot{width:20px; height:20px; border-radius:50%; flex:none;}
.brand{font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.mock-mid{flex:1; display:flex; align-items:center; padding:10px 0; position:relative; z-index:2;}
.mh{font-family:'Bricolage Grotesque',sans-serif; font-weight:800; line-height:1.05;
  letter-spacing:-.02em; margin:0;}
.v916 .mh{font-size:15px;}
.v11 .mh{font-size:21px;}
.mock-cta{margin-top:auto; position:relative; z-index:2;}
.v916 .mock-mid, .v916 .mock-cta{padding-right:9%;}
.v916 .mock-cta{margin-bottom:18%;}
.cta-pill{display:inline-block; padding:7px 13px; border-radius:100px; font-weight:700; font-size:12px;}

/* безопасные зоны площадок (куда ляжет интерфейс) */
.sz{position:absolute; z-index:1; pointer-events:none;
  background:repeating-linear-gradient(45deg, rgba(0,0,0,.16) 0 5px, rgba(0,0,0,.34) 5px 10px);}
.sz-top{top:0; left:0; right:0; height:12%; border-bottom:1px dashed rgba(255,255,255,.4);}
.sz-bottom{bottom:0; left:0; right:0; height:20%; border-top:1px dashed rgba(255,255,255,.4);}
.sz-right{top:12%; bottom:20%; right:0; width:9%; border-left:1px dashed rgba(255,255,255,.4);}
.sz-l{position:absolute; top:3px; left:4px; font-size:7px; letter-spacing:.02em; color:rgba(255,255,255,.85);
  background:rgba(0,0,0,.45); padding:1px 4px; border-radius:3px; white-space:nowrap;}
.sz-bottom .sz-l{top:auto; bottom:3px;}
.sz-edge{position:absolute; inset:6%; z-index:1; pointer-events:none;
  border:1px dashed rgba(255,255,255,.3); border-radius:7px;}
.sz-legend{display:flex; align-items:center; gap:7px; padding:0 16px 14px;
  font-size:11px; color:#6f6c64; line-height:1.4;}
.sz-swatch{flex:none; width:16px; height:16px; border-radius:4px;
  background:repeating-linear-gradient(45deg, rgba(255,255,255,.12) 0 4px, rgba(255,255,255,.3) 4px 8px);
  border:1px dashed rgba(255,255,255,.35);}

.body{padding:18px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:12px; flex:1;}
.angle{align-self:flex-start; font-size:11px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--accent); border:1px solid #d8ff3e44; padding:4px 9px; border-radius:6px; font-weight:600;}
.ptext{margin:0; font-size:15px; line-height:1.5; color:#dedbd2;}
.visual{font-size:13px; color:var(--dim); line-height:1.45; background:var(--panel2);
  border:1px solid var(--line); border-radius:10px; padding:11px 12px;}
.vlabel{display:block; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase;
  color:#6f6c64; margin-bottom:4px; font-weight:600;}
.btns{display:flex; gap:8px; margin-top:auto;}
.copy{flex:1; background:transparent; border:1px solid var(--line); color:var(--ink);
  padding:11px 8px; border-radius:10px; font:inherit; font-weight:600; font-size:13px; cursor:pointer; transition:.16s;}
.copy:hover{border-color:var(--accent); color:var(--accent);}

.lbl-row{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; flex-wrap:wrap;}
.lbl-row .lbl{margin-bottom:0;}
.mini{background:#d8ff3e1a; border:1px solid #d8ff3e55; color:var(--accent);
  padding:6px 11px; border-radius:8px; font:inherit; font-weight:600; font-size:12.5px; cursor:pointer; transition:.16s;}
.mini:hover:not(:disabled){background:#d8ff3e2e;}
.mini:disabled{opacity:.4; cursor:not-allowed;}
.usp-opts{display:flex; flex-direction:column; gap:7px; margin-top:10px;}
.usp-hint{font-size:11px; color:var(--dim); letter-spacing:.02em;}
.usp-chip{text-align:left; background:var(--panel2); border:1px solid var(--line); color:var(--ink);
  padding:10px 12px; border-radius:10px; font:inherit; font-size:13.5px; line-height:1.4; cursor:pointer; transition:.16s;}
.usp-chip:hover{border-color:var(--accent); color:var(--accent);}

.logo-row{display:flex; align-items:center; gap:12px; flex-wrap:wrap;}
.logo-btn{display:inline-flex; align-items:center; background:var(--panel2); border:1px dashed #3a3a42;
  color:var(--ink); padding:11px 16px; border-radius:11px; font-weight:600; font-size:14px; cursor:pointer; transition:.16s;}
.logo-btn:hover{border-color:var(--accent); color:var(--accent);}
.logo-prev{display:flex; align-items:center; gap:6px;}
.logo-prev img{height:38px; width:38px; object-fit:contain; border-radius:8px; background:#fff; padding:3px; border:1px solid var(--line);}
.logo-rm{background:transparent; border:1px solid var(--line); color:var(--dim); width:28px; height:28px;
  border-radius:7px; cursor:pointer; font-size:12px; line-height:1;}
.logo-rm:hover{color:#ff8b6b; border-color:#ff8b6b66;}
.logo-badge{height:26px; max-width:96px; object-fit:contain; border-radius:5px; background:rgba(255,255,255,.92); padding:2px 5px;}
.foot{margin-top:34px; text-align:center; color:#605d56; font-size:13px; line-height:1.5;}
`;
