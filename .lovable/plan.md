

## Plano: Corrigir geração de imagens, documentos PDF/TXT/HTML

### Problema
A Edge Function `generate-document` usa o modelo `google/gemini-2.5-flash-image` para gerar imagens, mas o formato de resposta da API pode não estar sendo parseado corretamente. Além disso, a exportação PDF usa `window.open` + `print()`, que é frágil.

### Solução

#### 1. Corrigir geração de imagens na Edge Function
- Trocar o modelo de `google/gemini-2.5-flash-image` para `google/gemini-3.1-flash-image-preview` (mais confiável para geração de imagens)
- Adicionar logging detalhado da resposta para debug
- Melhorar o parsing da resposta: verificar todos os formatos possíveis de retorno de imagem (base64 inline, URL, content parts com `inline_data`)
- Salvar a imagem gerada no bucket `attachments` do Storage e retornar a URL pública (mais confiável que base64)

#### 2. Corrigir exportação de documentos (PDF/HTML/TXT)
- **PDF**: Usar `jspdf` + `html2canvas` no frontend para gerar PDF real a partir do HTML retornado, em vez de depender de `window.print()`
- **HTML/TXT**: O fluxo atual funciona, apenas garantir que os erros da API sejam tratados e exibidos corretamente

#### 3. Melhorar feedback no frontend (AssistentePage)
- Mostrar toast com mensagem de erro detalhada quando a geração falhar
- Adicionar estado de loading específico para cada tipo de exportação
- Garantir que imagens base64 sejam renderizadas corretamente no chat via `react-markdown` (configurar `img` como componente permitido)

### Arquivos alterados
- `supabase/functions/generate-document/index.ts` — trocar modelo, melhorar parsing, upload ao Storage
- `src/pages/AssistentePage.tsx` — adicionar `jspdf`/`html2canvas` para PDF real, melhorar tratamento de erros
- `package.json` — adicionar dependências `jspdf` e `html2canvas`

### Detalhes técnicos

```text
Fluxo de imagem:
  Frontend → POST /generate-document {type:"image", content:"..."}
  → Edge Function chama Gemini 3.1 Flash Image
  → Extrai base64 da resposta
  → Upload para Storage bucket "attachments"
  → Retorna URL pública
  → Frontend exibe no chat como <img>

Fluxo de PDF:
  Frontend → POST /generate-document {type:"html", content:"..."}
  → Edge Function gera HTML formatado via Gemini
  → Frontend recebe HTML
  → html2canvas renderiza → jsPDF gera PDF real
  → Download automático
```

