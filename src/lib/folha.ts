// Renderiza a folha de atividade estruturada (vinda da edge function gerar-folha)
// em HTML (preview, PDF e PNG) e em DOCX, a partir da MESMA estrutura.

import {
  AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer,
  PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, VerticalAlign,
  WidthType,
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

/** O material que o professor anexou (a tirinha, a prova, a folha original). */
export interface MaterialOriginal {
  /** data: URL em base64 da imagem enviada pelo professor */
  imagem?: string;
  legenda?: string;
}

export interface Folha {
  titulo?: string;
  disciplina?: string;
  aluno?: string;
  adaptacoes_aplicadas?: string[];
  config?: {
    fonte?: string;
    tamanho_pt?: number;
    espacamento?: number;
    itens_por_pagina?: number;
    /** repete o material original em todas as páginas, para o aluno não precisar voltar */
    repetir_material?: boolean;
  };
  material_original?: MaterialOriginal;
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

/** O enunciado já traz as lacunas de resposta? Então não repetir linha embaixo. */
const temLacuna = (txt: string) => /_{3,}/.test(txt || "");

/**
 * Limpa o que o modelo deixa passar no enunciado:
 * - numeração própria ("1) ", "2. "), que duplicaria a bolinha do renderizador;
 * - marcadores de figura em texto ("[desenho de uma bola]"), que deveriam ter
 *   virado imagem e, quando não viram, não podem aparecer para o aluno.
 */
function limparEnunciado(txt: string, temNumero: boolean): string {
  let t = txt || "";
  if (temNumero) t = t.replace(/^\s*\d+\s*[).\-–]\s*/, "");
  t = t.replace(/\[\s*(?:desenho|imagem|figura|foto)\s*:?\s*(?:de|da|do|dos|das)?\s*[^\]]*\]/gi, "");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

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
      // Quando o enunciado já traz as lacunas ("b_l_"), o espaço de resposta é
      // o próprio underscore. Mas se o modelo escreve só a instrução ("forme a
      // palavra com BO - LA"), sem lacuna, a folha sairia sem lugar nenhum para
      // o aluno escrever — então damos a linha.
      resposta = temLacuna(b.enunciado)
        ? ""
        : `<div style="margin-top:10px;">${
            Array.from({ length: linhas }).map(() =>
              `<div style="border-bottom:1.5px solid #333;height:${pt * 2.4}px;"></div>`,
            ).join("")
          }</div>`;
      break;
    default:
      resposta = temLacuna(b.enunciado)
        ? ""
        : `<div style="margin-top:10px;">${
            Array.from({ length: linhas }).map(() =>
              `<div style="border-bottom:1.5px solid #333;height:${pt * 2.2}px;"></div>`,
            ).join("")
          }</div>`;
  }

  const img = b.imagem
    ? `<div style="text-align:center;margin:12px 0;"><img src="${b.imagem}" alt="" style="max-width:250px;max-height:250px;object-fit:contain;" /></div>`
    : "";

  return `<div style="margin-bottom:${pt * 2}px;break-inside:avoid;">
    <div style="display:flex;align-items:flex-start;">${num}<div style="flex:1;white-space:pre-wrap;">${esc(limparEnunciado(b.enunciado, b.numero != null))}</div></div>
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

  // O material que o professor anexou, impresso na própria folha. Vai sempre na
  // página 1; nas demais, só quando o perfil pedir para não fazer o aluno voltar.
  const mat = folha.material_original;
  const mostraMaterial = mat?.imagem && (idx === 0 || cfg.repetir_material);
  const materialHtml = mostraMaterial
    ? `<div style="border:1.5px solid #ddd;border-radius:8px;padding:10px;margin-bottom:${pt * 2}px;background:#FCFCFC;">
         <div style="font-size:${pt * 0.72}pt;letter-spacing:1px;color:#888;text-transform:uppercase;margin-bottom:6px;">
           ${esc(mat!.legenda || "Material da atividade")}
         </div>
         <img src="${mat!.imagem}" alt="" style="display:block;margin:0 auto;max-width:100%;max-height:330px;object-fit:contain;" />
       </div>`
    : "";

  // Nome/turma/data só na primeira página: repetir o cabeçalho inteiro em todas
  // come o espaço útil e não serve para nada, já que o aluno preenche uma vez.
  const cabecalho = idx === 0
    ? `<div style="border-bottom:2px solid #ddd;padding-bottom:12px;margin-bottom:18px;">
         <div style="font-size:${pt * 0.72}pt;letter-spacing:2px;color:#888;text-transform:uppercase;">Atividade Pedagógica</div>
         <div style="font-size:${pt * 1.5}pt;font-weight:700;margin-top:4px;">${esc(folha.titulo || "Atividade")}</div>
         ${folha.disciplina ? `<div style="font-size:${pt * 0.8}pt;color:#777;margin-top:2px;">${esc(folha.disciplina)}</div>` : ""}
       </div>
       <div style="display:flex;gap:20px;padding:10px 0;border-top:1px solid #ccc;border-bottom:1px solid #ccc;font-size:${pt * 0.85}pt;margin-bottom:${pt * 1.6}px;">
         <div style="flex:2;">Nome: <span style="display:inline-block;border-bottom:1px solid #333;min-width:190px;"></span></div>
         <div style="flex:1;">Turma: <span style="display:inline-block;border-bottom:1px solid #333;min-width:70px;"></span></div>
         <div style="flex:1;">Data: ___/___/______</div>
       </div>`
    : `<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:${pt * 1.6}px;">
         <span style="font-size:${pt * 0.95}pt;font-weight:700;">${esc(folha.titulo || "Atividade")}</span>
         <span style="font-size:${pt * 0.72}pt;color:#999;">Página ${idx + 1} de ${total}</span>
       </div>`;

  return `<div style="width:794px;min-height:1123px;box-sizing:border-box;padding:56px 64px;background:#fff;color:#111;
      font-family:${pilhaFonte(cfg.fonte)};font-size:${pt}pt;line-height:${cfg.espacamento ?? 1.5};">
    ${cabecalho}
    ${materialHtml}
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

/** Largura e altura reais da imagem, lidas dos bytes (PNG e JPEG). */
function dimensoesImagem(bytes: Uint8Array): { w: number; h: number } | null {
  // PNG: IHDR traz largura e altura nos bytes 16..23
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  // JPEG: percorre os marcadores até achar um SOF
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marcador = bytes[i + 1];
      // SOF0..SOF15, pulando os que não carregam dimensão
      if (marcador >= 0xc0 && marcador <= 0xcf &&
          marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
        const dv = new DataView(bytes.buffer, bytes.byteOffset);
        return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }
  return null;
}

/** Encaixa o material anexado na largura útil da página, sem distorcer. */
function dimensaoMaterial(dataUrl: string): { width: number; height: number } {
  const MAX_W = 450;   // largura útil do A4 com as margens da folha
  const MAX_H = 330;
  const dim = dimensoesImagem(dataUrlParaBytes(dataUrl));
  if (!dim || !dim.w || !dim.h) return { width: 400, height: 260 };
  const escala = Math.min(MAX_W / dim.w, MAX_H / dim.h, 1);
  return { width: Math.round(dim.w * escala), height: Math.round(dim.h * escala) };
}

/**
 * No Word não existe fallback de fonte: se a fonte não estiver instalada na
 * máquina, ele troca por uma qualquer — normalmente uma serifada, que é o
 * oposto do que a adaptação de dislexia pede. Lexend quase nunca está
 * instalada, então no DOCX usamos Verdana, que vem em todo Windows e Mac e
 * também é recomendada para leitores com dislexia. No preview em HTML a
 * Lexend continua sendo usada, porque lá existe pilha de fallback.
 */
function fonteDocx(fonte?: string): string {
  const f = (fonte || "Verdana").trim();
  const arriscadas = ["lexend", "opendyslexic", "dyslexie", "atkinson hyperlegible"];
  return arriscadas.includes(f.toLowerCase()) ? "Verdana" : f;
}

/** Caixa de resposta com altura real: tabela de 1 célula com altura fixa. */
function caixaResposta(alturaTwips: number, tracejada: boolean): Table {
  const estilo = tracejada ? BorderStyle.DASHED : BorderStyle.SINGLE;
  const cor = tracejada ? "999999" : "333333";
  const borda = { style: estilo, size: tracejada ? 8 : 6, color: cor };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      height: { value: alturaTwips, rule: "atLeast" },
      children: [new TableCell({
        verticalAlign: VerticalAlign.TOP,
        borders: { top: borda, bottom: borda, left: borda, right: borda },
        children: [new Paragraph({ children: [new TextRun({ text: " " })] })],
      })],
    })],
  });
}

export async function folhaParaDocx(folha: Folha): Promise<Blob> {
  const cfg = folha.config ?? {};
  const pt = cfg.tamanho_pt ?? 12;
  const half = pt * 2;                                  // docx mede em meios-pontos
  const fonte = fonteDocx(cfg.fonte);
  const linhaEspaco = Math.round((cfg.espacamento ?? 1.5) * 240);
  const paginas = folha.paginas ?? [];

  const filhos: (Paragraph | Table)[] = [];

  paginas.forEach((pag, pi) => {
    if (pi > 0) filhos.push(new Paragraph({ children: [new PageBreak()] }));

    if (pi === 0) {
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
    } else {
      // Páginas seguintes: só o título, sem repetir nome/turma/data.
      filhos.push(new Paragraph({
        children: [new TextRun({ text: folha.titulo || "Atividade", bold: true, size: Math.round(half * 0.95), font: fonte })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } },
        spacing: { after: 200 },
      }));
    }

    // Material anexado pelo professor, impresso na folha
    const mat = folha.material_original;
    if (mat?.imagem && (pi === 0 || cfg.repetir_material)) {
      try {
        filhos.push(new Paragraph({
          children: [new TextRun({
            text: (mat.legenda || "Material da atividade").toUpperCase(),
            size: Math.round(half * 0.72), color: "888888", font: fonte,
          })],
          spacing: { after: 80 },
        }));
        filhos.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            data: dataUrlParaBytes(mat.imagem),
            type: tipoImagem(mat.imagem),
            transformation: dimensaoMaterial(mat.imagem),
          })],
          spacing: { after: 260 },
        }));
      } catch { /* imagem inválida: segue sem o material */ }
    }

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
          text: `${b.numero != null ? `${b.numero}. ` : ""}${limparEnunciado(b.enunciado, b.numero != null)}`,
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
              transformation: { width: 230, height: 230 },
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
          // ~7cm de altura para o aluno desenhar
          filhos.push(caixaResposta(4000, true));
          filhos.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 240 } }));
          break;
        case "caixa":
          // cada "linha" pedida vira ~1cm de altura útil
          filhos.push(caixaResposta(Math.max(1200, linhas * 620), false));
          filhos.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 240 } }));
          break;
        case "completar":
          // mesma regra do HTML: sem lacuna no enunciado, dá a linha
          if (!temLacuna(b.enunciado)) {
            for (let i = 0; i < linhas; i++) {
              filhos.push(new Paragraph({
                children: [new TextRun({ text: " ", size: half, font: fonte })],
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 10 } },
                spacing: { after: 200, line: linhaEspaco },
              }));
            }
          }
          break;
        default:
          if (!temLacuna(b.enunciado)) {
            for (let i = 0; i < linhas; i++) {
              filhos.push(new Paragraph({
                children: [new TextRun({ text: " ", size: half, font: fonte })],
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 10 } },
                spacing: { after: 200, line: linhaEspaco },
              }));
            }
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
