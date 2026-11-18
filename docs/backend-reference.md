# Referência técnica do backend

Este documento descreve o funcionamento efetivo do backend do Motor VTT. A
fonte de verdade do comportamento continua sendo o código em `src/`; os nomes
abaixo refletem os módulos e contratos atualmente implementados.

## Visão geral

O backend é uma aplicação Node.js 22+ escrita em TypeScript, compilada como
ESM para `dist/`. Ele expõe:

- API HTTP Express para autenticação, usuários, salas e fichas;
- persistência MySQL acessada por um pool `mysql2`;
- autenticação por access token JWT e refresh token persistido em cookie
  `HttpOnly`;
- gateway Socket.IO autenticado para presença, chat e tokens do tabletop;
- validação de payloads com Zod e contratos compartilhados em
  `@motor-vtt/contracts`.

O processo de produção inicia em `dist/server.js`. O processo de
desenvolvimento executa `src/server.ts` diretamente com `tsx`.

## Inicialização e ciclo de uma requisição

```text
server.ts
  ├─ carrega env.ts (dotenv + Zod; falha antes de abrir a porta)
  ├─ importa app.ts
  │   ├─ correlationId
  │   ├─ CORS + JSON + cookies
  │   ├─ routes/index.ts
  │   ├─ notFound
  │   └─ errorHandler
  ├─ cria http.Server
  ├─ conecta o gateway tabletop
  └─ executa migrations e app.listen(PORT)
```

Uma requisição de recurso segue `router -> authenticate (quando necessário)
-> validate -> controller -> service -> pool`. O controller traduz o resultado
para o envelope padronizado de `http/response.ts`; exceções são encaminhadas
ao `errorHandler`, que inclui o correlation ID.

## Módulos

| Diretório | Responsabilidade |
| --- | --- |
| `config` | Variáveis de ambiente e pool MySQL |
| `routes` | URL, schemas Zod e composição de middlewares |
| `controllers` | Entrada/saída HTTP e adaptação para services |
| `services` | Regras de negócio, SQL e transações |
| `http` | Erros, envelopes, tipos e validação |
| `middlewares` | Autenticação de requisições |
| `realtime` | Gateway Socket.IO e autorização de sala |
| `sockets` | Handlers de eventos especializados de Socket.IO |
| `database/migrations` | Evolução versionada do schema |
| `types` | Extensões de tipos do Express e tipos de autenticação |

O arquivo `presets/defaultTemplatePreset.json` contém o preset de campos usado
para criar templates padrão; ele não é uma tabela nem um endpoint estático.

## HTTP

Todas as rotas de negócio usam o prefixo `/api`. O endpoint `GET /health` é
público. As rotas autenticadas obtêm o usuário pelo middleware
`middlewares/authenticate.ts`; o acesso a salas também é conferido no service,
evitando que conhecer um UUID permita ler ou alterar outra sala.

### Recursos disponíveis

| Grupo | Operações |
| --- | --- |
| Auth | registro, login, refresh, logout e usuário autenticado |
| Users | consulta e atualização do usuário |
| Rooms | criar, listar, consultar, entrar e administrar participantes |
| Sheet templates | CRUD, clone, biblioteca e associação à sala |
| Character sheets | criar, consultar, clonar, atualizar valores e importar |
| Health | verificação simples de disponibilidade |

Os caminhos completos e seus schemas estão nos arquivos `routes/*routes.ts` e
`routes/*schemas.ts`. Payloads inválidos retornam erro de validação antes de
chegar ao controller; IDs são validados como UUID e os schemas compartilhados
garantem compatibilidade com o frontend.

## Autenticação e segurança

O login cria uma sessão persistida em `auth_sessions`, emite um access JWT e
um refresh token aleatório armazenado apenas em forma hash. O access token é
aceito no header `Authorization: Bearer ...`; o refresh usa cookie. A rotação
invalida o token anterior e cria outro registro, reduzindo o impacto de
replay. Logout revoga a sessão.

Em produção o cookie deve usar `Secure`, `HttpOnly`, `SameSite` apropriado e
uma origem CORS explícita. `JWT_SECRET` e `COOKIE_SECRET` precisam ter pelo
menos 32 caracteres. Segredos nunca são incluídos nas mensagens de erro de
configuração.

## Modelo de dados e migrações

As migrações são carregadas em ordem numérica, executadas dentro do CLI de
`database/cli.ts` e registradas em `schema_migrations`. O lock nomeado do
MySQL impede duas execuções concorrentes.

```text
users
  ├─ user_credentials
  ├─ auth_sessions
  ├─ rooms ─ participants ─ users
  │    └─ boards ─ scenes
  │          └─ tokens
  ├─ assets
  ├─ sheet_templates ─ room_sheet_templates ─ rooms
  └─ character_sheets ─ tokens
                         └─ message_logs
```

As migrações `001`–`014` criam usuários, salas, tabuleiros, participantes,
assets, templates, cenas, fichas, tokens, mensagens, autenticação e vínculos
de templates. As últimas migrações ajustam chaves estrangeiras e tornam a
propriedade de fichas explícita. Use `npm run migrate:up` para aplicar e
`npm run migrate:rollback` para reverter o último batch; não edite uma
migração já aplicada.

## Tabletop em tempo real

`realtime/tabletop.gateway.ts` cria o namespace de Socket.IO sobre o mesmo
servidor HTTP. A conexão precisa de um access token válido e só entra em uma
room após o service confirmar a participação do usuário.

Eventos V1:

| Evento cliente | Efeito |
| --- | --- |
| `tabletop:v1:join` | entra na sala e recebe snapshot inicial |
| `tabletop:v1:message:send` | valida, persiste e transmite mensagem |
| `tabletop:v1:token:add` | cria token da cena |
| `tabletop:v1:token:move` | altera posição autorizada |
| `tabletop:v1:token:remove` | remove token autorizado |
| `disconnect` | remove a presença da sessão |

As respostas de callback usam o formato de erro/sucesso compartilhado. O
estado persistente é a fonte de recuperação após reconexão; broadcasts servem
para atualizar clientes conectados. O handler de fichas (`sockets/`) mantém
eventos de atualização de recursos separados do gateway tabletop.

## Configuração e operação

Copie `.env.example` para `.env` e ajuste `DB_*`, `CORS_ORIGIN`, `JWT_SECRET`,
`COOKIE_SECRET` e, quando aplicável, `TABLETOP_BACKGROUND_URL` e
`TABLETOP_GRID_SIZE`. O arquivo `.env.<NODE_ENV>` é preferido, e
`DOTENV_CONFIG_PATH` permite apontar para um arquivo específico.

```bash
npm install
npm run typecheck
npm test
npm run migrate:up
npm run build
npm start
```

`dist/` é gerado pelo build e não deve ser editado manualmente. Para testes de
integração, configure um MySQL de teste conforme `tests/.env.example`; os
testes HTTP que importam `app` não precisam abrir uma porta, enquanto os
testes de Socket.IO iniciam um servidor efêmero.

## Observabilidade e falhas

Cada requisição recebe `X-Correlation-Id`; se o cliente enviar um valor
válido, ele é propagado. Erros conhecidos usam status e código explícitos;
erros inesperados retornam uma resposta genérica e são registrados no
servidor. Falha na configuração ou na conexão/migração impede a inicialização
para não deixar a aplicação em estado parcialmente funcional.
