# Motor VTT — Backend

Backend do Motor VTT Universal, responsável por expor a aplicação HTTP que
será consumida pelo frontend e por concentrar as regras de servidor do sistema.

O backend fornece a API autenticada, persistência MySQL para salas e tabletop,
e Socket.IO para estado e presença em tempo real.

## Documentação

| Assunto | Documentação |
| --- | --- |
| Arquitetura e fluxo de inicialização | [Arquitetura](docs/architecture.md) |
| Instalação, scripts e configuração | [Desenvolvimento](docs/development.md) |
| Aplicação HTTP e endpoint de saúde | [HTTP e health check](docs/http.md) |
| Contratos compartilhados | [Contratos](docs/contracts.md) |
| Demonstração tabletop com duas sessões | [Tabletop em tempo real](docs/tabletop-realtime.md) |
| Funcionalidades previstas | [Backlog](docs/TODO.md) |

## Estado atual

Implementado:

- projeto TypeScript com módulos ESM;
- aplicação Express;
- parsing de requisições JSON;
- endpoint `GET /health`;
- validação centralizada das variáveis de ambiente durante a inicialização;
- integração com o pacote `@motor-vtt/contracts`, incluindo validação compartilhada;
- autenticação com cookies HttpOnly, sessões persistidas e renovação de refresh token;
- persistência MySQL para usuários, salas, participantes, tabuleiros, cenas e tokens;
- rotas autenticadas de criação/entrada/consulta de salas e isolamento por participação;
- cena tabletop inicial por sala e sincronização Socket.IO autenticada para presença e tokens;
- chat de sala persistido e rolagens V1 calculadas no backend e isoladas por participação;
- respostas HTTP padronizadas, validação de rota com Zod e tratamento global de erros;
- correlation ID propagado nos headers e respostas HTTP;

Os requisitos de desenvolvimento incluem Node.js 22.18+ ou 24.12+, npm e
MySQL. Consulte [Tabletop em tempo real](docs/tabletop-realtime.md) para
configurar o ambiente, iniciar backend e frontend e testar com mestre e
jogador em sessões separadas. A demonstração usa um mapa fixo do frontend; o
backend não hospeda o arquivo.

## Requisitos

- Node.js compatível com as dependências do projeto;
- npm;
- MySQL;
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
npm test           # testes unitários e integração HTTP/Socket.IO com MySQL
```

## Configuração

As configurações são carregadas de `.env` e validadas antes do servidor HTTP
ser iniciado. Copie `.env.example` para `.env` e ajuste os valores do ambiente.

`PORT`, `APP_URL`, `CORS_ORIGIN`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` e
`TABLETOP_GRID_SIZE` têm defaults de desenvolvimento. Para iniciar o backend,
é obrigatório configurar `JWT_SECRET` com pelo menos 32 caracteres e fornecer
um MySQL acessível; ajuste `DB_PASS` conforme as credenciais locais:

```bash
cp .env.example .env
# Edite .env: defina JWT_SECRET e os parâmetros reais de conexão MySQL.
```

`CORS_ORIGIN` deve corresponder à origem do frontend. Veja
[Desenvolvimento](docs/development.md) para a configuração completa.

Valores inválidos interrompem a inicialização com uma lista das variáveis
problemáticas, sem imprimir os valores sensíveis.

## Uso rápido

```bash
npm run build
npm start
```

Com o servidor em execução, consulte `http://localhost:3000/health`.
