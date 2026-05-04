import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Users, Brain, ArrowRight, GraduationCap, FileText, BarChart3, CheckCircle2, Star, Heart, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/hero-illustration.jpg";
import featureAdapt from "@/assets/feature-adapt.jpg";
import featureAi from "@/assets/feature-ai.jpg";
import featureReports from "@/assets/feature-reports.jpg";

const stats = [
  { value: "DUA", label: "Desenho Universal para Aprendizagem" },
  { value: "TEA", label: "TDAH, Dislexia e mais" },
  { value: "100%", label: "Gratuito para começar" },
  { value: "IA", label: "Assistente pedagógico integrado" },
];

const features = [
  {
    title: "Adapte atividades com inteligência artificial",
    desc: "Envie uma atividade e receba versões adaptadas conforme o perfil pedagógico de cada aluno. A IA segue os princípios do DUA para sugerir múltiplas formas de apresentação, engajamento e expressão.",
    img: featureAdapt,
    items: ["Adaptação automática por perfil", "Planos de aula personalizados", "Múltiplas formas de representação"],
  },
  {
    title: "Assistente IA que conhece seus alunos",
    desc: "Converse com a IA sobre estratégias de ensino. Ela acessa os perfis dos alunos, cria atividades, atualiza informações e gera documentos — tudo pelo chat.",
    img: featureAi,
    items: ["Atualiza perfis pelo chat", "Cria atividades automaticamente", "Gera documentos e relatórios"],
  },
  {
    title: "Acompanhe a evolução de cada aluno",
    desc: "Relatórios pedagógicos claros e objetivos para visualizar o progresso, as adaptações realizadas e as estratégias que funcionam para cada estudante.",
    img: featureReports,
    items: ["Relatórios por aluno e turma", "Histórico de adaptações", "Exportação em PDF e HTML"],
  },
];

const testimonials = [
  {
    text: "O TUPI transformou minha forma de preparar atividades. Antes eu gastava horas adaptando para cada aluno, agora a IA faz isso em segundos.",
    name: "Professora Ana",
    role: "Ensino Fundamental — 3º Ano",
  },
  {
    text: "Ter o perfil pedagógico detalhado de cada aluno acessível pela IA é incrível. Ela já sabe das dificuldades e sugere estratégias certeiras.",
    name: "Professor Carlos",
    role: "Educação Especial",
  },
  {
    text: "A plataforma é intuitiva e acolhedora. Consigo registrar tudo sobre meus alunos e gerar relatórios profissionais em poucos cliques.",
    name: "Professora Maria",
    role: "Ensino Fundamental — 5º Ano",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-foreground leading-none">TUPI</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Práticas da Inclusão</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Entrar</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link to="/cadastro">Começar Grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — clean, sem gradiente */}
      <section className="relative pt-16">
        <div className="relative bg-background-warm py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
                <GraduationCap className="h-4 w-4" />
                Tecnologia Universal para Práticas da Inclusão
              </div>
              <h2 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-foreground leading-[1.1] mb-6">
                A plataforma de{" "}
                <span className="text-primary">inclusão escolar</span>{" "}
                favorita dos professores!
              </h2>
              <p className="text-lg text-muted-foreground max-w-lg mb-8 leading-relaxed">
                Crie atividades adaptadas com IA, gerencie perfis pedagógicos e acompanhe a evolução de cada aluno.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" asChild className="rounded-full text-base px-8 h-12">
                  <Link to="/cadastro">
                    Começar Gratuitamente
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="rounded-full text-base px-8 h-12">
                  <Link to="/login">Já tenho uma conta</Link>
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="hidden lg:block"
            >
              <img
                src={heroImg}
                alt="Sala de aula inclusiva com professor e alunos diversos"
                width={960}
                height={640}
                className="w-full max-w-lg mx-auto rounded-3xl shadow-2xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats bar — like Matific's numbers strip */}
      <section className="relative z-10 -mt-2">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="surface-card text-center py-6 px-4"
              >
                <p className="font-display text-2xl sm:text-3xl font-bold text-primary mb-1">{s.value}</p>
                <p className="text-xs sm:text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — alternating image+text like Matific */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
              Tudo para a inclusão em um só lugar
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Ferramentas inteligentes que simplificam o trabalho do professor e potencializam a aprendizagem de todos.
            </p>
          </motion.div>

          <div className="space-y-24">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className={`grid lg:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? "lg:direction-rtl" : ""}`}
              >
                <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                  <h3 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-4">{f.title}</h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">{f.desc}</p>
                  <ul className="space-y-3">
                    {f.items.map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-secondary shrink-0" />
                        <span className="text-sm text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                  <img
                    src={f.img}
                    alt={f.title}
                    loading="lazy"
                    width={640}
                    height={512}
                    className="w-full rounded-2xl shadow-lg border border-border"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities strip */}
      <section className="py-16 px-6 bg-primary">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-primary-foreground text-center mb-10">
            O que o TUPI pode fazer por você
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Brain, text: "Adaptação de atividades com IA baseada no DUA" },
              { icon: Users, text: "Perfis pedagógicos com hiperfocos, TEA, TDAH e mais" },
              { icon: FileText, text: "Geração de documentos em PDF, HTML e TXT" },
              { icon: Heart, text: "Alertas de aniversários e datas importantes" },
              { icon: BarChart3, text: "Relatórios de evolução por aluno e turma" },
              { icon: Shield, text: "Dados seguros e isolados por professor" },
            ].map((c, i) => (
              <motion.div
                key={c.text}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 bg-primary-foreground/10 rounded-xl p-4"
              >
                <c.icon className="h-6 w-6 text-primary-foreground shrink-0 mt-0.5" />
                <span className="text-sm text-primary-foreground font-medium">{c.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials — like Matific's carousel */}
      <section className="py-20 px-6 bg-background-warm">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">
              O que os professores dizem
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="surface-card p-6 flex flex-col"
              >
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="h-4 w-4 text-warning fill-warning" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 mb-4">"{t.text}"</p>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Comece a transformar sua sala de aula hoje
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Cadastre-se gratuitamente e descubra como a IA pedagógica pode tornar sua prática mais inclusiva e eficiente.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="rounded-full text-base px-8 h-12">
                <Link to="/cadastro">
                  Criar Minha Conta Gratuita
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 bg-card">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-bold text-foreground">TUPI</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} TUPI — Tecnologia Universal para Práticas da Inclusão
          </p>
        </div>
      </footer>
    </div>
  );
}
