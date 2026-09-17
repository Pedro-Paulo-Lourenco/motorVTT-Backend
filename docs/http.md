# HTTP e health check

## Aplicação Express

A aplicação é criada em `src/app.ts` e exportada como default. Ela registra o
middleware JSON do Express, permitindo que requisições com corpo JSON sejam
interpretadas por rotas futuras.

A aplicação registra um identificador de correlação por requisição, validação
de entrada por rota, tratamento global de erros e uma rota de fallback para
recursos inexistentes. CORS e autenticação continuam fora desta etapa.

## `GET /health`

Endpoint público usado para verificar se a aplicação está respondendo.

```http
GET /health
```

Resposta de sucesso:

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "backend"
  },
  "correlationId": "..."
}
```

## Rotas e validação

As rotas são agrupadas em `src/routes` e montadas pelo roteador principal. A
rota `GET /api/users/:id` demonstra a validação de `params` e `query` com Zod.
Falhas de validação retornam `422` no formato:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados da requisição inválidos.",
    "details": {
      "issues": [
        { "path": "id", "message": "Invalid UUID", "code": "invalid_format" }
      ]
    },
    "correlationId": "..."
  }
}
```

Erros desconhecidos retornam `500`. Em produção, a resposta não inclui a
mensagem interna da exceção.

Teste local:

```bash
curl http://localhost:3000/health
```

O endpoint confirma apenas que o processo HTTP está ativo. Ele não verifica
conexão com banco, dependências externas ou disponibilidade do frontend.
