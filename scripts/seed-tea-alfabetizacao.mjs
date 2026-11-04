/**
 * Popula a conta de demonstração com o recorte do TCC:
 * estudantes com TEA em processo de alfabetização.
 *
 * Substitui os alunos existentes da conta. É destrutivo e idempotente:
 * rodar de novo recria o mesmo conjunto.
 *
 * Uso:
 *   node scripts/seed-tea-alfabetizacao.mjs            # mostra o que faria
 *   node scripts/seed-tea-alfabetizacao.mjs --aplicar  # aplica de verdade
 *
 * Lê SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY de .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const APLICAR = process.argv.includes("--aplicar");
const CONTA = process.env.DEMO_EMAIL || "usuarioteste@gmail.com";

const envText = await readFile(".env.local", "utf-8");
const env = Object.fromEntries(
  envText.split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
  }),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TURMAS = [
  { nome: "2º Ano A", serie: "2º Ano", turno: "Manhã", ano_letivo: 2026,
    descricao: "Turma de alfabetização com estudantes com TEA" },
  { nome: "3º Ano B", serie: "3º Ano", turno: "Tarde", ano_letivo: 2026,
    descricao: "Alfabetização em andamento, suportes variados" },
];

// Quatro perfis que cobrem as fases da psicogênese e os três níveis de suporte,
// para a adaptação ter de reagir a situações bem diferentes dentro do mesmo recorte.
const ALUNOS = [
  {
    turma_idx: 0, nome: "Heitor Nogueira", idade: 8, serie: "2º Ano",
    necessidades: [{ condicao: "TEA", nivel_suporte: "Nível 3",
      detalhes: "Comunicação não verbal; usa CAA com pictogramas (PECS)" }],
    perfil: {
      nivel_aprendizagem: "Pré-silábico — ainda não relaciona letra e som",
      preferencias_aprendizagem: "Pictogramas, imagens reais, pareamento figura-figura, rotina visual fixa",
      dificuldades: "Textos escritos, instruções verbais longas, mudanças de rotina, ruído",
      facilidades: "Memória visual muito boa, pareamento, reconhece logotipos e símbolos",
      hiperfocos: "Elevadores e botões numerados",
      interesses_pessoais: "Apertar botões, portas automáticas, vídeos de elevador",
      estrategias_funcionam: "Apoio visual em tudo, uma instrução por vez, modelo pronto ao lado, reforço imediato",
      comportamento: "Quieto, evita contato visual, acalma-se com rotina previsível",
      dificuldades_especificas: "Não responde a comando apenas oral; precisa do apoio visual junto",
      observacoes_pedagogicas: "Responde muito melhor a atividade com figura do que com palavra escrita. Quase nada de texto.",
    },
  },
  {
    turma_idx: 0, nome: "Cecília Vasques", idade: 8, serie: "2º Ano",
    necessidades: [{ condicao: "TEA", nivel_suporte: "Nível 2",
      detalhes: "Fala funcional por frases curtas; acompanhamento fonoaudiológico" }],
    perfil: {
      nivel_aprendizagem: "Silábico — escreve uma letra para cada sílaba",
      preferencias_aprendizagem: "Imagem ao lado da palavra, alfabeto móvel, recortar e colar",
      dificuldades: "Escrever palavra completa, textos com muita informação junta, folha cheia",
      facilidades: "Reconhece o próprio nome e palavras do seu interesse, bom pareamento",
      hiperfocos: "Gatos (sabe raças de cor)",
      interesses_pessoais: "Desenhar gatos, adesivos, cores",
      estrategias_funcionam: "Poucos itens por folha, figura grande junto da palavra, banco de sílabas para escolher",
      comportamento: "Afetuosa, cansa rápido em tarefa longa",
      dificuldades_especificas: "Desiste quando a folha tem muita coisa escrita",
      observacoes_pedagogicas: "Folha com muito texto faz ela travar antes de começar. Imagem destrava.",
    },
  },
  {
    turma_idx: 1, nome: "Benício Tavares", idade: 9, serie: "3º Ano",
    necessidades: [{ condicao: "TEA", nivel_suporte: "Nível 1", detalhes: "" }],
    perfil: {
      nivel_aprendizagem: "Silábico-alfabético — já junta sílabas, troca letras",
      preferencias_aprendizagem: "Sequência de imagens, história em quadrinhos, instrução literal",
      dificuldades: "Linguagem figurada, enunciado com duplo sentido, interpretar intenção",
      facilidades: "Decodifica palavras conhecidas, memória para fatos, pensamento sistemático",
      hiperfocos: "Dinossauros (nomes científicos e períodos)",
      interesses_pessoais: "Livros de dinossauro, escavação, montar quebra-cabeça",
      estrategias_funcionam: "Enunciado direto e literal, apoio visual, conectar ao tema de dinossauro",
      comportamento: "Falante sobre o hiperfoco, reservado no resto",
      dificuldades_especificas: "Não entende 'pegue leve', 'use a cabeça' e outras expressões",
      observacoes_pedagogicas: "Enunciado tem de ser literal. Figura ajuda mais que explicação escrita.",
    },
  },
  {
    turma_idx: 1, nome: "Laís Montenegro", idade: 9, serie: "3º Ano",
    necessidades: [
      { condicao: "TEA", nivel_suporte: "Nível 1", detalhes: "" },
      { condicao: "Hiperlexia", nivel_suporte: "Leve", detalhes: "Decodifica acima da série, compreensão abaixo" },
    ],
    perfil: {
      nivel_aprendizagem: "Alfabético na decodificação, mas compreensão muito abaixo",
      preferencias_aprendizagem: "Imagem para checar o sentido, pergunta objetiva, resposta por escolha",
      dificuldades: "Entender o que leu, responder pergunta aberta, recontar história",
      facilidades: "Lê em voz alta com fluência, memoriza textos inteiros",
      hiperfocos: "Placas de trânsito e sinalização",
      interesses_pessoais: "Mapas, símbolos, organizar objetos por cor",
      estrategias_funcionam: "Ligar palavra à imagem, múltipla escolha com figura, evitar pergunta aberta",
      comportamento: "Colaborativa, responde rápido mesmo sem ter entendido",
      dificuldades_especificas: "Lê perfeitamente e não sabe dizer do que se trata",
      observacoes_pedagogicas: "Ler bem engana: a compreensão precisa ser checada com imagem, não com mais texto.",
    },
  },
];

async function main() {
  const { data: lista, error: errLista } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (errLista) throw errLista;
  const user = lista.users.find((u) => u.email?.toLowerCase() === CONTA.toLowerCase());
  if (!user) throw new Error(`Conta não encontrada: ${CONTA}`);
  const professorId = user.id;

  const { data: atuais } = await db.from("alunos").select("id, nome").eq("professor_id", professorId);
  const { data: turmasAtuais } = await db.from("turmas").select("id, nome").eq("professor_id", professorId);

  console.log(`Conta: ${CONTA}`);
  console.log(`\nSERÁ APAGADO:`);
  console.log(`  ${(atuais ?? []).length} aluno(s): ${(atuais ?? []).map((a) => a.nome).join(", ") || "—"}`);
  console.log(`  ${(turmasAtuais ?? []).length} turma(s): ${(turmasAtuais ?? []).map((t) => t.nome).join(", ") || "—"}`);
  console.log(`\nSERÁ CRIADO:`);
  console.log(`  ${TURMAS.length} turma(s): ${TURMAS.map((t) => t.nome).join(", ")}`);
  for (const a of ALUNOS) {
    console.log(`  ${a.nome} (${a.idade}a) — ${a.necessidades.map((n) => `${n.condicao} ${n.nivel_suporte}`).join(", ")} — ${a.perfil.nivel_aprendizagem}`);
  }

  if (!APLICAR) {
    console.log(`\n(simulação: nada foi alterado. Rode com --aplicar para valer.)`);
    return;
  }

  console.log(`\n→ Apagando dados antigos…`);
  await db.from("alunos").delete().eq("professor_id", professorId);
  await db.from("turmas").delete().eq("professor_id", professorId);

  console.log(`→ Criando turmas…`);
  const turmaIds = [];
  for (const t of TURMAS) {
    const id = randomUUID();
    const { error } = await db.from("turmas").insert({ id, professor_id: professorId, ...t });
    if (error) throw new Error(`Turma ${t.nome}: ${error.message}`);
    turmaIds.push(id);
  }

  console.log(`→ Criando alunos…`);
  for (const a of ALUNOS) {
    const alunoId = randomUUID();
    const { error: e1 } = await db.from("alunos").insert({
      id: alunoId, professor_id: professorId, turma_id: turmaIds[a.turma_idx],
      nome: a.nome, idade: a.idade, serie: a.serie,
    });
    if (e1) throw new Error(`${a.nome}: ${e1.message}`);

    const { error: e2 } = await db.from("perfil_pedagogico")
      .insert({ id: randomUUID(), aluno_id: alunoId, ...a.perfil });
    if (e2) throw new Error(`perfil de ${a.nome}: ${e2.message}`);

    for (const n of a.necessidades) {
      const { error: e3 } = await db.from("necessidades_educacionais")
        .insert({ id: randomUUID(), aluno_id: alunoId, ...n });
      if (e3) throw new Error(`necessidade de ${a.nome}: ${e3.message}`);
    }
    console.log(`  ✓ ${a.nome}`);
  }

  console.log(`\nPronto: ${ALUNOS.length} estudantes com TEA em alfabetização.`);
}

main().catch((e) => { console.error("\nFALHOU:", e.message); process.exit(1); });
