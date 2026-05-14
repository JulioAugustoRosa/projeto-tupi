import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const envText = await readFile(".env.local", "utf-8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
    }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// =========================================================
// CREDENCIAIS DA CONTA DEMO (altere se quiser, ou passe via env)
// Uso: DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/create-demo-account.mjs
// =========================================================
const DEMO = {
  email: process.env.DEMO_EMAIL || "banca@tupi.app",
  password: process.env.DEMO_PASSWORD || "banca2026",
  nome: process.env.DEMO_NAME || "Profª Demo (TCC)",
  escola: process.env.DEMO_ESCOLA || "Escola Demonstrativa TUPI",
};

// =========================================================
// TURMAS E ALUNOS FICTÍCIOS
// =========================================================
const TURMAS = [
  { nome: "6º Ano A", serie: "6º Ano", turno: "Manhã", ano_letivo: 2026, descricao: "Turma diversa, predominância de TDAH e TEA" },
  { nome: "2º Ano Médio", serie: "2º Ano EM", turno: "Tarde", ano_letivo: 2026, descricao: "Turma de ensino médio com perfis variados" },
];

const ALUNOS = [
  // ---------- TURMA 1: 6º ANO A ----------
  {
    turma_idx: 0,
    nome: "Beatriz Lima",
    idade: 11,
    serie: "6º Ano",
    necessidades: [{ condicao: "TDAH", nivel_suporte: "Moderado", detalhes: "Diagnóstico aos 8 anos, em uso de medicação" }],
    perfil: {
      nivel_aprendizagem: "Adequado para a série",
      preferencias_aprendizagem: "Atividades curtas, gamificadas, com feedback imediato",
      dificuldades: "Manter atenção em tarefas longas, organização do material",
      facilidades: "Raciocínio rápido, criatividade, trabalho em grupo pequeno",
      hiperfocos: "Jogos online (especialmente Free Fire), maquiagem",
      interesses_pessoais: "TikTok, dança, desenhar",
      estrategias_funcionam: "Cronômetro visual, divisão em micro-tarefas, recompensas a cada etapa concluída",
      comportamento: "Agitada, conversadora, afetuosa",
      dificuldades_especificas: "Inicia tarefas com dificuldade (procrastinação)",
      observacoes_pedagogicas: "Excelente quando o conteúdo é apresentado de forma visual e interativa",
    },
  },
  {
    turma_idx: 0,
    nome: "Davi Oliveira",
    idade: 11,
    serie: "6º Ano",
    necessidades: [{ condicao: "TEA", nivel_suporte: "Nível 2", detalhes: "Diagnóstico aos 4 anos, acompanhamento com fonoaudióloga" }],
    perfil: {
      nivel_aprendizagem: "Avançado em conteúdos do interesse, defasado em outros",
      preferencias_aprendizagem: "Rotinas previsíveis, instruções escritas claras, ambiente silencioso",
      dificuldades: "Trabalhos em grupo grande, mudanças de rotina, ruído alto",
      facilidades: "Memória excepcional para fatos e datas, pensamento sistemático",
      hiperfocos: "Trens e metrôs (decora linhas e estações de cor)",
      interesses_pessoais: "Mapas, sistemas de transporte, vídeos do YouTube",
      estrategias_funcionam: "Antecipar mudanças, usar pictogramas, conectar conteúdo aos seus interesses",
      comportamento: "Reservado, calmo, esquiva-se do contato físico",
      dificuldades_especificas: "Compreensão de linguagem figurada e sarcasmo",
      observacoes_pedagogicas: "Engajamento dispara quando atividades envolvem trens ou rotas",
    },
  },
  {
    turma_idx: 0,
    nome: "Mariana Silva",
    idade: 10,
    serie: "6º Ano",
    necessidades: [{ condicao: "Dislexia", nivel_suporte: "Leve", detalhes: "Avaliação neuropsicológica em 2024" }],
    perfil: {
      nivel_aprendizagem: "Adequado, com adaptações na escrita",
      preferencias_aprendizagem: "Audição (audiolivros), explicações orais, mapas mentais",
      dificuldades: "Leitura silenciosa fluente, escrita ortográfica, cópia da lousa",
      facilidades: "Compreensão oral excelente, raciocínio matemático, oratória",
      hiperfocos: "Animais marinhos (especialmente polvos)",
      interesses_pessoais: "Documentários, museus, desenhar bichos",
      estrategias_funcionam: "Texto com fonte ampliada (Lexend), leitura compartilhada, audiolivros, Kahoot",
      comportamento: "Tímida no início, expansiva quando confortável",
      dificuldades_especificas: "Troca p/q, b/d; ortografia",
      observacoes_pedagogicas: "Não associar inteligência à velocidade de leitura — ela é brilhante",
    },
  },
  {
    turma_idx: 0,
    nome: "Pedro Santos",
    idade: 12,
    serie: "6º Ano",
    necessidades: [
      { condicao: "TEA", nivel_suporte: "Nível 1", detalhes: "" },
      { condicao: "Dislexia", nivel_suporte: "Moderado", detalhes: "" },
    ],
    perfil: {
      nivel_aprendizagem: "Decodificação ok, interpretação prejudicada",
      preferencias_aprendizagem: "Histórias visuais, quadrinhos, esquemas",
      dificuldades: "Inferência, leitura de subtexto, escrita longa",
      facilidades: "Decodificação de palavras, memória de imagens",
      hiperfocos: "Super-heróis (universo Marvel)",
      interesses_pessoais: "HQs, filmes de ação, desenhar personagens",
      estrategias_funcionam: "Histórias em quadrinhos como ponte, perguntas dirigidas, recursos visuais",
      comportamento: "Quieto, observador, gosta de espaço próprio",
      dificuldades_especificas: "Não consegue inferir intenção dos personagens em textos",
      observacoes_pedagogicas: "Adaptações que misturam quadrinhos + texto têm ótimo resultado",
    },
  },
  {
    turma_idx: 0,
    nome: "Ana Carolina Souza",
    idade: 10,
    serie: "6º Ano",
    necessidades: [{ condicao: "Discalculia", nivel_suporte: "Moderado", detalhes: "Avaliação em 2025" }],
    perfil: {
      nivel_aprendizagem: "Acima da média em humanas, defasado em exatas",
      preferencias_aprendizagem: "Manipulação concreta de objetos para conceitos numéricos",
      dificuldades: "Senso numérico, operações, compreensão de quantidades, horas",
      facilidades: "Leitura, escrita criativa, oralidade",
      hiperfocos: "Música pop (especialmente cantoras femininas)",
      interesses_pessoais: "Cantar, escrever poesia, redes sociais",
      estrategias_funcionam: "Material dourado, ábaco, problemas contextualizados em letras de música",
      comportamento: "Comunicativa, líder no grupo",
      dificuldades_especificas: "Tabuada, conversão entre horas/minutos, frações",
      observacoes_pedagogicas: "Quando o problema vira uma 'história', ela resolve melhor",
    },
  },
  {
    turma_idx: 0,
    nome: "Lucas Mendes",
    idade: 11,
    serie: "6º Ano",
    necessidades: [{ condicao: "Síndrome de Down", nivel_suporte: "Moderado", detalhes: "Trissomia do 21" }],
    perfil: {
      nivel_aprendizagem: "Fase silábica de alfabetização, em progresso",
      preferencias_aprendizagem: "Material visual concreto, repetição com variação, mediação 1:1",
      dificuldades: "Atenção sustentada, abstração, leitura fluente",
      facilidades: "Memória visual, sociabilidade, imitação",
      hiperfocos: "Futebol (time do Palmeiras)",
      interesses_pessoais: "Jogar bola, dançar, abraçar amigos",
      estrategias_funcionam: "Atividades sensoriais, alfabeto móvel, sílabas com palavras do futebol",
      comportamento: "Carinhoso, sociável, gosta de contato físico",
      dificuldades_especificas: "Coordenação motora fina, articulação da fala",
      observacoes_pedagogicas: "Usar palavras do contexto futebolístico (BOLA, GOL, TIME) acelera muito a alfabetização",
    },
  },
  // ---------- TURMA 2: 2º MÉDIO ----------
  {
    turma_idx: 1,
    nome: "Gabriela Costa",
    idade: 16,
    serie: "2º Ano EM",
    necessidades: [
      { condicao: "TEA", nivel_suporte: "Nível 1", detalhes: "Antigamente chamado de Asperger" },
      { condicao: "Altas Habilidades", nivel_suporte: "Não se aplica", detalhes: "AH em raciocínio lógico-matemático" },
    ],
    perfil: {
      nivel_aprendizagem: "Muito acima da média em exatas",
      preferencias_aprendizagem: "Desafios complexos, autonomia, instruções precisas",
      dificuldades: "Trabalhos em grupo, situações sociais ambíguas, atividades que considera 'óbvias'",
      facilidades: "Lógica, programação, padrões, abstração",
      hiperfocos: "Programação (Python, JavaScript), criptografia",
      interesses_pessoais: "Hackathons, livros de matemática, código aberto",
      estrategias_funcionam: "Projetos abertos, parceria com colega de mesmo nível, evitar trabalhos repetitivos",
      comportamento: "Reservada, focada, pouco expressão facial",
      dificuldades_especificas: "Lidar com conflitos sociais, hierarquias informais",
      observacoes_pedagogicas: "Dupla excepcionalidade — oferecer desafios extras e tutoria entre pares",
    },
  },
  {
    turma_idx: 1,
    nome: "Rafael Pereira",
    idade: 17,
    serie: "2º Ano EM",
    necessidades: [
      { condicao: "TDAH", nivel_suporte: "Moderado", detalhes: "" },
      { condicao: "Transtorno de Ansiedade Generalizada", nivel_suporte: "Moderado", detalhes: "Acompanhamento psicológico" },
    ],
    perfil: {
      nivel_aprendizagem: "Adequado, oscila com nível de ansiedade",
      preferencias_aprendizagem: "Aulas práticas, debates, trabalhos curtos",
      dificuldades: "Provas longas e cronometradas (gatilho de ansiedade), leituras extensas",
      facilidades: "Análise crítica, oratória, pensamento lateral",
      hiperfocos: "Skate (street e vert)",
      interesses_pessoais: "Música indie, fotografia, documentários",
      estrategias_funcionam: "Provas em formato de seminário, tempo extra, ambiente calmo",
      comportamento: "Inquieto fisicamente, fala rápido, autocrítico",
      dificuldades_especificas: "Bloqueio mental em provas, inicia mas não conclui projetos",
      observacoes_pedagogicas: "Avaliação por portfólio funciona muito melhor do que provas tradicionais",
    },
  },
  {
    turma_idx: 1,
    nome: "Júlia Rodrigues",
    idade: 15,
    serie: "2º Ano EM",
    necessidades: [{ condicao: "Dislexia", nivel_suporte: "Moderado", detalhes: "Acompanhamento desde os 9 anos" }],
    perfil: {
      nivel_aprendizagem: "Adequado, com adaptações de tempo",
      preferencias_aprendizagem: "Audiolivros, leitura em voz alta com colega, mapas mentais",
      dificuldades: "Leitura silenciosa rápida, escrita ortográfica, prova com texto longo",
      facilidades: "Compreensão profunda, criatividade, oralidade",
      hiperfocos: "Literatura fantástica (Brandon Sanderson, fantasia épica)",
      interesses_pessoais: "Escrever histórias, RPG de mesa, ilustração",
      estrategias_funcionam: "Tempo extra, fonte Lexend ou OpenDyslexic, prova oral substitutiva",
      comportamento: "Introspectiva, criativa, muito leitora",
      dificuldades_especificas: "Trocas de letras na escrita, lentidão em leitura técnica",
      observacoes_pedagogicas: "Excelente em produção textual quando avaliada por conteúdo, não ortografia",
    },
  },
  {
    turma_idx: 1,
    nome: "Vinícius Almeida",
    idade: 16,
    serie: "2º Ano EM",
    necessidades: [{ condicao: "Apraxia da Fala", nivel_suporte: "Leve", detalhes: "Atendimento fonoaudiológico semanal" }],
    perfil: {
      nivel_aprendizagem: "Adequado, comunicação compensada por escrita",
      preferencias_aprendizagem: "Atividades escritas, comunicação por texto, recursos visuais",
      dificuldades: "Apresentações orais, conversas em grupo grande",
      facilidades: "Escrita, análise crítica, raciocínio claro",
      hiperfocos: "Cinema (especialmente Tarantino e diretores autorais)",
      interesses_pessoais: "Roteiros, fotografia, edição de vídeo",
      estrategias_funcionam: "Substituir apresentação oral por vídeo gravado, comunicação por chat em sala",
      comportamento: "Comunicativo via escrita, paciente, observador",
      dificuldades_especificas: "Pronúncia de algumas consoantes, fala ritmada",
      observacoes_pedagogicas: "Não tratar como deficiência intelectual — comunicação é só motora",
    },
  },
];

// =========================================================
// EXECUÇÃO
// =========================================================
async function ensureUser() {
  console.log(`→ Garantindo usuário: ${DEMO.email}`);
  const created = await supabase.auth.admin.createUser({
    email: DEMO.email,
    password: DEMO.password,
    email_confirm: true,
    user_metadata: { nome: DEMO.nome },
  });
  if (created.data?.user) {
    console.log(`  ✓ criado (${created.data.user.id.slice(0, 8)}…)`);
    return created.data.user;
  }
  if (/already.*registered|already.*exists|email_exists/i.test(created.error?.message || "")) {
    console.log(`  ! já existe, atualizando senha…`);
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const found = list.users.find((u) => u.email?.toLowerCase() === DEMO.email.toLowerCase());
    if (!found) throw new Error("Usuário existe mas não encontrado");
    await supabase.auth.admin.updateUserById(found.id, {
      password: DEMO.password,
      email_confirm: true,
      user_metadata: { nome: DEMO.nome },
    });
    return found;
  }
  throw created.error;
}

async function main() {
  console.log("=== Criando conta demo TCC ===\n");

  const user = await ensureUser();
  const professorId = user.id;

  // Update profile
  console.log(`\n→ Atualizando profile…`);
  await supabase.from("profiles").update({
    nome: DEMO.nome,
    escola: DEMO.escola,
  }).eq("id", professorId);
  console.log(`  ✓ profile pronto`);

  // Limpar dados antigos do demo (idempotência)
  console.log(`\n→ Limpando dados antigos do demo (se houver)…`);
  await supabase.from("turmas").delete().eq("professor_id", professorId);
  await supabase.from("alunos").delete().eq("professor_id", professorId);
  console.log(`  ✓ limpo`);

  // Criar turmas
  console.log(`\n→ Criando ${TURMAS.length} turmas…`);
  const turmasIds = [];
  for (const t of TURMAS) {
    const id = randomUUID();
    const { error } = await supabase.from("turmas").insert({
      id, professor_id: professorId, ...t,
    });
    if (error) throw new Error(`Turma ${t.nome}: ${error.message}`);
    turmasIds.push(id);
    console.log(`  ✓ ${t.nome}`);
  }

  // Criar alunos + perfis + necessidades
  console.log(`\n→ Criando ${ALUNOS.length} alunos…`);
  for (const a of ALUNOS) {
    const alunoId = randomUUID();
    const { error: alunoErr } = await supabase.from("alunos").insert({
      id: alunoId,
      professor_id: professorId,
      turma_id: turmasIds[a.turma_idx],
      nome: a.nome,
      idade: a.idade,
      serie: a.serie,
    });
    if (alunoErr) throw new Error(`Aluno ${a.nome}: ${alunoErr.message}`);

    // Perfil pedagógico
    const { error: perfilErr } = await supabase.from("perfil_pedagogico").insert({
      id: randomUUID(),
      aluno_id: alunoId,
      ...a.perfil,
    });
    if (perfilErr) throw new Error(`Perfil de ${a.nome}: ${perfilErr.message}`);

    // Necessidades
    for (const n of a.necessidades) {
      const { error: necErr } = await supabase.from("necessidades_educacionais").insert({
        id: randomUUID(),
        aluno_id: alunoId,
        ...n,
      });
      if (necErr) throw new Error(`Necessidade de ${a.nome}: ${necErr.message}`);
    }

    const conds = a.necessidades.map((n) => n.condicao).join(", ");
    console.log(`  ✓ ${a.nome.padEnd(22)} (${conds})`);
  }

  console.log("\n=== Conta demo pronta ===\n");
  console.log("Credenciais para a banca:");
  console.log(`  URL:   https://tupi-adp.vercel.app`);
  console.log(`  Email: ${DEMO.email}`);
  console.log(`  Senha: ${DEMO.password}`);
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});
