
-- Profiles table (auto-created on signup)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  escola TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Turmas
CREATE TABLE public.turmas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  serie TEXT NOT NULL DEFAULT '',
  turno TEXT NOT NULL DEFAULT 'Manhã',
  ano_letivo INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  descricao TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage own turmas" ON public.turmas FOR ALL TO authenticated USING (auth.uid() = professor_id) WITH CHECK (auth.uid() = professor_id);

-- Alunos
CREATE TABLE public.alunos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  idade INTEGER,
  serie TEXT DEFAULT '',
  responsaveis TEXT DEFAULT '',
  documentos TEXT DEFAULT '',
  foto_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.alunos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage own alunos" ON public.alunos FOR ALL TO authenticated USING (auth.uid() = professor_id) WITH CHECK (auth.uid() = professor_id);

-- Perfil pedagógico
CREATE TABLE public.perfil_pedagogico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  nivel_aprendizagem TEXT DEFAULT '',
  dificuldades TEXT DEFAULT '',
  facilidades TEXT DEFAULT '',
  comportamento TEXT DEFAULT '',
  hiperfocos TEXT DEFAULT '',
  interesses_pessoais TEXT DEFAULT '',
  observacoes_pedagogicas TEXT DEFAULT '',
  preferencias_aprendizagem TEXT DEFAULT '',
  estrategias_funcionam TEXT DEFAULT '',
  dificuldades_especificas TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perfil_pedagogico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage perfil via aluno" ON public.perfil_pedagogico FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.alunos WHERE alunos.id = perfil_pedagogico.aluno_id AND alunos.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.alunos WHERE alunos.id = perfil_pedagogico.aluno_id AND alunos.professor_id = auth.uid()));

-- Necessidades educacionais
CREATE TABLE public.necessidades_educacionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  condicao TEXT NOT NULL,
  nivel_suporte TEXT DEFAULT '',
  detalhes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.necessidades_educacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage necessidades via aluno" ON public.necessidades_educacionais FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.alunos WHERE alunos.id = necessidades_educacionais.aluno_id AND alunos.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.alunos WHERE alunos.id = necessidades_educacionais.aluno_id AND alunos.professor_id = auth.uid()));

-- Atividades
CREATE TABLE public.atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  disciplina TEXT DEFAULT '',
  tema TEXT DEFAULT '',
  data_atividade DATE DEFAULT CURRENT_DATE,
  arquivo_url TEXT DEFAULT '',
  arquivo_tipo TEXT DEFAULT '',
  conteudo_extraido TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.atividades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage own atividades" ON public.atividades FOR ALL TO authenticated USING (auth.uid() = professor_id) WITH CHECK (auth.uid() = professor_id);

-- Atividades adaptadas
CREATE TABLE public.atividades_adaptadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  tipo_adaptacao TEXT NOT NULL DEFAULT 'geral',
  conteudo_adaptado TEXT NOT NULL DEFAULT '',
  nivel_dificuldade TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  arquivo_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'gerada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.atividades_adaptadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage adaptacoes via atividade" ON public.atividades_adaptadas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.atividades WHERE atividades.id = atividades_adaptadas.atividade_id AND atividades.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.atividades WHERE atividades.id = atividades_adaptadas.atividade_id AND atividades.professor_id = auth.uid()));

-- Observações pedagógicas
CREATE TABLE public.observacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  atividade_id UUID REFERENCES public.atividades(id) ON DELETE SET NULL,
  conteudo TEXT NOT NULL,
  tipo TEXT DEFAULT 'geral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.observacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage own observacoes" ON public.observacoes FOR ALL TO authenticated USING (auth.uid() = professor_id) WITH CHECK (auth.uid() = professor_id);

-- Relatórios
CREATE TABLE public.relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.alunos(id) ON DELETE SET NULL,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL DEFAULT 'geral',
  titulo TEXT NOT NULL,
  conteudo TEXT DEFAULT '',
  periodo_inicio DATE,
  periodo_fim DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.relatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professors manage own relatorios" ON public.relatorios FOR ALL TO authenticated USING (auth.uid() = professor_id) WITH CHECK (auth.uid() = professor_id);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.turmas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alunos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_adaptadas;
