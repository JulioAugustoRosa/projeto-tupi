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
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { type, content, title } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY não configurada");

    // ==================== IMAGE GENERATION (via Gemini Nano Banana) ====================
    if (type === "image") {
      const cleanContent = (content || "")
        .replace(/eu (sou|sou uma|, como)[^.!?\n]*(ia|inteligência artificial|modelo|baseada em texto|de linguagem)[^.!?\n]*[.!?]?/gi, "")
        .replace(/(não|nao) (posso|consigo) (gerar|criar|produzir)[^.!?\n]*[.!?]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const visualPrompt = `Gere uma ilustração no estilo de atividade escolar de alfabetização impressa, em preto e branco.

ESTILO OBRIGATÓRIO:
- Preto e branco, sem cores (apenas contornos pretos sobre fundo branco)
- Estilo desenho para colorir / clip-art de material escolar
- Linhas grossas, limpas, sem sombreamento
- Fundo branco puro
- Tipo material que professor distribui em sala de aula
- Apropriado para criança em alfabetização
- Centralizado, sem cenário ao redor

ASSUNTO DA ILUSTRAÇÃO:
${cleanContent || "uma bola simples"}

Retorne APENAS a imagem, sem texto, sem letras, sem números na imagem.`;

      // Lista de modelos pra tentar, em ordem de preferência (melhor free disponível primeiro)
      const candidateModels = [
        "gemini-2.5-flash-image",
        "gemini-2.0-flash-preview-image-generation",
      ];

      let result: any = null;
      let lastError = "";
      for (const model of candidateModels) {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: visualPrompt }] }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
            }),
          },
        );

        if (resp.ok) {
          result = await resp.json();
          console.log(`Imagem gerada com modelo: ${model}`);
          break;
        }

        const errText = await resp.text();
        lastError = `${model} → ${resp.status}: ${errText.slice(0, 200)}`;
        console.warn(lastError);

        // Se for rate limit, não adianta tentar outro modelo — falha logo
        if (resp.status === 429) {
          return new Response(
            JSON.stringify({ error: "Limite diário de imagens do Gemini atingido. Tente novamente mais tarde." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (!result) {
        console.error("Todos os modelos de imagem falharam:", lastError);
        return new Response(
          JSON.stringify({ error: "Não foi possível gerar a imagem. Detalhes: " + lastError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const parts = result.candidates?.[0]?.content?.parts || [];
      let base64Data: string | null = null;
      let mimeType = "image/png";
      for (const part of parts) {
        if (part.inlineData?.data) {
          base64Data = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
          break;
        }
      }

      if (!base64Data) {
        console.error("Nenhuma imagem na resposta:", JSON.stringify(result).slice(0, 500));
        return new Response(
          JSON.stringify({ error: "Não foi possível gerar a imagem. Tente descrever melhor." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Retorna como data URL — cliente usa direto em <img src={url}>
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      return new Response(JSON.stringify({ url: dataUrl, type: "image" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==================== DOCUMENT GENERATION (HTML/TXT) ====================
    // Limpar preâmbulos de recusa/IA do conteúdo de entrada antes de mandar pro modelo
    const stripPreamble = (txt: string): string => {
      let t = txt || "";
      const refusalPatterns = [
        /como (assistente de )?ia[^.!?\n]*[.!?\n]/gi,
        /sou uma? (ia|inteligência artificial|modelo de linguagem|assistente)[^.!?\n]*[.!?\n]/gi,
        /(não|nao) (posso|consigo) (gerar|criar|enviar|produzir|disponibilizar)[^.!?\n]*[.!?\n]/gi,
        /no entanto,? o conteúdo abaixo está[^.!?\n]*[.!?\n]/gi,
        /minhas limitações[^.!?\n]*[.!?\n]/gi,
        /diretamente para (download|impressão)[^.!?\n]*[.!?\n]/gi,
      ];
      for (const re of refusalPatterns) t = t.replace(re, "");
      // Normaliza sequências de underscores com espaços ("_ _ _ _" -> "____")
      t = t.replace(/(?:_\s){2,}_/g, (m) => "_".repeat(m.split("_").length - 1));
      return t.replace(/\n{3,}/g, "\n\n").trim();
    };
    const cleanInput = stripPreamble(content || "");

    const docPrompt = `Gere uma FOLHA DE ATIVIDADE ESCOLAR em HTML, no formato de um worksheet pedagógico imprimível tipo material que professor distribui para os alunos.

ESTRUTURA OBRIGATÓRIA (nessa ordem):

1. CABEÇALHO INSTITUCIONAL (no topo, com borda inferior fina cinza):
   - Linha 1: pequena tag "ATIVIDADE PEDAGÓGICA" em letras espaçadas (letter-spacing) e cor cinza
   - Linha 2: título grande em negrito (use o título informado: "${title || "Atividade"}")
   - Linha 3: pequeno subtítulo opcional com a disciplina/tema, em cinza

2. CAMPOS DO ALUNO (logo abaixo do cabeçalho, em uma única linha horizontal usando flex/grid):
   <div style="display: flex; gap: 24px; margin: 16px 0; padding: 12px 0; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; font-size: 11pt;">
     <div style="flex: 2;">Nome: <span style="display:inline-block; border-bottom: 1px solid #333; min-width: 200px; height: 18px;"></span></div>
     <div style="flex: 1;">Turma: <span style="display:inline-block; border-bottom: 1px solid #333; min-width: 80px; height: 18px;"></span></div>
     <div style="flex: 1;">Data: ___/___/______</div>
   </div>

3. INSTRUÇÕES DA ATIVIDADE (em uma caixa com fundo levemente cinza, borda esquerda colorida):
   <div style="background: #f5f5f5; border-left: 4px solid #4F46E5; padding: 12px 16px; margin: 16px 0; font-size: 11pt;">
     <strong>📚 Instruções:</strong> [1-3 frases curtas explicando o que o aluno deve fazer]
   </div>

4. EXERCÍCIOS NUMERADOS:
   - Cada exercício em uma <div data-pdf-section="true"> separada
   - Use formato: número grande (24px, negrito, cor primária) ao lado da pergunta
   - Espaços de resposta visíveis e adequados ao tipo:
     * Resposta curta: linha contínua de underscores
     * Resposta longa: caixa com bordas (height adequado, ~60-100px)
     * Múltipla escolha: ( ) opção A    ( ) opção B    ( ) opção C
     * Ligar/Associar: duas colunas com itens de cada lado
     * Completar palavra: <span style="font-family:'Courier New',monospace; letter-spacing:4px; font-weight:bold; font-size:14pt;">b_l_</span>
     * Desenhar: caixa quadrada com bordas tracejadas (border: 1px dashed #999)

5. RODAPÉ DISCRETO (no final, fonte pequena cinza, centralizado):
   "Gerado por TUPI · Tecnologia Universal para Práticas da Inclusão"

ESTILO GERAL (incluir no <style> ou inline no body):
- Fonte: 'Helvetica', 'Arial', sans-serif
- Tamanho corpo: 12pt
- Margens: 20mm em todos os lados (use @page { margin: 20mm; })
- Cor primária: #4F46E5 (índigo)
- Espaçamento entre exercícios: margin-top: 20px
- Linhas de resposta: height ajustado pra caber a escrita à mão (~24px mínimo)

REGRAS ABSOLUTAS:
1. NUNCA escreva frases como "Como IA…", "não posso gerar…", "sou um modelo…", "no entanto…" — PROIBIDO em qualquer lugar.
2. Underscores: SEM ESPAÇOS entre eles. "___________" certo, "_ _ _ _" errado.
3. Letras a completar: coladas, sem espaços. "b_l_" certo (4 caracteres).
4. Cada exercício DEVE estar em <div data-pdf-section="true"> separada — isso evita cortar exercício no meio na quebra de página.
5. NÃO use cores muito saturadas, fundos muito chamativos, nem fontes decorativas. É uma folha de atividade — tem que ser limpa, clara e profissional.
6. Use ÍCONES EMOJIS pequenos APENAS em títulos de seção (📚 ✏️ 📝 ✂️) — não exagera.
7. IMAGENS: você PODE incluir imagens reais usando o serviço Pollinations.ai (gratuito, sem chave). Sintaxe:
   <img src="https://image.pollinations.ai/prompt/DESCRICAO_EM_INGLES?width=400&height=400&nologo=true" alt="descrição em pt" style="display:block; margin: 8px auto; max-width: 200px; height: auto;" />
   REGRAS pras imagens:
   - DESCRICAO_EM_INGLES deve ser URL-encoded (espaços = %20). Exemplos: "soccer%20ball%20simple%20illustration", "cute%20cat%20cartoon", "red%20apple%20on%20white%20background".
   - Sempre adicione "simple illustration" ou "cartoon style" ou "white background" no prompt pra ficar limpo.
   - Use width/height entre 300-500. Pra ilustração principal, 400x400 é bom.
   - Use NO MÁXIMO 2-3 imagens por exercício pra não pesar a página.
   - PROIBIDO placeholders tipo "IMAGEM:", "FOTO:", "IMG:" ou caixas vazias. Sempre coloque a tag <img> de verdade com URL Pollinations.
   Quando NÃO precisar de imagem (texto puro funciona melhor), use emojis: ⚽ 🏀 🎾 🐶 🌳 🍎 ✏️ 📚 etc.
8. CSS DE QUEBRA DE PÁGINA: adicione no <style> do <head>:
   <style>
     @page { margin: 20mm; }
     body { font-family: Helvetica, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #1a1a1a; }
     [data-pdf-section] { break-inside: avoid; page-break-inside: avoid; margin-bottom: 18px; }
     h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
     p { orphans: 3; widows: 3; }
   </style>
   Esses CSS impedem que exercícios sejam cortados no meio entre páginas.

CONTEÚDO DA ATIVIDADE:
${cleanInput}

Retorne APENAS o HTML completo, do <!DOCTYPE html> ao </html>. Sem markdown, sem preâmbulo, sem blocos de código.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um gerador de documentos HTML profissionais. Retorne APENAS código HTML válido, sem markdown, sem blocos de código, sem preâmbulo, sem mensagens de recusa, sem dizer que é uma IA. Use <div data-pdf-section=\"true\"> para separar seções. Para underscores de completar, use sequências contínuas SEM espaços entre os underscores." },
          { role: "user", content: docPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro ao gerar documento");
    }

    const result = await response.json();
    let htmlContent = result.choices?.[0]?.message?.content || "";
    htmlContent = htmlContent.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // Remover preâmbulos antes do <!DOCTYPE> ou <html>
    const docStart = htmlContent.search(/<!doctype html|<html/i);
    if (docStart > 0) htmlContent = htmlContent.slice(docStart);

    // Remover quaisquer parágrafos/divs de recusa que tenham passado pelo modelo
    htmlContent = htmlContent
      .replace(/<(p|div)[^>]*>\s*(como assistente de ia|sou uma ia|não consigo gerar|no entanto,? o conteúdo abaixo está)[^<]*<\/\1>/gi, "")
      .replace(/(?:_\s){2,}_/g, (m: string) => "_".repeat(m.split("_").length - 1));

    if (type === "txt") {
      const textContent = htmlContent
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/(?:_\s){2,}_/g, (m: string) => "_".repeat(m.split("_").length - 1));
      return new Response(JSON.stringify({ content: textContent, type: "txt", filename: `${title || "documento"}.txt` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ content: htmlContent, type: type || "html", filename: `${title || "documento"}.html` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
