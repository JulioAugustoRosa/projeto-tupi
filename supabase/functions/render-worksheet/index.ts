import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pollinationsUrl(prompt: string, w = 400, h = 400): string {
  // Estilo "desenho pra colorir" típico de material escolar brasileiro:
  // contorno preto, linhas grossas, sem sombreamento, fundo branco puro
  const augmented = `${prompt}, black and white coloring book line art, thick clean outlines, no shading, no color fill, no text, no letters, white background, simple childrens worksheet illustration, hand drawn style`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(augmented)}?width=${w}&height=${h}&nologo=true&model=flux`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const sharedCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@500;700;900&family=Nunito:wght@600;800;900&display=swap');
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: white; }
  body {
    font-family: 'Lexend', 'Nunito', 'Helvetica Neue', sans-serif;
    color: #000;
    padding: 6mm;
  }
  .page {
    width: 100%;
    border: 4px dashed #000;
    border-radius: 18px;
    padding: 9mm 11mm 16mm;
    min-height: 280mm;
    position: relative;
    page-break-after: always;
    background: white;
  }
  .header {
    border: 3px dashed #000;
    border-radius: 9999px;
    padding: 5mm 10mm;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13pt;
    font-weight: 700;
    margin-bottom: 8mm;
    background: white;
  }
  .header .field { display: flex; align-items: center; gap: 2mm; }
  .header .line { display: inline-block; min-width: 60mm; border-bottom: 2px solid #000; height: 6mm; }
  .header .small-line { display: inline-block; min-width: 8mm; border-bottom: 2px solid #000; height: 6mm; }
  .title-h1 {
    text-align: center;
    font-size: 22pt;
    font-weight: 900;
    margin: 0 0 5mm;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .section {
    padding: 6mm 0 8mm;
    border-bottom: 3px dashed #555;
    page-break-inside: avoid;
  }
  .section:last-of-type { border-bottom: none; }
  .instruction {
    font-size: 16pt;
    font-weight: 700;
    margin-bottom: 6mm;
    color: #000;
  }
  .row { display: flex; align-items: center; gap: 14mm; }
  .col-grow { flex: 1; min-width: 0; }
  .word-huge {
    font-size: 80pt;
    font-weight: 900;
    letter-spacing: 6px;
    line-height: 1.0;
    font-family: 'Lexend', 'Helvetica', Arial, sans-serif;
    color: #000;
  }
  .word-big {
    font-size: 48pt;
    font-weight: 900;
    letter-spacing: 4px;
    line-height: 1.05;
  }
  .word-med { font-size: 28pt; font-weight: 900; letter-spacing: 3px; }
  .empty-box {
    display: inline-block;
    border: 3px solid #000;
    border-radius: 10px;
    background: white;
    vertical-align: middle;
  }
  .empty-box.lg { width: 44mm; height: 24mm; }
  .empty-box.md { width: 30mm; height: 18mm; }
  .empty-box.sm { width: 20mm; height: 12mm; }
  .illu { flex-shrink: 0; }
  .illu.lg { width: 60mm; height: 60mm; }
  .illu.md { width: 42mm; height: 42mm; }
  .illu img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .copy-line {
    border-bottom: 2.5px solid #444;
    height: 13mm;
    margin-bottom: 3mm;
  }
  .footer {
    position: absolute;
    bottom: 5mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 9pt;
    color: #777;
    font-style: italic;
  }
  .num-circle {
    display: inline-block;
    width: 11mm;
    height: 11mm;
    line-height: 11mm;
    border-radius: 50%;
    background: #000;
    color: white;
    text-align: center;
    font-weight: 900;
    font-size: 14pt;
    margin-right: 4mm;
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
