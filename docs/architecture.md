# Arquitetura e inicialização

## Estrutura atual

```text
backend/
├── src/
│   ├── config/
│   │   └── env.ts     # carregamento e validação da configuração
│   ├── controllers/  # execução dos handlers de domínio
│   ├── http/         # respostas, erros, validação e middlewares
│   ├── routes/       # roteadores por recurso
│   ├── app.ts        # configuração da aplicação Express
│   └── server.ts    # entrada do processo HTTP
├── dist/            # saída gerada pelo TypeScript
├── docs/            # documentação e backlog
├── tests/           # arquivos auxiliares de testes
├── package.json
└── tsconfig.json
```

## Responsabilidades

`src/app.ts` cria e configura a instância do Express, registra o parser JSON,
middlewares HTTP, roteador principal e tratamento final de erros, exportando a
aplicação sem iniciar o processo HTTP.

As rotas ficam separadas dos controllers. O middleware `validate` executa os
schemas Zod antes do controller e disponibiliza os resultados em
`res.locals.validated` com tipos inferidos pelo schema.

`src/config/env.ts` carrega o `.env` com `dotenv`, valida as variáveis com Zod e
exporta o objeto tipado `env`. Em caso de erro, lista todas as variáveis
inválidas no stderr e encerra o processo com código `1`.

`src/server.ts` importa a configuração antes da aplicação Express e só chama
`app.listen` depois que a validação foi concluída.

Essa separação permite importar a aplicação isoladamente em testes sem iniciar
um servidor real.

## Fluxo de inicialização

```text
npm start
  -> dist/server.js
  -> carrega e valida dist/config/env.js
  -> importa dist/app.js
  -> inicia app.listen(PORT)
```

Se a porta não for um inteiro entre `1` e `65535`, o processo lança um erro e
não inicia o servidor.

## Módulos

O projeto usa TypeScript compilado para módulos ESM. Os imports no código-fonte
utilizam a extensão `.js`, compatível com o resultado gerado em `dist/`.
