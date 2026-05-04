import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, User, Eye, EyeOff, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CadastroPage() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("Este e-mail já está cadastrado.");
      } else {
        toast.error("Erro ao criar conta. Tente novamente.");
      }
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center"
        >
          <div className="mx-auto h-16 w-16 rounded-full bg-secondary/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8 text-secondary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-3">Verifique seu e-mail</h2>
          <p className="text-muted-foreground mb-2">
            Enviamos um link de confirmação para:
          </p>
          <p className="font-medium text-foreground mb-6">{email}</p>
          <p className="text-sm text-muted-foreground mb-8">
            Clique no link enviado para ativar sua conta e acessar a plataforma TUPI.
          </p>
          <Button variant="outline" asChild>
            <Link to="/login">Ir para Login</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-secondary relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-secondary-foreground"
              style={{
                width: `${80 + i * 50}px`,
                height: `${80 + i * 50}px`,
                top: `${15 + i * 10}%`,
                right: `${5 + i * 12}%`,
                opacity: 0.08 + i * 0.02,
              }}
            />
          ))}
        </div>
        <div className="relative text-secondary-foreground max-w-md">
          <Sparkles className="h-12 w-12 mb-6 opacity-90" />
          <h2 className="font-display text-4xl font-bold mb-4">Junte-se ao TUPI!</h2>
          <p className="text-lg opacity-90 leading-relaxed mb-8">
            Comece a adaptar suas atividades pedagógicas com inteligência artificial e
            promova a inclusão na sua sala de aula.
          </p>
          <div className="space-y-3">
            {["Cadastro gratuito", "Sem cartão de crédito", "Acesso imediato"].map((t) => (
              <div key={t} className="flex items-center gap-2 text-sm opacity-90">
                <CheckCircle2 className="h-4 w-4" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Link to="/landing" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao início
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">TUPI</h1>
              <p className="text-xs text-muted-foreground">Práticas da Inclusão</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold text-foreground mb-2">Criar sua conta</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Preencha os dados abaixo para começar.
          </p>

          <form onSubmit={handleSignup} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="nome"
                  placeholder="Seu nome"
                  className="pl-10"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Criando conta..." : "Criar Conta"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Entrar
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
