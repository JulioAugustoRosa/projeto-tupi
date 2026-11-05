// Gera uma FOLHA DE ATIVIDADE estruturada, cujo LAYOUT é definido pelo perfil
// do aluno: quantos exercícios cabem por página, fonte, tamanho e espaçamento.
//
// Devolve JSON (não HTML) para que o cliente renderize PDF, PNG e DOCX a partir
// da mesma estrutura — no DOCX isso vira quebra de página de verdade.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// A diagramação era o elo fraco: num modelo "lite" ela explodia 5 exercícios em
// 10 páginas, reescrevia enunciados prontos, descartava as ilustrações e mandava
// um par só nos exercícios de ligar. Exige obediência estrutural, não criatividade.
const MODELO = "openai/gpt-5-mini";
// Raciocínio é obrigatório nesta família e os tokens dele saem do mesmo teto:
// sem baixar o esforço, o modelo gasta o orçamento pensando e devolve JSON vazio.
const RACIOCINIO = { effort: "low" };
const MAX_TOKENS = 12000;
const MAX_CONTEUDO = 12000;
const LIMITE_DIARIO = 200;       // compartilhado com adapt-compare
const TIMEOUT_MS = 60_000;
// Um bloco "ligar" sozinho consome 3 ilustrações, então o teto antigo de 10 se
// esgotava antes do fim da folha e exercícios como "pinte o desenho" saíam sem
// desenho nenhum. São baixadas em paralelo, então subir o teto não soma latência.
const MAX_IMAGENS = 18;
const MAX_ANEXOS = 2;
const MAX_ANEXO_BYTES = 4_000_000;
const MAX_PAGINAS = 4;  // folha densa: o certo é caber em 1 ou 2

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

interface PaginaBruta {
  instrucoes?: string;
  blocos?: { imagem_prompt?: string; imagem?: string }[];
}

// ---------------------------------------------------------------------------
// Esquema que o modelo deve devolver
// ---------------------------------------------------------------------------
const ESQUEMA = `{
  "titulo": "título curto, 2 a 5 palavras",
  "disciplina": "disciplina ou tema",
  "adaptacoes_aplicadas": ["uma frase por decisão de layout, ligada ao perfil"],
  "config": { "fonte": "Lexend", "tamanho_pt": 14, "espacamento": 1.4, "repetir_material": false },
  "legenda_material": "",
  "paginas": [
    {
      "instrucoes": "UMA frase curta de comando, no máximo 10 palavras",
      "blocos": [
        {
          "formato": "grade",
          "colunas": 3,
          "celulas": [
            { "imagem_prompt": "um gato", "texto": "GA", "texto_depois": "TO", "lacuna": "meio" },
            { "imagem_prompt": "uma bola", "texto": "BOLA", "lacuna": "nenhuma" },
            { "texto": "A", "circulo": true, "lacuna": "nenhuma" }
          ]
        },
        { "formato": "legenda", "itens_legenda": [ {"marca":"■","valor":"BO"}, {"marca":"●","valor":"CA"} ] },
        { "formato": "sequencia", "linhas_sequencia": [ {"marcas":["■","●"]}, {"marcas":["●","▲","★"]} ] }
      ]
    }
  ]
}`;

function montarPrompt(ctx: string, conteudo: string, temMaterial: boolean) {
  const sobreMaterial = temMaterial
    ? `
MATERIAL ORIGINAL ANEXADO — LEIA COM ATENÇÃO:
O professor anexou o material original (a imagem que acompanha esta mensagem) e ele
SERÁ IMPRESSO NA PRÓPRIA FOLHA, no topo da página 1, antes das instruções.
Por isso:
- NÃO transcreva o material inteiro dentro dos enunciados: o aluno vai vê-lo na folha.
- Escreva enunciados que APONTEM para ele: "Observe a tirinha acima", "No quadrinho 2...".
- Baseie as perguntas no que realmente aparece no material. Não invente personagens,
  falas ou cenas que não estão lá.
- Preencha "legenda_material" com um rótulo curto do que é esse material.
- Se a folha tiver mais de uma página e o aluno se perder ao voltar páginas, marque
  "repetir_material": true para o material ser reimpresso em todas as páginas.
`
    : `
Não há material anexado: tudo o que o aluno precisa ler deve estar escrito nos enunciados.
Deixe "legenda_material" como string vazia e "repetir_material" como false.
`;

  return `Você monta FOLHAS DE ATIVIDADE IMPRESSAS para alfabetização, no padrão das
folhas que circulam entre professores: pouca escrita, muita figura, tudo organizado
em GRADE, com 6 a 12 itens cabendo numa página só.

${ctx}
${sobreMaterial}
==================================================
COMO É UMA FOLHA BOA — LEIA ANTES DE TUDO
==================================================

A folha tem UMA linha de instrução no topo e, embaixo, um ARRANJO VISUAL.
Nunca uma lista de perguntas empilhadas, uma embaixo da outra.

Você tem três arranjos. Escolha o que serve ao que o professor pediu:

1) "grade" — o mais usado. Células com borda, 2 a 4 colunas, 6 a 12 no total.
   Cada célula junta FIGURA + PALAVRA + LACUNA. Serve para:
   - completar sílaba: figura do domino, texto "", texto_depois "MINÓ", lacuna "antes"
   - completar no meio: figura do sapato, texto "SA", texto_depois "TO", lacuna "meio"
   - completar no fim: figura do saco, texto "SACO", lacuna "depois"
   - só reconhecer: figura + palavra inteira, lacuna "nenhuma"
   - letra em destaque: texto "A", circulo true, para servir de cabeçalho visual

2) "legenda" + "sequencia" — o "código secreto". Primeiro um bloco "legenda"
   ligando marcas a sílabas, depois um bloco "sequencia" com as combinações a
   decifrar. Use marcas geométricas: ■ ● ▲ ★ ◆ ♥ ⬟ ➡ ⬅ ⬆ ⬇ ☁ ⬢ ✚
   A legenda vem SEMPRE antes da sequência, e toda marca usada na sequência
   precisa estar na legenda.

3) "ligar" — palavras de um lado, figuras do outro, 3 ou 4 pares embaralhados.

Os formatos antigos ("linhas", "caixa", "multipla", "desenho") ainda existem, mas
são o ÚLTIMO recurso: eles geram folha vazia e feia. Prefira sempre grade.

==================================================
REGRAS DE OURO
==================================================

- DENSIDADE: 6 a 12 itens por página. Uma página com 1 ou 2 exercícios está ERRADA.
  Antes de criar uma página nova, encha a atual.
- UMA instrução por página, com no máximo 10 palavras, no imperativo:
  "Complete as palavras." "Pinte as figuras com A." "Descubra o código."
- NADA de enunciado por item. Na grade, a célula não tem pergunta: a instrução
  do topo já diz o que fazer em todas.
- PALAVRAS EM CAIXA ALTA, que é o padrão da alfabetização.
- "imagem_prompt" é um OBJETO CONCRETO em até 5 palavras, em português.
  NUNCA peça desenho de letra, sílaba ou palavra escrita: sai ilegível.
  Toda célula da grade deveria ter figura, a menos que ela seja só uma letra.
- Use as palavras e os temas que o PROFESSOR pediu. O hiperfoco do aluno entra na
  escolha das palavras e das figuras, nunca mudando o conteúdo que foi pedido.

==================================================
O QUE O PROFESSOR PEDIU
==================================================

${conteudo}

Transforme isso numa folha com os arranjos acima. Preserve o conteúdo pedido:
as mesmas palavras, as mesmas sílabas, o mesmo objetivo. O que você decide é a
APRESENTAÇÃO.

REGRAS DE PREENCHIMENTO:
1. Entre 1 e 3 páginas. Só crie a segunda se a primeira estiver cheia.
2. "colunas": 3 é o padrão; 2 se as palavras forem longas; 4 se forem curtas.
3. "adaptacoes_aplicadas": uma frase por decisão, ligada ao perfil do estudante.
4. "fonte" aceita exatamente um destes nomes, sem barras nem alternativas:
   "Lexend" (quem ainda não lê com fluência) ou "Verdana" (os demais).
4. Responda em português brasileiro nos textos voltados ao aluno.

Responda APENAS com um JSON válido neste formato, sem markdown e sem cercas:
${ESQUEMA}`;
}

// ---------------------------------------------------------------------------
// Ilustrações: baixadas no servidor e embutidas em base64, para a exportação
// não depender de rede nem de CORS no navegador.
// ---------------------------------------------------------------------------
/** Estilo exigido da ilustração: contorno grosso, sem texto, sem fundo. */
// Sem as palavras "coloring book" e "worksheet": elas contaminam o resultado e o
// modelo de imagem acaba desenhando livros e estantes em vez do objeto pedido.
const ESTILO_ILUSTRACAO =
  "black and white line art, thick clean outlines, no shading, no color fill, " +
  "plain white background, no text, no letters, no numbers, single object, centered, " +
  "simple flat illustration for a young child";

/**
 * Extrai as marcações [IMAGEM: ...] do texto da atividade, na ordem em que
 * aparecem, e devolve o texto já limpo.
 *
 * Isso é feito em código, não pelo modelo: ao pedir que ele próprio convertesse as
 * marcações em "imagem_prompt", ele descartava a maioria — numa folha de
 * alfabetização, onde a figura é o conteúdo principal, perder imagem é perder a
 * atividade.
 */
function extrairImagens(texto: string): { limpo: string; descricoes: string[] } {
  const descricoes: string[] = [];
  const limpo = (texto || "").replace(
    /\[\s*(?:IMAGEM|IMAGE|FIGURA|DESENHO)\s*:\s*([^\]]+)\]/gi,
    (_m, desc: string) => {
      descricoes.push(String(desc).trim().slice(0, 120));
      return "";
    },
  );
  return { limpo: limpo.replace(/[ \t]{2,}/g, " ").trim(), descricoes };
}

const MODELO_IMAGEM = "google/gemini-2.5-flash-image";

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
      console.error(`ilustração HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
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
    console.error("ilustração sem imagem:", JSON.stringify(data).slice(0, 250));
    return null;
  } catch (e) {
    console.error("ilustração falhou:", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
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

    // As ilustrações são retiradas do texto aqui e reatribuídas aos blocos depois,
    // sem depender de o modelo preservá-las.
    const { limpo: textoSemImagens, descricoes: descImagens } = extrairImagens(texto);

    // Mensagem do usuário: prompt + o material anexado, para o modelo escrever
    // enunciados que apontem para o que realmente está na imagem.
    const partesUsuario: unknown[] = [
      { type: "text", text: montarPrompt(ctx, textoSemImagens, listaAnexos.length > 0) },
    ];
    for (const a of listaAnexos) {
      const dataUrl = `data:${a.mime};base64,${a.data}`;
      if (a.mime!.startsWith("image/")) {
        partesUsuario.push({ type: "image_url", image_url: { url: dataUrl } });
      } else {
        partesUsuario.push({ type: "file", file: { filename: a.nome || "material.pdf", file_data: dataUrl } });
      }
    }

    // Chamada ao modelo
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
          response_format: { type: "json_object" },
          reasoning: RACIOCINIO,
          messages: [
            { role: "system", content: "Você devolve APENAS JSON válido, sem markdown e sem cercas de código." },
            { role: "user", content: partesUsuario },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const d = await resp.text().catch(() => "");
      console.error(`gerar-folha HTTP ${resp.status}: ${d.slice(0, 300)}`);
      return json({ error: resp.status === 402 ? "Créditos da OpenRouter esgotados." : "O modelo não respondeu." }, 502, origin);
    }

    const data = await resp.json();
    let bruto: string = data?.choices?.[0]?.message?.content ?? "";
    bruto = bruto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let folha: Record<string, unknown>;
    try {
      folha = JSON.parse(bruto);
    } catch {
      console.error("JSON inválido do modelo:", bruto.slice(0, 400));
      return json({ error: "O modelo devolveu um formato inesperado. Tente de novo." }, 502, origin);
    }

    // Teto de páginas garantido aqui, não no prompt: o modelo costuma estourar,
    // transformando cada palavra numa página. Se passar do limite, os blocos são
    // redistribuídos com a menor densidade que ainda caiba no teto, preservando a
    // ordem e as instruções de cada página de origem.
    {
      const pags = (folha.paginas ?? []) as PaginaBruta[];
      if (pags.length > MAX_PAGINAS) {
        const blocos: { bloco: unknown; instrucao?: string; primeiro: boolean }[] = [];
        for (const p of pags) {
          (p.blocos ?? []).forEach((b, i) => {
            blocos.push({ bloco: b, instrucao: p.instrucoes, primeiro: i === 0 });
          });
        }
        const porPagina = Math.ceil(blocos.length / MAX_PAGINAS);
        const novas: PaginaBruta[] = [];
        for (let i = 0; i < blocos.length; i += porPagina) {
          const grupo = blocos.slice(i, i + porPagina);
          const comInstrucao = grupo.find((g) => g.primeiro && g.instrucao);
          novas.push({
            instrucoes: comInstrucao?.instrucao ?? grupo[0].instrucao,
            blocos: grupo.map((g) => g.bloco) as PaginaBruta["blocos"],
          });
        }
        console.log(`folha reequilibrada: ${pags.length} -> ${novas.length} páginas`);
        folha.paginas = novas;
        const cfg = (folha.config ?? {}) as Record<string, unknown>;
        cfg.itens_por_pagina = porPagina;
        folha.config = cfg;
      }
    }

    // Devolve as ilustrações aos blocos, na ordem em que apareciam no texto.
    // O que o modelo tiver inventado em "imagem_prompt" é descartado: a descrição
    // boa é a que veio da adaptação, que conhece o perfil do estudante.
    {
      const blocos: { imagem_prompt?: string; enunciado?: string }[] = [];
      for (const p of ((folha.paginas ?? []) as PaginaBruta[])) {
        for (const b of (p.blocos ?? [])) blocos.push(b);
      }
      // A descrição inventada pelo modelo da diagramação é SEMPRE descartada: foi
      // ela que encheu uma atividade de dinossauros com desenhos de livro. Vale a
      // que veio da adaptação, que conhece o perfil; e, na falta dela, uma derivada
      // do próprio enunciado, que ao menos fala do que o exercício trata.
      blocos.forEach((b, i) => {
        const comp = b as { pares?: unknown[]; celulas?: unknown[] };
        const temFilhos = (Array.isArray(comp.pares) && comp.pares.length > 0) ||
          (Array.isArray(comp.celulas) && comp.celulas.length > 0);
        // Grade e ligar têm figuras próprias, uma por célula/par.
        if (temFilhos) { delete b.imagem_prompt; return; }
        if (i < descImagens.length) {
          b.imagem_prompt = descImagens[i];
        } else {
          const base = (b.enunciado ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
          b.imagem_prompt = base
            ? `ilustração do objeto principal citado nesta instrução escolar: "${base}". Desenhe apenas esse objeto, nada de texto.`
            : "";
        }
        if (!b.imagem_prompt) delete b.imagem_prompt;
      });
      console.log(`ilustrações: ${descImagens.length} do texto, ${Math.max(0, blocos.length - descImagens.length)} derivadas do enunciado`);
    }

    // O modelo chegou a copiar o exemplo do esquema literalmente e devolveu a fonte
    // como "Lexend | Verdana", que não existe em lugar nenhum — o Word caiu numa
    // serifada e a adaptação de leitura foi perdida. Normalizamos aqui.
    {
      const cfg = (folha.config ?? {}) as Record<string, unknown>;
      const bruta = String(cfg.fonte ?? "").toLowerCase();
      cfg.fonte = bruta.includes("lexend") ? "Lexend" : "Verdana";
      folha.config = cfg;
    }

    // Renumeração sequencial em toda a folha. O modelo costuma reiniciar a
    // contagem a cada página ou repetir o mesmo número, e o renderizador tira a
    // numeração que vem dentro do enunciado para não duplicar — então o número
    // correto tem que sair daqui.
    {
      let n = 0;
      const SEM_NUMERO = new Set(["grade", "legenda", "sequencia"]);
      for (const p of ((folha.paginas ?? []) as PaginaBruta[])) {
        for (const b of (p.blocos ?? []) as { numero?: number; formato?: string }[]) {
          // A grade e a legenda são arranjos da página inteira, não "o exercício 3":
          // uma bolinha numerada ao lado delas só polui.
          if (SEM_NUMERO.has(b.formato ?? "")) { delete b.numero; continue; }
          b.numero = ++n;
        }
      }
    }

    // Ilustrações embutidas em base64
    if (com_imagens !== false) {
      const paginas = (folha.paginas ?? []) as { blocos?: { imagem_prompt?: string; imagem?: string }[] }[];
      type Img = { imagem_prompt?: string; imagem?: string };
      const alvos: Img[] = [];
      for (const pag of paginas) {
        for (const b of pag.blocos ?? []) {
          // Num bloco "ligar", as figuras ficam nos pares, não no bloco.
          const sub = (b as { pares?: Img[]; celulas?: Img[] });
          const filhosImg = [...(sub.celulas ?? []), ...(sub.pares ?? [])];
          if (filhosImg.length > 0) {
            for (const f of filhosImg) {
              if (f?.imagem_prompt && alvos.length < MAX_IMAGENS) alvos.push(f);
            }
            continue;
          }
          if (b.imagem_prompt && alvos.length < MAX_IMAGENS) alvos.push(b);
        }
      }
      const imagens = await Promise.all(
        alvos.map((b) => baixarIlustracao(`${b.imagem_prompt!}, ${ESTILO_ILUSTRACAO}`, apiKey)),
      );
      alvos.forEach((b, i) => {
        if (imagens[i]) b.imagem = imagens[i]!;
        delete b.imagem_prompt;
      });
    }

    // O material anexado é embutido pelo servidor, não pelo modelo: assim ele
    // aparece impresso na folha exatamente como o professor enviou.
    if (imagemMaterial) {
      folha.material_original = {
        imagem: `data:${imagemMaterial.mime};base64,${imagemMaterial.data}`,
        legenda: typeof folha.legenda_material === "string" && folha.legenda_material.trim()
          ? folha.legenda_material.trim()
          : "Material da atividade",
      };
      // Decisão nossa, não do modelo: se a folha tem mais de uma página, o
      // material vai em todas. Perguntar "no último quadrinho..." numa página
      // onde a tirinha não aparece obriga o aluno a ficar voltando a folha —
      // exatamente o que a adaptação deveria evitar.
      const cfg = (folha.config ?? {}) as Record<string, unknown>;
      cfg.repetir_material = ((folha.paginas as unknown[]) ?? []).length > 1;
      folha.config = cfg;
    }
    delete folha.legenda_material;

    folha.aluno = aluno.nome;
    return json(folha, 200, origin);
  } catch (e) {
    console.error("gerar-folha erro:", e);
    return json({ error: "Erro inesperado ao gerar a folha." }, 500, origin);
  }
});
