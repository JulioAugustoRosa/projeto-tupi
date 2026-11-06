// Cria o estudante do caso de teste da Etapa 10 do plano pedagógico:
// 14 anos, 6º ano, TEA, em processo de alfabetização.
//
// É o cenário de referência de qualidade: material de 14 anos com apoio de
// alfabetização, preservando o conteúdo curricular do ano escolar. Serve para
// checar que o TUPI não infantiliza nem troca o gênero notícia por sílabas.
//
// Uso:
//   node scripts/seed-caso-teste-notícia.mjs            (dry-run, só mostra)
//   node scripts/seed-caso-teste-notícia.mjs --aplicar  (grava)

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.TUPI_EMAIL || "usuarioteste@gmail.com";
const SENHA = process.env.TUPI_SENHA;
const APLICAR = process.argv.includes("--aplicar");

if (!SENHA) {
  console.error("Defina a senha do professor em TUPI_SENHA antes de rodar.");
  console.error("  TUPI_SENHA='...' node scripts/seed-caso-teste-notícia.mjs --aplicar");
  process.exit(1);
}

const ALUNO = {
  nome: "Rafael Guimarães",
  idade: 14,
  serie: "6º Ano",
};

const NECESSIDADE = {
  condicao: "Transtorno do Espectro Autista (TEA)",
  nivel_suporte: "Nível 1",
  detalhes:
    "Diagnóstico informado pela família. O diagnóstico não determina, por si só, " +
    "o nível de alfabetização, de compreensão ou de autonomia do estudante.",
};

// Escrito a partir do histórico pedagógico real fornecido pelo professor.
// Só descreve o que foi OBSERVADO: nada aqui afirma ausência de habilidade.
const PERFIL = {
  nivel_aprendizagem:
    "Em processo de alfabetização. Reconhece todas as letras do alfabeto e " +
    "identifica famílias silábicas. Observação registrada em novembro de 2026.",
  facilidades:
    "Reconhece letras e famílias silábicas; lê palavras simples; compreende o " +
    "significado das palavras que consegue ler; copia com precisão.",
  dificuldades:
    "Leitura de palavras simples ainda lenta, exigindo tempo para decodificação. " +
    "Fluência em desenvolvimento.",
  dificuldades_especificas:
    "Escreve com mediação do professor. A compreensão de textos completos ainda " +
    "não foi avaliada e não deve ser presumida.",
  comportamento:
    "Participa das propostas. Em algumas situações solicita confirmação da " +
    "professora antes de seguir, buscando segurança na resposta.",
  preferencias_aprendizagem:
    "Letras maiúsculas (caixa alta); comandos curtos e objetivos; imagens " +
    "significativas ligadas ao assunto; espaçamento ampliado entre linhas.",
  estrategias_funcionam:
    "Banco de palavras; banco de imagens; frases iniciadas para completar; " +
    "exemplo resolvido ao lado; leitura compartilhada antes da tarefa escrita.",
  interesses_pessoais: "Futebol, animais e tecnologia.",
  hiperfocos: "",
  observacoes_pedagogicas:
    "EVITAR INFANTILIZAÇÃO: tem 14 anos e cursa o 6º ano. O material deve ter " +
    "assunto e aparência de sua idade, com apoio de alfabetização embutido. " +
    "Preservar o conteúdo curricular do ano escolar: os exercícios de " +
    "reconhecimento de palavras entram como apoio, nunca no lugar do conteúdo. " +
    "Favorecer o desenvolvimento gradual da autonomia, reduzindo a necessidade " +
    "de confirmação. Oferecer oportunidade de escrita contextualizada, não cópia.",
};

async function api(caminho, opts = {}, token) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    ...opts,
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${caminho}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

const login = await api("/auth/v1/token?grant_type=password", {
  method: "POST",
  body: JSON.stringify({ email: EMAIL, password: SENHA }),
});
const token = login.access_token;
const professorId = login.user.id;
console.log(`Autenticado como ${EMAIL}`);

const existentes = await api(
  `/rest/v1/alunos?select=id,nome&nome=eq.${encodeURIComponent(ALUNO.nome)}`,
  {},
  token,
);

if (!APLICAR) {
  console.log("\n--- DRY-RUN: nada foi gravado ---");
  console.log(`Aluno: ${ALUNO.nome}, ${ALUNO.idade} anos, ${ALUNO.serie}`);
  console.log(`Condição: ${NECESSIDADE.condicao} (${NECESSIDADE.nivel_suporte})`);
  console.log("Perfil pedagógico:");
  for (const [k, v] of Object.entries(PERFIL)) if (v) console.log(`  ${k}: ${v}`);
  console.log(
    existentes.length > 0
      ? `\nJá existe (${existentes[0].id}) — seria ATUALIZADO.`
      : "\nNão existe — seria CRIADO.",
  );
  console.log("\nRode com --aplicar para gravar.");
  process.exit(0);
}

let alunoId;
if (existentes.length > 0) {
  alunoId = existentes[0].id;
  await api(`/rest/v1/alunos?id=eq.${alunoId}`, {
    method: "PATCH",
    body: JSON.stringify({ idade: ALUNO.idade, serie: ALUNO.serie }),
  }, token);
  console.log(`Aluno atualizado: ${alunoId}`);
} else {
  const criado = await api("/rest/v1/alunos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...ALUNO, professor_id: professorId }),
  }, token);
  alunoId = criado[0].id;
  console.log(`Aluno criado: ${alunoId}`);
}

const necs = await api(
  `/rest/v1/necessidades_educacionais?select=id&aluno_id=eq.${alunoId}`,
  {},
  token,
);
if (necs.length === 0) {
  await api("/rest/v1/necessidades_educacionais", {
    method: "POST",
    body: JSON.stringify({ ...NECESSIDADE, aluno_id: alunoId }),
  }, token);
  console.log("Necessidade educacional criada.");
} else {
  await api(`/rest/v1/necessidades_educacionais?id=eq.${necs[0].id}`, {
    method: "PATCH",
    body: JSON.stringify(NECESSIDADE),
  }, token);
  console.log("Necessidade educacional atualizada.");
}

const perfis = await api(
  `/rest/v1/perfil_pedagogico?select=id&aluno_id=eq.${alunoId}`,
  {},
  token,
);
if (perfis.length === 0) {
  await api("/rest/v1/perfil_pedagogico", {
    method: "POST",
    body: JSON.stringify({ ...PERFIL, aluno_id: alunoId }),
  }, token);
  console.log("Perfil pedagógico criado.");
} else {
  await api(`/rest/v1/perfil_pedagogico?id=eq.${perfis[0].id}`, {
    method: "PATCH",
    body: JSON.stringify(PERFIL),
  }, token);
  console.log("Perfil pedagógico atualizado.");
}

console.log(`\nPronto. aluno_id = ${alunoId}`);
