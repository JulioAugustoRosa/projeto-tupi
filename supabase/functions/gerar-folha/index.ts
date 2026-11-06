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
const MAX_IMAGENS = 4;  // tema, topo, uma seção e a chamada final
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

interface SecaoBruta {
  numero?: number;
  tipo?: string;
  largura?: string;
  imagem_prompt?: string;
  imagem?: string;
}

// ---------------------------------------------------------------------------
// Esquema que o modelo deve devolver
// ---------------------------------------------------------------------------
const ESQUEMA = `{
  "titulo": "título curto",
  "faixa": "LÍNGUA PORTUGUESA — PRODUÇÃO TEXTUAL",
  "etiqueta": "GÊNERO TEXTUAL: NOTÍCIA",
  "convite": "Vamos produzir uma notícia sobre a inauguração da livraria?",
  "ilustracao_topo": { "imagem_prompt": "um megafone" },
  "adaptacoes_aplicadas": ["uma frase por decisão, ligada ao perfil"],
  "config": { "fonte": "Verdana", "tamanho_pt": 11 },
  "secoes": [
    {
      "numero": 1, "titulo": "LEIA E ACOMPANHE AS INFORMAÇÕES", "cor": "azul",
      "largura": "metade", "tipo": "info",
      "imagem_prompt": "fachada de uma livraria comunitária",
      "destaque": "A Comunidade Escolar vai inaugurar uma livraria comunitária.",
      "dados": [
        {"icone":"📅","rotulo":"Data","valor":"18 de novembro de 2026"},
        {"icone":"🕐","rotulo":"Horário","valor":"15 horas"},
        {"icone":"📍","rotulo":"Local","valor":"Rua dos Estudantes, 96"},
        {"icone":"👥","rotulo":"Participantes","valor":"professores, alunos e pais"}
      ]
    },
    {
      "numero": 2, "titulo": "CONHECENDO A NOTÍCIA", "subtitulo": "Relacione cada parte à sua função.",
      "cor": "verde", "largura": "metade", "tipo": "relacionar",
      "pares": [
        {"rotulo":"MANCHETE","definicao":"É o título da notícia.","cor":"azul"},
        {"rotulo":"ABERTURA","definicao":"Apresenta as informações principais.","cor":"verde"},
        {"rotulo":"CORPO DA NOTÍCIA","definicao":"Explica melhor o acontecimento.","cor":"roxo"}
      ]
    },
    {
      "numero": 3, "titulo": "ORGANIZE AS INFORMAÇÕES", "subtitulo": "Use o quadro acima para responder.",
      "cor": "laranja", "largura": "metade", "tipo": "perguntas",
      "perguntas": [
        {"icone":"❓","pergunta":"O que vai acontecer?"},
        {"icone":"📅","pergunta":"Quando?"},
        {"icone":"📍","pergunta":"Onde?"},
        {"icone":"👥","pergunta":"Quem participará?"}
      ]
    },
    {
      "numero": 4, "titulo": "PRODUÇÃO DA NOTÍCIA", "subtitulo": "Use as respostas anteriores.",
      "cor": "roxo", "largura": "metade", "tipo": "producao",
      "campos": [
        {"rotulo":"MANCHETE (TÍTULO)","cor":"azul","texto":"______"},
        {"rotulo":"ABERTURA","cor":"verde","texto":"A Comunidade Escolar vai inaugurar ______"},
        {"rotulo":"CORPO DA NOTÍCIA","cor":"roxo","texto":"O evento acontecerá no dia ______, às ______ horas, no endereço ______."}
      ]
    },
    {
      "numero": 5, "titulo": "REVISÃO", "subtitulo": "Minha notícia tem:",
      "cor": "cinza", "largura": "metade", "tipo": "checklist",
      "itens": ["Título.","Informação sobre o acontecimento.","Data e horário.","Local.","Participantes."],
      "imagem_prompt": "uma pilha de livros coloridos"
    }
  ],
  "chamada_final": { "titulo": "Agora é com você!", "texto": "Sua notícia pode informar toda a comunidade.", "imagem_prompt": "um jornal dobrado" }
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

  return `Você monta FOLHAS DE ATIVIDADE ADAPTADAS no padrão usado por professoras
especialistas em educação inclusiva: UMA página A4, colorida, em duas colunas,
organizada em SEÇÕES NUMERADAS que se encadeiam como um andaime.

${ctx}
${sobreMaterial}
==================================================
A ESTRUTURA — O ALUNO É LEVADO PELA MÃO
==================================================

A folha não é uma lista de perguntas. É um caminho em etapas, onde cada seção
prepara a seguinte:

1) INFORMAR (tipo "info") — um card com a imagem do tema e os dados organizados
   por ícone: 📅 data, 🕐 horário, 📍 local, 👥 participantes, 💰 valor, ✏️ autor.
   É a FONTE que o aluno vai consultar nas seções seguintes.

2) ENSINAR O GÊNERO (tipo "relacionar") — rótulos coloridos ligados às suas
   funções. Dá ao aluno o vocabulário da tarefa antes de pedir que ele produza.

3) ORGANIZAR (tipo "perguntas") — perguntas-guia curtas, cada uma com uma caixa
   ao lado. O aluno EXTRAI da seção 1 e escreve em pedaços pequenos.

4) PRODUZIR (tipo "producao") — caixas coloridas com FRASES JÁ COMEÇADAS, onde
   ___ marca onde o aluno continua. Ex: "O evento acontecerá no dia ___, às ___".
   Esta é a seção mais importante: nunca entregue uma caixa vazia.
   As cores aqui DEVEM repetir as da seção 2, para o aluno ligar uma à outra.

5) REVISAR (tipo "checklist") — "Minha notícia tem:" com itens para o aluno
   conferir sozinho. Devolve o controle a ele.

Nem toda atividade precisa das cinco. Escolha as que servem ao que foi pedido,
mas SEMPRE termine com uma de produção ou de registro, e SEMPRE feche com a
"chamada_final" de incentivo.

==================================================
REGRAS VISUAIS
==================================================

- TUDO EM UMA PÁGINA. Use "largura":"metade" em quase todas as seções, para
  caírem lado a lado. Reserve "inteira" para no máximo uma.
- Entre 4 e 6 seções. Menos que isso deixa a folha vazia; mais, apertada.
- Cores disponíveis: azul, verde, roxo, amarelo, laranja, creme, cinza. Use cores
  DIFERENTES em seções vizinhas, e repita a mesma cor quando duas partes da
  folha se referem à mesma coisa.
- Ícones são EMOJI no texto, não imagens: 📅 🕐 📍 👥 ❓ ✏️ 📝 💡 ⭐ 📣 🔎 💰
- A folha leva QUATRO ilustrações coloridas, e todas importam para o visual:
  1. "ilustracao_topo": um objeto que simbolize a tarefa (megafone, lápis, lupa).
  2. A seção "info": a CENA do tema, o assunto da atividade.
  3. UMA outra seção: um objeto decorativo ligado ao tema.
  4. "chamada_final": um objeto que feche a ideia (jornal, troféu, estrela).
  Cada "imagem_prompt" é um objeto concreto, em português e em até 6 palavras.
  Nunca peça desenho de letra, sílaba ou texto.
- Enunciados curtos. O "subtitulo" de cada seção tem no máximo 10 palavras.

==================================================
A ADAPTAÇÃO AO ESTUDANTE
==================================================

O perfil acima decide o GRAU DE APOIO, não o visual:
- Mais apoio: mais frases começadas, menos lacunas por frase, respostas por
  marcar ou ligar em vez de escrever, checklist mais detalhado.
- Menos apoio: lacunas maiores, perguntas abertas, menos modelo pronto.
- Hiperfocos e interesses entram nos exemplos e na imagem, nunca mudando o
  conteúdo que o professor pediu.
- Se o estudante ainda não escreve, troque a seção de produção por uma de
  "relacionar" ou "perguntas" com resposta por desenho.

==================================================
O QUE O PROFESSOR PEDIU
==================================================

${conteudo}

Preserve o conteúdo e o objetivo. O que você decide é a APRESENTAÇÃO: quais
seções, em que ordem, com que cor e com quanto apoio.

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
  "colorful flat vector illustration, modern clean style, vibrant friendly colors, " +
  "bold simple shapes, plain white background, no text, no letters, no numbers, " +
  "centered single subject, educational material for children";

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

    // -------- Pós-processamento: o que não se confia ao modelo --------
    {
      const secoes = (folha.secoes ?? []) as SecaoBruta[];

      // 1) Numeração sequencial. O modelo repete ou reinicia a contagem.
      secoes.forEach((sec, i) => { sec.numero = i + 1; });

      // 2) Ilustrações: a da seção "info" recebe a descrição vinda da adaptação,
      //    que conhece o tema; as demais ficam com o que o modelo pediu. Seções
      //    extras além de uma perdem a figura, para a folha não virar álbum.
      let comInfo = false;
      let decorativas = 0;
      for (const sec of secoes) {
        if (sec.tipo === "info" && !comInfo) {
          if (descImagens.length > 0) sec.imagem_prompt = descImagens[0];
          comInfo = true;
        } else if (sec.imagem_prompt) {
          decorativas += 1;
          if (decorativas > 1) delete sec.imagem_prompt;
        }
      }

      // 3) Largura: só uma seção pode ocupar a página inteira, senão a folha
      //    vira uma coluna só e estoura para a segunda página.
      let inteiras = 0;
      for (const sec of secoes) {
        if (sec.largura === "inteira") {
          inteiras += 1;
          if (inteiras > 1) sec.largura = "metade";
        }
      }

      // 4) Fonte: o modelo já devolveu "Lexend | Verdana", copiando o exemplo.
      const cfg = (folha.config ?? {}) as Record<string, unknown>;
      const bruta = String(cfg.fonte ?? "").toLowerCase();
      cfg.fonte = bruta.includes("lexend") ? "Lexend" : "Verdana";
      const tam = Number(cfg.tamanho_pt);
      cfg.tamanho_pt = Number.isFinite(tam) ? Math.min(14, Math.max(9, tam)) : 11;
      folha.config = cfg;

      console.log(`folha: ${secoes.length} seções, ${secoes.filter((x) => x.imagem_prompt).length} ilustração`);
    }

    // Ilustrações embutidas em base64
    if (com_imagens !== false) {
      type ComImagem = { imagem_prompt?: string; imagem?: string };
      const alvos: ComImagem[] = [
        folha.ilustracao_topo as ComImagem,
        ...((folha.secoes ?? []) as SecaoBruta[]),
        folha.chamada_final as ComImagem,
      ].filter((x): x is ComImagem => !!x?.imagem_prompt).slice(0, MAX_IMAGENS);
      const imagens = await Promise.all(
        alvos.map((sec) => baixarIlustracao(`${sec.imagem_prompt!}, ${ESTILO_ILUSTRACAO}`, apiKey)),
      );
      alvos.forEach((sec, i) => {
        if (imagens[i]) sec.imagem = imagens[i]!;
        delete sec.imagem_prompt;
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

    }
    delete folha.legenda_material;

    folha.aluno = aluno.nome;
    return json(folha, 200, origin);
  } catch (e) {
    console.error("gerar-folha erro:", e);
    return json({ error: "Erro inesperado ao gerar a folha." }, 500, origin);
  }
});
