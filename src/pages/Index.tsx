import { Users, GraduationCap, FileText, Sparkles, ArrowRight, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const statusStyles: Record<string, string> = {
  adaptada: "bg-secondary/10 text-secondary",
  pendente: "bg-warning/10 text-warning",
  publicada: "bg-primary/10 text-primary",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const Dashboard = () => {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome").eq("id", user!.id).single();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [turmas, alunos, atividades, adaptacoes] = await Promise.all([
        supabase.from("turmas").select("id", { count: "exact", head: true }).eq("professor_id", user!.id),
        supabase.from("alunos").select("id", { count: "exact", head: true }).eq("professor_id", user!.id),
        supabase.from("atividades").select("id", { count: "exact", head: true }).eq("professor_id", user!.id),
        supabase.from("atividades_adaptadas").select("id", { count: "exact", head: true }),
      ]);
      return {
        turmas: turmas.count ?? 0,
        alunos: alunos.count ?? 0,
        atividades: atividades.count ?? 0,
        adaptacoes: adaptacoes.count ?? 0,
      };
    },
  });

  const { data: recentActivities = [] } = useQuery({
    queryKey: ["recent-activities", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("atividades")
        .select("id, titulo, status, created_at, turmas(nome)")
        .eq("professor_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  // Birthday alerts
  const { data: birthdayAlerts = [] } = useQuery({
    queryKey: ["birthday-alerts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("alunos")
        .select("nome, data_nascimento" as any)
        .eq("professor_id", user!.id)
        .not("data_nascimento", "is", null) as any;
      if (!data) return [];
      const today = new Date();
      const alerts: { nome: string; dias: number; emoji: string }[] = [];
      for (const aluno of data as any[]) {
        if (!aluno.data_nascimento) continue;
        const birth = new Date(aluno.data_nascimento);
        const nextBday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
        if (nextBday < today) nextBday.setFullYear(today.getFullYear() + 1);
        const diffDays = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          alerts.push({ nome: aluno.nome, dias: diffDays, emoji: diffDays === 0 ? "🎂" : "🎈" });
        }
      }
      return alerts.sort((a, b) => a.dias - b.dias);
    },
  });

  const firstName = profile?.nome?.split(" ")[0] || "Professor";

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Ontem";
    return `${diffDays} dias atrás`;
  };

  return (
    <div>
      <PageHeader
        title={`${getGreeting()}, ${firstName}!`}
        description="Acompanhe o panorama geral da sua prática pedagógica inclusiva."
      />

      {birthdayAlerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {birthdayAlerts.map((alert) => (
            <div key={alert.nome} className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              <span className="text-lg">{alert.emoji}</span>
              <span className="text-foreground">
                {alert.dias === 0
                  ? <><strong>{alert.nome}</strong> faz aniversário hoje!</>
                  : <><strong>{alert.nome}</strong> faz aniversário em {alert.dias} dia{alert.dias > 1 ? "s" : ""}!</>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Turmas" value={stats?.turmas ?? 0} icon={Users} variant="primary" delay={0} />
        <StatCard label="Alunos" value={stats?.alunos ?? 0} icon={GraduationCap} variant="secondary" delay={0.05} />
        <StatCard label="Atividades" value={stats?.atividades ?? 0} icon={FileText} delay={0.1} />
        <StatCard label="Adaptações" value={stats?.adaptacoes ?? 0} icon={Sparkles} variant="primary" delay={0.15} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className="lg:col-span-2 surface-card"
        >
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="font-display font-semibold text-foreground">Atividades Recentes</h2>
            <Link to="/atividades">
              <Button variant="ghost" size="sm">
                Ver todas <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="px-6 pb-6 space-y-3">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma atividade criada ainda.</p>
            ) : (
              recentActivities.map((activity: any) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-background-warm transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{activity.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activity.turmas?.nome || "Sem turma"} · {formatDate(activity.created_at)}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${statusStyles[activity.status] || statusStyles.pendente}`}>
                    {activity.status === "adaptada" ? "Adaptada" : activity.status === "publicada" ? "Publicada" : "Pendente"}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          className="surface-card p-6"
        >
          <h2 className="font-display font-semibold text-foreground mb-4">Ações Rápidas</h2>
          <div className="space-y-3">
            <Link to="/atividades" className="block">
              <Button variant="default" className="w-full justify-start" size="lg">
                <Sparkles className="h-4 w-4" />
                Adaptar Atividade
              </Button>
            </Link>
            <Link to="/turmas" className="block">
              <Button variant="secondary" className="w-full justify-start" size="lg">
                <Users className="h-4 w-4" />
                Nova Turma
              </Button>
            </Link>
            <Link to="/alunos" className="block">
              <Button variant="outline" className="w-full justify-start" size="lg">
                <GraduationCap className="h-4 w-4" />
                Cadastrar Aluno
              </Button>
            </Link>
            <Link to="/relatorios" className="block">
              <Button variant="ghost" className="w-full justify-start" size="lg">
                <TrendingUp className="h-4 w-4" />
                Ver Relatórios
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
