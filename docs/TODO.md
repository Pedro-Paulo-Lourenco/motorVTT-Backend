# TODO — Backend

Backlog do backend do Motor VTT Universal. As tarefas abaixo correspondem à
fundação necessária para cumprir o Sprint 0.

## Sprint 0 — Fundação

### Estrutura inicial

- [x] Criar a estrutura do projeto backend.
- [x] Configurar Node.js, TypeScript e Express.
- [x] Configurar `src/app.ts` e `src/server.ts`.
- [x] Criar o endpoint `GET /health`.
- [x] Configurar `tsconfig.json` com `strict: true`.
- [x] Alinhar a configuração de módulos ESM entre TypeScript e `package.json`.

### Contratos compartilhados

- [X] Integrar o backend ao repositório/pacote de contratos compartilhados.
- [X] Utilizar os mesmos DTOs, enums e schemas definidos para frontend e backend.
- [X] Incluir os contratos de Usuario, Sala, Participante, Tabuleiro, Cena,
  Token, Asset, SheetTemplate, CharacterSheet e MessageLog.
- [ ] Validar no backend os payloads conforme os schemas compartilhados.

**Aceitação:** frontend e backend validam os mesmos formatos.

### Ambientes e segredos

- [ ] Configurar `dotenv`.
- [ ] Criar `.env.example` com API, banco, JWT, cookies, CORS, e-mail, filas e
  storage.
- [ ] Validar as variáveis obrigatórias durante a inicialização.
- [ ] Exibir erro claro quando uma variável obrigatória estiver ausente.
- [ ] Garantir que arquivos `.env` e segredos não sejam versionados.

**Aceitação:** o backend não inicia silenciosamente com configuração inválida
e nenhum segredo entra no repositório.

### Validação, respostas e erros

- [ ] Padronizar o formato das respostas HTTP de sucesso.
- [ ] Padronizar o formato das respostas HTTP de erro.
- [ ] Criar middleware global de tratamento de erros.
- [ ] Criar middleware para rotas inexistentes (`404`).
- [ ] Garantir que respostas de erro não exponham stack trace ou dados sensíveis.

**Aceitação:** entradas inválidas e erros internos retornam respostas seguras e
consistentes.

### Rastreamento e logs

- [ ] Criar e propagar um `correlation_id` por requisição.
- [ ] Configurar logs estruturados.
- [ ] Garantir que logs não contenham senhas, tokens, cookies ou outros dados
  sensíveis.

**Aceitação:** cada requisição pode ser rastreada pelos logs sem exposição de
informações confidenciais.

### Qualidade e CI

- [ ] Configurar scripts de `dev`, `build`, `typecheck`, `lint` e `test`.
- [ ] Configurar ESLint.
- [ ] Configurar Prettier.
- [ ] Configurar framework de testes, como Vitest.
- [ ] Criar testes mínimos para `/health`, validação de ambiente e tratamento
  de erros.
- [ ] Configurar CI para executar typecheck, lint, testes e build.

**Aceitação:** o pipeline executa typecheck, lint, testes e build com sucesso.
