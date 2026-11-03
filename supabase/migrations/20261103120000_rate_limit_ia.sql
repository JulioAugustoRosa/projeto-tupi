-- Controle de uso das chamadas de IA pagas (OpenRouter).
-- Protege o crédito da conta contra abuso, já que o cadastro é público.

CREATE TABLE IF NOT EXISTS public.ia_uso_diario (
  professor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia DATE NOT NULL DEFAULT CURRENT_DATE,
  chamadas INTEGER NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (professor_id, dia)
);

-- RLS ligada SEM nenhuma policy: ninguém acessa com a chave anon nem com o JWT
-- do usuário. Só a service_role (usada dentro da edge function) enxerga a tabela.
-- Isso impede que o próprio usuário zere o contador dele via API REST.
ALTER TABLE public.ia_uso_diario ENABLE ROW LEVEL SECURITY;

-- Incrementa e devolve o total do dia, de forma atômica.
-- SECURITY DEFINER para rodar como dono da tabela, ignorando a RLS acima.
CREATE OR REPLACE FUNCTION public.incrementa_uso_ia(p_professor UUID, p_limite INTEGER)
RETURNS TABLE (total INTEGER, permitido BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual INTEGER;
BEGIN
  INSERT INTO public.ia_uso_diario (professor_id, dia, chamadas)
  VALUES (p_professor, CURRENT_DATE, 0)
  ON CONFLICT (professor_id, dia) DO NOTHING;

  SELECT chamadas INTO v_atual
  FROM public.ia_uso_diario
  WHERE professor_id = p_professor AND dia = CURRENT_DATE
  FOR UPDATE;

  IF v_atual >= p_limite THEN
    RETURN QUERY SELECT v_atual, FALSE;
    RETURN;
  END IF;

  UPDATE public.ia_uso_diario
  SET chamadas = chamadas + 1, atualizado_em = now()
  WHERE professor_id = p_professor AND dia = CURRENT_DATE
  RETURNING chamadas INTO v_atual;

  RETURN QUERY SELECT v_atual, TRUE;
END;
$$;

-- Só a service_role pode executar.
REVOKE ALL ON FUNCTION public.incrementa_uso_ia(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
