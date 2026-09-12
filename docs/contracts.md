# Contratos compartilhados

O backend declara dependência de `@motor-vtt/contracts`, pacote que centraliza
os tipos, enums e schemas Zod compartilhados com o frontend.

```json
{
  "dependencies": {
    "@motor-vtt/contracts": "github:Pedro-Paulo-Lourenco/vtt-contracts"
  }
}
```

Os contratos abrangem usuários, salas, participantes, tabuleiros, cenas,
tokens, assets, fichas e mensagens. A documentação detalhada desses formatos
fica no repositório de contratos.

## Estado da integração

A dependência está configurada no `package.json`, mas o código atual ainda não
valida requisições com os schemas compartilhados nem expõe rotas que consumam
esses contratos.

Quando as rotas forem implementadas, a validação deverá ocorrer na fronteira
da aplicação, antes da execução da regra de negócio. O backend deve tratar os
dados validados como a fonte comum de formato para frontend e servidor.

## Limite de responsabilidade

O pacote de contratos define formato e validação estrutural. Ele não substitui:

- autorização por usuário, sala ou papel;
- regras de persistência e transações;
- autenticação e gerenciamento de sessão;
- processamento de eventos em tempo real.
