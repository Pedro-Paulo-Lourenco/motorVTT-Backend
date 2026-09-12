# Desenvolvimento

## Instalação

Na raiz do backend:

```bash
npm install
```

O projeto depende de Express, TypeScript, `tsx` e do pacote compartilhado
`@motor-vtt/contracts`.

## Scripts

| Script | Finalidade |
| --- | --- |
| `npm run dev` | Executa `src/server.ts` com recarga usando `tsx watch`. |
| `npm run typecheck` | Executa o TypeScript sem gerar arquivos. |
| `npm run build` | Compila `src/` para `dist/`. |
| `npm start` | Executa o servidor compilado em `dist/server.js`. |
| `npm test` | Placeholder enquanto a suíte de testes não foi configurada. |

## Porta

O servidor usa `PORT=3000` por padrão. Para alterar durante o desenvolvimento:

```bash
PORT=4000 npm run dev
```

Não são necessárias outras variáveis de ambiente para as funcionalidades atuais.
O arquivo `tests/.env.example` serve como preparação para testes futuros e não
representa uma configuração já consumida pela aplicação.

## Processo recomendado

1. Instale as dependências.
2. Execute `npm run typecheck` durante as alterações.
3. Execute `npm run build` antes de testar o artefato compilado.
4. Inicie com `npm start` e consulte o health check.
