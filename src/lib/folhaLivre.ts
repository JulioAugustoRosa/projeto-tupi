// Folha de atividade com layout livre.
//
// O modelo devolve um documento HTML desenhado do jeito que ele preferir. Aqui ele
// é limpo, isolado do CSS do app, dividido em páginas A4 e exportado.
//
// Regra da paginação: NADA encolhe. O conteúdo é renderizado no tamanho real
// (794px = largura do A4 a 96 dpi) e, quando não cabe numa página, continua na
// seguinte. O ponto de corte é escolhido para não partir uma linha de texto, uma
// imagem, uma linha de tabela nem um bloco pequeno (caixa de resposta, rótulo).
import DOMPurify from "dompurify";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Document, ImageRun, Packer, Paragraph } from "docx";

export interface FolhaLivre {
  titulo: string;
  html: string;
  aluno?: string;
  aviso_imagens?: string;
}

/** A4 a 96 dpi. */
export const LARGURA = 794;
export const ALTURA = 1123;
/** Margem de papel em cima e embaixo de cada página: a impressora não imprime na borda. */
const MARGEM = 34;
const ALTURA_UTIL = ALTURA - 2 * MARGEM;
/** Abaixo disto, um elemento é tratado como indivisível (caixa, rótulo, linha de resposta). */
const BLOCO_PEQUENO = 140;

const ESCOPO = "folha-livre";

// ---------------------------------------------------------------------------
// Limpeza e isolamento
// ---------------------------------------------------------------------------

const TAGS_PROIBIDAS = [
  "script", "style", "iframe", "object", "embed", "link", "meta", "base", "form",
  "input", "textarea", "select", "button", "frame", "frameset", "applet", "noscript",
  "template",
];

const urlInsegura = /url\(\s*(['"]?)(?!data:image\/)[^)]*\1\s*\)/gi;

function limparDeclaracoes(css: string): string {
  return css
    .replace(urlInsegura, "none")
    .replace(/position\s*:\s*fixed/gi, "position:absolute");
}

// Instância própria: os hooks não vazam para outros usos do DOMPurify no app.
const purify = DOMPurify(window);
purify.addHook("uponSanitizeAttribute", (_no, dado) => {
  const nome = dado.attrName.toLowerCase();
  if (nome === "src" || nome === "href" || nome === "xlink:href") {
    const v = dado.attrValue.trim();
    if (!/^data:image\//i.test(v) && !v.startsWith("#")) dado.keepAttr = false;
  }
  if (nome === "style") dado.attrValue = limparDeclaracoes(dado.attrValue);
});

/** Divide uma lista de seletores pelas vírgulas de primeiro nível. */
function dividirSeletores(lista: string): string[] {
  const out: string[] = [];
  let prof = 0, atual = "";
  for (const ch of lista) {
    if (ch === "(" || ch === "[") prof++;
    if (ch === ")" || ch === "]") prof--;
    if (ch === "," && prof === 0) { out.push(atual); atual = ""; continue; }
    atual += ch;
  }
  if (atual.trim()) out.push(atual);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Prende o seletor dentro do contêiner da folha. html, :root e body viram o próprio contêiner. */
function escoparSeletor(sel: string, esc: string): string {
  const raiz = sel.match(/^(?:(?:html|:root)(?:\s+body)?|body)(?=$|[\s.#:[>+~])/i);
  if (raiz) return esc + sel.slice(raiz[0].length);
  return `${esc} ${sel}`;
}

function escoparRegras(regras: CSSRuleList, esc: string): string {
  let out = "";
  for (const r of Array.from(regras)) {
    if (r instanceof CSSStyleRule) {
      const sels = dividirSeletores(r.selectorText).map((s) => escoparSeletor(s, esc)).join(", ");
      out += `${sels} { ${limparDeclaracoes(r.style.cssText)} }\n`;
    } else if (r instanceof CSSMediaRule) {
      out += `@media ${r.conditionText} {\n${escoparRegras(r.cssRules, esc)}}\n`;
    } else if (r instanceof CSSSupportsRule) {
      out += `@supports ${r.conditionText} {\n${escoparRegras(r.cssRules, esc)}}\n`;
    } else if (r instanceof CSSKeyframesRule) {
      out += `${r.cssText}\n`;
    }
    // @font-face, @import e @page ficam de fora: nada de recurso externo, e a
    // página é definida pela paginação, não pelo CSS do modelo.
  }
  return out;
}

function escoparCss(css: string, esc: string): string {
  try {
    const folha = new CSSStyleSheet();
    folha.replaceSync(css.replace(/@import[^;]+;/gi, ""));
    return escoparRegras(folha.cssRules, esc);
  } catch {
    return "";
  }
}

interface HtmlPreparado {
  css: string;
  corpo: string;
  classes: string;
  estiloCorpo: string;
}

/** Limpa o HTML do modelo e isola o CSS dele dentro da folha. */
export function prepararHtml(html: string): HtmlPreparado {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const cssBruto = Array.from(doc.querySelectorAll("style")).map((s) => s.textContent ?? "").join("\n");
  const corpo = purify.sanitize(doc.body?.innerHTML ?? "", {
    FORBID_TAGS: TAGS_PROIBIDAS,
    FORBID_ATTR: ["srcset"],
  }) as string;
  const classes = (doc.body?.getAttribute("class") ?? "").replace(/[^\w\s-]/g, "");
  const estiloCorpo = limparDeclaracoes(doc.body?.getAttribute("style") ?? "");
  // O CSS do app (Tailwind e as regras de título) casa com os elementos da folha e
  // trocava a fonte e o peso dos títulos do modelo. O reset devolve tudo ao padrão
  // do navegador — como num documento avulso — e vem ANTES do CSS do modelo, com
  // especificidade mínima, para qualquer regra dele vencer. O interior de <svg> fica
  // de fora: o reset anularia os atributos de cor dos desenhos.
  const reset = `.${ESCOPO} :where(*:not(svg, svg *)),
  .${ESCOPO} :where(*:not(svg, svg *))::before,
  .${ESCOPO} :where(*:not(svg, svg *))::after { all: revert; }`;
  // O papel é branco: fundo de "mesa" que o modelo desenhe em volta da página não é impresso.
  const base = `.${ESCOPO} { width:${LARGURA}px !important; max-width:none !important; min-width:0 !important;
    margin:0 !important; box-sizing:border-box !important; position:relative !important;
    overflow:hidden !important; height:auto !important; min-height:0 !important;
    background:#fff !important; display:block !important; visibility:visible !important;
    opacity:1 !important; transform:none !important; }
  .${ESCOPO} img { max-width:100%; }`;
  return {
    css: `${reset}\n${escoparCss(cssBruto, `.${ESCOPO}`)}\n${base}`,
    corpo,
    classes,
    estiloCorpo,
  };
}

function montarElemento(p: HtmlPreparado): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `${ESCOPO} ${p.classes}`.trim();
  if (p.estiloCorpo) el.setAttribute("style", p.estiloCorpo);
  el.innerHTML = `<style>${p.css}</style>${p.corpo}`;
  return el;
}

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

/**
 * Linha de resposta sem largura: o modelo às vezes escreve "flex: 1" num elemento cujo
 * pai não é flex, e a linha do NOME some. Elemento vazio, com borda embaixo e quase
 * sem largura, ganha largura mínima — numa folha, linha de resposta é essencial.
 */
/**
 * O modelo às vezes imita a folha de papel com uma caixa de altura fixa ou mínima do
 * tamanho de uma A4 (min-height: 1123px). Como a área útil aqui é menor (as margens
 * são da paginação), essa caixa sempre transborda e empurra o fim da página para uma
 * folha quase vazia. Altura desse porte só existe para imitar página: é liberada.
 */
function liberarAlturaDePagina(raiz: HTMLElement) {
  const limite = ALTURA_UTIL * 0.8;
  raiz.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.minHeight) >= limite) el.style.minHeight = "0";
    if (/px$/.test(cs.height) && parseFloat(cs.height) >= limite && el.scrollHeight <= parseFloat(cs.height)) {
      el.style.height = "auto";
    }
  });
}

function garantirLinhasDeResposta(raiz: HTMLElement) {
  raiz.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.children.length > 0 || el.textContent?.trim() || /^(IMG|SVG|BR|HR|svg)$/.test(el.tagName)) return;
    const cs = getComputedStyle(el);
    if (!(parseFloat(cs.borderBottomWidth) > 0) || cs.borderBottomStyle === "none") return;
    if (el.getBoundingClientRect().width >= 8) return;
    if (cs.display === "inline") el.style.display = "inline-block";
    el.style.minWidth = "220px";
  });
}

/**
 * O modelo planeja as páginas (break-before: page), mas não estima altura em pixels:
 * a página planejada costuma passar 3% a 10% do limite, e o excedente ia sozinho para
 * uma página quase vazia. Quando uma página planejada estoura em até 25%, aqui se
 * reduz SÓ o espaço em branco entre os blocos dela — margens, recuos internos e vãos —,
 * em passos, até no mínimo 60% do original. Letra, entrelinha, linhas de resposta e
 * imagens não mudam de tamanho. Se nem assim couber, tudo volta ao original e a
 * paginação normal assume.
 */
function ajustarRespiro(raiz: HTMLElement) {
  const topo = () => raiz.getBoundingClientRect().top;
  const marcos = Array.from(raiz.querySelectorAll<HTMLElement>("*")).filter((el) =>
    /page|always/.test(getComputedStyle(el).breakBefore ||
      (getComputedStyle(el) as unknown as { pageBreakBefore?: string }).pageBreakBefore || ""));
  const fimDo = (k: number) => k < marcos.length
    ? marcos[k].getBoundingClientRect().top - topo()
    : raiz.scrollHeight;
  const inicioDo = (k: number) => (k === 0 ? 0 : marcos[k - 1].getBoundingClientRect().top - topo());
  const props = ["marginTop", "marginBottom", "paddingTop", "paddingBottom", "rowGap"] as const;
  const css: Record<(typeof props)[number], string> = {
    marginTop: "margin-top", marginBottom: "margin-bottom", paddingTop: "padding-top",
    paddingBottom: "padding-bottom", rowGap: "row-gap",
  };

  for (let k = 0; k <= marcos.length; k++) {
    const ini = inicioDo(k);
    const altura = fimDo(k) - ini;
    if (altura <= ALTURA_UTIL || altura > ALTURA_UTIL * 1.25) continue;

    const fim = fimDo(k);
    const doTrecho = Array.from(raiz.querySelectorAll<HTMLElement>("*")).filter((el) => {
      if (el.tagName === "STYLE") return false;
      const r = el.getBoundingClientRect();
      return r.top - topo() >= ini - 1 && r.bottom - topo() <= fim + 1;
    });
    const originais = doTrecho.map((el) => {
      const cs = getComputedStyle(el);
      return props.map((p) => parseFloat(cs[p] as string) || 0);
    });
    const inline = doTrecho.map((el) => el.getAttribute("style"));

    let coube = false;
    for (const f of [0.85, 0.7, 0.6]) {
      doTrecho.forEach((el, i) => {
        props.forEach((p, j) => {
          const v = originais[i][j];
          if (v > 0) el.style.setProperty(css[p], `${(v * f).toFixed(2)}px`, "important");
        });
      });
      if (fimDo(k) - inicioDo(k) <= ALTURA_UTIL) { coube = true; break; }
    }
    if (!coube) {
      doTrecho.forEach((el, i) => {
        const orig = inline[i];
        if (orig === null) el.removeAttribute("style"); else el.setAttribute("style", orig);
      });
    }
  }
}

/**
 * Devolve as fronteiras das páginas, em px a partir do topo da folha:
 * [0, corte1, corte2, ..., alturaTotal].
 */
/**
 * Título de verdade (h1–h6), ou linha curta toda em negrito com cara de enunciado:
 * numerada ("4. VEJA UM MODELO", "B) QUANDO ACONTECEU?") ou terminada em "?" ou ":".
 * Uma lista de palavras em negrito não é título: é conteúdo.
 */
function ehTitulo(el: HTMLElement, cs: CSSStyleDeclaration, altura: number): boolean {
  if (/^H[1-6]$/.test(el.tagName)) return true;
  if (!/^(block|list-item|flex)$/.test(cs.display)) return false;
  const texto = el.textContent?.trim() ?? "";
  if (!texto || texto.length > 120 || el.querySelector("img, svg, table, ul, ol, div, p")) return false;
  const linha = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
  if (altura > linha * 2.2) return false;
  const negrito = Number(cs.fontWeight) >= 600 ||
    el.querySelector("strong, b")?.textContent?.trim() === texto;
  return negrito && (/^(\d{1,2}|[A-Za-z])\s*[.)\-–]\s/.test(texto) || /[?:]$/.test(texto));
}

function calcularCortes(raiz: HTMLElement): number[] {
  const origem = raiz.getBoundingClientRect().top;
  const total = Math.ceil(raiz.scrollHeight);
  type Faixa = [number, number];
  // Três níveis de "não cortar aqui", do mais forte ao mais fraco:
  const linhas: Faixa[] = [];      // linha de texto: nunca
  const pecas: Faixa[] = [];       // imagem, linha de tabela, bloco pequeno
  const caixas: Faixa[] = [];      // caixa com borda, fundo ou sombra; bloco "não partir"
  const titulos: Faixa[] = [];     // título ou enunciado curto em negrito: vai com o que vem depois
  const forcados: number[] = [];

  const range = document.createRange();
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim() || n.parentElement?.tagName === "STYLE") continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) {
      if (r.height > 0) linhas.push([r.top - origem, r.bottom - origem]);
    }
  }

  const visivel = (cor: string) => {
    const m = cor.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
    if (parseFloat(a) === 0) return false;
    return !(Number(r) > 250 && Number(g) > 250 && Number(b) > 250);
  };

  raiz.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.tagName === "STYLE") return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return;
    const faixa: Faixa = [r.top - origem, r.bottom - origem];
    const cs = getComputedStyle(el);
    const atomico = /^(IMG|SVG|CANVAS|TR|svg)$/.test(el.tagName);
    const evitar = cs.breakInside === "avoid" || cs.breakInside === "avoid-page" ||
      (cs as unknown as { pageBreakInside?: string }).pageBreakInside === "avoid";
    const borda = ["Top", "Right", "Bottom", "Left"].some((l) =>
      parseFloat((cs as unknown as Record<string, string>)[`border${l}Width`]) > 0 &&
      (cs as unknown as Record<string, string>)[`border${l}Style`] !== "none");
    const decorada = borda || visivel(cs.backgroundColor) || cs.boxShadow !== "none" ||
      cs.backgroundImage !== "none";

    if (ehTitulo(el, cs, r.height)) titulos.push(faixa);

    if ((atomico && r.height < ALTURA_UTIL * 0.9) || r.height <= BLOCO_PEQUENO) pecas.push(faixa);
    // Caixa partida ao meio sai sem a borda de baixo numa página e sem a de cima na
    // outra — parece folha quebrada. Só se parte a que não cabe numa página inteira.
    else if ((decorada || evitar) && r.height < ALTURA_UTIL * 0.95) caixas.push(faixa);

    const antes = cs.breakBefore || (cs as unknown as { pageBreakBefore?: string }).pageBreakBefore;
    const depois = cs.breakAfter || (cs as unknown as { pageBreakAfter?: string }).pageBreakAfter;
    if (antes === "page" || antes === "always") forcados.push(faixa[0]);
    if (depois === "page" || depois === "always") forcados.push(faixa[1]);
  });

  const quebras = [...new Set(forcados.map(Math.round))]
    .filter((v) => v > 20 && v < total - 20)
    .sort((a, b) => a - b);

  /** Sobe a partir do limite até um ponto livre das faixas; null se descer do piso. */
  const procurar = (limite: number, piso: number, faixas: Faixa[]): number | null => {
    let c = limite;
    for (let i = 0; i < 2000; i++) {
      const dentro = faixas.filter(([a, b]) => a < c - 0.5 && b > c + 0.5);
      if (dentro.length === 0) return c >= piso ? c : null;
      c = Math.min(...dentro.map(([a]) => a)) - 1;
      if (c < piso) return null;
    }
    return null;
  };

  /**
   * Título no pé da página, com o conteúdo dele na página seguinte, parece folha
   * quebrada. Se depois do título só sobraram até duas linhas antes do corte, o corte
   * sobe para antes do título e ele desce junto com o que apresenta.
   */
  const segurarTitulo = (c: number, piso: number): number => {
    const orfaos = titulos.filter(([a, b]) => {
      if (b > c + 0.5 || a < piso) return false;
      const depois = linhas.filter(([la, lb]) => la >= b - 1 && lb <= c + 0.5).length;
      return depois <= 2;
    });
    if (orfaos.length === 0) return c;
    const alvo = Math.min(...orfaos.map(([a]) => a)) - 1;
    return procurar(alvo, piso, [...linhas, ...pecas, ...caixas]) ??
      procurar(alvo, piso, linhas) ?? c;
  };

  // Onde o conteúdo acaba: espaço em branco depois disso não abre página nova.
  const fimConteudo = Math.max(0, ...[...linhas, ...pecas, ...caixas].map(([, b]) => b));

  const cortes = [0];
  let y = 0;
  for (let guarda = 0; guarda < 200; guarda++) {
    const limite = y + ALTURA_UTIL;
    const forcado = quebras.find((v) => v > y + 20 && v <= Math.min(limite, total));
    if (forcado !== undefined) { cortes.push(forcado); y = forcado; continue; }
    if (limite >= Math.min(total, fimConteudo + 1)) break;

    // Preferência: não partir caixa nenhuma, mesmo que sobre espaço no pé da página;
    // depois, só não partir peças; por fim, só não partir linha de texto.
    const c =
      procurar(limite, y + ALTURA_UTIL * 0.2, [...linhas, ...pecas, ...caixas]) ??
      procurar(limite, y + ALTURA_UTIL * 0.35, [...linhas, ...pecas]) ??
      procurar(limite, y + ALTURA_UTIL * 0.2, linhas) ??
      limite;
    const final = segurarTitulo(c, y + ALTURA_UTIL * 0.35);
    cortes.push(Math.floor(final));
    y = Math.floor(final);
  }
  cortes.push(total);
  return cortes;
}

/**
 * O html2canvas acha a linha de base da fonte medindo uma <img> de 1px que ele põe no
 * documento principal, com vertical-align: baseline. O Tailwind do app declara
 * img { display: block }, a imagem cai para a linha de baixo e a medição sai errada:
 * todo texto da folha era desenhado ~6px abaixo do lugar — o número saía do círculo e
 * enunciados invadiam a caixa seguinte. A regra abaixo vale só para essa imagem de
 * medição (identificada pelo src fixo dela) e não toca nas imagens do app.
 */
const IMAGEM_DE_MEDICAO =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
function corrigirMedicaoDeFonte() {
  if (document.getElementById("folha-livre-medicao")) return;
  const st = document.createElement("style");
  st.id = "folha-livre-medicao";
  st.textContent = `img[src="${IMAGEM_DE_MEDICAO}"] { display: inline !important; }`;
  document.head.appendChild(st);
}

async function esperarImagens(raiz: HTMLElement) {
  const imgs = Array.from(raiz.querySelectorAll("img"));
  await Promise.all(imgs.map((im) =>
    im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; })
  ));
  try { await document.fonts.ready; } catch { /* sem suporte: segue */ }
}

/** Renderiza a folha inteira em páginas A4, cada uma num canvas no tamanho real. */
export async function renderizarPaginas(folha: FolhaLivre): Promise<HTMLCanvasElement[]> {
  corrigirMedicaoDeFonte();
  const preparado = prepararHtml(folha.html);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${LARGURA}px;background:#fff;`;
  const raiz = montarElemento(preparado);
  host.appendChild(raiz);
  document.body.appendChild(host);
  try {
    await esperarImagens(raiz);
    await new Promise((r) => setTimeout(r, 50));

    liberarAlturaDePagina(raiz);
    garantirLinhasDeResposta(raiz);
    ajustarRespiro(raiz);
    const cortes = calcularCortes(raiz);
    const total = cortes[cortes.length - 1];
    // O canvas tem limite de altura no navegador; folhas muito longas caem para escala 1.
    const escala = Math.min(2, 30000 / Math.max(total, 1));
    const fundo = "#ffffff";

    const inteira = await html2canvas(raiz, {
      width: LARGURA, height: total, windowWidth: LARGURA,
      scale: escala, backgroundColor: fundo, useCORS: false, logging: false,
    });

    const paginas: HTMLCanvasElement[] = [];
    for (let i = 0; i < cortes.length - 1; i++) {
      const ini = cortes[i], fim = cortes[i + 1];
      if (fim - ini < 2) continue;
      const pag = document.createElement("canvas");
      pag.width = Math.round(LARGURA * escala);
      pag.height = Math.round(ALTURA * escala);
      const ctx = pag.getContext("2d")!;
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, pag.width, pag.height);
      // Mesma escala na origem e no destino: o conteúdo é copiado, nunca redimensionado.
      ctx.drawImage(
        inteira,
        0, Math.round(ini * escala), pag.width, Math.round((fim - ini) * escala),
        0, Math.round(MARGEM * escala), pag.width, Math.round((fim - ini) * escala),
      );
      paginas.push(pag);
    }
    return paginas;
  } finally {
    document.body.removeChild(host);
  }
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export function paginasParaPdf(paginas: HTMLCanvasElement[]): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  paginas.forEach((c, i) => {
    if (i > 0) pdf.addPage();
    // O canvas já tem a proporção exata do A4: nada estica.
    pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
  });
  return pdf;
}

function canvasParaBytes(c: HTMLCanvasElement): Uint8Array {
  const b64 = c.toDataURL("image/png").split(",")[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Word com uma página por folha, idêntica ao PDF. Com layout livre não há como
 * converter qualquer CSS em parágrafos do Word sem desmontar o desenho, então cada
 * página entra como imagem. A imagem fica 1% abaixo da página para o Word não
 * empurrar a marca de parágrafo final para uma página em branco.
 */
export async function paginasParaDocx(paginas: HTMLCanvasElement[]): Promise<Blob> {
  const larg = Math.floor(LARGURA * 0.99), alt = Math.floor(ALTURA * 0.99);
  const doc = new Document({
    sections: paginas.map((c) => ({
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
        },
      },
      children: [new Paragraph({
        spacing: { before: 0, after: 0, line: 240 },
        children: [new ImageRun({ type: "png", data: canvasParaBytes(c), transformation: { width: larg, height: alt } })],
      })],
    })),
  });
  return Packer.toBlob(doc);
}

/** HTML autônomo, já limpo, para abrir no navegador e imprimir. */
export function folhaParaHtml(folha: FolhaLivre): string {
  const p = prepararHtml(folha.html);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(folha.titulo || "Folha de atividade")}</title>
<style>@page{size:A4;margin:9mm 0;} html,body{margin:0;background:#fff;}
body{display:flex;justify-content:center;}
${p.css}</style></head>
<body><div class="${ESCOPO} ${p.classes}" style="${p.estiloCorpo.replace(/"/g, "&quot;")}">${p.corpo}</div></body></html>`;
}
