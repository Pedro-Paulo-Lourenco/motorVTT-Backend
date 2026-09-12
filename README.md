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
- validação da variável `PORT` durante a inicialização;
- integração declarada com o pacote `@motor-vtt/contracts`.

Ainda não implementado:

- autenticação, autorização e sessões;
- rotas de usuários, salas e demais recursos;
- persistência em banco de dados;
- validação dos payloads usando os schemas compartilhados;
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

`PORT` é opcional e assume `3000` quando não for informada:

```bash
PORT=4000 npm run dev
```

O valor deve ser um número inteiro entre `1` e `65535`. Um valor inválido
interrompe a inicialização com uma mensagem de erro.

## Uso rápido

```bash
npm run build
npm start
```

Com o servidor em execução, consulte `http://localhost:3000/health`.
