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

console.log("Testando service_role key...");
const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
if (error) {
  console.error("❌ FALHOU:", error.message);
  console.error("→ Re-copie a chave service_role do dashboard, com cuidado pra não cortar o início.");
  process.exit(1);
}
console.log(`✓ Chave OK! Encontrei ${data.users.length} usuário(s) no banco.`);
console.log("Pode rodar a migração.");
