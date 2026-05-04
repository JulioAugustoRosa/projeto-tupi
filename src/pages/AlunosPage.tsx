import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Plus, GraduationCap, Search, MoreVertical, Pencil, Trash2, Eye, Camera, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AlunoForm {
  nome: string;
  idade: string;
  turma_id: string;
  serie: string;
  condicoes: string;
  hiperfocos: string;
  observacao: string;
  data_nascimento: string;
  foto_url: string;
}

const emptyForm: AlunoForm = {
  nome: "", idade: "", turma_id: "", serie: "", condicoes: "", hiperfocos: "", observacao: "", data_nascimento: "", foto_url: "",
};

const AlunosPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterTurma, setFilterTurma] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailAluno, setDetailAluno] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AlunoForm>(emptyForm);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/alunos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("attachments").getPublicUrl(path);
      setFormData((prev) => ({ ...prev, foto_url: data.publicUrl }));
      toast.success("Foto enviada!");
    } catch (err: any) {
      toast.error("Erro ao enviar foto: " + err.message);
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const { data: turmas = [] } = useQuery({
    queryKey: ["turmas", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("turmas").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: alunos = [], isLoading } = useQuery({
    queryKey: ["alunos", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alunos")
        .select("*, turmas(nome), necessidades_educacionais(condicao), perfil_pedagogico(hiperfocos, observacoes_pedagogicas)")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!formData.nome) throw new Error("Preencha o nome");

      const payload: any = {
        nome: formData.nome,
        idade: formData.idade ? parseInt(formData.idade) : null,
        turma_id: formData.turma_id || null,
        serie: formData.serie,
        professor_id: user.id,
        data_nascimento: formData.data_nascimento || null,
        foto_url: formData.foto_url || "",
      };

      let alunoId = editingId;

      if (editingId) {
        const { error } = await supabase.from("alunos").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("alunos").insert(payload).select("id").single();
        if (error) throw error;
        alunoId = data.id;
      }

      // Save necessidades if provided
      if (formData.condicoes.trim() && alunoId) {
        // Remove old ones on edit
        if (editingId) {
          await supabase.from("necessidades_educacionais").delete().eq("aluno_id", editingId);
        }
        const condicoes = formData.condicoes.split(",").map(c => c.trim()).filter(Boolean);
        if (condicoes.length > 0) {
          const { error } = await supabase.from("necessidades_educacionais").insert(
            condicoes.map(c => ({ aluno_id: alunoId!, condicao: c }))
          );
          if (error) throw error;
        }
      }

      // Save perfil_pedagogico if provided
      if ((formData.hiperfocos.trim() || formData.observacao.trim()) && alunoId) {
        const { data: existing } = await supabase
          .from("perfil_pedagogico")
          .select("id")
          .eq("aluno_id", alunoId)
          .maybeSingle();

        const perfilPayload = {
          aluno_id: alunoId!,
          hiperfocos: formData.hiperfocos,
          observacoes_pedagogicas: formData.observacao,
        };

        if (existing) {
          await supabase.from("perfil_pedagogico").update(perfilPayload).eq("id", existing.id);
        } else {
          await supabase.from("perfil_pedagogico").insert(perfilPayload);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alunos"] });
      toast.success(editingId ? "Aluno atualizado!" : "Aluno cadastrado!");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete related records first
      await supabase.from("necessidades_educacionais").delete().eq("aluno_id", id);
      await supabase.from("perfil_pedagogico").delete().eq("aluno_id", id);
      const { error } = await supabase.from("alunos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alunos"] });
      toast.success("Aluno excluído!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (aluno: any) => {
    setEditingId(aluno.id);
    setFormData({
      nome: aluno.nome,
      idade: aluno.idade?.toString() || "",
      turma_id: aluno.turma_id || "",
      serie: aluno.serie || "",
      condicoes: aluno.necessidades_educacionais?.map((n: any) => n.condicao).join(", ") || "",
      hiperfocos: aluno.perfil_pedagogico?.[0]?.hiperfocos || "",
      observacao: aluno.perfil_pedagogico?.[0]?.observacoes_pedagogicas || "",
      data_nascimento: aluno.data_nascimento || "",
      foto_url: aluno.foto_url || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const filtered = alunos.filter((a: any) => {
    const matchSearch = a.nome.toLowerCase().includes(search.toLowerCase());
    const matchTurma = filterTurma === "all" || a.turma_id === filterTurma;
    return matchSearch && matchTurma;
  });

  return (
    <div>
      <PageHeader title="Alunos" description="Gerencie os perfis pedagógicos dos seus alunos.">
        <Button onClick={() => { setEditingId(null); setFormData(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          Novo Aluno
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar aluno..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterTurma} onValueChange={setFilterTurma}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todas as turmas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as turmas</SelectItem>
            {turmas.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Carregando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title="Nenhum aluno encontrado"
          description="Cadastre seus alunos para começar a mapear o perfil pedagógico."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Cadastrar Aluno
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((aluno: any, i: number) => {
            const condicoes = aluno.necessidades_educacionais?.map((n: any) => n.condicao) || [];
            const hiperfocos = aluno.perfil_pedagogico?.[0]?.hiperfocos?.split(",").map((h: string) => h.trim()).filter(Boolean) || [];
            const obs = aluno.perfil_pedagogico?.[0]?.observacoes_pedagogicas || "";
            const turmaNome = aluno.turmas?.nome || aluno.serie || "Sem turma";

            return (
              <motion.div
                key={aluno.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                className="surface-card-hover p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center border border-border text-sm font-semibold text-foreground overflow-hidden">
                      {aluno.foto_url ? (
                        <img src={aluno.foto_url} alt={aluno.nome} className="h-full w-full object-cover" />
                      ) : (
                        aluno.nome.split(" ").map((n: string) => n[0]).join("").slice(0, 2)
                      )}
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground text-sm">{aluno.nome}</h3>
                      <p className="text-xs text-muted-foreground">{turmaNome}{aluno.idade ? ` · ${aluno.idade} anos` : ""}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailAluno(aluno)}>
                        <Eye className="h-4 w-4 mr-2" /> Ver Perfil
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(aluno)}>
                        <Pencil className="h-4 w-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteMutation.mutate(aluno.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {condicoes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {condicoes.map((c: string) => (
                      <Badge key={c} variant="secondary" className="text-xs bg-secondary/10 text-secondary border-0 font-normal">{c}</Badge>
                    ))}
                  </div>
                )}

                {hiperfocos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {hiperfocos.map((h: string) => (
                      <span key={h} className="text-xs px-2 py-0.5 bg-muted text-foreground rounded-md border border-border">#{h}</span>
                    ))}
                  </div>
                )}

                {obs && <p className="text-xs text-muted-foreground italic line-clamp-2">"{obs}"</p>}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4 text-primary border-primary/30 hover:bg-primary/5 hover:text-primary"
                  onClick={() => setDetailAluno(aluno)}
                >
                  Ver Plano de Inclusão
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailAluno} onOpenChange={() => setDetailAluno(null)}>
        <DialogContent className="max-w-lg">
          {detailAluno && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{detailAluno.nome}</DialogTitle>
                <DialogDescription>Perfil pedagógico do aluno</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Turma:</span>{" "}
                    <span className="font-medium">{detailAluno.turmas?.nome || "Sem turma"}</span>
                  </div>
                  {detailAluno.idade && (
                    <div>
                      <span className="text-muted-foreground">Idade:</span>{" "}
                      <span className="font-medium">{detailAluno.idade} anos</span>
                    </div>
                  )}
                </div>
                {detailAluno.necessidades_educacionais?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Condições Educacionais</h4>
                    <div className="flex flex-wrap gap-2">
                      {detailAluno.necessidades_educacionais.map((n: any) => (
                        <Badge key={n.id} variant="secondary" className="bg-secondary/10 text-secondary border-0">{n.condicao}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detailAluno.perfil_pedagogico?.[0]?.hiperfocos && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Hiperfocos e Interesses</h4>
                    <div className="flex flex-wrap gap-2">
                      {detailAluno.perfil_pedagogico[0].hiperfocos.split(",").map((h: string) => (
                        <span key={h.trim()} className="text-sm px-2.5 py-1 bg-muted text-foreground rounded-md border border-border">#{h.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
                {detailAluno.perfil_pedagogico?.[0]?.observacoes_pedagogicas && (
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-2">Observações Pedagógicas</h4>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                      {detailAluno.perfil_pedagogico[0].observacoes_pedagogicas}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar Aluno" : "Cadastrar Novo Aluno"}</DialogTitle>
            <DialogDescription>Preencha os dados do aluno abaixo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Foto de perfil */}
            <div className="flex flex-col items-center gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <div className="relative">
                <div className="h-24 w-24 rounded-full bg-muted border-2 border-border overflow-hidden flex items-center justify-center">
                  {formData.foto_url ? (
                    <img src={formData.foto_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                {formData.foto_url && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, foto_url: "" })}
                    className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
              >
                <Camera className="h-3.5 w-3.5 mr-1" />
                {uploadingPhoto ? "Enviando..." : formData.foto_url ? "Trocar foto" : "Adicionar foto"}
              </Button>
            </div>

            <div>
              <Label>Nome Completo</Label>
              <Input placeholder="Nome do aluno" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Idade</Label>
                <Input type="number" placeholder="10" value={formData.idade} onChange={(e) => setFormData({ ...formData, idade: e.target.value })} />
              </div>
              <div>
                <Label>Turma</Label>
                <Select value={formData.turma_id} onValueChange={(v) => setFormData({ ...formData, turma_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {turmas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Data de Nascimento</Label>
              <Input type="date" value={formData.data_nascimento} onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })} />
            </div>
            <div>
              <Label>Condições Educacionais</Label>
              <Input placeholder="Ex: TEA, TDAH, Dislexia (separado por vírgula)" value={formData.condicoes} onChange={(e) => setFormData({ ...formData, condicoes: e.target.value })} />
            </div>
            <div>
              <Label>Hiperfocos e Interesses</Label>
              <Input placeholder="Ex: dinossauros, música (separado por vírgula)" value={formData.hiperfocos} onChange={(e) => setFormData({ ...formData, hiperfocos: e.target.value })} />
            </div>
            <div>
              <Label>Observações Pedagógicas</Label>
              <Textarea placeholder="Observações sobre o aluno..." rows={3} value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} />
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : editingId ? "Salvar Alterações" : "Cadastrar Aluno"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlunosPage;
