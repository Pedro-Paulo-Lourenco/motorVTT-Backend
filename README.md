# Motor VTT — Backend

Backend do Motor VTT Universal, responsável por expor a aplicação HTTP que
será consumida pelo frontend e por concentrar as regras de servidor do sistema.

O projeto está em fase inicial. Atualmente, a aplicação Express possui o
endpoint de saúde e a configuração básica de inicialização. A documentação
abaixo diferencia o que já está disponível do que permanece no backlog.

## Documentação

| Assunto | Documentação |
| --- | --- |
| Arquitetura e fluxo de inicialização | [Arquitetura](docs/architecture.md) |
| Instalação, scripts e configuração | [Desenvolvimento](docs/development.md) |
| Aplicação HTTP e endpoint de saúde | [HTTP e health check](docs/http.md) |
| Contratos compartilhados | [Contratos](docs/contracts.md) |
| Funcionalidades previstas | [Backlog](docs/TODO.md) |

## Estado atual

Implementado:

- projeto TypeScript com módulos ESM;
- aplicação Express;
- parsing de requisições JSON;
- endpoint `GET /health`;
- validação centralizada das variáveis de ambiente durante a inicialização;
- integração declarada com o pacote `@motor-vtt/contracts`.
- respostas HTTP padronizadas, validação de rota com Zod e tratamento global de erros;
- correlation ID propagado nos headers e respostas HTTP;
- roteadores modulares para `/health` e `/api/users/:id`.

Ainda não implementado:

- autenticação, autorização e sessões;
- rotas de usuários, salas e demais recursos;
- persistência em banco de dados;
- rotas de usuários, salas e demais recursos de negócio;
- middleware global de erros e respostas padronizadas;
- Socket.IO, presença e sincronização em tempo real;
- logs estruturados, correlation ID e pipeline de CI.

## Requisitos

- Node.js compatível com as dependências do projeto;
- npm;
- acesso ao pacote `@motor-vtt/contracts`.

## Instalação

```bash
npm install
```

## Comandos

```bash
npm run dev        # desenvolvimento com recarga via tsx
npm run typecheck  # verifica os tipos sem gerar arquivos
npm run build      # gera JavaScript e declarações em dist/
npm start          # executa dist/server.js
npm test           # placeholder até a configuração da suíte de testes
```

## Configuração

As configurações são carregadas de `.env` e validadas antes do servidor HTTP
ser iniciado. Copie `.env.example` para `.env` e ajuste os valores do ambiente.

As configurações usadas pelo runtime atual possuem defaults locais:

```bash
PORT=4000 npm run dev
```

`NODE_ENV`, `APP_URL` e `CORS_ORIGIN` também podem ser definidos explicitamente.
Os blocos de banco, autenticação, e-mail, Redis e storage já estão documentados
no `.env.example` para as próximas etapas, mas só serão exigidos quando suas
integrações forem habilitadas.

Valores inválidos interrompem a inicialização com uma lista das variáveis
problemáticas, sem imprimir os valores sensíveis.

## Uso rápido

```bash
npm run build
npm start
```

Com o servidor em execução, consulte `http://localhost:3000/health`.
