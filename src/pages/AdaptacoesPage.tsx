import { motion } from "framer-motion";
import { Sparkles, ArrowRight, CheckCircle2, Clock, User } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

const statusConfig: Record<string, { label: string; class: string; icon: typeof CheckCircle2 }> = {
  concluida: { label: "Concluída", class: "bg-secondary/10 text-secondary", icon: CheckCircle2 },
  gerada: { label: "Gerada", class: "bg-secondary/10 text-secondary", icon: CheckCircle2 },
  em_andamento: { label: "Em andamento", class: "bg-info/10 text-info", icon: Clock },
  pendente: { label: "Pendente", class: "bg-warning/10 text-warning", icon: Clock },
};

const AdaptacoesPage = () => {
  const { user } = useAuth();

  const { data: adaptacoes = [], isLoading } = useQuery({
    queryKey: ["adaptacoes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades_adaptadas")
        .select("*, atividades(titulo, professor_id), alunos(nome)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = adaptacoes.reduce(
    (acc, a) => {
      const s = a.status;
      if (s === "concluida" || s === "gerada") acc.concluidas++;
      else if (s === "em_andamento") acc.em_andamento++;
      else acc.pendentes++;
      return acc;
    },
    { concluidas: 0, em_andamento: 0, pendentes: 0 }
  );

  return (
    <div>
      <PageHeader title="Adaptações" description="Acompanhe as versões adaptadas das suas atividades pedagógicas.">
        <Link to="/atividades">
          <Button>
            <Sparkles className="h-4 w-4" />
            Nova Adaptação
          </Button>
        </Link>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Concluídas", value: counts.concluidas, class: "text-secondary" },
          { label: "Em andamento", value: counts.em_andamento, class: "text-info" },
          { label: "Pendentes", value: counts.pendentes, class: "text-warning" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="surface-card p-5 text-center"
          >
            <p className={`text-3xl font-display font-bold ${item.class}`}>{item.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{item.label}</p>
          </motion.div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : adaptacoes.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card">
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="Nenhuma adaptação ainda"
            description="As adaptações aparecerão aqui quando você gerar versões adaptadas das suas atividades."
            action={<Link to="/atividades"><Button>Ir para Atividades</Button></Link>}
          />
        </motion.div>
      ) : (
        <div className="space-y-3">
          {adaptacoes.map((adaptacao, i) => {
            const st = statusConfig[adaptacao.status] ?? statusConfig.pendente;
            const atividade = adaptacao.atividades as any;
            const aluno = adaptacao.alunos as any;
            return (
              <motion.div
                key={adaptacao.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="surface-card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-foreground text-sm">
                    {atividade?.titulo ?? "Atividade"}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {aluno?.nome && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {aluno.nome}
                      </span>
                    )}
                    <span>{adaptacao.tipo_adaptacao}</span>
                    <span>{new Date(adaptacao.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={`${st.class} border-0 text-xs`}>
                    {st.label}
                  </Badge>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdaptacoesPage;
