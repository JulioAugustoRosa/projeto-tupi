import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const envText = await readFile(".env.local", "utf-8");
const env = Object.fromEntries(
  envText.split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const [k, ...v] = l.split("=");
    return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")];
  }),
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: "genirosa04@gmail.com", password: "geni0306" },
  { email: "grazielly.oliveira1700@gmail.com", password: "grazielly0306" },
  { email: "zetadeuif@gmail.com", password: "julio0306" },
  { email: "sabia.educar@gmail.com", password: "sabia0306" },
];

console.log("Listando usuários…");
const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("ERRO ao listar:", listError.message);
  process.exit(1);
}

for (const u of USERS) {
  const found = list.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
  if (!found) {
    console.log(`  ! ${u.email}: não encontrado`);
    continue;
  }
  const { error } = await supabase.auth.admin.updateUserById(found.id, {
    password: u.password,
    email_confirm: true,
  });
  if (error) {
    console.log(`  ! ${u.email}: ${error.message}`);
  } else {
    console.log(`  ✓ ${u.email} → senha "${u.password}"`);
  }
}

console.log("\nPronto. Use as credenciais acima pra logar.");
