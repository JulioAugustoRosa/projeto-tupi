// Renderiza a folha de atividade no modelo usado por professora especialista:
// faixa de disciplina no topo, seções numeradas e coloridas em duas colunas,
// ícones como âncora visual, escrita guiada por frases começadas e checklist
// de autoavaliação no fim.
//
// A mesma estrutura alimenta a pré-visualização, o PDF, o PNG e o DOCX.

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  VerticalAlign, WidthType,
} from "docx";

// ---------------------------------------------------------------------------
// Paleta
// ---------------------------------------------------------------------------

/**
 * Tons claros com texto escuro: a cor organiza a folha e ainda sobrevive à
 * fotocópia em preto e branco, que é como a maioria das escolas imprime.
 */
export const PALETA = {
  azul:    { fundo: "#CFE4FB", borda: "#1D4ED8", texto: "#0F2A63" },
  verde:   { fundo: "#D4F0DA", borda: "#15803D", texto: "#0E3A22" },
  roxo:    { fundo: "#E6D8F7", borda: "#7C3AED", texto: "#331663" },
  amarelo: { fundo: "#FCE08A", borda: "#D97706", texto: "#5C3604" },
  laranja: { fundo: "#FBD9C8", borda: "#E2561F", texto: "#6B2410" },
  creme:   { fundo: "#FDEFD4", borda: "#E0A33C", texto: "#5C3C08" },
  cinza:   { fundo: "#E7EAEE", borda: "#64748B", texto: "#1F2937" },
} as const;

export type NomeCor = keyof typeof PALETA;
const cor = (c?: string) => PALETA[(c as NomeCor)] ?? PALETA.azul;

const MARINHO = "#17356B";

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

export interface DadoInfo { icone?: string; rotulo: string; valor: string }
export interface ParRelacionar { rotulo: string; definicao: string; cor?: string }
export interface PerguntaGuia { icone?: string; pergunta: string }
export interface CampoProducao { rotulo: string; cor?: string; texto: string }

export interface SecaoFolha {
  numero?: number;
  titulo: string;
  subtitulo?: string;
  cor?: string;
  /** "metade" entra na grade de duas colunas; "inteira" ocupa a largura toda */
  largura?: "metade" | "inteira";
  tipo: "info" | "relacionar" | "perguntas" | "producao" | "checklist" | "texto";

  /** info */
  imagem?: string;
  imagem_prompt?: string;
  destaque?: string;
  dados?: DadoInfo[];

  /** relacionar */
  pares?: ParRelacionar[];

  /** perguntas */
  perguntas?: PerguntaGuia[];

  /** producao — o texto traz ___ onde o aluno escreve */
  campos?: CampoProducao[];

  /** checklist */
  itens?: string[];

  /** texto */
  texto?: string;
}

export interface MaterialOriginal { imagem?: string; legenda?: string }

/** Ilustração decorativa: entra no topo, ao lado de uma seção ou na chamada. */
export interface Ilustracao { imagem?: string; imagem_prompt?: string }

export interface Folha {
  titulo?: string;
  /** faixa escura do topo, ex: "LÍNGUA PORTUGUESA — PRODUÇÃO TEXTUAL" */
  faixa?: string;
  /** pílula amarela, ex: "GÊNERO TEXTUAL: NOTÍCIA" */
  etiqueta?: string;
  /** balão de convite ao lado da etiqueta */
  convite?: string;
  aluno?: string;
  adaptacoes_aplicadas?: string[];
  config?: { fonte?: string; tamanho_pt?: number };
  material_original?: MaterialOriginal;
  /** figura ao lado do balão de convite, ex: um megafone */
  ilustracao_topo?: Ilustracao;
  /** preenchido quando alguma ilustração falhou, para avisar o professor */
  aviso_imagens?: string;
  secoes?: SecaoFolha[];
  chamada_final?: { titulo?: string; texto?: string; imagem?: string; imagem_prompt?: string };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function pilhaFonte(fonte?: string) {
  const f = (fonte || "Verdana").trim();
  return `'${f}', Verdana, Tahoma, 'Trebuchet MS', sans-serif`;
}

/** Transforma ___ em linha de escrita. */
function comLacunas(txt: string, pt: number): string {
  return esc(txt).replace(/_{2,}/g, () =>
    `<span style="display:inline-block;min-width:${pt * 9}px;border-bottom:1.5px solid #555;">&nbsp;</span>`);
}

// ---------------------------------------------------------------------------
// HTML — preview, PDF e PNG
// ---------------------------------------------------------------------------

function conteudoSecao(s: SecaoFolha, pt: number): string {
  const c = cor(s.cor);
  const peq = (pt * 0.82).toFixed(1);

  switch (s.tipo) {
    case "info": {
      // As ilustrações chegam em 1.83:1. Num espaço quadrado com "cover", as
      // laterais eram cortadas e o letreiro da cena sumia. A figura passa a
      // ocupar a largura toda do card, acima dos dados, respeitando a proporção.
      const img = s.imagem
        ? `<img src="${s.imagem}" alt="" style="display:block;width:100%;height:auto;max-height:${pt * 9.5}px;
             object-fit:contain;border-radius:10px;margin-bottom:${pt * 0.5}px;" />`
        : "";
      const linhas = (s.dados ?? []).map((d) =>
        `<div style="display:flex;gap:6px;align-items:baseline;margin-bottom:3px;">
           <span style="flex:none;">${esc(d.icone || "•")}</span>
           <span><b>${esc(d.rotulo)}:</b> ${esc(d.valor)}</span>
         </div>`).join("");
      return `<div style="background:${PALETA.creme.fundo};border-radius:12px;padding:${pt * 0.6}px;">
        ${img}
        <div style="font-size:${peq}pt;line-height:1.4;">
          ${s.destaque ? `<p style="margin:0 0 6px;">${esc(s.destaque)}</p>` : ""}
          ${linhas}
        </div>
      </div>`;
    }

    case "relacionar": {
      return `<div style="display:flex;flex-direction:column;gap:${pt * 0.6}px;">
        ${(s.pares ?? []).map((p) => {
          const pc = cor(p.cor ?? s.cor);
          return `<div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:0 0 38%;background:${pc.fundo};border:2.5px solid ${pc.borda};color:${pc.texto};
                 border-radius:10px;padding:7px 8px;font-weight:800;font-size:${peq}pt;text-align:center;">${esc(p.rotulo)}</div>
            <span style="width:7px;height:7px;border:2px solid #333;border-radius:999px;flex:none;"></span>
            <span style="flex:1;border-bottom:1px dotted #bbb;"></span>
            <span style="width:7px;height:7px;border:2px solid #333;border-radius:999px;flex:none;"></span>
            <div style="flex:0 0 42%;border:2px solid ${PALETA.azul.borda};border-radius:10px;padding:6px 8px;
                 font-size:${peq}pt;background:#fff;">${esc(p.definicao)}</div>
          </div>`;
        }).join("")}
      </div>`;
    }

    case "perguntas":
      return `<div style="display:flex;flex-direction:column;gap:${pt * 0.55}px;">
        ${(s.perguntas ?? []).map((q) => `<div style="display:flex;gap:8px;align-items:stretch;">
            <div style="flex:0 0 44%;background:${c.fundo};border:2px solid ${c.borda};color:${c.texto};
                 border-radius:999px;padding:5px 10px;font-size:${peq}pt;font-weight:700;display:flex;gap:5px;align-items:center;">
              <span>${esc(q.icone || "?")}</span><span>${esc(q.pergunta)}</span>
            </div>
            <div style="flex:1;border-bottom:2px solid ${c.borda};margin-bottom:4px;"></div>
          </div>`).join("")}
      </div>`;

    case "producao":
      return `<div style="display:flex;flex-direction:column;gap:${pt * 0.6}px;">
        ${(s.campos ?? []).map((campo) => {
          const cc = cor(campo.cor ?? s.cor);
          return `<div style="background:${cc.fundo};border:2.5px solid ${cc.borda};border-radius:12px;padding:${pt * 0.65}px ${pt * 0.75}px;">
            <div style="font-weight:800;color:${cc.texto};font-size:${peq}pt;margin-bottom:3px;">${esc(campo.rotulo)}</div>
            <div style="font-size:${peq}pt;line-height:2.1;">${comLacunas(campo.texto, pt)}</div>
          </div>`;
        }).join("")}
      </div>`;

    case "checklist":
      return `<div style="font-size:${peq}pt;">
        ${(s.itens ?? []).map((i) => `<div style="display:flex;gap:7px;align-items:center;margin-bottom:4px;">
            <span style="width:${pt}px;height:${pt}px;border:2px solid #333;border-radius:3px;flex:none;"></span>
            <span>${esc(i)}</span>
          </div>`).join("")}
      </div>`;

    default:
      return `<div style="font-size:${peq}pt;line-height:1.5;">${comLacunas(s.texto ?? "", pt)}</div>`;
  }
}

function secaoHtml(s: SecaoFolha, pt: number): string {
  const c = cor(s.cor);
  const inteira = s.largura === "inteira";
  // Decorativa fica DEPOIS do conteúdo, nunca sobreposta: em absolute ela cobria
  // o texto da própria seção. mix-blend-multiply some com o fundo branco do PNG.
  const figura = (s.imagem && s.tipo !== "info")
    ? `<div style="text-align:right;margin-top:${pt * 0.3}px;">
         <img src="${s.imagem}" alt="" style="width:${pt * 11}px;height:auto;max-height:${pt * 6}px;object-fit:contain;mix-blend-mode:multiply;" />
       </div>`
    : "";
  return `<section style="grid-column:${inteira ? "1 / -1" : "auto"};border:3px solid ${c.borda};
      border-radius:16px;padding:${pt * 0.75}px ${pt * 0.85}px;background:#fff;break-inside:avoid;">
    <div style="display:flex;gap:9px;align-items:center;margin-bottom:${s.subtitulo ? 3 : 9}px;
         border-bottom:2px solid ${c.fundo};padding-bottom:5px;">
      ${s.numero != null ? `<span style="flex:none;width:${pt * 2.3}px;height:${pt * 2.3}px;border-radius:999px;background:${c.borda};
           color:#fff;font-weight:800;font-size:${(pt * 1.15).toFixed(1)}pt;display:flex;align-items:center;justify-content:center;">${s.numero}</span>` : ""}
      <h3 style="margin:0;font-size:${(pt * 1.3).toFixed(1)}pt;font-weight:800;color:${c.texto};
           text-transform:uppercase;letter-spacing:.4px;line-height:1.15;">${esc(s.titulo)}</h3>
    </div>
    ${s.subtitulo ? `<p style="margin:0 0 ${pt * 0.5}px ${pt * 2.3}px;font-size:${(pt * 0.75).toFixed(1)}pt;color:#555;">${esc(s.subtitulo)}</p>` : ""}
    ${conteudoSecao(s, pt)}${figura}
  </section>`;
}

/** A folha inteira numa página A4 (794×1123 px a 96dpi). */
export function paginaHtml(folha: Folha | null | undefined, _idx = 0): string {
  // Defesa: esta função é chamada de dentro do JSX, e um valor inesperado aqui
  // derruba a página inteira em tela branca. Vale devolver vazio e seguir.
  if (!folha || typeof folha !== "object") return "";
  const cfg = folha.config ?? {};
  const pt = cfg.tamanho_pt ?? 11;
  const secoes = folha.secoes ?? [];
  const mat = folha.material_original;

  const cab = `<div style="background:${MARINHO};color:#fff;border-radius:9px;padding:${pt * 0.6}px ${pt}px;
      display:flex;justify-content:space-between;align-items:center;gap:${pt}px;">
    <span style="font-weight:800;letter-spacing:.6px;font-size:${(pt * 0.95).toFixed(1)}pt;">${esc(folha.faixa || "ATIVIDADE PEDAGÓGICA")}</span>
    <span style="background:#fff;color:#333;border-radius:7px;padding:4px ${pt * 0.8}px;font-size:${(pt * 0.8).toFixed(1)}pt;white-space:nowrap;">
      ALUNO(A): ______________________
    </span>
  </div>`;

  const faixa2 = (folha.etiqueta || folha.convite)
    ? `<div style="display:flex;gap:${pt * 0.8}px;align-items:stretch;margin-top:${pt * 0.7}px;">
        ${folha.etiqueta ? `<div style="background:${PALETA.amarelo.fundo};border:2.5px solid ${PALETA.amarelo.borda};color:${PALETA.amarelo.texto};
             border-radius:999px;padding:7px ${pt * 1.2}px;font-weight:800;font-size:${(pt * 1.15).toFixed(1)}pt;display:flex;align-items:center;white-space:nowrap;">${esc(folha.etiqueta)}</div>` : ""}
        ${folha.convite ? `<div style="flex:1;background:${PALETA.azul.fundo};border:2.5px solid ${PALETA.azul.borda};color:${PALETA.azul.texto};
             border-radius:14px;padding:7px ${pt * 0.9}px;font-size:${(pt * 0.86).toFixed(1)}pt;font-weight:600;display:flex;align-items:center;text-align:center;justify-content:center;">${esc(folha.convite)}</div>` : ""}
        ${folha.ilustracao_topo?.imagem ? `<img src="${folha.ilustracao_topo.imagem}" alt="" style="width:${pt * 10}px;height:auto;max-height:${pt * 5.5}px;object-fit:contain;flex:none;mix-blend-mode:multiply;" />` : ""}
      </div>`
    : "";

  const material = mat?.imagem
    ? `<div style="margin-top:${pt * 0.7}px;border:2px solid #cbd5e1;border-radius:9px;padding:${pt * 0.5}px;text-align:center;">
         ${mat.legenda ? `<div style="font-size:${(pt * 0.7).toFixed(1)}pt;color:#777;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${esc(mat.legenda)}</div>` : ""}
         <img src="${mat.imagem}" alt="" style="max-width:100%;max-height:${pt * 20}px;object-fit:contain;" />
       </div>`
    : "";

  const rodape = (folha.chamada_final?.titulo || folha.chamada_final?.texto)
    ? `<div style="grid-column:1 / -1;background:${PALETA.amarelo.fundo};border:3px solid ${PALETA.amarelo.borda};
         border-radius:18px;padding:${pt * 0.8}px ${pt}px;display:flex;align-items:center;gap:${pt}px;">
        <div style="flex:1;text-align:center;">
          <div style="font-weight:800;color:${PALETA.amarelo.texto};font-size:${(pt * 1.35).toFixed(1)}pt;">${esc(folha.chamada_final?.titulo ?? "")}</div>
          ${folha.chamada_final?.texto ? `<div style="font-size:${(pt * 0.82).toFixed(1)}pt;color:#5C3604;margin-top:3px;">${esc(folha.chamada_final.texto)}</div>` : ""}
        </div>
        ${folha.chamada_final?.imagem ? `<img src="${folha.chamada_final.imagem}" alt="" style="width:${pt * 11}px;height:auto;max-height:${pt * 6}px;object-fit:contain;flex:none;mix-blend-mode:multiply;" />` : ""}
      </div>`
    : "";

  return `<div style="width:794px;min-height:1123px;box-sizing:border-box;padding:28px 30px;background:#fff;color:#111;
      font-family:${pilhaFonte(cfg.fonte)};font-size:${pt}pt;line-height:1.35;">
    ${cab}${faixa2}${material}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:${pt * 0.8}px;margin-top:${pt * 0.8}px;align-items:start;">
      ${secoes.map((s) => secaoHtml(s, pt)).join("")}
      ${rodape}
    </div>
    <div style="margin-top:${pt}px;text-align:center;font-size:${(pt * 0.65).toFixed(1)}pt;color:#999;">
      TUPI · Tecnologia Universal para Práticas da Inclusão
    </div>
  </div>`;
}

export function folhaHtmlCompleto(folha: Folha): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(folha.titulo || "Atividade")}</title>
<style>@page{size:A4;margin:0;} body{margin:0;background:#fff;}</style>
</head><body>${paginaHtml(folha)}</body></html>`;
}

// ---------------------------------------------------------------------------
// DOCX — mesma estrutura, em coluna única para o Word não embaralhar o layout
// ---------------------------------------------------------------------------

const dataUrlParaBytes = (d: string): Uint8Array => {
  const bin = atob(d.slice(d.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const tipoImagem = (d: string): "png" | "jpg" =>
  d.slice(0, 30).includes("image/png") ? "png" : "jpg";

const semHex = (h: string) => h.replace("#", "").toUpperCase();

/** No Word não há fallback de fonte: Lexend quase nunca está instalada. */
function fonteDocx(fonte?: string): string {
  const f = (fonte || "Verdana").trim();
  return ["lexend", "opendyslexic", "dyslexie"].includes(f.toLowerCase()) ? "Verdana" : f;
}

function caixaDocx(
  texto: string,
  c: { fundo: string; borda: string; texto: string },
  half: number,
  fonte: string,
  negrito = false,
) {
  return new Paragraph({
    children: [new TextRun({ text: texto, size: half, font: fonte, bold: negrito, color: semHex(c.texto) })],
    shading: { type: ShadingType.CLEAR, fill: semHex(c.fundo) },
    border: {
      top: { style: BorderStyle.SINGLE, size: 8, color: semHex(c.borda), space: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: semHex(c.borda), space: 4 },
      left: { style: BorderStyle.SINGLE, size: 8, color: semHex(c.borda), space: 6 },
      right: { style: BorderStyle.SINGLE, size: 8, color: semHex(c.borda), space: 6 },
    },
    spacing: { before: 60, after: 90 },
  });
}

export async function folhaParaDocx(folha: Folha): Promise<Blob> {
  const cfg = folha.config ?? {};
  const pt = cfg.tamanho_pt ?? 11;
  const half = pt * 2;
  const fonte = fonteDocx(cfg.fonte);
  const filhos: (Paragraph | Table)[] = [];

  filhos.push(new Paragraph({
    children: [new TextRun({ text: folha.faixa || "ATIVIDADE PEDAGÓGICA", bold: true, size: Math.round(half * 1.05), color: "FFFFFF", font: fonte })],
    shading: { type: ShadingType.CLEAR, fill: semHex(MARINHO) },
    spacing: { after: 80 },
  }));
  filhos.push(new Paragraph({
    children: [new TextRun({ text: "ALUNO(A): ______________________________   DATA: ___/___/______", size: Math.round(half * 0.85), font: fonte })],
    spacing: { after: 140 },
  }));
  if (folha.etiqueta) filhos.push(caixaDocx(folha.etiqueta, PALETA.amarelo, half, fonte, true));
  if (folha.convite) filhos.push(caixaDocx(folha.convite, PALETA.azul, Math.round(half * 0.9), fonte));

  if (folha.material_original?.imagem) {
    try {
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          data: dataUrlParaBytes(folha.material_original.imagem),
          type: tipoImagem(folha.material_original.imagem),
          transformation: { width: 380, height: 230 },
        })],
        spacing: { before: 120, after: 160 },
      }));
    } catch { /* segue sem o material */ }
  }

  for (const s of folha.secoes ?? []) {
    const c = cor(s.cor);
    filhos.push(new Paragraph({
      children: [new TextRun({
        text: `${s.numero != null ? `${s.numero}. ` : ""}${s.titulo.toUpperCase()}`,
        bold: true, size: Math.round(half * 1.3), color: semHex(c.texto), font: fonte,
      })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 220, after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: semHex(c.borda), space: 3 } },
    }));
    if (s.subtitulo) {
      filhos.push(new Paragraph({
        children: [new TextRun({ text: s.subtitulo, italics: true, size: Math.round(half * 0.8), color: "555555", font: fonte })],
        spacing: { after: 80 },
      }));
    }

    switch (s.tipo) {
      case "info": {
        if (s.imagem) {
          try {
            filhos.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ data: dataUrlParaBytes(s.imagem), type: tipoImagem(s.imagem), transformation: { width: 180, height: 180 } })],
              spacing: { after: 100 },
            }));
          } catch { /* ignora imagem inválida */ }
        }
        if (s.destaque) {
          filhos.push(new Paragraph({ children: [new TextRun({ text: s.destaque, size: half, font: fonte })], spacing: { after: 80 } }));
        }
        for (const d of s.dados ?? []) {
          filhos.push(new Paragraph({
            children: [
              new TextRun({ text: `${d.icone || "•"}  ${d.rotulo}: `, bold: true, size: half, font: fonte }),
              new TextRun({ text: d.valor, size: half, font: fonte }),
            ],
            spacing: { after: 50 },
          }));
        }
        break;
      }
      case "relacionar": {
        filhos.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: (s.pares ?? []).map((p) => {
            const pc = cor(p.cor ?? s.cor);
            return new TableRow({
              children: [
                new TableCell({
                  width: { size: 34, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlign.CENTER,
                  shading: { type: ShadingType.CLEAR, fill: semHex(pc.fundo) },
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: p.rotulo, bold: true, size: half, color: semHex(pc.texto), font: fonte })],
                  })],
                }),
                new TableCell({
                  width: { size: 12, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "•        •", size: half, font: fonte })] })],
                }),
                new TableCell({
                  width: { size: 54, type: WidthType.PERCENTAGE },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ children: [new TextRun({ text: p.definicao, size: Math.round(half * 0.9), font: fonte })] })],
                }),
              ],
            });
          }),
        }));
        filhos.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 160 } }));
        break;
      }
      case "perguntas": {
        filhos.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: (s.perguntas ?? []).map((q) => new TableRow({
            height: { value: 560, rule: "atLeast" },
            children: [
              new TableCell({
                width: { size: 42, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.CENTER,
                shading: { type: ShadingType.CLEAR, fill: semHex(c.fundo) },
                children: [new Paragraph({
                  children: [new TextRun({ text: `${q.icone || "?"}  ${q.pergunta}`, bold: true, size: Math.round(half * 0.9), color: semHex(c.texto), font: fonte })],
                })],
              }),
              new TableCell({
                width: { size: 58, type: WidthType.PERCENTAGE },
                children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
              }),
            ],
          })),
        }));
        filhos.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 160 } }));
        break;
      }
      case "producao": {
        for (const campo of s.campos ?? []) {
          const cc = cor(campo.cor ?? s.cor);
          filhos.push(new Paragraph({
            children: [new TextRun({ text: campo.rotulo, bold: true, size: Math.round(half * 0.9), color: semHex(cc.texto), font: fonte })],
            shading: { type: ShadingType.CLEAR, fill: semHex(cc.fundo) },
            spacing: { before: 120, after: 20 },
          }));
          filhos.push(new Paragraph({
            children: [new TextRun({ text: campo.texto.replace(/_{2,}/g, "________________"), size: half, font: fonte })],
            spacing: { after: 140, line: 420 },
          }));
        }
        break;
      }
      case "checklist": {
        for (const i of s.itens ?? []) {
          filhos.push(new Paragraph({
            children: [new TextRun({ text: `☐  ${i}`, size: half, font: fonte })],
            spacing: { after: 60 },
          }));
        }
        break;
      }
      default:
        filhos.push(new Paragraph({
          children: [new TextRun({ text: (s.texto ?? "").replace(/_{2,}/g, "________________"), size: half, font: fonte })],
          spacing: { after: 120, line: 400 },
        }));
    }
  }

  if (folha.chamada_final?.titulo || folha.chamada_final?.texto) {
    filhos.push(caixaDocx(
      `${folha.chamada_final.titulo ?? ""}${folha.chamada_final.texto ? " — " + folha.chamada_final.texto : ""}`,
      PALETA.amarelo, half, fonte, true,
    ));
  }

  const doc = new Document({
    creator: "TUPI",
    title: folha.titulo || "Atividade",
    sections: [{
      properties: { page: { margin: { top: 700, bottom: 700, left: 700, right: 700 } } },
      children: filhos,
    }],
  });
  return Packer.toBlob(doc);
}
