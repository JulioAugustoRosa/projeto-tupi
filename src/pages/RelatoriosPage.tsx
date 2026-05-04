import { useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, FileText, TrendingUp, Users, Download, FileDown, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const DOC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-document`;

const RelatoriosPage = () => {
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [reportDialog, setReportDialog] = useState(false);
  const [reportType, setReportType] = useState("geral");
  const [selectedAlunoId, setSelectedAlunoId] = useState("");
  const [selectedTurmaId, setSelectedTurmaId] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [exportingDoc, setExportingDoc] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["relatorio-stats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [atividades, adaptacoes, alunos] = await Promise.all([
        supabase.from("atividades").select("id", { count: "exact", head: true }).eq("professor_id", user!.id),
        supabase.from("atividades_adaptadas").select("id", { count: "exact", head: true }),
        supabase.from("alunos").select("id", { count: "exact", head: true }).eq("professor_id", user!.id),
      ]);
      const totalAtividades = atividades.count ?? 0;
      const totalAdaptacoes = adaptacoes.count ?? 0;
      const totalAlunos = alunos.count ?? 0;
      const taxa = totalAtividades > 0 ? Math.round((totalAdaptacoes / totalAtividades) * 100) : 0;
      return { totalAtividades, totalAdaptacoes, totalAlunos, taxa };
    },
  });

  const { data: alunos = [] } = useQuery({
    queryKey: ["alunos-list-rel", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("alunos").select("id, nome").eq("professor_id", user!.id).order("nome");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: turmas = [] } = useQuery({
    queryKey: ["turmas-list-rel", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("turmas").select("id, nome").eq("professor_id", user!.id).order("nome");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: savedReports = [] } = useQuery({
    queryKey: ["relatorios-saved", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("relatorios")
        .select("id, titulo, tipo, created_at, conteudo, aluno_id, turma_id, alunos(nome), turmas(nome)")
        .eq("professor_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!user,
  });

  const generateReport = async () => {
    if (!user) return;
    setGenerating(true);
    setReportContent(null);

    try {
      // Gather data for the report
      const [atvsRes, adaptRes, alunosRes, necsRes] = await Promise.all([
        supabase.from("atividades").select("titulo, disciplina, status, created_at").eq("professor_id", user.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("atividades_adaptadas").select("tipo_adaptacao, status, created_at, aluno_id, atividades(titulo), alunos(nome)").order("created_at", { ascending: false }).limit(50),
        supabase.from("alunos").select("id, nome, serie, idade, turma_id").eq("professor_id", user.id),
        supabase.from("necessidades_educacionais").select("aluno_id, condicao, nivel_suporte"),
      ]);

      const atividades = atvsRes.data ?? [];
      const adaptacoes = adaptRes.data ?? [];
      const allAlunos = alunosRes.data ?? [];
      const necs = necsRes.data ?? [];

      let context = `Dados do professor:\n`;
      context += `- ${atividades.length} atividades criadas\n`;
      context += `- ${adaptacoes.length} adaptações geradas\n`;
      context += `- ${allAlunos.length} alunos cadastrados\n\n`;

      if (selectedAlunoId) {
        const aluno = allAlunos.find((a) => a.id === selectedAlunoId);
        const alunoNecs = necs.filter((n) => n.aluno_id === selectedAlunoId);
        const alunoAdapts = adaptacoes.filter((a: any) => a.aluno_id === selectedAlunoId);
        context += `Foco: Aluno ${aluno?.nome || "?"}\n`;
        context += `Condições: ${alunoNecs.map((n) => n.condicao).join(", ") || "nenhuma"}\n`;
        context += `Adaptações realizadas: ${alunoAdapts.length}\n`;
      } else if (selectedTurmaId) {
        const turmaAlunos = allAlunos.filter((a) => a.turma_id === selectedTurmaId);
        context += `Foco: Turma com ${turmaAlunos.length} alunos\n`;
        context += `Alunos: ${turmaAlunos.map((a) => a.nome).join(", ")}\n`;
      }

      if (atividades.length > 0) {
        context += `\nÚltimas atividades: ${atividades.slice(0, 10).map((a) => `${a.titulo} (${a.disciplina || "sem disciplina"}, ${a.status})`).join("; ")}\n`;
      }
      if (adaptacoes.length > 0) {
        context += `Últimas adaptações: ${adaptacoes.slice(0, 10).map((a: any) => `${a.atividades?.titulo || "?"} para ${a.alunos?.nome || "geral"} (${a.tipo_adaptacao})`).join("; ")}\n`;
      }

      const reportPrompts: Record<string, string> = {
        geral: `Gere um relatório pedagógico geral com base nos dados. Inclua: resumo da atuação do professor, número de atividades e adaptações, recomendações para próximos passos.`,
        aluno: `Gere um relatório pedagógico individual detalhado focado no aluno. Inclua: perfil do aluno, adaptações realizadas, progresso observado, recomendações.`,
        turma: `Gere um relatório pedagógico da turma. Inclua: composição da turma, atividades realizadas, adaptações feitas, recomendações coletivas.`,
        adaptacoes: `Gere um relatório detalhado sobre as adaptações pedagógicas realizadas. Inclua: tipos de adaptação usados, frequência, alunos beneficiados, eficácia estimada.`,
      };

      const prompt = customPrompt || reportPrompts[reportType] || reportPrompts.geral;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // Use chat function to generate report
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: "user", content: `${prompt}\n\nDados:\n${context}\n\nResponda em markdown formatado, com títulos, listas e seções organizadas. Seja detalhado e profissional.` },
          ],
        }),
      });

      if (!resp.ok) throw new Error("Erro ao gerar relatório");

      // Parse SSE stream
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              fullContent += c;
              setReportContent(fullContent);
            }
          } catch {}
        }
      }

      if (fullContent) {
        // Save report
        const titulo = reportType === "aluno"
          ? `Relatório - ${alunos.find((a) => a.id === selectedAlunoId)?.nome || "Aluno"}`
          : reportType === "turma"
            ? `Relatório - ${turmas.find((t) => t.id === selectedTurmaId)?.nome || "Turma"}`
            : `Relatório ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`;

        await supabase.from("relatorios").insert({
          professor_id: user.id,
          titulo,
          tipo: reportType,
          conteudo: fullContent,
          aluno_id: selectedAlunoId || null,
          turma_id: selectedTurmaId || null,
        });

        toast.success("Relatório gerado e salvo!");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar relatório");
    } finally {
      setGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportReport = async (content: string, type: "txt" | "pdf") => {
    if (type === "txt") {
      downloadBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), "relatorio.txt");
      return;
    }

    setExportingDoc(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch(DOC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData?.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ type: "html", content, title: "Relatório Pedagógico TUPI" }),
      });
      if (!resp.ok) throw new Error("Erro");
      const result = await resp.json();
      const win = window.open("", "_blank");
      if (win) { win.document.write(result.content); win.document.close(); setTimeout(() => win.print(), 500); }
    } catch { toast.error("Erro ao exportar"); } finally { setExportingDoc(false); }
  };

  return (
    <div>
      <PageHeader title="Relatórios" description="Gere relatórios pedagógicos detalhados com IA.">
        <Button onClick={() => { setReportContent(null); setReportDialog(true); }}>
          <Sparkles className="h-4 w-4" /> Gerar Relatório
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Atividades Aplicadas" value={stats?.totalAtividades ?? 0} icon={FileText} delay={0} />
        <StatCard label="Adaptações Geradas" value={stats?.totalAdaptacoes ?? 0} icon={TrendingUp} variant="primary" delay={0.05} />
        <StatCard label="Alunos Atendidos" value={stats?.totalAlunos ?? 0} icon={Users} variant="secondary" delay={0.1} />
        <StatCard label="Taxa de Adaptação" value={`${stats?.taxa ?? 0}%`} icon={BarChart3} delay={0.15} />
      </div>

      {/* Saved reports */}
      {savedReports.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display font-semibold text-lg text-foreground">Relatórios Gerados</h2>
          {savedReports.map((report: any, i) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="surface-card-hover p-4 cursor-pointer"
              onClick={() => { setReportContent(report.conteudo); setReportDialog(true); }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{report.titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(report.created_at).toLocaleDateString("pt-BR")} · {report.tipo}
                    {report.alunos?.nome && ` · ${report.alunos.nome}`}
                    {report.turmas?.nome && ` · ${report.turmas.nome}`}
                  </p>
                </div>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {savedReports.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="surface-card p-8 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-display font-semibold text-foreground">Gere seu primeiro relatório</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Clique em "Gerar Relatório" para criar um relatório pedagógico detalhado com IA.
          </p>
          <Button onClick={() => setReportDialog(true)}>
            <Sparkles className="h-4 w-4" /> Gerar Relatório
          </Button>
        </motion.div>
      )}

      {/* Report Dialog */}
      <Dialog open={reportDialog} onOpenChange={setReportDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Relatório Pedagógico
            </DialogTitle>
            <DialogDescription>Configure e gere relatórios detalhados.</DialogDescription>
          </DialogHeader>

          {!reportContent ? (
            <div className="space-y-4 mt-4">
              <div>
                <Label>Tipo de Relatório</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geral">Relatório Geral</SelectItem>
                    <SelectItem value="aluno">Relatório por Aluno</SelectItem>
                    <SelectItem value="turma">Relatório por Turma</SelectItem>
                    <SelectItem value="adaptacoes">Relatório de Adaptações</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reportType === "aluno" && (
                <div>
                  <Label>Selecione o Aluno</Label>
                  <Select value={selectedAlunoId} onValueChange={setSelectedAlunoId}>
                    <SelectTrigger><SelectValue placeholder="Escolha um aluno" /></SelectTrigger>
                    <SelectContent>{alunos.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              {reportType === "turma" && (
                <div>
                  <Label>Selecione a Turma</Label>
                  <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma turma" /></SelectTrigger>
                    <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Instruções adicionais (opcional)</Label>
                <Textarea
                  placeholder="Ex: Foque nos progressos do último mês, inclua recomendações para a família..."
                  rows={3} value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                />
              </div>

              <Button className="w-full" onClick={generateReport} disabled={generating}>
                <Sparkles className="h-4 w-4" />
                {generating ? "Gerando relatório..." : "Gerar Relatório com IA"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="prose prose-sm max-w-none dark:prose-invert bg-muted/50 rounded-lg p-4 border border-border">
                <ReactMarkdown>{reportContent}</ReactMarkdown>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => exportReport(reportContent, "txt")} disabled={exportingDoc}>
                  <Download className="h-4 w-4 mr-1" /> Baixar TXT
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportReport(reportContent, "pdf")} disabled={exportingDoc}>
                  <FileDown className="h-4 w-4 mr-1" /> {exportingDoc ? "Gerando..." : "Salvar PDF"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(reportContent); toast.success("Copiado!"); }}>
                  Copiar
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setReportContent(null)}>
                  Novo Relatório
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RelatoriosPage;
