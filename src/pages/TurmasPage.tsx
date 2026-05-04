import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Users, MoreVertical, Pencil, Trash2, ChevronLeft, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface TurmaForm {
  nome: string;
  serie: string;
  anoLetivo: string;
  turno: string;
}

const emptyForm: TurmaForm = { nome: "", serie: "", anoLetivo: "2026", turno: "Manhã" };

const TurmasPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TurmaForm>(emptyForm);
  const [selectedTurmaId, setSelectedTurmaId] = useState<string | null>(null);

  const { data: turmas = [], isLoading } = useQuery({
    queryKey: ["turmas", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("turmas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: alunosCounts = {} } = useQuery({
    queryKey: ["alunos-count", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("alunos").select("turma_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((a) => {
        if (a.turma_id) counts[a.turma_id] = (counts[a.turma_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  const { data: turmaAlunos = [], isLoading: loadingAlunos } = useQuery({
    queryKey: ["turma-alunos", selectedTurmaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alunos")
        .select("id, nome, idade, serie, data_nascimento")
        .eq("turma_id", selectedTurmaId!)
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTurmaId,
  });

  const { data: alunosNec = [] } = useQuery({
    queryKey: ["turma-alunos-nec", selectedTurmaId],
    queryFn: async () => {
      const ids = turmaAlunos.map((a) => a.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("necessidades_educacionais")
        .select("aluno_id, condicao")
        .in("aluno_id", ids);
      return data ?? [];
    },
    enabled: turmaAlunos.length > 0,
  });

  const necMap: Record<string, string[]> = {};
  alunosNec.forEach((n) => {
    if (!necMap[n.aluno_id]) necMap[n.aluno_id] = [];
    necMap[n.aluno_id].push(n.condicao);
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!formData.nome || !formData.serie) throw new Error("Preencha nome e série");
      const payload = {
        nome: formData.nome,
        serie: formData.serie,
        ano_letivo: parseInt(formData.anoLetivo),
        turno: formData.turno,
        professor_id: user.id,
      };
      if (editingId) {
        const { error } = await supabase.from("turmas").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("turmas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["turmas"] });
      toast.success(editingId ? "Turma atualizada!" : "Turma criada!");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("turmas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["turmas"] });
      if (selectedTurmaId) setSelectedTurmaId(null);
      toast.success("Turma excluída!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (turma: any) => {
    setEditingId(turma.id);
    setFormData({ nome: turma.nome, serie: turma.serie, anoLetivo: turma.ano_letivo.toString(), turno: turma.turno });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setFormData(emptyForm); };

  const selectedTurma = turmas.find((t) => t.id === selectedTurmaId);

  // Detail view of a turma
  if (selectedTurmaId && selectedTurma) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setSelectedTurmaId(null)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{selectedTurma.nome}</h1>
            <p className="text-sm text-muted-foreground">{selectedTurma.serie} · {selectedTurma.ano_letivo} · {selectedTurma.turno}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="surface-card p-4 text-center">
            <p className="text-2xl font-display font-bold text-primary">{turmaAlunos.length}</p>
            <p className="text-xs text-muted-foreground">Alunos</p>
          </div>
          <div className="surface-card p-4 text-center">
            <p className="text-2xl font-display font-bold text-secondary">{Object.keys(necMap).length}</p>
            <p className="text-xs text-muted-foreground">Com NEE</p>
          </div>
          <div className="surface-card p-4 text-center">
            <Link to="/alunos">
              <Button variant="outline" size="sm" className="mt-1">
                <UserPlus className="h-4 w-4 mr-1" /> Gerenciar Alunos
              </Button>
            </Link>
          </div>
        </div>

        {loadingAlunos ? (
          <div className="text-center py-8 text-muted-foreground">Carregando alunos...</div>
        ) : turmaAlunos.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="Nenhum aluno nesta turma"
            description="Adicione alunos a esta turma na página de Alunos."
            action={<Link to="/alunos"><Button><UserPlus className="h-4 w-4" /> Ir para Alunos</Button></Link>}
          />
        ) : (
          <div className="space-y-2">
            {turmaAlunos.map((aluno, i) => (
              <motion.div
                key={aluno.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03 }}
                className="surface-card-hover p-4 flex items-center gap-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-display font-bold text-sm">
                  {aluno.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{aluno.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {aluno.idade ? `${aluno.idade} anos` : ""} {aluno.serie ? `· ${aluno.serie}` : ""}
                  </p>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  {(necMap[aluno.id] || []).map((c) => (
                    <Badge key={c} variant="secondary" className="text-xs bg-accent/20 text-accent-foreground">{c}</Badge>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Turmas" description="Gerencie suas turmas e visualize os alunos de cada sala.">
        <Button onClick={() => { setEditingId(null); setFormData(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Nova Turma
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Carregando...</div>
      ) : turmas.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Nenhuma turma cadastrada"
          description="Comece criando sua primeira turma para organizar seus alunos."
          action={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> Criar Turma</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {turmas.map((turma, i) => (
            <motion.div
              key={turma.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="surface-card-hover p-6 cursor-pointer"
              onClick={() => setSelectedTurmaId(turma.id)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary font-display font-bold text-sm">
                  {turma.nome.slice(0, 2)}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(turma); }}>
                      <Pencil className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(turma.id); }} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <h3 className="font-display font-semibold text-foreground">{turma.nome}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{turma.serie} · {turma.ano_letivo} · {turma.turno}</p>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xl font-display font-bold text-foreground">{alunosCounts[turma.id] || 0}</p>
                  <p className="text-xs text-muted-foreground">alunos</p>
                </div>
                <p className="text-xs text-primary ml-auto">Clique para ver →</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar Turma" : "Criar Nova Turma"}</DialogTitle>
            <DialogDescription>Preencha os dados da turma abaixo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Nome da Turma</Label>
              <Input placeholder="Ex: 6º Ano A" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
            </div>
            <div>
              <Label>Série</Label>
              <Select value={formData.serie} onValueChange={(v) => setFormData({ ...formData, serie: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a série" /></SelectTrigger>
                <SelectContent>
                  {["1º Ano", "2º Ano", "3º Ano", "4º Ano", "5º Ano", "6º Ano", "7º Ano", "8º Ano", "9º Ano"].map(
                    (s) => <SelectItem key={s} value={s}>{s}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ano Letivo</Label>
                <Input value={formData.anoLetivo} onChange={(e) => setFormData({ ...formData, anoLetivo: e.target.value })} />
              </div>
              <div>
                <Label>Turno</Label>
                <Select value={formData.turno} onValueChange={(v) => setFormData({ ...formData, turno: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Manhã", "Tarde", "Noite", "Integral"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Turma"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TurmasPage;
