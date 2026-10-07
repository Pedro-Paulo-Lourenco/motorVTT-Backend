# Tabletop em tempo real

## Demonstração local com duas sessões

### Pré-requisitos

- Node.js `22.18+` ou `24.12+` e npm, conforme o `engines` do frontend.
- MySQL disponível para o backend, com um usuário que possa criar e alterar
  tabelas no banco configurado.
- Os projetos `backend/` e `frontend/` clonados e com as dependências instaladas.
- Dois endereços de e-mail diferentes para as contas de demonstração.

Na primeira execução, instale as dependências em cada projeto. Os comandos
abaixo assumem que `backend/` e `frontend/` são pastas irmãs; se os repositórios
estiverem em outros caminhos, execute `npm install` dentro de cada pasta:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Ambiente e inicialização

No backend, crie `.env` a partir do modelo e ajuste os valores locais:

```bash
cd backend
cp .env.example .env
```

Configure no `.env`:

| Variável | Valor local / finalidade |
| --- | --- |
| `NODE_ENV` | `development`. |
| `PORT` | `3000`, porta HTTP e Socket.IO do backend. |
| `APP_URL` | `http://localhost:3000`. |
| `CORS_ORIGIN` | `http://localhost:5173`; precisa corresponder exatamente à origem do frontend. |
| `DB_HOST`, `DB_PORT` | Host e porta MySQL, normalmente `localhost` e `3306`. |
| `DB_USER`, `DB_PASS`, `DB_NAME` | Credenciais locais e banco MySQL que o backend deve usar. |
| `JWT_SECRET` | Gere um valor aleatório com pelo menos 32 caracteres; não reutilize um segredo publicado. |
| `TABLETOP_GRID_SIZE` | Tamanho do grid das novas salas, em pixels; padrão `64`. |

Por exemplo, `openssl rand -base64 32` gera um segredo aleatório para
`JWT_SECRET`. Não inclua o resultado em documentação, commits ou no frontend.
Os valores de usuário e senha do MySQL também são locais e não devem ser
compartilhados. `TABLETOP_BACKGROUND_URL` é opcional e fica armazenado nos metadados da cena.
A tela desta demonstração sempre renderiza o SVG local indicado abaixo; mudar
essa variável não troca o mapa.

No frontend, crie `.env.development`:

```dotenv
VITE_API_URL=http://localhost:3000/api
```

Inicie as migrations e os servidores em terminais separados:

```bash
# Terminal 1
cd backend
npm run migrate:up
npm run dev
```

```bash
# Terminal 2
cd frontend
npm run dev
```

Abra `http://localhost:5173`. O servidor Socket.IO usa a origem do backend,
derivada de `VITE_API_URL`, e aceita credenciais somente da origem configurada
em `CORS_ORIGIN`. Se mudar host ou porta, ajuste ambos os lados de forma
compatível. Os scripts e configurações adicionais estão descritos em
[Desenvolvimento](development.md).

### Contas, sala e duas sessões

1. Na primeira sessão do navegador, abra `/cadastro` e crie a conta do mestre
   com um e-mail ainda não cadastrado. A conta que cria a sala recebe o papel
   `MESTRE`.
2. Em `/home`, use **Criar sala**. Anote o código de convite exibido.
3. Abra outro navegador, um perfil separado ou uma janela privativa. A janela
   privativa deve permanecer aberta durante todo o teste; ela é uma sessão de
   cookies independente.
4. Nessa segunda sessão, abra `/cadastro` e crie a conta do jogador com outro
   e-mail. Em `/home`, informe o código em **Entrar com convite**. Quem entra
   pelo convite recebe o papel `JOGADOR`.
5. Abra **Abrir tabletop** nas duas sessões. Ambas devem exibir a mesma sala,
   cena, mapa e grid; a lista de participantes indica quem está online.

Também é possível usar duas contas já cadastradas: entre com a conta do mestre
na primeira sessão e com a conta participante/jogador na segunda.

### Operação e permissões

- **Mestre:** adiciona um token pelo campo **Nome do token**, arrasta tokens
  existentes para movê-los e usa **Remover selecionado** para removê-los. O
  movimento é enviado ao servidor e arredondado ao grid ativo antes de ser
  persistido e transmitido.
- **Jogador:** visualiza e seleciona tokens e pode mover ou ampliar a câmera
  localmente. Os controles de edição não são oferecidos, e o backend também
  recusa operações de token de uma participação que não seja `MESTRE`.
- **Ambas as sessões:** podem arrastar o mapa para fazer pan e usar a roda do
  mouse para zoom. Essas alterações de câmera são locais ao navegador, não são
  transmitidas nem persistidas.

Para observar a presença, feche a aba tabletop ou desconecte uma sessão. O
participante passa a offline quando sua última conexão na sala é encerrada;
uma segunda conexão do mesmo usuário mantém sua presença online. Ao reabrir a
sala, o cliente recebe do banco o estado atual dos tokens.

### Limitações da demonstração

- O mapa e os objetos decorativos são fixos no frontend:
  `public/tabletop-demo-map.svg`. A tela não usa `scene.backgroundUrl` para
  carregar um mapa diferente e não oferece gerenciador de assets.
- O grid é desenhado sobre o mapa com as configurações da cena; salas novas
  usam `TABLETOP_GRID_SIZE`. A câmera tem zoom e pan por sessão.
- Tokens e cenas ficam no MySQL e sobrevivem à reinicialização do backend.
  Remover um token apaga o registro do token, mas não o asset ou a ficha de
  origem. Use um banco de demonstração e limpe os dados de teste conforme a
  política local; não há limpeza automática de salas/contas criadas pela UI.
- Presença e filas de operações são mantidas em memória nesta instância. Não
  execute várias instâncias esperando presença compartilhada; isso exigiria
  um adapter distribuído.
- A demonstração requer contas autenticadas e participantes persistidos. Não
  existe modo anônimo ou bypass de autorização.

O backend cria um tabuleiro e uma cena principal ao criar cada sala. Salas
anteriores sem tabuleiro/cena recebem essa estrutura quando um participante
autorizado solicita o estado inicial. Tokens são lidos e gravados na tabela
`tokens`; removê-los não remove assets nem fichas de origem.

`TABLETOP_BACKGROUND_URL` é opcional e é armazenado em `scene.backgroundUrl`;
sem a variável, a cena recebe `backgroundUrl: null`. A tela atual da
demonstração não usa esse metadado para escolher ou carregar o mapa: sempre
renderiza `frontend/public/tabletop-demo-map.svg`. O backend não hospeda esse
arquivo. `TABLETOP_GRID_SIZE` define o tamanho positivo do grid das novas
cenas, em pixels (padrão `64`); a cena inicial habilita o grid com opacidade
`0.5`.

## Conexão e autorização

O Socket.IO usa o mesmo servidor HTTP, `CORS_ORIGIN` e credenciais habilitadas.
O navegador deve conectar com envio de credenciais (`withCredentials: true`).
O handshake autentica exclusivamente o cookie `access_token` HttpOnly enviado
pelo navegador; não envie token em `auth`, query string ou payload. A sessão é
validada no MySQL no handshake e novamente antes de entrar na sala e executar
operações. O cliente precisa primeiro autenticar-se pelos endpoints HTTP já
existentes.

Depois da conexão autenticada, o cliente solicita a entrada:

```ts
socket.emit('tabletop:v1:join', { v: 1, roomId });
```

`roomId` é sempre tratado como entrada não confiável. O servidor confirma que
a sessão pertence a um participante ativo da sala antes de associar o socket à
room Socket.IO. Cada socket pode participar de uma sala tabletop por vez.

## Eventos

| Direção | Evento | Payload / resultado |
| --- | --- | --- |
| Cliente → servidor | `tabletop:v1:join` | `{ v: 1, roomId }`; o ack confirma a autorização e o servidor envia o estado inicial. |
| Servidor → cliente | `tabletop:v1:state` | `{ v: 1, roomId, board, scene, tokens }`; schemas de board, scene e token são compartilhados em `@motor-vtt/contracts`. |
| Servidor → cliente | `tabletop:v1:messages` | `{ v: 1, roomId, messages }`; até as 50 mensagens mais recentes, após autorização de entrada. |
| Servidor → sala | `tabletop:v1:presence` | `{ v: 1, roomId, onlineUserIds }`; cada usuário aparece uma vez, mesmo com múltiplas conexões. |
| Cliente → servidor | `tabletop:v1:message:send` | `{ v: 1, content }`; texto simples ou expressão de rolagem. Payload estrito: não aceita sala, autor, dados ou resultado enviados pelo cliente. |
| Servidor → sala | `tabletop:v1:message:created` | `{ v: 1, message }`; mensagem `CHAT` ou `ROLAGEM` persistida, com `metadata.roll` calculado pelo backend em rolagens. |
| Cliente → servidor | `tabletop:v1:token:add` | `{ v: 1, token: { nome, x, y, escala, assetOrigemId?, characterSheetId?, statusBarMap?, customData? } }`. |
| Servidor → sala | `tabletop:v1:token:added` | `{ v: 1, token }`. |
| Cliente → servidor | `tabletop:v1:token:move` | `{ v: 1, tokenId, x, y }`. |
| Servidor → sala | `tabletop:v1:token:moved` | `{ v: 1, token }` com as coordenadas persistidas. |
| Cliente → servidor | `tabletop:v1:token:remove` | `{ v: 1, tokenId }`. |
| Servidor → sala | `tabletop:v1:token:removed` | `{ v: 1, tokenId, sceneId }`. |
| Servidor → cliente | `tabletop:v1:error` | `{ v: 1, code, message }` quando não há callback de ack. |

Operações de token também aceitam callback de confirmação:
`{ v: 1, ok: true, token? , tokenId? }` ou
`{ v: 1, ok: false, error: { v: 1, code, message } }`. Códigos esperados:
`INVALID_PAYLOAD`, `ROOM_NOT_JOINED`, `ROOM_ACCESS_DENIED`,
`MASTER_REQUIRED`, `TOKEN_NOT_FOUND`, `AUTH_REQUIRED` e `INTERNAL_ERROR`.
Envios de mensagem usam o mesmo formato de ack e também podem retornar
`INVALID_DICE_EXPRESSION` para uma expressão malformada ou acima dos limites.
Erros inesperados não incluem stack trace, consulta SQL ou dados de sessão no
payload enviado ao cliente.

O papel não é aceito do cliente. O servidor consulta a participação persistida
em cada operação; todos os participantes ativos podem conversar e rolar, mas
apenas `MESTRE` pode adicionar, mover ou remover tokens. O servidor trata o
conteúdo enviado como não confiável, valida o tamanho (1 a 1.000 caracteres),
reconhece expressões V1 completas, executa os dados com `node:crypto.randomInt`
e persiste o resultado; o cliente nunca fornece faces, valores aleatórios ou
totais para serem aceitos. O envio é recusado se o socket não entrou numa sala
ou se a participação deixou de ser válida.

Chat e rolagens são persistidos na tabela existente `message_logs`. Mensagens
simples usam `tipo: CHAT`; rolagens guardam a expressão original em `conteudo`,
`tipo: ROLAGEM` e o objeto estruturado do backend em `metadata.roll`. Ao entrar,
o participante recebe no máximo 50 mensagens recentes; não há paginação nem
busca de histórico. Estado e eventos são emitidos somente para a room da sala
autorizada.

### Sintaxe V1 e limites do chat

A sintaxe implementada é o subconjunto descrito em
[Mensagens, chat e rolagens](../../vtt-contracts/docs/messages.md), baseado na
[documentação V1 do Rollem](https://rollem.rocks/docs/v1-syntax): `NdX`/`dX`,
modificador final `+Z` ou `-Z`, repetições `R#NdX`, explosões `!`, `ns`,
matemática por dado `++Z`/`--Z` e contagem inclusiva `>>Z`/`<<Z`. `>>Z` conta
resultados `>= Z`; `<<Z` conta `<= Z`. A ordem padrão é decrescente e `ns`
preserva a ordem gerada. Repetições têm listas/totais independentes. Não estão
implementados outros recursos V1 nem expressões inline em frases.

Limites: no máximo 100 repetições e 100 dados totais (repetições × dados por
lista); cada dado tem de 2 a 1.000.000 faces. Cada dado pode explodir no máximo
100 vezes além da rolagem inicial. Se a última rolagem do limite também for
máxima, o dado sinaliza `explosionLimitReached` e a cadeia termina. O teto de
faces e de explosões é defensivo desta demonstração; a documentação V1
consultada não define valores máximos para eles. O contrato JSON completo está
em `DiceRollResult`/`diceRollResultSchema` no pacote vtt-contracts.

Presença é mantida em memória e vale para uma instância do backend; uma
implantação com múltiplas instâncias precisará de um adapter compartilhado.

### Testar chat e rolagens

Com MySQL configurado e migrations aplicadas, execute os testes de integração
e de parser no backend:

```bash
cd backend
npm test
npm run typecheck
npm run build
```

No frontend e em `vtt-contracts`, execute os testes, typecheck e build
disponíveis (`npm test`, `npm run type-check`, `npm run typecheck` e
`npm run build`). Para o teste manual, abra duas sessões participantes da mesma
sala e uma terceira sessão em outra sala: envie texto, `2d4+2`, `d20`,
`3#5d20`, `d6!`, `4d6ns`, `2d6++1`, `2d6--1`, `5d6>>4` e `5d6<<3`; somente os
participantes da sala devem ver cada mensagem e resultado.

## Execução local

Siga as instruções completas em [Demonstração local com duas
sessões](#demonstração-local-com-duas-sessões), incluindo os valores esperados
de ambiente, migrations, inicialização do frontend e do backend e criação de
contas.

O Socket.IO atende no mesmo host/porta da API; não há endpoint ou modo anônimo
alternativo.
