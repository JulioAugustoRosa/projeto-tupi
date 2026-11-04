import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Bot, User, Paperclip, X, Loader2, MoreVertical, Plus, MessageSquare, Trash2, Pencil, Download, FileText, ChevronRight, GraduationCap, Cpu, Check, Sparkles, AlertCircle } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { folhaParaDocx, folhaHtmlCompleto, paginaHtml, type Folha } from "@/lib/folha";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ResultadoModelo {
  modelo: string;
  nome: string;
  conteudo?: string;
  erro?: string;
  ms: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Quando preenchido, a mensagem é uma comparação lado a lado entre modelos. */
  comparacao?: ResultadoModelo[];
  alunoNome?: string;
  alunoId?: string;
  /** material anexado nesta sessão, repassado à folha para ser impresso nela */
  anexos?: { nome: string; mime: string; data: string }[];
  /** material salvo no storage, para a folha ainda funcionar após recarregar */
  material?: { nome: string; mime: string; path: string } | null;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const DOC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-document`;
const COMPARE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/adapt-compare`;
const FOLHA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerar-folha`;

/** Espelha a lista fixa validada no servidor (supabase/functions/adapt-compare). */
const MODELOS = [
  { id: "openai/gpt-5-nano", nome: "GPT-5 Nano", detalhe: "mais rápido" },
  { id: "openai/gpt-5-mini", nome: "GPT-5 Mini", detalhe: "intermediário" },
  { id: "openai/gpt-5", nome: "GPT-5", detalhe: "mais capaz" },
] as const;

const MAX_ARQUIVO_MB = 4;

/** Marcadores que o adapt-compare usa para separar as duas partes da resposta. */
const MARCA_INICIO = "<<<ATIVIDADE>>>";
const MARCA_FIM = "<<<FIM_ATIVIDADE>>>";

/**
 * Separa a atividade do estudante das orientações ao professor.
 * Se o modelo não respeitar os marcadores, tudo vira atividade — é melhor
 * mostrar demais do que esconder o conteúdo do professor.
 */
function separarAdaptacao(texto: string): { atividade: string; orientacao: string } {
  const t = texto ?? "";
  const i = t.indexOf(MARCA_INICIO);
  const f = t.indexOf(MARCA_FIM);
  if (i === -1 || f === -1 || f < i) return { atividade: t.trim(), orientacao: "" };
  return {
    atividade: t.slice(i + MARCA_INICIO.length, f).trim(),
    orientacao: t.slice(f + MARCA_FIM.length).trim(),
  };
}

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Olá, Professor! Sou o assistente pedagógico do **TUPI**. Posso:\n\n- 📝 **Criar atividades** — peça e eu registro no sistema\n- 🧠 **Atualizar perfis de alunos** — adicione características, dificuldades, hiperfocos\n- 📄 **Gerar documentos** — clique nos três pontinhos (⋮) ao lado de qualquer resposta minha para exportar em PDF/HTML/TXT\n- 🎨 **Gerar imagens** — mesmo menu de três pontinhos: peça uma imagem educativa e clique em \"Gerar Imagem\"\n- 💬 **Orientar** sobre DUA, adaptações e estratégias\n\nComo posso ajudar hoje?",
};

// Remove preâmbulos de recusa/IA e normaliza underscores quebrados
const stripPreamble = (text: string): string => {
  let t = text || "";
  const patterns = [
    /como (assistente de )?ia[^.!?\n]*[.!?\n]/gi,
    /sou uma? (ia|inteligência artificial|modelo de linguagem|assistente)[^.!?\n]*[.!?\n]/gi,
    /(não|nao) (posso|consigo) (gerar|criar|enviar|produzir|disponibilizar)[^.!?\n]*[.!?\n]/gi,
    /no entanto,? o conteúdo abaixo está[^.!?\n]*[.!?\n]/gi,
    /minhas limitações[^.!?\n]*[.!?\n]/gi,
    /diretamente para (download|impressão)[^.!?\n]*[.!?\n]/gi,
  ];
  for (const re of patterns) t = t.replace(re, "");
  // "_ _ _ _" -> "____"
  t = t.replace(/(?:_\s){2,}_/g, (m) => "_".repeat(m.split("_").length - 1));
  return t.replace(/\n{3,}/g, "\n\n").trim();
};

// Limpa o conteúdo da IA antes de enviar para geração de imagem
const cleanForImagePrompt = (text: string): string => {
  return stripPreamble(text)
    .replace(/\[.*?\]\(.*?\)/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/[#*_`>]/g, "")
    .replace(/clique (nos|no) (três|3) pontinhos[^.!?\n]*[.!?]?/gi, "")
    .replace(/use os (três|3) pontinhos[^.!?\n]*[.!?]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 600);
};

const AssistentePage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ file: File; preview?: string }[]>([]);
  // Modo adaptação: com um aluno selecionado, a mensagem vira uma comparação entre modelos.
  const [exportandoTudo, setExportandoTudo] = useState(false);
  const [folha, setFolha] = useState<Folha | null>(null);
  const [gerandoFolha, setGerandoFolha] = useState<string | null>(null);
  const [orientacaoAberta, setOrientacaoAberta] = useState<string | null>(null);
  const [exportandoFolha, setExportandoFolha] = useState<string | null>(null);
  const [alunoId, setAlunoId] = useState<string>("");
  const [modelosSel, setModelosSel] = useState<string[]>(MODELOS.map((m) => m.id));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Lista de conversas
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id, titulo, updated_at")
        .eq("professor_id", user!.id)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  // Alunos do professor, para o seletor do modo adaptação
  const { data: alunos = [] } = useQuery({
    queryKey: ["alunos-assistente", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("alunos")
        .select("id, nome, turmas(nome)")
        .order("nome");
      return data ?? [];
    },
  });

  const alunoSelecionado = alunos.find((a) => a.id === alunoId);

  // Mensagens da conversa selecionada
  const loadConversation = async (convId: string) => {
    setConversationId(convId);
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (msgs && msgs.length > 0) {
      setMessages([WELCOME_MSG, ...msgs.map((m: any) => {
        const base: Message = {
          id: m.id, role: m.role as "user" | "assistant", content: m.content,
        };
        // Remonta os painéis lado a lado em vez de mostrar tudo num texto só.
        const meta = m.metadata;
        if (meta?.tipo === "comparacao" && Array.isArray(meta.resultados)) {
          base.comparacao = meta.resultados as ResultadoModelo[];
          base.alunoNome = meta.aluno;
          base.alunoId = meta.aluno_id;
          base.material = meta.material ?? null;
          base.content = `Adaptação para **${meta.aluno}** — ${meta.resultados.length} modelo(s).`;
        }
        return base;
      })]);
    } else {
      setMessages([WELCOME_MSG]);
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Auto-carregar última conversa ao abrir
  useEffect(() => {
    if (!conversationId && conversations.length > 0) {
      loadConversation(conversations[0].id);
    }
  }, [conversations]);

  const getOrCreateConversation = async (firstMessage?: string): Promise<string> => {
    if (conversationId) return conversationId;
    const titulo = firstMessage ? firstMessage.slice(0, 40) : "Nova conversa";
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ professor_id: user!.id, titulo })
      .select("id")
      .single();
    if (error) throw error;
    setConversationId(data.id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    return data.id;
  };

  const uploadFile = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("attachments").getPublicUrl(path);
    return data.publicUrl;
  };

  /** Lê o arquivo como base64 puro (sem o prefixo data:...;base64,). */
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = String(reader.result || "");
        resolve(r.slice(r.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(file);
    });

  /**
   * Modo adaptação: manda a atividade (texto e/ou arquivo) + o perfil do aluno
   * para os modelos escolhidos e mostra as respostas lado a lado.
   */
  const handleAdaptCompare = async () => {
    if (!user || !alunoId) return;
    if (modelosSel.length === 0) {
      toast({ title: "Escolha pelo menos um modelo", variant: "destructive" });
      return;
    }

    const enunciado = input.trim();
    const anexos = attachments.slice(0, 2);

    if (!enunciado && anexos.length === 0) {
      toast({ title: "Digite a atividade ou anexe um arquivo", variant: "destructive" });
      return;
    }

    const invalido = anexos.find(
      (a) => !(a.file.type.startsWith("image/") || a.file.type === "application/pdf"),
    );
    if (invalido) {
      toast({
        title: "Formato não aceito na adaptação",
        description: `"${invalido.file.name}" — use imagem ou PDF.`,
        variant: "destructive",
      });
      return;
    }
    const grande = anexos.find((a) => a.file.size > MAX_ARQUIVO_MB * 1_000_000);
    if (grande) {
      toast({
        title: "Arquivo muito grande",
        description: `"${grande.file.name}" passa de ${MAX_ARQUIVO_MB} MB.`,
        variant: "destructive",
      });
      return;
    }

    const nomeAluno = alunoSelecionado?.nome ?? "aluno";
    const resumoAnexos = anexos.length ? `\n\n📎 ${anexos.map((a) => a.file.name).join(", ")}` : "";
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: `🎯 **Adaptar para ${nomeAluno}**\n\n${enunciado || "(atividade no arquivo anexado)"}${resumoAnexos}`,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    try {
      const arquivos = await Promise.all(
        anexos.map(async (a) => ({
          nome: a.file.name,
          mime: a.file.type,
          data: await fileToBase64(a.file),
        })),
      );

      const convId = await getOrCreateConversation(`Adaptação — ${nomeAluno}`);
      await supabase.from("chat_messages").insert({
        conversation_id: convId, role: "user", content: userMsg.content,
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch(COMPARE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData?.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          aluno_id: alunoId,
          texto: enunciado,
          arquivos,
          modelos: modelosSel,
        }),
      });

      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(result.error || `Erro ${resp.status}`);

      const resultados: ResultadoModelo[] = result.resultados ?? [];

      // O material anexado vai para o storage: assim, ao reabrir a conversa,
      // ainda dá para gerar a folha com a imagem original.
      let material: { nome: string; mime: string; path: string } | null = null;
      if (anexos.length > 0) {
        const img = anexos.find((a) => a.file.type.startsWith("image/")) ?? anexos[0];
        try {
          const ext = img.file.name.split(".").pop() || "bin";
          const path = `${user.id}/material/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error } = await supabase.storage.from("attachments").upload(path, img.file);
          if (!error) material = { nome: img.file.name, mime: img.file.type, path };
        } catch { /* sem material salvo: a folha ainda pode ser gerada sem ele */ }
      }

      const compMsg: Message = {
        id: "comp-" + Date.now(),
        role: "assistant",
        content: `Adaptação para **${result.aluno ?? nomeAluno}** — ${resultados.length} modelo(s).`,
        comparacao: resultados,
        alunoNome: result.aluno ?? nomeAluno,
        alunoId,
        anexos: arquivos,
        material,
      };
      setMessages((prev) => [...prev, compMsg]);

      // content continua em markdown legível (é ele que vai para a exportação);
      // metadata guarda a estrutura, para a tela remontar os painéis.
      const registro = resultados
        .map((r) => `### ${r.nome}\n\n${r.conteudo ?? `_${r.erro}_`}`)
        .join("\n\n---\n\n");
      await supabase.from("chat_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: `**Comparação de adaptações — ${result.aluno ?? nomeAluno}**\n\n${registro}`,
        // cast: o tipo Json gerado exige index signature, que as interfaces não têm
        metadata: {
          tipo: "comparacao",
          aluno: result.aluno ?? nomeAluno,
          aluno_id: alunoId,
          resultados,
          material,
        } as unknown as Json,
      });
      await supabase.from("chat_conversations")
        .update({ updated_at: new Date().toISOString() }).eq("id", convId);
    } catch (e) {
      toast({
        title: "Erro ao gerar as adaptações",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    // Com um aluno selecionado, a barra entra no modo adaptação comparada.
    if (alunoId) return handleAdaptCompare();
    if ((!input.trim() && attachments.length === 0) || isLoading || !user) return;

    let userContent = input.trim();
    if (attachments.length > 0) {
      try {
        const urls = await Promise.all(attachments.map((a) => uploadFile(a.file)));
        const fileList = urls.map((url, i) => `[${attachments[i].file.name}](${url})`).join("\n");
        userContent = userContent ? `${userContent}\n\n📎 Arquivos:\n${fileList}` : `📎 Arquivos:\n${fileList}`;
      } catch {
        toast({ title: "Erro ao enviar arquivo", variant: "destructive" });
        return;
      }
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: userContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    try {
      const convId = await getOrCreateConversation(userContent);
      await supabase.from("chat_messages").insert({ conversation_id: convId, role: "user", content: userContent });
      await supabase.from("chat_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);

      const allMessages = messages.filter((m) => m.id !== "welcome").concat(userMsg).map((m) => ({
        role: m.role, content: m.content,
      }));

      let assistantSoFar = "";
      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("stream-")) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { id: "stream-" + Date.now(), role: "assistant", content: assistantSoFar }];
        });
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${resp.status}`);
      }
      if (!resp.body) throw new Error("Sem resposta");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (assistantSoFar) {
        await supabase.from("chat_messages").insert({ conversation_id: convId, role: "assistant", content: assistantSoFar });
      }
    } catch (e: any) {
      console.error("Chat error:", e);
      toast({ title: "Erro no assistente", description: e.message, variant: "destructive" });
      setMessages((prev) => [
        ...prev.filter((m) => !m.id.startsWith("stream-")),
        { id: "err-" + Date.now(), role: "assistant", content: "Desculpe, ocorreu um erro. Tente novamente." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImageFor = async (msg: Message) => {
    setGeneratingId(msg.id + "-img");
    try {
      const cleanPrompt = cleanForImagePrompt(msg.content);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const resp = await fetch(DOC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ type: "image", content: cleanPrompt }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || "Erro ao gerar imagem");
      }
      const result = await resp.json();

      if (result.url) {
        const imgMsg: Message = {
          id: "img-" + Date.now(),
          role: "assistant",
          content: `🎨 **Imagem gerada com sucesso!**\n\n📥 [Clique aqui para visualizar e baixar a imagem](${result.url})`,
        };
        setMessages((prev) => [...prev, imgMsg]);
        if (conversationId) {
          await supabase.from("chat_messages").insert({
            conversation_id: conversationId, role: "assistant", content: imgMsg.content,
          });
        }
        toast({ title: "Imagem gerada!" });
      } else {
        throw new Error(result.error || "Sem imagem");
      }
    } catch (e: any) {
      toast({ title: "Erro ao gerar imagem", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleExportFor = async (msg: Message, type: "pdf" | "html" | "txt") => {
    setGeneratingId(msg.id + "-" + type);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const resp = await fetch(DOC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          type: type === "pdf" ? "html" : type,
          content: stripPreamble(msg.content),
          title: "Documento TUPI",
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${resp.status}`);
      }
      const result = await resp.json();
      if (result.error) throw new Error(result.error);

      if (type === "pdf") {
        const container = document.createElement("div");
        container.innerHTML = result.content;
        container.style.position = "fixed";
        container.style.left = "-9999px";
        container.style.top = "0";
        container.style.width = "794px";
        container.style.background = "white";
        container.style.padding = "40px";
        container.style.fontFamily = "Arial, sans-serif";
        container.style.fontSize = "14px";
        container.style.lineHeight = "1.6";
        container.style.color = "#000";
        document.body.appendChild(container);

        try {
          const pdf = new jsPDF("p", "mm", "a4");
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const margin = 15;
          const contentWidth = pdfWidth - margin * 2;
          const usableHeight = pdfHeight - margin * 2;
          let currentY = margin;
          const blockGap = 2;

          // Renderiza um elemento como imagem e calcula altura em mm
          const renderBlock = async (el: HTMLElement) => {
            const canvas = await html2canvas(el, {
              scale: 2, useCORS: true, backgroundColor: "#ffffff", width: 714,
              logging: false,
            });
            const scaleFactor = contentWidth / canvas.width;
            const heightMM = canvas.height * scaleFactor;
            return { canvas, heightMM };
          };

          // Adiciona um canvas ao PDF respeitando paginação. Se não couber inteiro nem em página vazia,
          // fatia em pixels (último recurso, só pra blocos folha grandes como uma imagem única).
          const addCanvasToPdf = (canvas: HTMLCanvasElement, heightMM: number) => {
            const remaining = pdfHeight - margin - currentY;
            if (heightMM <= remaining) {
              pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, currentY, contentWidth, heightMM);
              currentY += heightMM + blockGap;
              return;
            }
            // não cabe: tenta página nova
            if (currentY > margin + 0.5) { pdf.addPage(); currentY = margin; }
            if (heightMM <= usableHeight) {
              pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, currentY, contentWidth, heightMM);
              currentY += heightMM + blockGap;
              return;
            }
            // ainda não cabe nem em página inteira: fatia (bloco folha gigante)
            const scaleFactor = contentWidth / canvas.width;
            const sliceHeightPx = usableHeight / scaleFactor;
            let srcY = 0;
            while (srcY < canvas.height) {
              const thisSlicePx = Math.min(sliceHeightPx, canvas.height - srcY);
              const thisSliceMM = thisSlicePx * scaleFactor;
              const sliceCanvas = document.createElement("canvas");
              sliceCanvas.width = canvas.width;
              sliceCanvas.height = thisSlicePx;
              const ctx = sliceCanvas.getContext("2d")!;
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, canvas.width, thisSlicePx);
              ctx.drawImage(canvas, 0, srcY, canvas.width, thisSlicePx, 0, 0, canvas.width, thisSlicePx);
              if (srcY > 0) { pdf.addPage(); currentY = margin; }
              pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, currentY, contentWidth, thisSliceMM);
              currentY += thisSliceMM;
              srcY += thisSlicePx;
            }
            currentY += blockGap;
          };

          // Estratégia recursiva: tenta renderizar inteiro; se não cabe e tem filhos quebráveis, recursa
          const isAtomic = (el: HTMLElement) => {
            const tag = el.tagName.toLowerCase();
            return ["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr", "img", "table", "figure", "blockquote", "pre"].includes(tag);
          };

          const processBlock = async (el: HTMLElement) => {
            const text = el.textContent?.trim() || "";
            if (!text && el.children.length === 0 && el.tagName.toLowerCase() !== "img") return;

            const { canvas, heightMM } = await renderBlock(el);
            const remaining = pdfHeight - margin - currentY;

            // Cabe na página atual ou é atômico → adiciona direto
            if (heightMM <= remaining || isAtomic(el) || el.children.length === 0) {
              addCanvasToPdf(canvas, heightMM);
              return;
            }

            // Não cabe e tem filhos: recursa nos filhos
            const children = Array.from(el.children) as HTMLElement[];
            for (const child of children) await processBlock(child);
          };

          // Pega seções marcadas; se não houver, usa filhos diretos do container
          let topBlocks = Array.from(container.querySelectorAll("[data-pdf-section]")) as HTMLElement[];
          if (topBlocks.length === 0) {
            const body = container.querySelector("body") as HTMLElement | null;
            const root = body || container;
            topBlocks = Array.from(root.children) as HTMLElement[];
          }
          if (topBlocks.length === 0) topBlocks = [container];

          for (const block of topBlocks) await processBlock(block);

          pdf.save(`${result.filename?.replace(/\.html$/, "") || "documento"}.pdf`);
        } finally {
          document.body.removeChild(container);
        }
      } else if (type === "html") {
        const blob = new Blob([result.content], { type: "text/html" });
        downloadBlob(blob, result.filename || "documento.html");
      } else {
        const blob = new Blob([result.content], { type: "text/plain" });
        downloadBlob(blob, result.filename || "documento.txt");
      }
      toast({ title: `${type.toUpperCase()} gerado!` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) setAttachments((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const newConversation = () => {
    setConversationId(null);
    setMessages([WELCOME_MSG]);
  };

  // ---------------------------------------------------------------------
  // Folha de atividade: o layout é decidido pelo perfil do aluno
  // ---------------------------------------------------------------------

  /** Baixa do storage um material salvo e devolve em base64. */
  const materialDoStorage = async (
    mat: { nome: string; mime: string; path: string },
  ): Promise<{ nome: string; mime: string; data: string } | null> => {
    try {
      const { data, error } = await supabase.storage.from("attachments").download(mat.path);
      if (error || !data) return null;
      const b64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => { const r = String(fr.result || ""); res(r.slice(r.indexOf(",") + 1)); };
        fr.onerror = () => rej(new Error("falha ao ler"));
        fr.readAsDataURL(data);
      });
      return { nome: mat.nome, mime: mat.mime, data: b64 };
    } catch {
      return null;
    }
  };

  const gerarFolha = async (
    chaveBotao: string,
    alunoDaFolha: string,
    conteudo: string,
    msg?: Message,
  ) => {
    setGerandoFolha(chaveBotao);
    try {
      // Na sessão o anexo está em memória; depois de recarregar, vem do storage.
      let anexos = msg?.anexos;
      if ((!anexos || anexos.length === 0) && msg?.material) {
        const recuperado = await materialDoStorage(msg.material);
        if (recuperado) anexos = [recuperado];
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch(FOLHA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData?.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ aluno_id: alunoDaFolha, conteudo, com_imagens: true, anexos: anexos ?? [] }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(result.error || `Erro ${resp.status}`);
      setFolha(result as Folha);
    } catch (e) {
      toast({ title: "Erro ao gerar a folha", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGerandoFolha(null);
    }
  };

  /** Renderiza uma página fora da tela e devolve o canvas, para PDF e PNG. */
  const renderizarPagina = async (f: Folha, idx: number): Promise<HTMLCanvasElement> => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
    host.innerHTML = paginaHtml(f, idx);
    document.body.appendChild(host);
    try {
      // Espera as imagens embutidas decodificarem antes de capturar.
      const imgs = Array.from(host.querySelectorAll("img"));
      await Promise.all(imgs.map((im) =>
        im.complete ? Promise.resolve() : new Promise((r) => { im.onload = r; im.onerror = r; })
      ));
      return await html2canvas(host.firstElementChild as HTMLElement, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
      });
    } finally {
      document.body.removeChild(host);
    }
  };

  const nomeBase = (f: Folha) =>
    `${slug(f.titulo || "atividade")}-${slug(f.aluno || "aluno")}`;

  const exportarFolha = async (formato: "pdf" | "png" | "docx" | "html") => {
    if (!folha) return;
    setExportandoFolha(formato);
    try {
      const totalPaginas = (folha.paginas ?? []).length || 1;

      if (formato === "docx") {
        downloadBlob(await folhaParaDocx(folha), `${nomeBase(folha)}.docx`);
      } else if (formato === "html") {
        downloadBlob(
          new Blob([folhaHtmlCompleto(folha)], { type: "text/html;charset=utf-8" }),
          `${nomeBase(folha)}.html`,
        );
      } else if (formato === "png") {
        for (let i = 0; i < totalPaginas; i++) {
          const canvas = await renderizarPagina(folha, i);
          const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
          if (blob) {
            downloadBlob(blob, totalPaginas > 1
              ? `${nomeBase(folha)}-pagina-${i + 1}.png`
              : `${nomeBase(folha)}.png`);
          }
        }
      } else {
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        for (let i = 0; i < totalPaginas; i++) {
          const canvas = await renderizarPagina(folha, i);
          if (i > 0) pdf.addPage();
          // PNG, não JPEG: a folha é quase toda branca, e a compressão JPEG deixava
          // faixas acinzentadas em volta dos desenhos de contorno.
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
        }
        pdf.save(`${nomeBase(folha)}.pdf`);
      }
      toast({ title: `Folha exportada (${formato.toUpperCase()})` });
    } catch (e) {
      toast({ title: "Erro ao exportar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExportandoFolha(null);
    }
  };

  // ---------------------------------------------------------------------
  // Exportação de conversas
  // ---------------------------------------------------------------------

  /** Nome de arquivo seguro, sem acento nem caractere especial. */
  const slug = (s: string) =>
    (s || "conversa")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 50) || "conversa";

  const carregarMensagens = async (convId: string) => {
    const { data } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("conversation_id", convId)
      .order("created_at");
    return data ?? [];
  };

  const conversaParaMarkdown = (
    titulo: string,
    criadaEm: string | null,
    msgs: { role: string; content: string; created_at: string }[],
  ) => {
    const cab = [
      `# ${titulo}`,
      "",
      `- Professor: ${user?.email ?? ""}`,
      criadaEm ? `- Última atualização: ${new Date(criadaEm).toLocaleString("pt-BR")}` : "",
      `- Mensagens: ${msgs.length}`,
      `- Exportado em: ${new Date().toLocaleString("pt-BR")}`,
      "",
      "---",
      "",
    ].filter(Boolean).join("\n");

    const corpo = msgs.map((m) => {
      const quem = m.role === "user" ? "👤 Professor" : "🤖 Assistente";
      const quando = new Date(m.created_at).toLocaleString("pt-BR");
      return `## ${quem} · ${quando}\n\n${m.content}\n`;
    }).join("\n---\n\n");

    return cab + corpo;
  };

  /** Exporta UMA conversa em .md (leitura) ou .json (análise). */
  const exportarConversa = async (
    conv: { id: string; titulo: string; updated_at: string },
    formato: "md" | "json",
  ) => {
    try {
      const msgs = await carregarMensagens(conv.id);
      if (msgs.length === 0) {
        toast({ title: "Conversa vazia", description: "Não há mensagens para exportar." });
        return;
      }
      if (formato === "md") {
        const md = conversaParaMarkdown(conv.titulo, conv.updated_at, msgs);
        downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), `${slug(conv.titulo)}.md`);
      } else {
        const payload = {
          titulo: conv.titulo,
          professor: user?.email ?? null,
          atualizado_em: conv.updated_at,
          exportado_em: new Date().toISOString(),
          mensagens: msgs,
        };
        downloadBlob(
          new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
          `${slug(conv.titulo)}.json`,
        );
      }
      toast({ title: "Conversa exportada" });
    } catch (e) {
      toast({ title: "Erro ao exportar", description: (e as Error).message, variant: "destructive" });
    }
  };

  /** Exporta TODAS as conversas num arquivo só — base para analisar as requisições depois. */
  const exportarTudo = async (formato: "md" | "json") => {
    if (conversations.length === 0) {
      toast({ title: "Nenhuma conversa para exportar" });
      return;
    }
    setExportandoTudo(true);
    try {
      const tudo = await Promise.all(
        conversations.map(async (c) => ({ conv: c, msgs: await carregarMensagens(c.id) })),
      );
      const totalMsgs = tudo.reduce((n, t) => n + t.msgs.length, 0);
      const data = new Date().toISOString().slice(0, 10);

      if (formato === "md") {
        const partes = [
          `# Conversas do Assistente TUPI`,
          "",
          `- Professor: ${user?.email ?? ""}`,
          `- Conversas: ${tudo.length}`,
          `- Mensagens: ${totalMsgs}`,
          `- Exportado em: ${new Date().toLocaleString("pt-BR")}`,
          "",
          "=".repeat(60),
          "",
          ...tudo.map(({ conv, msgs }) => conversaParaMarkdown(conv.titulo, conv.updated_at, msgs)),
        ].join("\n");
        downloadBlob(new Blob([partes], { type: "text/markdown;charset=utf-8" }), `tupi-conversas-${data}.md`);
      } else {
        const payload = {
          professor: user?.email ?? null,
          exportado_em: new Date().toISOString(),
          total_conversas: tudo.length,
          total_mensagens: totalMsgs,
          conversas: tudo.map(({ conv, msgs }) => ({
            id: conv.id,
            titulo: conv.titulo,
            atualizado_em: conv.updated_at,
            mensagens: msgs,
          })),
        };
        downloadBlob(
          new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
          `tupi-conversas-${data}.json`,
        );
      }
      toast({ title: `${tudo.length} conversa(s) exportada(s)`, description: `${totalMsgs} mensagens.` });
    } catch (e) {
      toast({ title: "Erro ao exportar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExportandoTudo(false);
    }
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("chat_messages").delete().eq("conversation_id", id);
    await supabase.from("chat_conversations").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (id === conversationId) newConversation();
    toast({ title: "Conversa excluída" });
  };

  const renameConversation = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    await supabase.from("chat_conversations").update({ titulo: renameValue.trim() }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <>
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar de conversas */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col surface-card p-3">
        <Button onClick={newConversation} className="w-full mb-2" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Conversa
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full mb-3" disabled={exportandoTudo || conversations.length === 0}>
              {exportandoTudo ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Exportar tudo
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={() => exportarTudo("md")}>
              📄 Markdown (.md) — leitura
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportarTudo("json")}>
              🗂️ JSON (.json) — análise
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1 overflow-y-auto space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhuma conversa ainda.</p>
          )}
          {conversations.map((c: any) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors ${
                c.id === conversationId ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
              onClick={() => loadConversation(c.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              {renamingId === c.id ? (
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => renameConversation(c.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") renameConversation(c.id); }}
                  className="h-6 text-xs px-1 py-0"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate">{c.titulo}</span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); exportarConversa(c, "md"); }}>
                    <Download className="h-3.5 w-3.5 mr-2" /> Exportar (.md)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); exportarConversa(c, "json"); }}>
                    <Download className="h-3.5 w-3.5 mr-2" /> Exportar (.json)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameValue(c.titulo); }}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader title="Assistente IA" description="Converse, gere atividades, imagens e documentos. Use ⋮ ao lado das respostas." />

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i === messages.length - 1 ? 0.1 : 0 }}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary mt-1">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <div className={`flex flex-col items-start gap-1 ${msg.comparacao ? "w-full max-w-none" : "max-w-[75%]"}`}>
                {msg.comparacao ? (
                  /* Comparação lado a lado entre os modelos */
                  <div className="w-full">
                    <div className="flex items-center gap-2 mb-3 text-sm">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-display font-semibold text-foreground">
                        Adaptação para {msg.alunoNome}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {msg.comparacao.length} modelo(s) comparado(s)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {msg.comparacao.map((r) => (
                        <div key={r.modelo} className="surface-card border border-border rounded-2xl flex flex-col overflow-hidden">
                          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
                            <span className="font-display font-semibold text-sm text-foreground">{r.nome}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {(r.ms / 1000).toFixed(1)}s
                            </span>
                          </div>
                          <div className="px-4 py-3 text-sm leading-relaxed max-h-[32rem] overflow-y-auto">
                            {r.erro ? (
                              <div className="flex items-start gap-2 text-destructive text-xs">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <span>{r.erro}</span>
                              </div>
                            ) : (() => {
                              const { atividade, orientacao } = separarAdaptacao(r.conteudo ?? "");
                              const aberta = orientacaoAberta === msg.id + r.modelo;
                              return (
                                <>
                                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-sm prose-a:text-primary">
                                    <ReactMarkdown>{stripPreamble(atividade)}</ReactMarkdown>
                                  </div>
                                  {orientacao && (
                                    <div className="mt-3 pt-3 border-t border-dashed border-border">
                                      <button
                                        onClick={() => setOrientacaoAberta(aberta ? null : msg.id + r.modelo)}
                                        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                                      >
                                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${aberta ? "rotate-90" : ""}`} />
                                        {aberta ? "Ocultar" : "Ver"} orientações ao professor
                                      </button>
                                      {aberta && (
                                        <div className="mt-2 rounded-lg bg-muted/50 p-3 prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-xs prose-headings:uppercase prose-headings:tracking-wide prose-headings:text-muted-foreground">
                                          <ReactMarkdown>{orientacao}</ReactMarkdown>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          {!r.erro && (
                            <div className="px-3 py-2 border-t border-border">
                              <Button
                                size="sm"
                                className="h-8 w-full text-xs"
                                disabled={!!gerandoFolha}
                                onClick={() =>
                                  gerarFolha(
                                    msg.id + r.modelo,
                                    msg.alunoId ?? "",
                                    separarAdaptacao(r.conteudo ?? "").atividade,
                                    msg,
                                  )
                                }
                              >
                                {gerandoFolha === msg.id + r.modelo ? (
                                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Montando a folha...</>
                                ) : (
                                  <><FileText className="h-3.5 w-3.5 mr-1" /> Gerar folha para imprimir</>
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed w-full ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-a:text-primary">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>
                          ),
                        }}
                      >
                        {stripPreamble(msg.content)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
                )}
                {/* Ações por mensagem (apenas assistant, exceto welcome e comparações) */}
                {msg.role === "assistant" && msg.id !== "welcome" && !msg.comparacao && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        disabled={generatingId?.startsWith(msg.id)}
                      >
                        {generatingId?.startsWith(msg.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MoreVertical className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1">Ações</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => handleGenerateImageFor(msg)}>
                        🎨 Gerar Imagem
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleExportFor(msg, "pdf")}>
                        📄 Salvar como PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportFor(msg, "html")}>
                        🌐 Baixar HTML
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportFor(msg, "txt")}>
                        📝 Baixar TXT
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border mt-1">
                  <User className="h-4 w-4 text-foreground" />
                </div>
              )}
            </motion.div>
          ))}
          {isLoading && !messages.some((m) => m.id.startsWith("stream-")) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2.5">
                <span className="text-sm font-medium bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent animate-[shimmer_2s_linear_infinite]">
                  Pensando
                </span>
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.3s]" />
                </span>
              </div>
            </motion.div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {attachments.map((a, i) => (
                <div key={i} className="relative group">
                  {a.preview ? (
                    <img src={a.preview} alt="" className="h-16 w-16 rounded-lg object-cover border border-border" />
                  ) : (
                    <div className="h-16 px-3 rounded-lg border border-border bg-muted flex items-center gap-2 text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[80px] truncate">{a.file.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Barra de modo: aluno + modelos */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Select value={alunoId || "nenhum"} onValueChange={(v) => setAlunoId(v === "nenhum" ? "" : v)}>
              <SelectTrigger className="h-9 w-auto min-w-[15rem] gap-2 text-sm" aria-label="Adaptar para um aluno">
                <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Conversa normal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Conversa normal (sem aluno)</SelectItem>
                {alunos.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    Adaptar para {a.nome}
                    {(a.turmas as { nome?: string } | null)?.nome ? ` · ${(a.turmas as { nome: string }).nome}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {alunoId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 text-sm">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    {modelosSel.length === MODELOS.length
                      ? "Os 3 modelos"
                      : modelosSel.length === 1
                      ? MODELOS.find((m) => m.id === modelosSel[0])?.nome
                      : `${modelosSel.length} modelos`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {MODELOS.map((m) => {
                    const ativo = modelosSel.includes(m.id);
                    return (
                      <DropdownMenuItem
                        key={m.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          setModelosSel((prev) =>
                            prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                          );
                        }}
                        className="gap-2"
                      >
                        <span className="w-4 shrink-0">
                          {ativo && <Check className="h-4 w-4 text-primary" />}
                        </span>
                        <span className="flex-1">{m.nome}</span>
                        <span className="text-[11px] text-muted-foreground">{m.detalhe}</span>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setModelosSel(MODELOS.map((m) => m.id))}>
                    Selecionar os 3
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {alunoId && (
              <span className="text-xs text-muted-foreground">
                Anexe imagem ou PDF da atividade, ou digite o enunciado.
              </span>
            )}
          </div>

          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button variant="outline" size="icon" className="shrink-0 h-11 w-11" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              placeholder={
                alunoId
                  ? `Enunciado da atividade para adaptar para ${alunoSelecionado?.nome ?? "o aluno"}...`
                  : "Peça para criar atividades, atualizar perfis, gerar conteúdo..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              className="min-h-[44px] max-h-32 resize-none"
            />
            <Button onClick={handleSend} disabled={(!input.trim() && attachments.length === 0) || isLoading} size="icon" className="shrink-0 h-11 w-11">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Use o menu ⋮ ao lado de cada resposta para gerar imagem, PDF, HTML ou TXT.
          </p>
        </div>
      </div>
    </div>

      {/* Folha de atividade pronta para imprimir */}
      <Dialog open={!!folha} onOpenChange={(o) => !o && setFolha(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {folha?.titulo || "Folha de atividade"}
            </DialogTitle>
            <DialogDescription>
              Adaptada para {folha?.aluno} · {(folha?.paginas ?? []).length} página(s)
            </DialogDescription>
          </DialogHeader>

          {(folha?.adaptacoes_aplicadas ?? []).length > 0 && (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                O que foi adaptado no layout, e por quê
              </p>
              <ul className="space-y-1">
                {folha!.adaptacoes_aplicadas!.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-primary">•</span><span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {([
              ["pdf", "PDF"],
              ["docx", "Word (.docx)"],
              ["png", "PNG"],
              ["html", "HTML"],
            ] as const).map(([f, rotulo]) => (
              <Button
                key={f}
                variant={f === "pdf" ? "default" : "outline"}
                size="sm"
                disabled={!!exportandoFolha}
                onClick={() => exportarFolha(f)}
              >
                {exportandoFolha === f
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <Download className="h-4 w-4 mr-1" />}
                {rotulo}
              </Button>
            ))}
          </div>

          {/* Pré-visualização de cada página, reduzida para caber */}
          <div className="space-y-6 bg-muted/30 rounded-xl p-4">
            {(folha?.paginas ?? []).map((_, i) => (
              <div key={i}>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Página {i + 1} de {(folha?.paginas ?? []).length}
                </p>
                <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm"
                     style={{ width: 556, height: 786 }}>
                  <div style={{ transform: "scale(0.7)", transformOrigin: "top left" }}
                       dangerouslySetInnerHTML={{ __html: paginaHtml(folha!, i) }} />
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AssistentePage;
