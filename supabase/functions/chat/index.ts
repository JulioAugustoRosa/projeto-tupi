import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const tools = [
  {
    type: "function",
    function: {
      name: "update_student_profile",
      description: "Atualiza o perfil pedagógico de um aluno. Use para adicionar ou modificar características, preferências, dificuldades, facilidades, hiperfocos, estratégias, comportamento etc.",
      parameters: {
        type: "object",
        properties: {
          aluno_nome: { type: "string", description: "Nome do aluno a ser atualizado" },
          field: {
            type: "string",
            enum: ["preferencias_aprendizagem", "dificuldades", "facilidades", "hiperfocos", "estrategias_funcionam", "comportamento", "dificuldades_especificas", "interesses_pessoais", "nivel_aprendizagem", "observacoes_pedagogicas"],
            description: "Campo do perfil a ser atualizado"
          },
          value: { type: "string", description: "Novo valor ou texto a ser adicionado ao campo" },
          mode: { type: "string", enum: ["replace", "append"], description: "replace = substitui valor, append = adiciona ao final do texto existente" }
        },
        required: ["aluno_nome", "field", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_student_condition",
      description: "Adiciona uma necessidade educacional (condição) a um aluno. Ex: TEA, TDAH, Dislexia, etc.",
      parameters: {
        type: "object",
        properties: {
          aluno_nome: { type: "string", description: "Nome do aluno" },
          condicao: { type: "string", description: "Condição educacional (TEA, TDAH, Dislexia, etc.)" },
          nivel_suporte: { type: "string", description: "Nível de suporte necessário" },
          detalhes: { type: "string", description: "Detalhes adicionais" }
        },
        required: ["aluno_nome", "condicao"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_activity",
      description: "Cria uma nova atividade pedagógica no sistema.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título da atividade" },
          disciplina: { type: "string", description: "Disciplina da atividade" },
          descricao: { type: "string", description: "Descrição/conteúdo completo da atividade" },
          tema: { type: "string", description: "Tema da atividade" },
          turma_nome: { type: "string", description: "Nome da turma (opcional)" }
        },
        required: ["titulo", "descricao"]
      }
    }
  }
];

async function executeTool(toolName: string, args: any, supabase: any, userId: string): Promise<string> {
  try {
    if (toolName === "update_student_profile") {
      // Find student by name
      const { data: alunos } = await supabase.from("alunos").select("id, nome").eq("professor_id", userId).ilike("nome", `%${args.aluno_nome}%`);
      if (!alunos || alunos.length === 0) return `Aluno "${args.aluno_nome}" não encontrado.`;
      const aluno = alunos[0];

      // Check if profile exists
      const { data: perfil } = await supabase.from("perfil_pedagogico").select("*").eq("aluno_id", aluno.id).single();

      if (perfil) {
        const currentValue = perfil[args.field] || "";
        const newValue = args.mode === "append" && currentValue ? `${currentValue}; ${args.value}` : args.value;
        await supabase.from("perfil_pedagogico").update({ [args.field]: newValue, updated_at: new Date().toISOString() }).eq("aluno_id", aluno.id);
      } else {
        await supabase.from("perfil_pedagogico").insert({ aluno_id: aluno.id, [args.field]: args.value });
      }
      return `Perfil de ${aluno.nome} atualizado: ${args.field} = "${args.value}"`;
    }

    if (toolName === "add_student_condition") {
      const { data: alunos } = await supabase.from("alunos").select("id, nome").eq("professor_id", userId).ilike("nome", `%${args.aluno_nome}%`);
      if (!alunos || alunos.length === 0) return `Aluno "${args.aluno_nome}" não encontrado.`;
      const aluno = alunos[0];

      await supabase.from("necessidades_educacionais").insert({
        aluno_id: aluno.id,
        condicao: args.condicao,
        nivel_suporte: args.nivel_suporte || "",
        detalhes: args.detalhes || ""
      });
      return `Condição "${args.condicao}" adicionada ao aluno ${aluno.nome}.`;
    }

    if (toolName === "create_activity") {
      let turmaId = null;
      if (args.turma_nome) {
        const { data: turmas } = await supabase.from("turmas").select("id").eq("professor_id", userId).ilike("nome", `%${args.turma_nome}%`);
        if (turmas && turmas.length > 0) turmaId = turmas[0].id;
      }

      const { data, error } = await supabase.from("atividades").insert({
        professor_id: userId,
        titulo: args.titulo,
        disciplina: args.disciplina || "",
        descricao: args.descricao,
        tema: args.tema || "",
        turma_id: turmaId,
        status: "pendente"
      }).select("id").single();

      if (error) throw error;
      return `Atividade "${args.titulo}" criada com sucesso (ID: ${data.id}).`;
    }

    return "Ferramenta não reconhecida.";
  } catch (e: any) {
    console.error("Tool exec error:", e);
    return `Erro ao executar: ${e.message}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const { messages } = await req.json();

    // Fetch teacher context
    const [turmasRes, alunosRes, atividadesRes] = await Promise.all([
      supabase.from("turmas").select("nome, serie, turno").eq("professor_id", userId),
      supabase.from("alunos").select("id, nome, serie, idade").eq("professor_id", userId),
      supabase.from("atividades").select("titulo, disciplina, status").eq("professor_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);

    const turmas = turmasRes.data ?? [];
    const alunos = alunosRes.data ?? [];
    const atividades = atividadesRes.data ?? [];
    const ids = alunos.map((a: any) => a.id);

    let necessidades: any[] = [];
    let perfis: any[] = [];
    if (ids.length > 0) {
      const [necRes, perfRes] = await Promise.all([
        supabase.from("necessidades_educacionais").select("aluno_id, condicao, nivel_suporte, detalhes").in("aluno_id", ids),
        supabase.from("perfil_pedagogico").select("aluno_id, preferencias_aprendizagem, dificuldades, facilidades, hiperfocos, estrategias_funcionam, comportamento").in("aluno_id", ids),
      ]);
      necessidades = necRes.data ?? [];
      perfis = perfRes.data ?? [];
    }

    const alunoMap = Object.fromEntries(alunos.map((a: any) => [a.id, a.nome]));

    const contextParts = [
      `O professor tem ${turmas.length} turma(s): ${turmas.map((t: any) => `${t.nome} (${t.serie}, ${t.turno})`).join("; ") || "nenhuma"}`,
      `Tem ${alunos.length} aluno(s): ${alunos.map((a: any) => `${a.nome} (${a.serie || "sem série"}, ${a.idade || "?"} anos)`).join("; ") || "nenhum"}`,
      `Últimas atividades: ${atividades.map((a: any) => `${a.titulo} [${a.disciplina || "sem disciplina"}] - ${a.status}`).join("; ") || "nenhuma"}`,
    ];

    if (necessidades.length > 0) {
      contextParts.push(
        `Necessidades educacionais: ${necessidades.map((n: any) => `${alunoMap[n.aluno_id] || "?"}: ${n.condicao} (suporte: ${n.nivel_suporte || "não informado"}) ${n.detalhes || ""}`).join("; ")}`
      );
    }

    if (perfis.length > 0) {
      contextParts.push(
        `Perfis pedagógicos: ${perfis.map((p: any) => {
          const parts = [];
          if (p.preferencias_aprendizagem) parts.push(`preferências: ${p.preferencias_aprendizagem}`);
          if (p.dificuldades) parts.push(`dificuldades: ${p.dificuldades}`);
          if (p.facilidades) parts.push(`facilidades: ${p.facilidades}`);
          if (p.hiperfocos) parts.push(`hiperfocos: ${p.hiperfocos}`);
          if (p.estrategias_funcionam) parts.push(`estratégias que funcionam: ${p.estrategias_funcionam}`);
          if (p.comportamento) parts.push(`comportamento: ${p.comportamento}`);
          return `${alunoMap[p.aluno_id] || "?"}: ${parts.join(", ")}`;
        }).join("; ")}`
      );
    }

    const systemPrompt = `Você é o assistente pedagógico do TUPI, especializado em educação inclusiva e Desenho Universal para Aprendizagem (DUA).
Você ajuda professores a adaptar atividades, entender perfis de alunos e criar estratégias de inclusão.

Você tem acesso a FERRAMENTAS que permitem:
- Atualizar perfis pedagógicos de alunos (adicionar características, preferências, dificuldades, etc.)
- Adicionar necessidades educacionais a alunos
- Criar atividades pedagógicas no sistema

USE AS FERRAMENTAS quando o professor pedir para adicionar, modificar ou registrar informações sobre alunos ou criar atividades. Depois de usar a ferramenta, confirme a ação ao professor.

CONTEXTO DO PROFESSOR:
${contextParts.join("\n")}

INSTRUÇÕES IMPORTANTES:
- Responda sempre em português brasileiro.
- Use o contexto dos alunos, turmas e atividades para personalizar respostas.
- Sugira adaptações baseadas no DUA quando pertinente.
- Seja acolhedor, prático e direto.
- Use markdown para formatar respostas quando útil.
- Quando o professor pedir para alterar dados de alunos, USE as ferramentas disponíveis.
- Quando o professor pedir para criar uma atividade, USE a ferramenta create_activity.

GERAÇÃO DE IMAGENS, PDF E DOCUMENTOS — REGRAS ABSOLUTAS:
- PROIBIDO escrever frases como: "Como assistente de IA", "não consigo gerar", "não posso enviar arquivo", "sou uma IA baseada em texto", "minhas limitações", "no entanto, o conteúdo abaixo está formatado para impressão", ou QUALQUER variação de recusa/desculpa técnica. NUNCA. Em nenhum lugar da resposta.
- O sistema TUPI possui ferramentas externas de geração de imagens e documentos integradas.
- Quando o professor pedir uma imagem, PDF ou documento, ENTREGUE direto o conteúdo solicitado (atividade, texto, descrição visual) — sem preâmbulos, sem explicar suas limitações.
- Ao final, em UMA linha curta, oriente: "Use os três pontinhos (⋮) ao lado desta mensagem para gerar imagem ou baixar PDF/HTML/TXT."
- Sempre escreva conteúdo rico e bem descrito, pois ele será usado como base para gerar imagens e documentos.

ATIVIDADES DE COMPLETAR (FILL-IN-THE-BLANK) — REGRA CRÍTICA:
- Para lacunas de palavras inteiras, use UMA linha contínua de underscores SEM ESPAÇOS entre eles. Exemplo correto: "A ___________ é redonda." NUNCA escreva "_ _ _ _ _" (com espaços) — isso vira pontilhado quebrado no PDF.
- Para completar letras de uma palavra, mantenha as letras conhecidas coladas aos underscores, sem espaços. Exemplo CORRETO para a palavra "bola" com vogais ocultas: "b_l_" (4 caracteres, sem espaços). EXEMPLO ERRADO: "b _ _ l _ _" (isso sugere 6 letras e fica desconfigurado).
- Use exatamente 1 underscore por letra oculta, colado às demais letras.`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    // First call: non-streaming to handle tool calls
    const firstResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
        stream: false,
      }),
    });

    if (!firstResponse.ok) {
      const status = firstResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await firstResponse.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const firstResult = await firstResponse.json();
    const choice = firstResult.choices?.[0];

    // Check if the model wants to call tools
    if (choice?.finish_reason === "tool_calls" || choice?.message?.tool_calls?.length > 0) {
      const toolCalls = choice.message.tool_calls;
      const toolResults: any[] = [];

      for (const tc of toolCalls) {
        const fnName = tc.function.name;
        let fnArgs: any;
        try { fnArgs = JSON.parse(tc.function.arguments); } catch { fnArgs = {}; }
        const result = await executeTool(fnName, fnArgs, supabase, userId);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Second call: streaming with tool results for final response
      const secondMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
        choice.message,
        ...toolResults,
      ];

      const secondResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: secondMessages,
          stream: true,
        }),
      });

      if (!secondResponse.ok) {
        throw new Error("Erro na resposta da IA após execução de ferramentas");
      }

      return new Response(secondResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // No tool calls: stream directly
    const streamResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!streamResponse.ok) {
      const status = streamResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("Erro no serviço de IA");
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
