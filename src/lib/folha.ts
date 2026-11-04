// Renderiza a folha de atividade estruturada (vinda da edge function gerar-folha)
// em HTML (preview, PDF e PNG) e em DOCX, a partir da MESMA estrutura.

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer,
  PageBreak, Paragraph, TextRun,
} from "docx";

export interface BlocoFolha {
  numero?: number;
  enunciado: string;
  formato?: "linhas" | "caixa" | "multipla" | "completar" | "ligar" | "desenho";
  opcoes?: string[];
  pares?: { esquerda: string; direita: string }[];
  linhas?: number;
  /** data: URL em base64, já embutida pela edge function */
  imagem?: string;
}

export interface PaginaFolha {
  instrucoes?: string;
  blocos?: BlocoFolha[];
}

export interface Folha {
  titulo?: string;
  disciplina?: string;
  aluno?: string;
  adaptacoes_aplicadas?: string[];
  config?: { fonte?: string; tamanho_pt?: number; espacamento?: number; itens_por_pagina?: number };
  paginas?: PaginaFolha[];
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Lexend e Verdana podem não existir na máquina; a pilha garante um fallback legível. */
function pilhaFonte(fonte?: string) {
  const f = (fonte || "Verdana").trim();
  return `'${f}', Verdana, Tahoma, 'Trebuchet MS', sans-serif`;
}

// ---------------------------------------------------------------------------
// HTML — usado no preview, no PDF e no PNG
// ---------------------------------------------------------------------------

function blocoHtml(b: BlocoFolha, pt: number): string {
  const num = b.numero != null
    ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:${pt * 2}px;height:${pt * 2}px;border-radius:999px;background:#E95A3A;color:#fff;font-weight:700;margin-right:10px;flex:none;">${esc(b.numero)}</span>`
    : "";

  let resposta = "";
  const linhas = Math.max(1, b.linhas ?? 2);

  switch (b.formato) {
    case "caixa":
      resposta = `<div style="border:1.5px solid #333;border-radius:6px;height:${linhas * pt * 2.2}px;margin-top:10px;"></div>`;
      break;
    case "multipla":
      resposta = `<div style="margin-top:10px;display:flex;flex-direction:column;gap:${pt * 0.7}px;">${
        (b.opcoes ?? []).map((o) =>
          `<div style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:${pt}px;height:${pt}px;border:1.5px solid #333;border-radius:3px;flex:none;"></span><span>${esc(o)}</span></div>`,
        ).join("")
      }</div>`;
      break;
    case "ligar":
      resposta = `<div style="display:flex;justify-content:space-between;gap:40px;margin-top:12px;">
        <div style="display:flex;flex-direction:column;gap:${pt * 1.4}px;">${(b.pares ?? []).map((p) => `<span>${esc(p.esquerda)} &nbsp;•</span>`).join("")}</div>
        <div style="display:flex;flex-direction:column;gap:${pt * 1.4}px;text-align:right;">${(b.pares ?? []).map((p) => `<span>•&nbsp; ${esc(p.direita)}</span>`).join("")}</div>
      </div>`;
      break;
    case "desenho":
      resposta = `<div style="border:2px dashed #999;border-radius:8px;height:${Math.max(160, linhas * pt * 4)}px;margin-top:10px;"></div>`;
      break;
    case "completar":
      resposta = "";
      break;
    default:
      resposta = `<div style="margin-top:10px;">${
        Array.from({ length: linhas }).map(() =>
          `<div style="border-bottom:1.5px solid #333;height:${pt * 2.2}px;"></div>`,
        ).join("")
      }</div>`;
  }

  const img = b.imagem
    ? `<div style="text-align:center;margin:12px 0;"><img src="${b.imagem}" alt="" style="max-width:190px;max-height:190px;object-fit:contain;" /></div>`
    : "";

  return `<div style="margin-bottom:${pt * 2}px;break-inside:avoid;">
    <div style="display:flex;align-items:flex-start;">${num}<div style="flex:1;">${esc(b.enunciado)}</div></div>
    ${img}${resposta}
  </div>`;
}

/** Uma página A4 (794×1123 px a 96dpi), pronta para html2canvas. */
export function paginaHtml(folha: Folha, idx: number): string {
  const cfg = folha.config ?? {};
  const pt = cfg.tamanho_pt ?? 12;
  const pag = (folha.paginas ?? [])[idx] ?? {};
  const total = (folha.paginas ?? []).length;

  const instrucoes = pag.instrucoes
    ? `<div style="background:#F5F5F5;border-left:4px solid #E95A3A;padding:12px 14px;margin-bottom:${pt * 2}px;border-radius:0 6px 6px 0;">${esc(pag.instrucoes)}</div>`
    : "";

  return `<div style="width:794px;min-height:1123px;box-sizing:border-box;padding:56px 64px;background:#fff;color:#111;
      font-family:${pilhaFonte(cfg.fonte)};font-size:${pt}pt;line-height:${cfg.espacamento ?? 1.5};">
    <div style="border-bottom:2px solid #ddd;padding-bottom:12px;margin-bottom:18px;">
      <div style="font-size:${pt * 0.72}pt;letter-spacing:2px;color:#888;text-transform:uppercase;">Atividade Pedagógica</div>
      <div style="font-size:${pt * 1.5}pt;font-weight:700;margin-top:4px;">${esc(folha.titulo || "Atividade")}</div>
      ${folha.disciplina ? `<div style="font-size:${pt * 0.8}pt;color:#777;margin-top:2px;">${esc(folha.disciplina)}</div>` : ""}
    </div>
    <div style="display:flex;gap:20px;padding:10px 0;border-top:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${pt * 0.85}pt;margin-bottom:${pt * 1.6}px;">
      <div style="flex:2;">Nome: <span style="display:inline-block;border-bottom:1px solid #333;min-width:190px;"></span></div>
      <div style="flex:1;">Turma: <span style="display:inline-block;border-bottom:1px solid #333;min-width:70px;"></span></div>
      <div style="flex:1;">Data: ___/___/______</div>
    </div>
    ${instrucoes}
    ${(pag.blocos ?? []).map((b) => blocoHtml(b, pt)).join("")}
    <div style="position:absolute;"></div>
    <div style="margin-top:28px;padding-top:10px;border-top:1px solid #eee;text-align:center;font-size:${pt * 0.68}pt;color:#999;">
      TUPI · Tecnologia Universal para Práticas da Inclusão${total > 1 ? ` · Página ${idx + 1} de ${total}` : ""}
    </div>
  </div>`;
}

/** Documento completo, para baixar como .html ou imprimir. */
export function folhaHtmlCompleto(folha: Folha): string {
  const paginas = (folha.paginas ?? []).map((_, i) => paginaHtml(folha, i)).join(
    `<div style="page-break-after:always;"></div>`,
  );
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>${esc(folha.titulo || "Atividade")}</title>
<style>@page{size:A4;margin:0;} body{margin:0;background:#fff;}</style>
</head><body>${paginas}</body></html>`;
}

// ---------------------------------------------------------------------------
// DOCX — mesma estrutura, com quebra de página de verdade
// ---------------------------------------------------------------------------

const dataUrlParaBytes = (d: string): Uint8Array => {
  const b64 = d.slice(d.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const tipoImagem = (d: string): "png" | "jpg" =>
  d.slice(0, 30).includes("image/png") ? "png" : "jpg";

export async function folhaParaDocx(folha: Folha): Promise<Blob> {
  const cfg = folha.config ?? {};
  const pt = cfg.tamanho_pt ?? 12;
  const half = pt * 2;                                  // docx mede em meios-pontos
  const fonte = cfg.fonte || "Verdana";
  const linhaEspaco = Math.round((cfg.espacamento ?? 1.5) * 240);
  const paginas = folha.paginas ?? [];

  const filhos: Paragraph[] = [];

  paginas.forEach((pag, pi) => {
    if (pi > 0) filhos.push(new Paragraph({ children: [new PageBreak()] }));

    filhos.push(new Paragraph({
      children: [new TextRun({ text: "ATIVIDADE PEDAGÓGICA", size: Math.round(half * 0.7), color: "888888", font: fonte })],
      spacing: { after: 60 },
    }));
    filhos.push(new Paragraph({
      children: [new TextRun({ text: folha.titulo || "Atividade", bold: true, size: Math.round(half * 1.5), font: fonte })],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "DDDDDD", space: 6 } },
    }));
    filhos.push(new Paragraph({
      children: [new TextRun({
        text: "Nome: ______________________________   Turma: __________   Data: ___/___/______",
        size: Math.round(half * 0.85), font: fonte,
      })],
      spacing: { before: 160, after: 220 },
    }));

    if (pag.instrucoes) {
      filhos.push(new Paragraph({
        children: [new TextRun({ text: pag.instrucoes, size: half, font: fonte, italics: true })],
        shading: { fill: "F5F5F5" },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: "E95A3A", space: 8 } },
        spacing: { after: 240, line: linhaEspaco },
      }));
    }

    (pag.blocos ?? []).forEach((b) => {
      filhos.push(new Paragraph({
        children: [new TextRun({
          text: `${b.numero != null ? `${b.numero}. ` : ""}${b.enunciado}`,
          size: half, font: fonte, bold: true,
        })],
        spacing: { before: 220, after: 110, line: linhaEspaco },
      }));

      if (b.imagem) {
        try {
          filhos.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({
              data: dataUrlParaBytes(b.imagem),
              type: tipoImagem(b.imagem),
              transformation: { width: 190, height: 190 },
            })],
            spacing: { after: 140 },
          }));
        } catch { /* imagem inválida: a folha continua sem ela */ }
      }

      const linhas = Math.max(1, b.linhas ?? 2);
      switch (b.formato) {
        case "multipla":
          (b.opcoes ?? []).forEach((o) => filhos.push(new Paragraph({
            children: [new TextRun({ text: `(   )  ${o}`, size: half, font: fonte })],
            spacing: { after: 90, line: linhaEspaco },
          })));
          break;
        case "ligar":
          (b.pares ?? []).forEach((p) => filhos.push(new Paragraph({
            children: [new TextRun({ text: `${p.esquerda}   •                    •   ${p.direita}`, size: half, font: fonte })],
            spacing: { after: 130, line: linhaEspaco },
          })));
          break;
        case "desenho":
          filhos.push(new Paragraph({
            children: [new TextRun({ text: " ", size: half, font: fonte })],
            border: {
              top: { style: BorderStyle.DASHED, size: 8, color: "999999", space: 4 },
              bottom: { style: BorderStyle.DASHED, size: 8, color: "999999", space: 4 },
              left: { style: BorderStyle.DASHED, size: 8, color: "999999", space: 4 },
              right: { style: BorderStyle.DASHED, size: 8, color: "999999", space: 4 },
            },
            spacing: { before: 120, after: 1800 },
          }));
          break;
        case "caixa":
          filhos.push(new Paragraph({
            children: [new TextRun({ text: " ", size: half, font: fonte })],
            border: {
              top: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 4 },
              left: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 4 },
              right: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 4 },
            },
            spacing: { before: 120, after: 160 + linhas * 220 },
          }));
          break;
        case "completar":
          break;
        default:
          for (let i = 0; i < linhas; i++) {
            filhos.push(new Paragraph({
              children: [new TextRun({ text: " ", size: half, font: fonte })],
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 10 } },
              spacing: { after: 200, line: linhaEspaco },
            }));
          }
      }
    });

    filhos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: `TUPI · Tecnologia Universal para Práticas da Inclusão${paginas.length > 1 ? ` · Página ${pi + 1} de ${paginas.length}` : ""}`,
        size: Math.round(half * 0.68), color: "999999", font: fonte,
      })],
      spacing: { before: 420 },
    }));
  });

  const doc = new Document({
    creator: "TUPI",
    title: folha.titulo || "Atividade",
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: filhos,
    }],
  });

  return Packer.toBlob(doc);
}
