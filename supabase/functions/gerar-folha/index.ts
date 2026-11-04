// Gera uma FOLHA DE ATIVIDADE estruturada, cujo LAYOUT é definido pelo perfil
// do aluno: quantos exercícios cabem por página, fonte, tamanho e espaçamento.
//
// Devolve JSON (não HTML) para que o cliente renderize PDF, PNG e DOCX a partir
// da mesma estrutura — no DOCX isso vira quebra de página de verdade.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const MODELO = "google/gemini-2.5-flash-lite";
const MAX_TOKENS = 6000;
const MAX_CONTEUDO = 12000;
const LIMITE_DIARIO = 60;
const TIMEOUT_MS = 60_000;
const MAX_IMAGENS = 6;

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
// Esquema que o modelo deve devolver
// ---------------------------------------------------------------------------
const ESQUEMA = `{
  "titulo": "título curto da atividade",
  "disciplina": "disciplina ou tema",
  "adaptacoes_aplicadas": ["frase curta explicando CADA decisão de layout ligada ao perfil"],
  "config": {
    "fonte": "Lexend | Verdana | Arial",
    "tamanho_pt": 12,
    "espacamento": 1.5,
    "itens_por_pagina": 3
  },
  "paginas": [
    {
      "instrucoes": "1 ou 2 frases curtas dizendo ao aluno o que fazer nesta página",
      "blocos": [
        {
          "numero": 1,
          "enunciado": "texto do exercício",
          "formato": "linhas | caixa | multipla | completar | ligar | desenho",
          "opcoes": ["só para multipla"],
          "pares": [{"esquerda":"...","direita":"..."}],
          "linhas": 3,
          "imagem_prompt": "descrição EM INGLÊS da ilustração, ou vazio"
        }
      ]
    }
  ]
}`;

function montarPrompt(ctx: string, conteudo: string) {
  return `Você monta FOLHAS DE ATIVIDADE IMPRESSAS para educação inclusiva, seguindo o DUA.

${ctx}

REGRA CENTRAL — O LAYOUT É UMA ADAPTAÇÃO, NÃO UM DETALHE:

PONTO DE PARTIDA (use isto quando nada no perfil justificar mudar):
  fonte "Verdana", tamanho_pt 12, espacamento 1.5, 3 a 5 exercícios por página.

Agora ajuste a partir do perfil acima, e SÓ onde o perfil justificar. Cada desvio do
ponto de partida precisa de uma razão explícita escrita em "adaptacoes_aplicadas".
Não aplique uma adaptação de uma condição que o aluno não tem.

- Sobrecarga com muita informação, TDAH, dificuldade de atenção sustentada, ou
  deficiência intelectual: POUCOS itens por página (1 ou 2), distribuídos em MAIS
  páginas. Menos densidade por página é a adaptação.
- Dislexia, ou dificuldade de leitura/decodificação: fonte "Lexend", tamanho_pt >= 16,
  espacamento >= 1.8, enunciados curtos.
- Discalculia: apoio visual e enunciados contextualizados; evite muitas contas juntas.
- Deficiência visual ou baixa visão: tamanho_pt >= 18 e alto contraste.
- Coordenação motora fina prejudicada: "linhas" com mais espaço (linhas >= 3) e caixas
  maiores.
- Responde melhor por desenho ou oralidade: inclua blocos "desenho".

ATENÇÃO — ADAPTAR NÃO É SEMPRE SIMPLIFICAR:
- Altas habilidades, superdotação, ou nível de aprendizagem acima da média: vá na
  direção OPOSTA. MAIS densidade (4 a 6 itens por página), MENOS páginas, enunciados
  que exigem análise, justificativa ou generalização, e pelo menos um item de
  aprofundamento. Para esse aluno, uma folha fácil e espaçada é desmotivante.
  Mantenha tamanho_pt 12 e espacamento 1.5, a menos que haja também uma questão de
  leitura ou visão.
- TEA sem dificuldade de leitura: o que costuma ajudar é previsibilidade e instrução
  literal e sem ambiguidade, não fonte grande nem menos itens.
- Um aluno pode ter duas coisas ao mesmo tempo (ex.: TEA + altas habilidades). Nesse
  caso combine: instrução literal e previsível, com conteúdo desafiador.

HIPERFOCOS E INTERESSES:
Se houver hiperfocos ou interesses registrados, AMBIENTE os enunciados nesses temas
(personagens, contextos), sem mudar o conteúdo pedagógico nem o nível de exigência.

CONTEÚDO DA ATIVIDADE (já adaptado pedagogicamente; transforme em folha impressa):
${conteudo}

REGRAS DE PREENCHIMENTO:
1. NUNCA altere o conteúdo pedagógico. Só a forma de apresentar.
2. Em "adaptacoes_aplicadas", escreva uma frase por decisão, ligando ao perfil.
   Ex: "3 páginas com 1 exercício cada, porque o aluno se sobrecarrega com muita informação".
3. "itens_por_pagina" deve bater com o número real de blocos em cada página.
4. Em "completar", use underscores contínuos SEM espaços: "b_l_" certo, "b _ l _" errado.
5. "imagem_prompt" só quando a ilustração ajudar de verdade. No máximo ${MAX_IMAGENS} no total.
   Escreva em inglês e termine com "simple black and white line drawing, white background".
6. Responda em português brasileiro nos textos voltados ao aluno.
7. Entre 1 e 6 páginas.

Responda APENAS com um JSON válido neste formato, sem markdown e sem cercas de código:
${ESQUEMA}`;
}

// ---------------------------------------------------------------------------
// Ilustrações: baixadas no servidor e embutidas em base64, para a exportação
// não depender de rede nem de CORS no navegador.
// ---------------------------------------------------------------------------
async function baixarIlustracao(prompt: string): Promise<string | null> {
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=400&height=400&nologo=true&model=flux`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > 1_500_000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 8192) {
      bin += String.fromCharCode(...buf.subarray(i, i + 8192));
    }
    const mime = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
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
    const { aluno_id, conteudo, com_imagens } = body as {
      aluno_id?: string; conteudo?: string; com_imagens?: boolean;
    };

    if (!aluno_id) return json({ error: "Selecione um aluno." }, 400, origin);
    const texto = (conteudo ?? "").trim();
    if (!texto) return json({ error: "Falta o conteúdo da atividade." }, 400, origin);
    if (texto.length > MAX_CONTEUDO) return json({ error: "Conteúdo longo demais." }, 413, origin);

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
          messages: [
            { role: "system", content: "Você devolve APENAS JSON válido, sem markdown e sem cercas de código." },
            { role: "user", content: montarPrompt(ctx, texto) },
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

    // Ilustrações embutidas em base64
    if (com_imagens !== false) {
      const paginas = (folha.paginas ?? []) as { blocos?: { imagem_prompt?: string; imagem?: string }[] }[];
      const alvos: { imagem_prompt?: string; imagem?: string }[] = [];
      for (const pag of paginas) {
        for (const b of pag.blocos ?? []) {
          if (b.imagem_prompt && alvos.length < MAX_IMAGENS) alvos.push(b);
        }
      }
      const imagens = await Promise.all(alvos.map((b) => baixarIlustracao(b.imagem_prompt!)));
      alvos.forEach((b, i) => {
        if (imagens[i]) b.imagem = imagens[i]!;
        delete b.imagem_prompt;
      });
    }

    folha.aluno = aluno.nome;
    return json(folha, 200, origin);
  } catch (e) {
    console.error("gerar-folha erro:", e);
    return json({ error: "Erro inesperado ao gerar a folha." }, 500, origin);
  }
});
