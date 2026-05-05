import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const envText = await readFile(".env.local", "utf-8").catch(() => {
  console.error("ERRO: .env.local não encontrado.");
  process.exit(1);
});
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
    }),
);

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente em .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: "genirosa04@gmail.com", password: "geni0306", nome: "Geni" },
  { email: "grazielly.oliveira1700@gmail.com", password: "grazielly0306", nome: "Grazielly Dias de Oliveira" },
  { email: "zetadeuif@gmail.com", password: "julio0306", nome: "Julio" },
  { email: "sabia.educar@gmail.com", password: "sabia0306", nome: "Sabia" },
];

const SKIP_OLD_UUIDS = new Set([
  "0b2df679-d598-4b08-ac43-b0520f59d998", // genirosa@gmail.com (conta duplicada Geni)
]);

const CSV_DIR = "/Users/julioaugustorosa/Downloads/DATABASETUPI";

function findCSV(prefix) {
  const file = readdirSync(CSV_DIR).find((f) => f.startsWith(prefix + "-export"));
  if (!file) throw new Error(`CSV não encontrado: ${prefix}*.csv`);
  return join(CSV_DIR, file);
}

async function readCSV(prefix) {
  const path = findCSV(prefix);
  const content = await readFile(path, "utf-8");
  return parse(content, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
}

function emptyToNull(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === "" ? null : v;
  }
  return out;
}

async function ensureUser({ email, password, nome }) {
  console.log(`  → ${email}`);
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (created.data?.user) {
    console.log(`    ✓ criado ${created.data.user.id.slice(0, 8)}…`);
    return created.data.user;
  }
  const msg = created.error?.message || "";
  if (/already.*registered|already.*exists|email.*taken|email_exists/i.test(msg)) {
    console.log(`    ! já existe, buscando…`);
    const { data: list, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error(`usuário ${email} reportado existente mas não encontrado`);
    console.log(`    ✓ encontrado ${found.id.slice(0, 8)}…`);
    return found;
  }
  throw created.error || new Error("erro desconhecido criando usuário");
}

async function upsertChunked(table, rows, batchSize = 200) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`    ! batch ${i}-${i + batch.length}: ${error.message}`);
    } else {
      ok += batch.length;
    }
  }
  return ok;
}

async function main() {
  console.log("=== Migração Lovable → Supabase novo ===\n");

  console.log("1. Lendo profiles antigos…");
  const oldProfiles = await readCSV("profiles");
  const emailToOld = new Map();
  for (const r of oldProfiles) {
    if (SKIP_OLD_UUIDS.has(r.id)) continue;
    emailToOld.set(r.email.toLowerCase(), r.id);
  }
  console.log(`   ${emailToOld.size} usuários elegíveis\n`);

  console.log("2. Garantindo usuários no Supabase novo…");
  const emailToNew = new Map();
  for (const u of USERS) {
    const user = await ensureUser(u);
    emailToNew.set(u.email.toLowerCase(), user.id);
  }
  console.log();

  console.log("3. Construindo mapa UUID antigo → novo…");
  const uuidMap = new Map();
  for (const [email, oldId] of emailToOld) {
    const newId = emailToNew.get(email);
    if (!newId) {
      console.warn(`   ! ${email}: sem usuário novo, ignorando`);
      continue;
    }
    uuidMap.set(oldId, newId);
    console.log(`   ${email}: ${oldId.slice(0, 8)}… → ${newId.slice(0, 8)}…`);
  }
  console.log();

  function remapProfessor(row) {
    if (SKIP_OLD_UUIDS.has(row.professor_id)) return null;
    const newId = uuidMap.get(row.professor_id);
    if (!newId) {
      console.warn(`     ! professor_id desconhecido ${row.professor_id} — pulando`);
      return null;
    }
    return { ...row, professor_id: newId };
  }

  console.log("4. Atualizando profiles (escola, avatar_url)…");
  let updated = 0;
  for (const r of oldProfiles) {
    if (SKIP_OLD_UUIDS.has(r.id)) continue;
    const newId = uuidMap.get(r.id);
    if (!newId) continue;
    const { error } = await supabase
      .from("profiles")
      .update({
        nome: r.nome || null,
        escola: r.escola || null,
        avatar_url: r.avatar_url || null,
      })
      .eq("id", newId);
    if (error) console.error(`   ! ${newId}: ${error.message}`);
    else updated++;
  }
  console.log(`   ✓ ${updated} profiles atualizados\n`);

  console.log("5. Inserindo turmas…");
  const oldTurmas = await readCSV("turmas");
  const newTurmas = oldTurmas.map(remapProfessor).filter(Boolean).map(emptyToNull);
  const turmasOk = await upsertChunked("turmas", newTurmas);
  console.log(`   ✓ ${turmasOk}/${newTurmas.length} turmas\n`);
  const turmaIds = new Set(newTurmas.map((t) => t.id));

  console.log("6. Inserindo alunos…");
  const oldAlunos = await readCSV("alunos");
  const newAlunos = oldAlunos
    .map(remapProfessor)
    .filter(Boolean)
    .map(emptyToNull)
    .map((a) => {
      // Se turma_id ficou órfã (turma pulada), zera
      if (a.turma_id && !turmaIds.has(a.turma_id)) a.turma_id = null;
      return a;
    });
  const alunosOk = await upsertChunked("alunos", newAlunos);
  console.log(`   ✓ ${alunosOk}/${newAlunos.length} alunos\n`);
  const alunoIds = new Set(newAlunos.map((a) => a.id));

  console.log("7. Inserindo perfil_pedagogico…");
  const oldPerfis = await readCSV("perfil_pedagogico");
  const newPerfis = oldPerfis.filter((p) => alunoIds.has(p.aluno_id)).map(emptyToNull);
  const perfisOk = await upsertChunked("perfil_pedagogico", newPerfis);
  console.log(`   ✓ ${perfisOk}/${newPerfis.length} perfis\n`);

  console.log("8. Inserindo necessidades_educacionais…");
  const oldNec = await readCSV("necessidades_educacionais");
  const newNec = oldNec.filter((n) => alunoIds.has(n.aluno_id)).map(emptyToNull);
  const necOk = await upsertChunked("necessidades_educacionais", newNec);
  console.log(`   ✓ ${necOk}/${newNec.length} necessidades\n`);

  console.log("9. Inserindo chat_conversations…");
  const oldConv = await readCSV("chat_conversations");
  const newConv = oldConv.map(remapProfessor).filter(Boolean).map(emptyToNull);
  const convOk = await upsertChunked("chat_conversations", newConv);
  console.log(`   ✓ ${convOk}/${newConv.length} conversas\n`);
  const convIds = new Set(newConv.map((c) => c.id));

  console.log("10. Inserindo chat_messages…");
  const oldMsg = await readCSV("chat_messages");
  const newMsg = oldMsg.filter((m) => convIds.has(m.conversation_id)).map(emptyToNull);
  const msgOk = await upsertChunked("chat_messages", newMsg, 100);
  console.log(`   ✓ ${msgOk}/${newMsg.length} mensagens\n`);

  console.log("=== Migração concluída ===\n");
  console.log("Credenciais (passa pra cada uma individualmente):");
  for (const u of USERS) {
    console.log(`  ${u.email.padEnd(40)} senha: ${u.password}`);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err.message || err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
