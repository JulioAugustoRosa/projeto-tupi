import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.includes("Email not confirmed")) {
        toast.error("Verifique seu e-mail antes de fazer login.");
      } else {
        toast.error("E-mail ou senha incorretos.");
      }
    } else {
      navigate("/");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Digite seu e-mail.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao enviar e-mail de recuperação.");
    } else {
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
      setForgotMode(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-primary-foreground"
              style={{
                width: `${100 + i * 60}px`,
                height: `${100 + i * 60}px`,
                top: `${10 + i * 12}%`,
                left: `${5 + i * 15}%`,
                opacity: 0.1 + i * 0.03,
              }}
            />
          ))}
        </div>
        <div className="relative text-primary-foreground max-w-md">
          <Sparkles className="h-12 w-12 mb-6 opacity-90" />
          <h2 className="font-display text-4xl font-bold mb-4">Bem-vindo de volta!</h2>
          <p className="text-lg opacity-90 leading-relaxed">
            Continue transformando sua sala de aula com práticas pedagógicas inclusivas e adaptadas.
          </p>
        </div>
      </div>

      {/* Right form panel */}
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

          <h2 className="font-display text-2xl font-bold text-foreground mb-2">
            {forgotMode ? "Recuperar Senha" : "Entrar na Plataforma"}
          </h2>
          <p className="text-muted-foreground text-sm mb-8">
            {forgotMode
              ? "Digite seu e-mail para receber um link de recuperação."
              : "Acesse sua conta para continuar."}
          </p>

          <form onSubmit={forgotMode ? handleForgotPassword : handleLogin} className="space-y-5">
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

            {!forgotMode && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
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
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Carregando..." : forgotMode ? "Enviar Link" : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-3">
            {!forgotMode ? (
              <>
                <button
                  onClick={() => setForgotMode(true)}
                  className="text-sm text-primary hover:underline"
                >
                  Esqueci minha senha
                </button>
                <p className="text-sm text-muted-foreground">
                  Não tem conta?{" "}
                  <Link to="/cadastro" className="text-primary font-medium hover:underline">
                    Criar conta
                  </Link>
                </p>
              </>
            ) : (
              <button
                onClick={() => setForgotMode(false)}
                className="text-sm text-primary hover:underline"
              >
                Voltar para login
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
