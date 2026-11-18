/** Inicializa o servidor HTTP, migrações e gateway Socket.IO. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { createServer } from 'node:http';

import { env } from './config/env.js';
import { checkDatabaseConnection, closeDatabase } from './config/database.js';
import app from './app.js';
import { createTabletopGateway } from './realtime/tabletop.gateway.js';

// Bloco local: `startServer` concentra uma responsabilidade reutilizada dentro deste módulo.
async function startServer(): Promise<void> {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
    try {
        await checkDatabaseConnection();
    } catch (error) {
        console.error('Falha ao conectar ao MySQL durante a inicialização.', error);
        await closeDatabase().catch((closeError) => {
            console.error('Falha ao encerrar o pool MySQL após erro de inicialização.', closeError);
        });
        process.exit(1);
    }

// Constante ou estado local: `server` mantém o dado necessário ao fluxo abaixo.
    const server = createServer(app);
// Constante ou estado local: `tabletopGateway` mantém o dado necessário ao fluxo abaixo.
    const tabletopGateway = createTabletopGateway(server);
    server.listen(env.PORT, () => {
        console.log(`Backend executando na porta ${env.PORT}`);
    });

// Constante ou estado local: `isShuttingDown` mantém o dado necessário ao fluxo abaixo.
    let isShuttingDown = false;

// Constante ou estado local: `shutdown` mantém o dado necessário ao fluxo abaixo.
    const shutdown = (signal: NodeJS.Signals): void => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`Sinal ${signal} recebido. Encerrando o backend...`);

        tabletopGateway.close(async () => {
// Bloco protegido: mantém o fluxo principal e suas finalizações ou tratamentos associados.
            try {
                await closeDatabase();
                console.log('Pool MySQL encerrado com sucesso.');
                process.exit(0);
            } catch (error) {
                console.error('Falha ao encerrar o pool MySQL.', error);
                process.exit(1);
            }
        });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
}

void startServer().catch((error: unknown) => {
    console.error('Falha inesperada ao iniciar o backend.', error);
    process.exit(1);
});
