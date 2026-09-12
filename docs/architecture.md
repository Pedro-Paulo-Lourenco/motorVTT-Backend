# Arquitetura e inicialização

## Estrutura atual

```text
backend/
├── src/
│   ├── app.ts       # configuração da aplicação Express
│   └── server.ts    # entrada do processo HTTP
├── dist/            # saída gerada pelo TypeScript
├── docs/            # documentação e backlog
├── tests/           # arquivos auxiliares de testes
├── package.json
└── tsconfig.json
```

## Responsabilidades

`src/app.ts` cria e configura a instância do Express. Atualmente, registra o
middleware `express.json()` e a rota `GET /health`, exportando a aplicação sem
iniciar o processo HTTP.

`src/server.ts` é o ponto de entrada executável. Ele lê `process.env.PORT`,
converte o valor para número, aplica o padrão `3000`, valida o intervalo
permitido e chama `app.listen`.

Essa separação permite importar a aplicação isoladamente em testes sem iniciar
um servidor real.

## Fluxo de inicialização

```text
npm start
  -> dist/server.js
  -> importa dist/app.js
  -> lê e valida PORT
  -> inicia app.listen(PORT)
```

Se a porta não for um inteiro entre `1` e `65535`, o processo lança um erro e
não inicia o servidor.

## Módulos

O projeto usa TypeScript compilado para módulos ESM. Os imports no código-fonte
utilizam a extensão `.js`, compatível com o resultado gerado em `dist/`.
