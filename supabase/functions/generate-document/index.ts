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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { type, content, title } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    // ==================== IMAGE GENERATION ====================
    if (type === "image") {
      console.log("Generating image with google/gemini-3-pro-image-preview...");

      // Limpar conteúdo: remover meta-frases sobre "sou uma IA", limites técnicos etc.
      const cleanContent = (content || "")
        .replace(/eu (sou|sou uma|, como)[^.!?\n]*(ia|inteligência artificial|modelo|baseada em texto|de linguagem)[^.!?\n]*[.!?]?/gi, "")
        .replace(/(não|nao) (posso|consigo) (gerar|criar|produzir)[^.!?\n]*[.!?]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const visualPrompt = `Gere UMA imagem que pareça uma FOLHA DE ATIVIDADE ESCOLAR IMPRESSA (worksheet pedagógico) — formato A4 retrato, fundo branco, com TEXTO LEGÍVEL em português brasileiro.

ESTILO OBRIGATÓRIO:
- Aparência de papel de atividade impresso, NÃO uma ilustração, NÃO uma cena, NÃO uma foto, NÃO crianças/personagens.
- Layout estruturado tipo worksheet: cabeçalho com "ATIVIDADE", linhas de "Nome:_____", "Professor(a):_____", "Data:____", e abaixo o conteúdo da atividade.
- Use fontes claras (sans-serif tipo Arial), preto sobre branco, com bordas finas em caixas/quadros quando necessário.
- Inclua os elementos típicos: enunciado da instrução, exercícios numerados, lacunas para preencher (linhas contínuas "_______"), quadros para resposta, círculos/balões para desenho se for o caso.
- Pode usar ÍCONES PEQUENOS decorativos (ex: 📚 ✏️ 🏆) ao lado de títulos de seção, mas o foco é o TEXTO da atividade.
- NÃO desenhe crianças, professores, salas de aula, fundos coloridos ou cenários — é uma FOLHA DE PAPEL.

CONTEÚDO DA ATIVIDADE A REPRESENTAR:
${cleanContent || "Atividade de alfabetização com lacunas para completar palavras"}

REGRAS DE TEXTO:
- Para palavras com letras a completar (ex: "BOLA" sem vogais), escreva exatamente "B_L_" — letras coladas, SEM espaços entre underscores.
- Para lacunas de palavra inteira, use linha contínua: "____________".
- Texto em português, ortografia correta, legível.

Retorne APENAS a imagem da folha de atividade, sem qualquer texto explicativo.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-pro-image-preview",
          messages: [
            { role: "user", content: visualPrompt },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("Image gen error:", response.status, t);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos na sua conta." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("Erro ao gerar imagem");
      }

      const result = await response.json();
      const message = result.choices?.[0]?.message;
      console.log("Image response structure:", JSON.stringify({
        hasImages: !!message?.images,
        imagesLength: message?.images?.length,
        contentType: typeof message?.content,
        contentIsArray: Array.isArray(message?.content),
      }));

      let base64Data: string | null = null;

      // Format 1: images array (most common for image models)
      if (message?.images && Array.isArray(message.images)) {
        for (const img of message.images) {
          if (img.type === "image_url" && img.image_url?.url) {
            base64Data = img.image_url.url;
            break;
          }
        }
      }

      // Format 2: content as array of parts
      if (!base64Data && Array.isArray(message?.content)) {
        for (const part of message.content) {
          if (part.type === "image_url" && part.image_url?.url) {
            base64Data = part.image_url.url;
            break;
          }
        }
      }

      // Format 3: content is string starting with data:image
      if (!base64Data && typeof message?.content === "string" && message.content.startsWith("data:image")) {
        base64Data = message.content;
      }

      if (!base64Data) {
        console.error("No image data found. Message keys:", message ? Object.keys(message) : "null");
        return new Response(JSON.stringify({ error: "Não foi possível gerar a imagem. Tente descrever melhor o que deseja." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upload to storage
      console.log("Got image data, uploading to storage...");
      let bytes: Uint8Array;
      let mimeType = "image/png";
      let ext = "png";

      if (base64Data.startsWith("data:image")) {
        const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/s);
        if (!match) throw new Error("Formato de imagem inválido");
        mimeType = match[1];
        ext = mimeType.split("/")[1] || "png";
        const raw = match[2].replace(/\s/g, "");
        const binaryStr = atob(raw);
        bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      } else if (base64Data.startsWith("http")) {
        // It's a URL — fetch and upload
        const imgResp = await fetch(base64Data);
        const blob = await imgResp.arrayBuffer();
        bytes = new Uint8Array(blob);
        mimeType = imgResp.headers.get("content-type") || "image/png";
        ext = mimeType.split("/")[1]?.split(";")[0] || "png";
      } else {
        // Raw base64
        const raw = base64Data.replace(/\s/g, "");
        const binaryStr = atob(raw);
        bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      }

      const filePath = `generated/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("attachments")
        .upload(filePath, bytes, { contentType: mimeType, upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        // Fallback: return base64 directly if it starts with data:
        if (base64Data.startsWith("data:image")) {
          return new Response(JSON.stringify({ url: base64Data, type: "image" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("Erro ao salvar imagem");
      }

      const { data: urlData } = supabaseAdmin.storage.from("attachments").getPublicUrl(filePath);
      console.log("Image uploaded successfully:", urlData.publicUrl);

      return new Response(JSON.stringify({ url: urlData.publicUrl, type: "image" }), {
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

    const docPrompt = `Gere um documento HTML completo e bem formatado com o seguinte conteúdo.
Use CSS inline para estilizar o documento de forma profissional e adequada para impressão.
O documento deve ter:
- Margens adequadas (margin: 20mm em cada lado)
- Fonte legível (Arial, 14px para corpo, 24px para títulos)
- Cabeçalho com título centralizado
- Conteúdo bem organizado com parágrafos, listas e tabelas quando necessário
- Cada seção principal deve estar dentro de uma <div data-pdf-section="true"> para controle de quebra de página
- Rodapé com "Gerado por TUPI - Tecnologia Universal para Práticas da Inclusão"

REGRAS ABSOLUTAS:
1. NUNCA inclua frases como "Como assistente de IA", "não consigo gerar arquivo", "no entanto, o conteúdo abaixo está formatado", "sou uma IA baseada em texto" ou QUALQUER variação de recusa/desculpa. PROIBIDO em qualquer parte do HTML.
2. Para lacunas de COMPLETAR PALAVRAS, use uma sequência CONTÍNUA de underscores SEM espaços (ex: "____________"). NUNCA escreva "_ _ _ _ _" com espaços — isso quebra a renderização no PDF.
3. Para completar letras (ex: palavra "bola" com vogais ocultas), escreva as letras coladas: "b_l_" — exatamente 4 caracteres, SEM espaços. Envolva em <span style="white-space:nowrap; font-family:'Courier New',monospace; letter-spacing:3px; font-weight:bold;">b_l_</span> para evitar quebra.
4. Separe o conteúdo em seções lógicas usando <div data-pdf-section="true">. Cada seção será tratada como um bloco que não será cortado ao meio na geração do PDF.

Título: ${title || "Documento"}
Conteúdo: ${cleanInput}

Retorne APENAS o HTML completo, sem explicações, sem preâmbulo, sem markdown. Comece direto com <!DOCTYPE html>.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
