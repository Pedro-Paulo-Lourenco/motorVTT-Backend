# HTTP e health check

## Aplicação Express

A aplicação é criada em `src/app.ts` e exportada como default. Ela registra o
middleware JSON do Express, permitindo que requisições com corpo JSON sejam
interpretadas por rotas futuras.

Ainda não há middleware de CORS, autenticação, tratamento global de erros ou
rota de fallback para recursos inexistentes.

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
  "status": "ok",
  "service": "backend"
}
```

Teste local:

```bash
curl http://localhost:3000/health
```

O endpoint confirma apenas que o processo HTTP está ativo. Ele não verifica
conexão com banco, dependências externas ou disponibilidade do frontend.
