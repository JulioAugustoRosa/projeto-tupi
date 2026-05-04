# TUPI — Tecnologia Universal para Práticas da Inclusão

Plataforma de gestão pedagógica inclusiva. Adapte atividades com inteligência artificial usando a metodologia DUA (Desenho Universal para a Aprendizagem).

## Stack

- Vite
- TypeScript
- React 18
- Tailwind CSS
- shadcn/ui (Radix UI)
- Supabase (auth, database, edge functions)
- React Query
- React Router

## Como rodar localmente

Pré-requisitos: Node.js 18+ e npm (ou bun).

```sh
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite o .env com as credenciais do seu projeto Supabase

# 3. Iniciar o servidor de desenvolvimento
npm run dev
```

A aplicação roda por padrão em `http://localhost:8080`.

## Variáveis de ambiente

Crie um arquivo `.env` na raiz com:

```
VITE_SUPABASE_URL=sua_url_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_publica_supabase
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor de desenvolvimento |
| `npm run build` | Gera o build de produção |
| `npm run preview` | Preview do build de produção |
| `npm run lint` | Roda o ESLint |
| `npm run test` | Roda os testes (Vitest) |

## Estrutura

```
src/
├── components/      # componentes (UI, layout, dashboard, auth)
├── contexts/        # contexts React (Auth)
├── hooks/           # custom hooks
├── integrations/    # clientes externos (Supabase)
├── lib/             # utilitários
├── pages/           # páginas/rotas
└── test/            # setup e exemplos de testes
supabase/
├── functions/       # edge functions (chat, adaptação, geração)
└── migrations/      # migrações SQL
```

## Deploy

O projeto está preparado para deploy na Vercel. Conecte o repositório, configure as variáveis de ambiente do Supabase no painel da Vercel e faça o deploy.
