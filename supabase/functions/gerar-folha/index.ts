// Gera a FOLHA DE ATIVIDADE pronta para imprimir, com LAYOUT LIVRE.
//
// O modelo recebe a atividade já adaptada e o perfil do estudante e desenha a
// folha em HTML do jeito que preferir — organização, cores, tipografia, número de
// páginas. O formato fixo de seções coloridas numa página só foi abandonado: na
// avaliação com a professora, os blocos ficavam grudados uns nos outros, e o
// ChatGPT de uso comum, sem regra nenhuma de diagramação, entregava folhas melhores.
//
// O que continua sendo do código, e não do modelo:
//   - as ilustrações: o modelo só marca onde quer cada uma; o servidor gera e embute;
//   - o material anexado pelo professor, embutido exatamente como foi enviado;
//   - a limpeza do HTML (sem script, sem recurso externo);
//   - a paginação em A4, feita no navegador, sem encolher nada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MODELO = "openai/gpt-6-luna";
// Raciocínio é opcional nesta família, mas o padrão é "medium". Fixado em "low"
// para os tokens de raciocínio não consumirem o teto da resposta.
const RACIOCINIO = { effort: "low" };
const MAX_TOKENS = 16000;        // HTML com CSS ocupa bem mais que o JSON antigo
const MAX_CONTEUDO = 12000;
const LIMITE_DIARIO = 200;       // compartilhado com adapt-compare
const TIMEOUT_MS = 120_000;
const MAX_IMAGENS = 6;           // geradas em paralelo: o teto pesa no custo, não no tempo
const MAX_ANEXOS = 2;
const MAX_ANEXO_BYTES = 4_000_000;

const ORIGENS_PERMITIDAS = [
  "https://tupi-adp.vercel.app",
  "http://localhost:8080",
];

function cors(origin: string | null) {
  const ok = origin && ORIGENS_PERMITIDAS.includes(origin) ? origin : ORIGENS_PERMITIDAS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
const json = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });


// ---------------------------------------------------------------------------
// Prompt — curto de propósito. Só há regra técnica; o visual é do modelo.
// ---------------------------------------------------------------------------
function montarPrompt(ctx: string, conteudo: string, temMaterial: boolean) {
  const sobreMaterial = temMaterial
    ? `
O professor anexou o material original (a imagem que acompanha esta mensagem). Ele será
impresso na folha: coloque <img data-material alt="material da atividade"> onde ele deve
aparecer e escreva os enunciados apontando para ele. Não transcreva o material inteiro.
`
    : "";

  return `Você é um professor especialista em educação inclusiva e um ótimo designer de
materiais didáticos. Monte a folha de atividade deste estudante, pronta para imprimir e
entregar a ele.

Você tem liberdade para escolher o layout, a organização, as cores, a tipografia, o
espaçamento e quantas páginas forem necessárias. Faça a melhor folha que você faria
para este estudante, considerando o perfil abaixo.

COMO COSTUMAM SER AS FOLHAS QUE FUNCIONAM — REFERÊNCIA, NÃO MOLDE
As folhas que professoras aprovaram para estudantes como este são sóbrias e respiram:
- cabeçalho discreto (disciplina • ano), título, e uma linha de NOME e DATA;
- partes numeradas, cada uma com um subtítulo colorido e o texto em preto, em letra
  grande e com bastante espaço entre as linhas;
- poucas caixas: um fundo claro para destacar o exemplo ou o banco de palavras, e o
  resto direto na página, sem moldura em volta de tudo;
- uma ilustração larga do tema logo depois da situação; outras só se ajudarem a entender;
- páginas planejadas: em geral a primeira é para ler e entender, e a segunda para
  praticar e produzir ("AGORA É SUA VEZ!"), repetindo o cabeçalho e a linha de NOME;
- espaço em branco no pé da página é normal. Folha apertada não é.

TAMANHO DA PÁGINA — ESTIME ANTES DE FECHAR CADA UMA
Cada página tem cerca de 1.050px de altura útil. Para ter noção, em linhas: com letra
de 14px e espaçamento confortável, cabem umas 35 linhas — planeje para 30, deixando
folga, porque a conta nunca é exata. A ilustração larga
ocupa o lugar de umas 12 linhas; o cabeçalho com título e NOME, umas 5; cada subtítulo
de parte, umas 2; cada linha de resposta, umas 2. Some o que pôs em cada página.
Uma página que transborda parece folha quebrada: o excedente vai sozinho para uma
página quase vazia. Se a conta não fecha, planeje uma página a mais (break-before: page
antes da parte que não cabe) — três páginas bem resolvidas são melhores que duas
estourando. E nunca deixe uma parte começar no pé de uma página e terminar na outra.

${ctx}

A ATIVIDADE — este é o conteúdo da folha:
${conteudo}

Esse conteúdo já foi definido com o professor: mantenha as palavras, os textos, os números,
os nomes e as perguntas. Como apresentar é decisão sua. Se aparecerem marcadores entre
colchetes, como [DIA] ou [NOME DO LOCAL], troque cada um por uma linha para o estudante
preencher — colchete não é algo que ele saiba completar.
${sobreMaterial}
FORMATO DA RESPOSTA — são exigências técnicas, não estéticas:
- Responda apenas com um documento HTML completo, de <!DOCTYPE html> a </html>, com o CSS
  dentro de <style>. Sem markdown, sem cercas de código, sem comentário antes ou depois.
- A página tem 794px de largura (A4 a 96 dpi). Não use vw, vh nem position: fixed, e não
  fixe a altura das páginas: o sistema divide o documento em folhas A4 sozinho, sem
  encolher nada. Para começar uma página nova num ponto exato, use style="break-before: page".
  Use break-inside: avoid nos blocos que não podem ser partidos entre duas páginas.
- A folha é capturada como tela: não dependa de @media print.
- Sem JavaScript, sem links externos e sem fontes da internet. Fontes disponíveis:
  Arial, Verdana, Tahoma, Trebuchet MS, Georgia, Inter e Outfit.
- Sem <input>, <textarea> ou outros campos de formulário: a folha é de papel. Para o aluno
  escrever, desenhe linhas ou caixas com CSS.
- Ilustrações: você não desenha nem busca imagens. Onde quiser uma, escreva
  <img data-ilustracao="descrição em português, de 15 a 25 palavras, do objeto ou da cena" alt="...">
  e o sistema gera a imagem nesse lugar. Cada marcação [IMAGEM: ...] da atividade vira uma
  dessas, no mesmo ponto. No máximo ${MAX_IMAGENS} na folha inteira. Defina o tamanho de cada
  uma pelo CSS. Nunca peça figura com letras, palavras ou texto escrito dentro.`;
}

// ---------------------------------------------------------------------------
// Ilustrações: baixadas no servidor e embutidas em base64, para a exportação
// não depender de rede nem de CORS no navegador.
// ---------------------------------------------------------------------------
/** Estilo exigido da ilustração: contorno grosso, sem texto, sem fundo. */
// Sem as palavras "coloring book" e "worksheet": elas contaminam o resultado e o
// modelo de imagem acaba desenhando livros e estantes em vez do objeto pedido.
const ESTILO_ILUSTRACAO =
  "colorful flat vector illustration, modern clean style, vibrant friendly colors, " +
  "bold simple shapes, plain white background, centered composition, " +
  "educational material for children, cheerful and friendly";

const MODELO_IMAGEM = "google/gemini-3-pro-image";
let ultimoErroImagem = "";

/**
 * Gera uma ilustração pela OpenRouter e devolve como data URL.
 *
 * Substitui o Pollinations, que passou a responder 402 (pagamento exigido) e 503.
 * Como a OpenRouter já está paga para os modelos de texto, a mesma chave serve.
 */
async function baixarIlustracao(prompt: string, apiKey: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://tupi-adp.vercel.app",
        "X-Title": "TUPI",
      },
      body: JSON.stringify({
        model: MODELO_IMAGEM,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const corpo = (await r.text().catch(() => "")).slice(0, 300);
      console.error(`ilustração HTTP ${r.status}: ${corpo}`);
      ultimoErroImagem = `HTTP ${r.status}: ${corpo}`;
      return null;
    }

    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    // A imagem pode vir em message.images[] ou dentro de content[]
    const direta = msg?.images?.[0]?.image_url?.url;
    if (typeof direta === "string" && direta.startsWith("data:")) return direta;
    if (Array.isArray(msg?.content)) {
      for (const parte of msg.content) {
        const u = parte?.image_url?.url;
        if (typeof u === "string" && u.startsWith("data:")) return u;
      }
    }
    const amostra = JSON.stringify(data).slice(0, 300);
    console.error("ilustração sem imagem:", amostra);
    ultimoErroImagem = `sem imagem: ${amostra}`;
    return null;
  } catch (e) {
    console.error("ilustração falhou:", (e as Error).message);
    ultimoErroImagem = `exceção: ${(e as Error).message}`;
    return null;
  } finally {
    clearTimeout(timer);
  }
}


// ---------------------------------------------------------------------------
// Utilidades de HTML
// ---------------------------------------------------------------------------

/** Tira cercas de código e qualquer texto fora do documento. */
function extrairHtml(bruto: string): string {
  let t = bruto.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const ini = t.search(/<!DOCTYPE html|<html[\s>]/i);
  const fim = t.toLowerCase().lastIndexOf("</html>");
  if (ini >= 0 && fim > ini) t = t.slice(ini, fim + 7);
  return t;
}

/**
 * Primeira camada de limpeza. A segunda, que é a que vale, roda no navegador com
 * DOMPurify antes de qualquer renderização. Aqui só se retira o que nunca deveria
 * ter vindo: script, frames, recursos externos e handlers de evento.
 */
function limparHtml(h: string): string {
  return h
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|frame|frameset|applet|base|link|meta|form)\b[^>]*>/gi, "")
    .replace(/<\/(iframe|object|embed|frame|frameset|applet|form)\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|srcset)\s*=\s*("|')\s*(?:javascript|https?|\/\/)[^"']*\2/gi, "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, "none");
}

function escAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function textoDe(s?: string) {
  return (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (uErr || !user) return json({ error: "Não autorizado" }, 401, origin);

    const apiKey = Deno.env.get("OPENROUTER_KEY");
    if (!apiKey) return json({ error: "Serviço de IA indisponível." }, 503, origin);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Corpo inválido" }, 400, origin);
    const { aluno_id, conteudo, com_imagens, anexos } = body as {
      aluno_id?: string; conteudo?: string; com_imagens?: boolean;
      anexos?: { nome?: string; mime?: string; data?: string }[];
    };

    if (!aluno_id) return json({ error: "Selecione um aluno." }, 400, origin);
    const texto = (conteudo ?? "").trim();
    if (!texto) return json({ error: "Falta o conteúdo da atividade." }, 400, origin);
    if (texto.length > MAX_CONTEUDO) return json({ error: "Conteúdo longo demais." }, 413, origin);

    // Material anexado pelo professor. Só imagem é impressa na folha; PDF segue
    // apenas como contexto para o modelo.
    const listaAnexos = (Array.isArray(anexos) ? anexos : []).slice(0, MAX_ANEXOS);
    for (const a of listaAnexos) {
      if (typeof a?.data !== "string" || typeof a?.mime !== "string") {
        return json({ error: "Anexo inválido." }, 400, origin);
      }
      if (a.data.length * 0.75 > MAX_ANEXO_BYTES) {
        return json({ error: `Cada anexo deve ter no máximo ${MAX_ANEXO_BYTES / 1_000_000} MB.` }, 413, origin);
      }
      if (!a.mime.startsWith("image/") && a.mime !== "application/pdf") {
        return json({ error: "Só são aceitos imagens e PDF." }, 415, origin);
      }
    }
    const imagemMaterial = listaAnexos.find((a) => a.mime!.startsWith("image/"));

    // Rate limit compartilhado com a comparação de modelos
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: uso } = await admin.rpc("incrementa_uso_ia", { p_professor: user.id, p_limite: LIMITE_DIARIO });
    const linha = Array.isArray(uso) ? uso[0] : uso;
    if (linha && linha.permitido === false) {
      return json({ error: `Limite de ${LIMITE_DIARIO} gerações por dia atingido.` }, 429, origin);
    }

    // Perfil do aluno — é o que dita o layout
    const [aRes, nRes, pRes] = await Promise.all([
      supabase.from("alunos").select("nome, idade, serie").eq("id", aluno_id).maybeSingle(),
      supabase.from("necessidades_educacionais").select("condicao, nivel_suporte, detalhes").eq("aluno_id", aluno_id),
      supabase.from("perfil_pedagogico").select("*").eq("aluno_id", aluno_id).maybeSingle(),
    ]);
    const aluno = aRes.data;
    if (!aluno) return json({ error: "Aluno não encontrado." }, 404, origin);

    let ctx = `PERFIL DO ALUNO\nNome: ${aluno.nome} — ${aluno.idade ?? "?"} anos, série ${aluno.serie || "?"}.`;
    const necs = nRes.data ?? [];
    if (necs.length) {
      ctx += `\nCondições: ${necs.map((n) =>
        `${n.condicao}${n.nivel_suporte ? ` (suporte ${n.nivel_suporte})` : ""}${n.detalhes ? ` — ${n.detalhes}` : ""}`).join("; ")}.`;
    }
    const p = pRes.data;
    if (p) {
      const campos: [string, string][] = [
        ["nível de aprendizagem", p.nivel_aprendizagem],
        ["preferências de aprendizagem", p.preferencias_aprendizagem],
        ["dificuldades", p.dificuldades],
        ["facilidades", p.facilidades],
        ["hiperfocos", p.hiperfocos],
        ["interesses", p.interesses_pessoais],
        ["estratégias que funcionam", p.estrategias_funcionam],
        ["comportamento", p.comportamento],
        ["dificuldades específicas", p.dificuldades_especificas],
        ["observações do professor", p.observacoes_pedagogicas],
      ];
      const ok = campos.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`);
      if (ok.length) ctx += `\n${ok.join("\n")}`;
    }

    // Ilustrações já marcadas na atividade ficam no texto: o modelo as converte
    // em <img data-ilustracao> no ponto em que fizer sentido no layout dele.
    const partesUsuario: unknown[] = [
      { type: "text", text: montarPrompt(ctx, texto, listaAnexos.length > 0) },
    ];
    for (const a of listaAnexos) {
      const dataUrl = `data:${a.mime};base64,${a.data}`;
      if (a.mime!.startsWith("image/")) {
        partesUsuario.push({ type: "image_url", image_url: { url: dataUrl } });
      } else {
        partesUsuario.push({ type: "file", file: { filename: a.nome || "material.pdf", file_data: dataUrl } });
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tupi-adp.vercel.app",
          "X-Title": "TUPI",
        },
        body: JSON.stringify({
          model: MODELO,
          max_tokens: MAX_TOKENS,
          reasoning: RACIOCINIO,
          messages: [{ role: "user", content: partesUsuario }],
        }),
      });
    } catch (e) {
      const abortado = (e as Error).name === "AbortError";
      return json({ error: abortado ? "O modelo demorou demais para montar a folha." : "Falha ao chamar o modelo." }, 504, origin);
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const d = await resp.text().catch(() => "");
      console.error(`gerar-folha HTTP ${resp.status}: ${d.slice(0, 300)}`);
      return json({ error: resp.status === 402 ? "Créditos da OpenRouter esgotados." : "O modelo não respondeu." }, 502, origin);
    }

    const data = await resp.json();
    let html = extrairHtml(String(data?.choices?.[0]?.message?.content ?? ""));
    if (!/<body[\s>]/i.test(html) || html.length < 200) {
      console.error("HTML inválido do modelo:", html.slice(0, 300));
      return json({ error: "O modelo devolveu um formato inesperado. Tente de novo." }, 502, origin);
    }
    html = limparHtml(html);

    // Marcação [IMAGEM: ...] que o modelo deixou como texto também vira ilustração.
    // Só no texto visível: dentro de um atributo ou do <style>, virar tag quebraria o HTML.
    {
      let emStyle = false;
      html = html.split(/(<[^>]+>)/).map((parte) => {
        if (parte.startsWith("<")) {
          if (/^<style\b/i.test(parte)) emStyle = true;
          else if (/^<\/style/i.test(parte)) emStyle = false;
          return parte;
        }
        if (emStyle) return parte;
        return parte.replace(
          /\[\s*(?:IMAGEM|IMAGE|FIGURA|DESENHO)\s*:\s*([^\]]+)\]/gi,
          (_m, d: string) => `<img data-ilustracao="${escAttr(d.trim())}" alt="" style="max-width:220px;display:block;margin:8px auto;">`,
        );
      }).join("");
    }

    // -------- Ilustrações --------
    const tags = [...html.matchAll(/<img\b[^>]*\bdata-ilustracao\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi)];
    const alvos = tags.slice(0, MAX_IMAGENS);
    let aviso_imagens: string | undefined;
    if (alvos.length > 0 && com_imagens !== false) {
      const imagens = await Promise.all(alvos.map((m) => {
        const desc = (m[2] ?? m[3] ?? "").trim().slice(0, 300);
        return desc ? baixarIlustracao(`${desc}, ${ESTILO_ILUSTRACAO}`, apiKey) : Promise.resolve(null);
      }));
      // Substitui de trás para frente para os índices não se deslocarem.
      for (let i = alvos.length - 1; i >= 0; i--) {
        const m = alvos[i];
        const ini = m.index!;
        const fim = ini + m[0].length;
        const novo = imagens[i]
          ? m[0].replace(/\bdata-ilustracao\s*=\s*("[^"]*"|'[^']*')/i, `src="${imagens[i]}"`)
          : "";
        html = html.slice(0, ini) + novo + html.slice(fim);
      }
      const obtidas = imagens.filter(Boolean).length;
      if (obtidas < alvos.length) {
        aviso_imagens = ultimoErroImagem.includes("402")
          ? "As ilustrações não foram geradas: a OpenRouter exige pelo menos US$ 1,00 de folga no limite da chave para gerar imagem. Aumente o limite em openrouter.ai/settings/keys ou adicione créditos."
          : `Só ${obtidas} de ${alvos.length} ilustrações foram geradas. Tente novamente em alguns instantes.`;
      }
    }
    // Marcações além do teto, ou com imagens desligadas, saem da folha.
    html = html.replace(/<img\b[^>]*\bdata-ilustracao\b[^>]*>/gi, "");

    // -------- Material anexado --------
    // Embutido pelo servidor, exatamente como o professor enviou.
    if (imagemMaterial) {
      const src = `data:${imagemMaterial.mime};base64,${imagemMaterial.data}`;
      let colocado = false;
      html = html.replace(/<img\b[^>]*\bdata-material\b[^>]*>/gi, (tag) => {
        if (colocado) return "";
        colocado = true;
        return tag.replace(/\bdata-material\b(\s*=\s*("[^"]*"|'[^']*'))?/i, `src="${src}"`);
      });
      if (!colocado) {
        html = html.replace(/<body([^>]*)>/i, (b) =>
          `${b}<div style="text-align:center;margin:16px 0;break-inside:avoid;"><img src="${src}" alt="material da atividade" style="max-width:100%;max-height:520px;object-fit:contain;"></div>`);
      }
    } else {
      html = html.replace(/<img\b[^>]*\bdata-material\b[^>]*>/gi, "");
    }

    const titulo = textoDe(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
      || textoDe(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
      || "Folha de atividade";

    return json({ titulo, html, aluno: aluno.nome, ...(aviso_imagens ? { aviso_imagens } : {}) }, 200, origin);
  } catch (e) {
    console.error("gerar-folha erro:", e);
    return json({ error: "Erro inesperado ao gerar a folha." }, 500, origin);
  }
});
