import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { atividade_id, aluno_id, turma_id, tipo_adaptacao, instrucoes_professor } = await req.json();

    if (!atividade_id) {
      return new Response(JSON.stringify({ error: "atividade_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch original activity
    const { data: atividade } = await supabase
      .from("atividades")
      .select("*")
      .eq("id", atividade_id)
      .single();

    if (!atividade) {
      return new Response(JSON.stringify({ error: "Atividade não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch student profiles if applicable
    let alunoContext = "";
    if (aluno_id) {
      const [alunoRes, necRes, perfilRes] = await Promise.all([
        supabase.from("alunos").select("nome, idade, serie").eq("id", aluno_id).single(),
        supabase.from("necessidades_educacionais").select("condicao, nivel_suporte, detalhes").eq("aluno_id", aluno_id),
        supabase.from("perfil_pedagogico").select("*").eq("aluno_id", aluno_id).single(),
      ]);
      const aluno = alunoRes.data;
      const necs = necRes.data ?? [];
      const perfil = perfilRes.data;
      if (aluno) {
        alunoContext = `\nALUNO: ${aluno.nome}, ${aluno.idade || "?"} anos, série ${aluno.serie || "?"}.`;
        if (necs.length > 0) {
          alunoContext += `\nCondições: ${necs.map(n => `${n.condicao}${n.nivel_suporte ? ` (suporte: ${n.nivel_suporte})` : ""}`).join(", ")}.`;
        }
        if (perfil) {
          const parts = [];
          if (perfil.preferencias_aprendizagem) parts.push(`preferências: ${perfil.preferencias_aprendizagem}`);
          if (perfil.dificuldades) parts.push(`dificuldades: ${perfil.dificuldades}`);
          if (perfil.facilidades) parts.push(`facilidades: ${perfil.facilidades}`);
          if (perfil.hiperfocos) parts.push(`hiperfocos: ${perfil.hiperfocos}`);
          if (perfil.estrategias_funcionam) parts.push(`estratégias: ${perfil.estrategias_funcionam}`);
          if (perfil.comportamento) parts.push(`comportamento: ${perfil.comportamento}`);
          if (parts.length > 0) alunoContext += `\nPerfil pedagógico: ${parts.join("; ")}.`;
        }
      }
    } else if (turma_id) {
      const { data: alunos } = await supabase.from("alunos").select("id, nome").eq("turma_id", turma_id);
      if (alunos && alunos.length > 0) {
        alunoContext = `\nTURMA com ${alunos.length} alunos: ${alunos.map(a => a.nome).join(", ")}.`;
      }
    }

    const systemPrompt = `Você é o Adaptador de Atividades do TUPI, especialista em Desenho Universal para Aprendizagem (DUA).

Sua tarefa é criar um PLANO DE AULA ADAPTADO ou VERSÃO ADAPTADA da atividade original. Você NÃO altera o conteúdo pedagógico da atividade — você adapta a FORMA DE APRESENTAÇÃO, a METODOLOGIA e as ESTRATÉGIAS DE ENSINO.

ATIVIDADE ORIGINAL:
Título: ${atividade.titulo}
Disciplina: ${atividade.disciplina || "Não especificada"}
Descrição/Conteúdo: ${atividade.descricao || "Não fornecido"}
${alunoContext}

${instrucoes_professor ? `INSTRUÇÕES DO PROFESSOR: ${instrucoes_professor}` : ""}

TIPO DE ADAPTAÇÃO: ${tipo_adaptacao || "geral"}

INSTRUÇÕES:
1. NUNCA altere o conteúdo original da atividade.
2. Adapte a FORMA como a atividade é apresentada ao aluno.
3. Considere os princípios do DUA: múltiplas formas de engajamento, representação e ação/expressão.
4. Forneça:
   - Objetivos pedagógicos da adaptação
   - Materiais necessários
   - Passo a passo da aplicação
   - Estratégias de mediação para o professor
   - Critérios de avaliação adaptados
   - Sugestões de recursos visuais, táteis ou tecnológicos
5. Se o professor deu instruções específicas, siga-as.
6. Responda em português brasileiro.
7. Use markdown para formatar.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: instrucoes_professor || "Adapte esta atividade seguindo os princípios do DUA, considerando o perfil do(s) aluno(s)." },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("Erro no serviço de IA");
    }

    const aiResult = await response.json();
    const adaptedContent = aiResult.choices?.[0]?.message?.content || "Não foi possível gerar a adaptação.";

    // Save to database
    const { data: adaptacao, error: insertError } = await supabase
      .from("atividades_adaptadas")
      .insert({
        atividade_id,
        aluno_id: aluno_id || null,
        tipo_adaptacao: tipo_adaptacao || "DUA - Plano de Aula",
        conteudo_adaptado: adaptedContent,
        status: "gerada",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    // Update activity status
    await supabase.from("atividades").update({ status: "adaptada" }).eq("id", atividade_id);

    return new Response(JSON.stringify({ id: adaptacao.id, conteudo: adaptedContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("adapt-activity error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
