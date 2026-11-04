-- Guarda a estrutura das comparações entre modelos.
--
-- Antes, a comparação era salva só como markdown no campo content, então ao
-- recarregar a conversa os três painéis voltavam grudados numa mensagem só.
-- O content continua legível (é ele que vai para a exportação .md), e a
-- estrutura fica aqui para a tela remontar os painéis lado a lado.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.chat_messages.metadata IS
  'Dados estruturados da mensagem. Para comparações: { tipo, aluno, aluno_id, resultados[], material }.';
