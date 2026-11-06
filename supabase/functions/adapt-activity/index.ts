import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type DadosEstudante,
  montarPromptAtividade,
} from "../_shared/prompts/atividade-adaptada.ts";

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

    // Dados do estudante (ou da turma) que alimentam o prompt compartilhado.
    const est: DadosEstudante = { nome: "estudante não identificado" };
    if (aluno_id) {
      const [alunoRes, necRes, perfilRes] = await Promise.all([
        supabase.from("alunos").select("nome, idade, serie").eq("id", aluno_id).maybeSingle(),
        supabase.from("necessidades_educacionais").select("condicao, nivel_suporte, detalhes").eq("aluno_id", aluno_id),
        supabase.from("perfil_pedagogico").select("*").eq("aluno_id", aluno_id).maybeSingle(),
      ]);
      const aluno = alunoRes.data;
      const necs = necRes.data ?? [];
      const perfil = perfilRes.data;
      if (aluno) {
        est.nome = aluno.nome;
        est.idade = aluno.idade ?? null;
        est.serie = aluno.serie ?? null;
        if (necs.length > 0) {
          est.condicoes = necs.map((n) =>
            `${n.condicao}${n.nivel_suporte ? ` (suporte: ${n.nivel_suporte})` : ""}`
          ).join("; ");
        }
        if (perfil) {
          const campos: [string, string][] = [
            ["nível de aprendizagem", perfil.nivel_aprendizagem],
            ["preferências de aprendizagem", perfil.preferencias_aprendizagem],
            ["dificuldades", perfil.dificuldades],
            ["facilidades", perfil.facilidades],
            ["hiperfocos", perfil.hiperfocos],
            ["interesses", perfil.interesses_pessoais],
            ["estratégias que funcionam", perfil.estrategias_funcionam],
            ["comportamento", perfil.comportamento],
            ["dificuldades específicas", perfil.dificuldades_especificas],
            ["observações do professor", perfil.observacoes_pedagogicas],
          ];
          est.perfil = campos.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
        }
      }
    } else if (turma_id) {
      const { data: alunos } = await supabase.from("alunos").select("id, nome").eq("turma_id", turma_id);
      if (alunos && alunos.length > 0) {
        est.nome = `turma de ${alunos.length} estudantes (${alunos.map((a) => a.nome).join(", ")})`;
      }
    }

    // Regras pedagógicas compartilhadas com a adapt-compare.
    const conteudoOriginal = [
      `Título: ${atividade.titulo}`,
      atividade.disciplina ? `Disciplina: ${atividade.disciplina}` : "",
      atividade.descricao ? `Conteúdo: ${atividade.descricao}` : "",
      tipo_adaptacao ? `Tipo de adaptação pedido: ${tipo_adaptacao}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = montarPromptAtividade({
      estudante: est,
      professor: { instrucoes: (instrucoes_professor ?? "").trim() },
      conteudo_original: conteudoOriginal,
      tem_material_anexado: false,
    });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
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
