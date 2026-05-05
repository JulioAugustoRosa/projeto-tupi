import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Bot, User, Paperclip, X, Loader2, MoreVertical, Plus, MessageSquare, Trash2, Pencil } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import ReactMarkdown from "react-markdown";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const DOC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-document`;

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

  // Mensagens da conversa selecionada
  const loadConversation = async (convId: string) => {
    setConversationId(convId);
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (msgs && msgs.length > 0) {
      setMessages([WELCOME_MSG, ...msgs.map((m: any) => ({
        id: m.id, role: m.role as "user" | "assistant", content: m.content,
      }))]);
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

  const handleSend = async () => {
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
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar de conversas */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col surface-card p-3">
        <Button onClick={newConversation} className="w-full mb-3" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Conversa
        </Button>
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
              <div className="flex flex-col items-start gap-1 max-w-[75%]">
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
                {/* Ações por mensagem (apenas assistant, exceto welcome) */}
                {msg.role === "assistant" && msg.id !== "welcome" && (
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
              placeholder="Peça para criar atividades, atualizar perfis, gerar conteúdo..."
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
  );
};

export default AssistentePage;
