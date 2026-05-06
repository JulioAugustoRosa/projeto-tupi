import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pollinationsUrl(prompt: string, w = 400, h = 400): string {
  const augmented = `${prompt}, simple line drawing, cartoon style, white background, no text, educational illustration for children`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(augmented)}?width=${w}&height=${h}&nologo=true`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const sharedCSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: white; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    padding: 8mm;
  }
  .page {
    width: 100%;
    border: 3px dashed #000;
    border-radius: 14px;
    padding: 8mm 10mm 14mm;
    min-height: 277mm;
    position: relative;
    page-break-after: always;
  }
  .header {
    border: 2px dashed #000;
    border-radius: 9999px;
    padding: 4mm 8mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12pt;
    margin-bottom: 6mm;
    background: white;
  }
  .header .field { display: flex; align-items: center; gap: 2mm; }
  .header .line { display: inline-block; min-width: 50mm; border-bottom: 1px solid #000; height: 5mm; }
  .header .small-line { display: inline-block; min-width: 7mm; border-bottom: 1px solid #000; height: 5mm; }
  .title-h1 {
    text-align: center;
    font-size: 18pt;
    font-weight: 900;
    margin: 0 0 4mm;
    letter-spacing: 1px;
  }
  .section {
    padding: 5mm 0 6mm;
    border-bottom: 2px dashed #999;
    page-break-inside: avoid;
  }
  .section:last-of-type { border-bottom: none; }
  .instruction {
    font-size: 14pt;
    font-style: italic;
    margin-bottom: 4mm;
    color: #1a1a1a;
  }
  .row { display: flex; align-items: center; gap: 12mm; }
  .col-grow { flex: 1; min-width: 0; }
  .word-huge {
    font-size: 56pt;
    font-weight: 900;
    letter-spacing: 4px;
    line-height: 1.05;
    font-family: 'Helvetica', Arial, sans-serif;
  }
  .word-big {
    font-size: 36pt;
    font-weight: 900;
    letter-spacing: 3px;
    line-height: 1.1;
  }
  .word-med { font-size: 22pt; font-weight: 900; letter-spacing: 2px; }
  .empty-box {
    display: inline-block;
    border: 2.5px solid #000;
    border-radius: 6px;
    background: white;
    vertical-align: middle;
  }
  .empty-box.lg { width: 36mm; height: 18mm; }
  .empty-box.md { width: 24mm; height: 14mm; }
  .empty-box.sm { width: 16mm; height: 10mm; }
  .illu { flex-shrink: 0; }
  .illu.lg { width: 50mm; height: 50mm; }
  .illu.md { width: 35mm; height: 35mm; }
  .illu img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .copy-line {
    border-bottom: 2px solid #888;
    height: 11mm;
    margin-bottom: 3mm;
  }
  .footer {
    position: absolute;
    bottom: 4mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 8pt;
    color: #888;
  }
  .num-circle {
    display: inline-block;
    width: 9mm;
    height: 9mm;
    line-height: 9mm;
    border-radius: 50%;
    background: #4F46E5;
    color: white;
    text-align: center;
    font-weight: 900;
    font-size: 12pt;
    margin-right: 3mm;
    vertical-align: middle;
  }
`;

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<style>${sharedCSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function header(): string {
  return `
  <div class="header">
    <div class="field">Nome: <span class="line"></span></div>
    <div class="field">Data: <span class="small-line"></span>/<span class="small-line"></span>/<span class="small-line"></span></div>
  </div>`;
}

function footer(): string {
  return `<div class="footer">Gerado por TUPI · Tecnologia Universal para Práticas da Inclusão</div>`;
}

// ============ Tipo 1: Alfabetização silábica ============
interface SilabicaData {
  palavra: string;
  silabas: string[];
  imagem_prompt: string;
}

function renderSilabica(d: SilabicaData): string {
  const palavra = d.palavra.toUpperCase();
  const silabas = d.silabas.map((s) => s.toUpperCase());
  const imgUrl = pollinationsUrl(d.imagem_prompt, 400, 400);

  // Sílabas separadas por espaços largos para "Leia"
  const silabasSeparadas = silabas.join("&nbsp;&nbsp;&nbsp;");

  // "Complete" — uma linha esconde a primeira sílaba, outra linha esconde a última
  const linha1Complete = `<span class="empty-box lg"></span>${silabas
    .slice(1)
    .map((s) => `&nbsp;&nbsp;<span>${escapeHtml(s)}</span>`)
    .join("")}`;
  const linha2Complete = `${silabas
    .slice(0, -1)
    .map((s) => `<span>${escapeHtml(s)}</span>&nbsp;&nbsp;`)
    .join("")}<span class="empty-box lg"></span>`;

  // "Copie" — palavra inteira + cada sílaba, cada um com caixinha
  const copieCells = [
    `<div style="text-align:center;"><div class="word-big">${escapeHtml(palavra)}</div><div class="empty-box lg" style="margin-top:3mm; width:50mm; height:20mm;"></div></div>`,
    ...silabas.map(
      (s) =>
        `<div style="text-align:center;"><div class="word-big">${escapeHtml(s)}</div><div class="empty-box lg" style="margin-top:3mm; width:30mm; height:20mm;"></div></div>`,
    ),
  ].join("");

  return htmlPage(
    `Atividade — ${palavra}`,
    `
<div class="page">
  ${header()}

  <div class="section">
    <div class="instruction">Leia.</div>
    <div class="row">
      <div class="col-grow">
        <div class="word-huge">${escapeHtml(palavra)}</div>
        <div class="word-huge" style="margin-top: 5mm;">${silabasSeparadas}</div>
      </div>
      <div class="illu lg"><img src="${imgUrl}" alt="${escapeHtml(palavra)}" /></div>
    </div>
  </div>

  <div class="section">
    <div class="instruction">Complete com a sílaba que falta.</div>
    <div class="row">
      <div class="col-grow">
        <div class="word-huge" style="display:flex; align-items:center; gap:0;">${linha1Complete}</div>
        <div class="word-huge" style="display:flex; align-items:center; gap:0; margin-top:5mm;">${linha2Complete}</div>
      </div>
      <div class="illu lg"><img src="${imgUrl}" alt="${escapeHtml(palavra)}" /></div>
    </div>
  </div>

  <div class="section">
    <div class="instruction">Copie.</div>
    <div style="display:flex; gap:6mm; align-items:flex-start; flex-wrap:wrap;">${copieCells}</div>
  </div>

  ${footer()}
</div>`,
  );
}

// ============ Tipo 2: Completar lacuna ============
interface CompletarLacunaData {
  titulo?: string;
  exercicios: { frase: string; resposta?: string; imagem_prompt?: string }[];
}

function renderCompletarLacuna(d: CompletarLacunaData): string {
  const title = d.titulo ?? "Complete as frases";
  const items = d.exercicios
    .map((ex, i) => {
      const fraseHtml = escapeHtml(ex.frase).replace(
        /_+/g,
        '<span class="empty-box md" style="margin: 0 2mm;"></span>',
      );
      const img = ex.imagem_prompt
        ? `<div class="illu md"><img src="${pollinationsUrl(ex.imagem_prompt, 300, 300)}" alt="" /></div>`
        : "";
      return `
    <div class="section">
      <div class="row">
        <div class="col-grow" style="font-size:18pt; line-height:1.8; font-weight:600;">
          <span class="num-circle">${i + 1}</span>${fraseHtml}
        </div>
        ${img}
      </div>
    </div>`;
    })
    .join("");

  return htmlPage(
    title,
    `
<div class="page">
  ${header()}
  <h1 class="title-h1">${escapeHtml(title)}</h1>
  <div class="instruction" style="text-align:center;">Complete cada frase escrevendo nos quadradinhos.</div>
  ${items}
  ${footer()}
</div>`,
  );
}

// ============ Tipo 3: Ligar palavra à imagem ============
interface LigarPalavraImagemData {
  titulo?: string;
  pares: { palavra: string; imagem_prompt: string }[];
}

function renderLigarPalavraImagem(d: LigarPalavraImagemData): string {
  const title = d.titulo ?? "Ligue cada palavra à imagem";
  // Embaralhar imagens (rotação simples)
  const palavras = d.pares.map((p) => p.palavra.toUpperCase());
  const imgs =
    d.pares.length > 1 ? d.pares.slice(1).concat(d.pares[0]) : d.pares.slice();

  const rows = palavras
    .map(
      (palavra, i) => `
    <div class="row" style="margin: 5mm 0; padding: 4mm 0; border-bottom: 1.5px dashed #ccc;">
      <div style="flex: 1.5;">
        <div class="word-med">${escapeHtml(palavra)}</div>
      </div>
      <div style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 2mm;">
        <span style="font-size: 18pt; color: #666;">○</span>
        <span style="border-top: 2px dashed #aaa; flex: 1;"></span>
        <span style="font-size: 18pt; color: #666;">○</span>
      </div>
      <div class="illu md">
        <img src="${pollinationsUrl(imgs[i].imagem_prompt, 300, 300)}" alt="${escapeHtml(imgs[i].palavra)}" />
      </div>
    </div>`,
    )
    .join("");

  return htmlPage(
    title,
    `
<div class="page">
  ${header()}
  <h1 class="title-h1">${escapeHtml(title)}</h1>
  <div class="instruction" style="text-align:center;">Desenhe uma linha ligando cada palavra à imagem correspondente.</div>
  ${rows}
  ${footer()}
</div>`,
  );
}

// ============ Tipo 4: Cópia / Repetição ============
interface CopieData {
  titulo?: string;
  itens: { palavra: string; imagem_prompt?: string; linhas?: number }[];
}

function renderCopie(d: CopieData): string {
  const title = d.titulo ?? "Copie as palavras";
  const sections = d.itens
    .map((item) => {
      const linhas = item.linhas ?? 2;
      const img = item.imagem_prompt
        ? `<div class="illu md"><img src="${pollinationsUrl(item.imagem_prompt, 300, 300)}" alt="" /></div>`
        : "";
      const copyLines = Array(linhas).fill('<div class="copy-line"></div>').join("");
      return `
    <div class="section">
      <div class="row" style="align-items:flex-start;">
        ${img}
        <div class="col-grow">
          <div class="word-big" style="margin-bottom:5mm;">${escapeHtml(item.palavra.toUpperCase())}</div>
          ${copyLines}
        </div>
      </div>
    </div>`;
    })
    .join("");

  return htmlPage(
    title,
    `
<div class="page">
  ${header()}
  <h1 class="title-h1">${escapeHtml(title)}</h1>
  <div class="instruction" style="text-align:center;">Observe e copie as palavras nas linhas.</div>
  ${sections}
  ${footer()}
</div>`,
  );
}

// ============ HTTP Handler ============
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const data = await req.json();
    const { type } = data;

    let html: string;
    switch (type) {
      case "silabica":
        html = renderSilabica(data);
        break;
      case "completar_lacuna":
        html = renderCompletarLacuna(data);
        break;
      case "ligar_palavra_imagem":
        html = renderLigarPalavraImagem(data);
        break;
      case "copie":
        html = renderCopie(data);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Tipo desconhecido: ${type}. Use silabica, completar_lacuna, ligar_palavra_imagem, copie.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    console.error("render-worksheet error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro ao renderizar worksheet" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
