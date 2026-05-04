import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, FileText, Sparkles, Calendar, BookOpen, MoreVertical, Pencil, Trash2, Wand2, Download, Search, Image, FileDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AtividadeForm {
  titulo: string;
  disciplina: string;
  turma_id: string;
  descricao: string;
  data_atividade: string;
  arquivo: File | null;
}

const emptyForm: AtividadeForm = {
  titulo: "", disciplina: "", turma_id: "", descricao: "", data_atividade: new Date().toISOString().split("T")[0], arquivo: null,
};

const statusMap: Record<string, { label: string; class: string }> = {
  pendente: { label: "Pendente", class: "bg-muted text-muted-foreground" },
  publicada: { label: "Publicada", class: "bg-primary/10 text-primary" },
  adaptada: { label: "Adaptada", class: "bg-secondary/10 text-secondary" },
};

const disciplinas = ["Matemática", "Língua Portuguesa", "Ciências", "História", "Geografia", "Artes", "Educação Física"];

const DOC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-document`;

const AtividadesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AtividadeForm>(emptyForm);

  // Adapt dialog state
  const [adaptDialogOpen, setAdaptDialogOpen] = useState(false);
  const [adaptAtividadeId, setAdaptAtividadeId] = useState<string | null>(null);
  const [adaptSelectedAlunos, setAdaptSelectedAlunos] = useState<string[]>([]);
  const [adaptFilterTurma, setAdaptFilterTurma] = useState("");
  const [adaptFilterNome, setAdaptFilterNome] = useState("");
  const [adaptInstrucoes, setAdaptInstrucoes] = useState("");
  const [adaptTipo, setAdaptTipo] = useState("DUA - Plano de Aula");
  const [adapting, setAdapting] = useState(false);
  const [adaptResult, setAdaptResult] = useState<string | null>(null);
  const [generatingDoc, setGeneratingDoc] = useState(false);

  const { data: turmas = [] } = useQuery({
    queryKey: ["turmas", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("turmas").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: alunos = [] } = useQuery({
    queryKey: ["alunos-full", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("alunos").select("id, nome, turma_id").order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const filteredAlunos = useMemo(() => {
    return alunos.filter((a) => {
      if (adaptFilterTurma && adaptFilterTurma !== "all" && a.turma_id !== adaptFilterTurma) return false;
      if (adaptFilterNome && !a.nome.toLowerCase().includes(adaptFilterNome.toLowerCase())) return false;
      return true;
    });
  }, [alunos, adaptFilterTurma, adaptFilterNome]);

  const { data: atividades = [], isLoading } = useQuery({
    queryKey: ["atividades", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades")
        .select("*, turmas(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!formData.titulo) throw new Error("Preencha o título");

      let arquivo_url = "";
      let arquivo_tipo = "";

      if (formData.arquivo) {
        const ext = formData.arquivo.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("attachments").upload(path, formData.arquivo);
        if (uploadError) throw new Error("Erro ao enviar arquivo: " + uploadError.message);
        const { data: urlData } = supabase.storage.from("attachments").getPublicUrl(path);
        arquivo_url = urlData.publicUrl;
        arquivo_tipo = formData.arquivo.type;
      }

      const payload: any = {
        titulo: formData.titulo,
        disciplina: formData.disciplina,
        turma_id: formData.turma_id || null,
        descricao: formData.descricao,
        data_atividade: formData.data_atividade || null,
        professor_id: user.id,
      };

      if (formData.arquivo) {
        payload.arquivo_url = arquivo_url;
        payload.arquivo_tipo = arquivo_tipo;
      }

      if (editingId) {
        const { error } = await supabase.from("atividades").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("atividades").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
      toast.success(editingId ? "Atividade atualizada!" : "Atividade criada!");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("atividades_adaptadas").delete().eq("atividade_id", id);
      const { error } = await supabase.from("atividades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
      toast.success("Atividade excluída!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (atv: any) => {
    setEditingId(atv.id);
    setFormData({
      titulo: atv.titulo, disciplina: atv.disciplina || "", turma_id: atv.turma_id || "",
      descricao: atv.descricao || "", data_atividade: atv.data_atividade || "", arquivo: null,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setFormData(emptyForm); };

  const openAdaptDialog = (atvId: string) => {
    setAdaptAtividadeId(atvId);
    setAdaptSelectedAlunos([]);
    setAdaptFilterTurma("");
    setAdaptFilterNome("");
    setAdaptInstrucoes("");
    setAdaptTipo("DUA - Plano de Aula");
    setAdaptResult(null);
    setAdaptDialogOpen(true);
  };

  const toggleAluno = (id: string) => {
    setAdaptSelectedAlunos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const ids = filteredAlunos.map((a) => a.id);
    setAdaptSelectedAlunos((prev) => {
      const allSelected = ids.every((id) => prev.includes(id));
      if (allSelected) return prev.filter((id) => !ids.includes(id));
      return [...new Set([...prev, ...ids])];
    });
  };

  const handleAdapt = async () => {
    if (!adaptAtividadeId) return;
    setAdapting(true);
    setAdaptResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      // If multiple students, send first one as aluno_id and list all names in instructions
      const selectedNames = adaptSelectedAlunos.map((id) => alunos.find((a) => a.id === id)?.nome).filter(Boolean);
      let extraInstructions = adaptInstrucoes || "";
      if (selectedNames.length > 1) {
        extraInstructions = `Adapte para os seguintes alunos simultaneamente: ${selectedNames.join(", ")}. ${extraInstructions}`;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adapt-activity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          atividade_id: adaptAtividadeId,
          aluno_id: adaptSelectedAlunos.length === 1 ? adaptSelectedAlunos[0] : undefined,
          turma_id: adaptFilterTurma || undefined,
          tipo_adaptacao: adaptTipo,
          instrucoes_professor: extraInstructions || undefined,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      const result = await resp.json();
      setAdaptResult(result.conteudo);
      queryClient.invalidateQueries({ queryKey: ["atividades"] });
      queryClient.invalidateQueries({ queryKey: ["adaptacoes"] });
      toast.success("Adaptação gerada com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao adaptar atividade");
    } finally {
      setAdapting(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsText = (content: string, filename: string) => {
    downloadBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), filename);
  };

  const handleExportAdaptation = async (type: "txt" | "pdf" | "image") => {
    if (!adaptResult) return;
    if (type === "txt") {
      downloadAsText(adaptResult, "adaptacao.txt");
      return;
    }

    setGeneratingDoc(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (type === "pdf") {
        const resp = await fetch(DOC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ type: "html", content: adaptResult, title: "Adaptação Pedagógica" }),
        });
        if (!resp.ok) throw new Error("Erro ao gerar documento");
        const result = await resp.json();
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(result.content);
          win.document.close();
          setTimeout(() => win.print(), 500);
        }
      } else if (type === "image") {
        const resp = await fetch(DOC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ type: "image", content: `Crie uma imagem educativa ilustrando a seguinte adaptação pedagógica: ${adaptResult.substring(0, 500)}` }),
        });
        if (!resp.ok) throw new Error("Erro ao gerar imagem");
        const result = await resp.json();
        if (result.url) {
          const link = document.createElement("a");
          link.href = result.url;
          link.download = "adaptacao-imagem.png";
          link.click();
        }
      }
      toast.success(`${type === "pdf" ? "PDF" : "Imagem"} gerado(a)!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeneratingDoc(false);
    }
  };

  return (
    <div>
      <PageHeader title="Atividades" description="Crie e gerencie suas atividades pedagógicas.">
        <Button onClick={() => { setEditingId(null); setFormData(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Nova Atividade
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Carregando...</div>
      ) : atividades.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="Nenhuma atividade cadastrada"
          description="Crie sua primeira atividade pedagógica."
          action={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> Criar Atividade</Button>}
        />
      ) : (
        <div className="space-y-3">
          {atividades.map((atv: any, i: number) => {
            const st = statusMap[atv.status] || statusMap.pendente;
            return (
              <motion.div
                key={atv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="surface-card-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-semibold text-foreground text-sm">{atv.titulo}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {atv.disciplina && <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />{atv.disciplina}</span>}
                    {atv.turmas?.nome && <span>{atv.turmas.nome}</span>}
                    {atv.data_atividade && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(atv.data_atividade).toLocaleDateString("pt-BR")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openAdaptDialog(atv.id)} className="text-primary border-primary/30">
                    <Wand2 className="h-4 w-4 mr-1" /> Adaptar
                  </Button>
                  <Badge variant="secondary" className={`${st.class} border-0 text-xs`}>{st.label}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(atv)}><Pencil className="h-4 w-4 mr-2" /> Editar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(atv.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Excluir</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
            <DialogDescription>Preencha os dados da atividade.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Título</Label>
              <Input placeholder="Nome da atividade" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Disciplina</Label>
                <Select value={formData.disciplina} onValueChange={(v) => setFormData({ ...formData, disciplina: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{disciplinas.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Turma</Label>
                <Select value={formData.turma_id} onValueChange={(v) => setFormData({ ...formData, turma_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Data da Atividade</Label>
              <Input type="date" value={formData.data_atividade} onChange={(e) => setFormData({ ...formData, data_atividade: e.target.value })} />
            </div>
            <div>
              <Label>Conteúdo da Atividade</Label>
              <Textarea placeholder="Cole ou digite o conteúdo da atividade..." rows={5} value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Anexar Arquivo</Label>
              <Input type="file" accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx" onChange={(e) => setFormData({ ...formData, arquivo: e.target.files?.[0] || null })} />
              {formData.arquivo && <p className="text-xs text-muted-foreground mt-1">📎 {formData.arquivo.name}</p>}
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Atividade"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Adapt Dialog */}
      <Dialog open={adaptDialogOpen} onOpenChange={setAdaptDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" /> Adaptar Atividade
            </DialogTitle>
            <DialogDescription>Selecione alunos e configure a adaptação usando DUA.</DialogDescription>
          </DialogHeader>

          {!adaptResult ? (
            <div className="space-y-4 mt-4">
              {/* Student selection with filters */}
              <div>
                <Label className="text-sm font-semibold">Selecionar Alunos</Label>
                <div className="flex gap-2 mt-2">
                  <Select value={adaptFilterTurma} onValueChange={setAdaptFilterTurma}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrar por turma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as turmas</SelectItem>
                      {turmas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome..."
                      value={adaptFilterNome}
                      onChange={(e) => setAdaptFilterNome(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="border border-border rounded-lg mt-2 max-h-48 overflow-y-auto">
                  {filteredAlunos.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                      <Checkbox
                        checked={filteredAlunos.length > 0 && filteredAlunos.every((a) => adaptSelectedAlunos.includes(a.id))}
                        onCheckedChange={selectAll}
                      />
                      <span className="text-xs font-medium text-muted-foreground">Selecionar todos ({filteredAlunos.length})</span>
                    </div>
                  )}
                  {filteredAlunos.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum aluno encontrado</p>
                  ) : (
                    filteredAlunos.map((a) => {
                      const turmaName = turmas.find((t) => t.id === a.turma_id)?.nome;
                      return (
                        <label key={a.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer">
                          <Checkbox
                            checked={adaptSelectedAlunos.includes(a.id)}
                            onCheckedChange={() => toggleAluno(a.id)}
                          />
                          <span className="text-sm">{a.nome}</span>
                          {turmaName && <span className="text-xs text-muted-foreground ml-auto">{turmaName}</span>}
                        </label>
                      );
                    })
                  )}
                </div>
                {adaptSelectedAlunos.length > 0 && (
                  <p className="text-xs text-primary mt-1">{adaptSelectedAlunos.length} aluno(s) selecionado(s)</p>
                )}
              </div>

              <div>
                <Label>Tipo de Adaptação</Label>
                <Select value={adaptTipo} onValueChange={setAdaptTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DUA - Plano de Aula">Plano de Aula Adaptado (DUA)</SelectItem>
                    <SelectItem value="Simplificação visual">Simplificação Visual</SelectItem>
                    <SelectItem value="Adaptação cognitiva">Adaptação Cognitiva</SelectItem>
                    <SelectItem value="Adaptação sensorial">Adaptação Sensorial</SelectItem>
                    <SelectItem value="Estratégias de mediação">Estratégias de Mediação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Instruções adicionais para a IA (opcional)</Label>
                <Textarea
                  placeholder="Ex: Foque em atividades visuais, use linguagem simples, inclua recursos táteis..."
                  rows={3} value={adaptInstrucoes} onChange={(e) => setAdaptInstrucoes(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleAdapt} disabled={adapting}>
                <Sparkles className="h-4 w-4" />
                {adapting ? "Gerando adaptação..." : "Gerar Adaptação com IA"}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="prose prose-sm max-w-none dark:prose-invert bg-muted/50 rounded-lg p-4 border border-border">
                <ReactMarkdown>{adaptResult}</ReactMarkdown>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleExportAdaptation("txt")} disabled={generatingDoc}>
                  <Download className="h-4 w-4 mr-1" /> Baixar TXT
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExportAdaptation("pdf")} disabled={generatingDoc}>
                  <FileDown className="h-4 w-4 mr-1" /> {generatingDoc ? "Gerando..." : "Salvar PDF"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExportAdaptation("image")} disabled={generatingDoc}>
                  <Image className="h-4 w-4 mr-1" /> {generatingDoc ? "Gerando..." : "Gerar Imagem"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(adaptResult!); toast.success("Copiado!"); }}>
                  Copiar Texto
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setAdaptResult(null)}>
                  Nova Adaptação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AtividadesPage;
