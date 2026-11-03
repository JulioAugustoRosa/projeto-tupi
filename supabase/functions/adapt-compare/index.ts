// Adapta uma atividade para UM aluno usando vários modelos em paralelo (OpenRouter),
// para comparação lado a lado. O chat comum continua no Gemini.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

// Lista fixa validada no servidor. O cliente só pode pedir um destes ids.
//
// `reasoning` é essencial aqui: gpt-5-nano tem raciocínio OBRIGATÓRIO e o
// claude-haiku-5.5 usa esforço "medium" por padrão. Sem baixar o esforço, os
// dois consomem todo o max_tokens pensando e devolvem conteúdo vazio.
const MODELOS_PERMITIDOS: Record<string, { nome: string; reasoning?: Record<string, unknown> }> = {
  "openai/gpt-5-nano": {
    nome: "ChatGPT (GPT-5 Nano)",
    reasoning: { effort: "minimal" }, // obrigatório: só dá pra reduzir ao mínimo
  },
  "google/gemini-2.5-flash-lite": {
    nome: "Gemini 2.5 Flash Lite",
  },
  "anthropic/claude-haiku-5.5": {
    nome: "Claude Haiku 5.5",
    reasoning: { effort: "none" },
  },
};

const MAX_MODELOS = 3;
const MAX_TEXTO = 8000;          // caracteres do enunciado digitado
const MAX_ARQUIVO_BYTES = 4_000_000; // ~4 MB por arquivo, já em base64 decodificado
const MAX_ARQUIVOS = 2;
// Tokens de raciocínio contam dentro do max_tokens, então há folga sobre as
// ~700 palavras pedidas no prompt. É um teto, não consumo garantido.
const MAX_TOKENS = 3000;
const LIMITE_DIARIO = 60;        // chamadas por professor por dia
const TIMEOUT_MS = 45_000;

// CORS restrito à origem do app (nada de "*").
const ORIGENS_PERMITIDAS = [
  "https://tupi-adp.vercel.app",
  "http://localhost:8080",
];

function cors(origin: string | null) {
  const permitida = origin && ORIGENS_PERMITIDAS.includes(origin) ? origin : ORIGENS_PERMITIDAS[0];
  return {
    "Access-Control-Allow-Origin": permitida,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Prompt pedagógico (mesma base da adapt-activity, com DUA)
// ---------------------------------------------------------------------------
function montarSystemPrompt(alunoContexto: string, instrucoes: string) {
  return `Você é o Adaptador de Atividades do TUPI, especialista em Desenho Universal para a Aprendizagem (DUA).

Sua tarefa é produzir uma VERSÃO ADAPTADA da atividade para o aluno descrito abaixo.
Você NÃO altera o conteúdo pedagógico: adapta a FORMA DE APRESENTAÇÃO, a METODOLOGIA e as ESTRATÉGIAS DE ENSINO.

${alunoContexto}

${instrucoes ? `INSTRUÇÕES DO PROFESSOR: ${instrucoes}` : ""}

INSTRUÇÕES:
1. NUNCA altere o conteúdo original da atividade.
2. Considere os princípios do DUA: múltiplas formas de engajamento, representação e ação/expressão.
3. Conecte a adaptação aos hiperfocos e interesses do aluno sempre que fizer sentido.
4. Entregue, nesta ordem:
   - Objetivos pedagógicos da adaptação
   - Materiais necessários
   - Passo a passo da aplicação
   - Estratégias de mediação para o professor
   - Critérios de avaliação adaptados
5. Responda em português brasileiro, usando markdown.
6. Seja objetivo: no máximo ~700 palavras.
7. Nunca diga que você é uma IA nem mencione limitações técnicas.`;
}

// ---------------------------------------------------------------------------
// Chamada a um modelo
// ---------------------------------------------------------------------------
async function chamarModelo(
  modelo: string,
  systemPrompt: string,
  partesUsuario: unknown[],
  apiKey: string,
): Promise<{ modelo: string; nome: string; conteudo?: string; erro?: string; ms: number }> {
  const inicio = Date.now();
  const cfg = MODELOS_PERMITIDOS[modelo];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Atribuição do app nos rankings da OpenRouter.
        "HTTP-Referer": "https://tupi-adp.vercel.app",
        "X-Title": "TUPI",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: MAX_TOKENS,
        ...(cfg.reasoning ? { reasoning: cfg.reasoning } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: partesUsuario },
        ],
      }),
    });

    if (!resp.ok) {
      // Nunca repassamos o corpo do erro do provedor para o cliente.
      const detalhe = await resp.text().catch(() => "");
      console.error(`[${modelo}] HTTP ${resp.status}: ${detalhe.slice(0, 300)}`);
      const amigavel = resp.status === 402
        ? "Créditos da OpenRouter esgotados."
        : resp.status === 429
        ? "Limite de requisições do modelo atingido."
        : `O modelo não respondeu (erro ${resp.status}).`;
      return { modelo, nome: cfg.nome, erro: amigavel, ms: Date.now() - inicio };
    }

    const data = await resp.json();
    const conteudo = data?.choices?.[0]?.message?.content;
    if (!conteudo) {
      console.error(`[${modelo}] resposta sem conteúdo:`, JSON.stringify(data).slice(0, 300));
      return { modelo, nome: cfg.nome, erro: "Resposta vazia do modelo.", ms: Date.now() - inicio };
    }
    return { modelo, nome: cfg.nome, conteudo, ms: Date.now() - inicio };
  } catch (e) {
    const abortado = (e as Error).name === "AbortError";
    console.error(`[${modelo}] falha:`, (e as Error).message);
    return {
      modelo,
      nome: cfg.nome,
      erro: abortado ? `Tempo esgotado (${TIMEOUT_MS / 1000}s).` : "Falha ao chamar o modelo.",
      ms: Date.now() - inicio,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);

  try {
    // ---- 1. Autenticação obrigatória ------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Não autorizado" }, 401, origin);

    const apiKey = Deno.env.get("OPENROUTER_KEY");
    if (!apiKey) {
      console.error("OPENROUTER_KEY não configurada");
      return json({ error: "Serviço de IA indisponível." }, 503, origin);
    }

    // ---- 2. Validação da entrada ----------------------------------------
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Corpo inválido" }, 400, origin);

    const { aluno_id, texto, instrucoes, arquivos, modelos } = body as {
      aluno_id?: string; texto?: string; instrucoes?: string;
      arquivos?: { nome: string; mime: string; data: string }[];
      modelos?: string[];
    };

    if (!aluno_id || typeof aluno_id !== "string") {
      return json({ error: "Selecione um aluno." }, 400, origin);
    }

    const enunciado = (texto ?? "").trim();
    const listaArquivos = Array.isArray(arquivos) ? arquivos : [];

    if (!enunciado && listaArquivos.length === 0) {
      return json({ error: "Envie o enunciado da atividade ou anexe um arquivo." }, 400, origin);
    }
    if (enunciado.length > MAX_TEXTO) {
      return json({ error: `O enunciado passa de ${MAX_TEXTO} caracteres.` }, 413, origin);
    }
    if ((instrucoes ?? "").length > 2000) {
      return json({ error: "As instruções estão longas demais." }, 413, origin);
    }
    if (listaArquivos.length > MAX_ARQUIVOS) {
      return json({ error: `No máximo ${MAX_ARQUIVOS} arquivos por adaptação.` }, 413, origin);
    }
    for (const a of listaArquivos) {
      if (typeof a?.data !== "string" || typeof a?.mime !== "string") {
        return json({ error: "Arquivo inválido." }, 400, origin);
      }
      // base64 ocupa ~4/3 do tamanho original
      if (a.data.length * 0.75 > MAX_ARQUIVO_BYTES) {
        return json({ error: `Cada arquivo deve ter no máximo ${MAX_ARQUIVO_BYTES / 1_000_000} MB.` }, 413, origin);
      }
      const tipoOk = a.mime.startsWith("image/") || a.mime === "application/pdf";
      if (!tipoOk) {
        return json({ error: "Só são aceitos imagens e PDF." }, 415, origin);
      }
    }

    // Lista fixa: ignora qualquer id que o cliente invente.
    const modelosPedidos = Array.isArray(modelos) && modelos.length > 0
      ? modelos
      : Object.keys(MODELOS_PERMITIDOS);
    const modelosValidos = [...new Set(modelosPedidos)]
      .filter((m) => typeof m === "string" && m in MODELOS_PERMITIDOS)
      .slice(0, MAX_MODELOS);

    if (modelosValidos.length === 0) {
      return json({ error: "Nenhum modelo válido selecionado." }, 400, origin);
    }

    // ---- 3. Rate limit (service_role, fora do alcance do usuário) --------
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: uso, error: usoErr } = await admin.rpc("incrementa_uso_ia", {
      p_professor: user.id,
      p_limite: LIMITE_DIARIO,
    });
    if (usoErr) {
      console.error("rate limit falhou:", usoErr.message);
    } else {
      const linha = Array.isArray(uso) ? uso[0] : uso;
      if (linha && linha.permitido === false) {
        return json(
          { error: `Você atingiu o limite de ${LIMITE_DIARIO} adaptações por dia. Tente amanhã.` },
          429,
          origin,
        );
      }
    }

    // ---- 4. Contexto do aluno (RLS garante que é um aluno do professor) --
    const [alunoRes, necRes, perfilRes] = await Promise.all([
      supabase.from("alunos").select("nome, idade, serie").eq("id", aluno_id).maybeSingle(),
      supabase.from("necessidades_educacionais").select("condicao, nivel_suporte, detalhes").eq("aluno_id", aluno_id),
      supabase.from("perfil_pedagogico").select("*").eq("aluno_id", aluno_id).maybeSingle(),
    ]);

    const aluno = alunoRes.data;
    if (!aluno) return json({ error: "Aluno não encontrado." }, 404, origin);

    let ctx = `ALUNO: ${aluno.nome}, ${aluno.idade ?? "?"} anos, série ${aluno.serie || "?"}.`;
    const necs = necRes.data ?? [];
    if (necs.length > 0) {
      ctx += `\nCondições: ${necs.map((n) =>
        `${n.condicao}${n.nivel_suporte ? ` (suporte: ${n.nivel_suporte})` : ""}${n.detalhes ? ` — ${n.detalhes}` : ""}`
      ).join("; ")}.`;
    }
    const p = perfilRes.data;
    if (p) {
      const campos: [string, string][] = [
        ["nível de aprendizagem", p.nivel_aprendizagem],
        ["preferências", p.preferencias_aprendizagem],
        ["dificuldades", p.dificuldades],
        ["facilidades", p.facilidades],
        ["hiperfocos", p.hiperfocos],
        ["interesses", p.interesses_pessoais],
        ["estratégias que funcionam", p.estrategias_funcionam],
        ["comportamento", p.comportamento],
        ["dificuldades específicas", p.dificuldades_especificas],
        ["observações", p.observacoes_pedagogicas],
      ];
      const preenchidos = campos.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
      if (preenchidos.length) ctx += `\nPerfil pedagógico — ${preenchidos.join("; ")}.`;
    }

    // ---- 5. Monta a mensagem do usuário (texto + arquivos de verdade) ----
    const partes: unknown[] = [];
    partes.push({
      type: "text",
      text: enunciado
        ? `ATIVIDADE ORIGINAL:\n${enunciado}`
        : "A atividade original está no(s) arquivo(s) anexado(s). Leia e adapte.",
    });

    for (const a of listaArquivos) {
      const dataUrl = `data:${a.mime};base64,${a.data}`;
      if (a.mime.startsWith("image/")) {
        partes.push({ type: "image_url", image_url: { url: dataUrl } });
      } else {
        partes.push({ type: "file", file: { filename: a.nome || "atividade.pdf", file_data: dataUrl } });
      }
    }

    const systemPrompt = montarSystemPrompt(ctx, (instrucoes ?? "").trim());

    // ---- 6. Chama os modelos em paralelo --------------------------------
    const resultados = await Promise.all(
      modelosValidos.map((m) => chamarModelo(m, systemPrompt, partes, apiKey)),
    );

    return json({ aluno: aluno.nome, resultados }, 200, origin);
  } catch (e) {
    console.error("adapt-compare erro:", e);
    return json({ error: "Erro inesperado ao gerar as adaptações." }, 500, origin);
  }
});
