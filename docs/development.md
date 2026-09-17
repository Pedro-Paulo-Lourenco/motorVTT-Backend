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
| `npm run migrate:make -- nome` | Cria um arquivo de migration vazio em ordem temporal. |
| `npm run migrate:up` | Executa todas as migrations pendentes. |
| `npm run migrate:down` | Reverte a última migration aplicada. |
| `npm run migrate:rollback` | Alias de `migrate:down`. |

## Variáveis de ambiente

Copie o arquivo de referência antes de iniciar o backend:

```bash
cp .env.example .env
```

O servidor usa `PORT=3000`, `APP_URL=http://localhost:3000` e
`CORS_ORIGIN=http://localhost:5173` por padrão. Para alterar a porta durante o
desenvolvimento:

```bash
PORT=4000 npm run dev
```

As configurações `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` e `DB_NAME` são
centralizadas em `env` e usadas pelo pool MySQL. O backend executa `SELECT 1`
antes de abrir a porta HTTP; se o banco estiver indisponível, o processo é
encerrado com código `1` e uma mensagem explicativa.

O pool usa até 10 conexões, aguarda conexões disponíveis e mantém uma fila sem
limite artificial (`queueLimit=0`). Em `SIGINT` ou `SIGTERM`, o servidor para
de aceitar requisições e o pool é encerrado antes do processo terminar.

Uma variável inválida interrompe o processo antes de `app.listen`, com uma
mensagem contendo o nome e o motivo de cada falha. Valores de segredos nunca
são incluídos nessa mensagem.

## Processo recomendado

1. Instale as dependências.
2. Execute `npm run typecheck` durante as alterações.
3. Execute `npm run build` antes de testar o artefato compilado.
4. Execute `npm run migrate:up` para criar/atualizar o schema MySQL.
5. Inicie com `npm start` e consulte o health check.

As migrations usam o pool MySQL existente e registram cada alteração em
`schema_migrations`. Elas devem ser tratadas como imutáveis depois de aplicadas;
alterações futuras devem ser adicionadas por novos arquivos.
