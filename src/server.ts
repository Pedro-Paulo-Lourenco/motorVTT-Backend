/** Inicializa o servidor HTTP, migrações e gateway Socket.IO. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { createServer } from 'node:http';

import { env } from './config/env.js';
import { checkDatabaseConnection, closeDatabase } from './config/database.js';
import app from './app.js';
import { createTabletopGateway } from './realtime/tabletop.gateway.js';

// Função auxiliar: `startServer` isola uma responsabilidade reutilizada neste módulo.
async function startServer(): Promise<void> {
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
    try {
        await checkDatabaseConnection();
    } catch (error) {
        console.error('Falha ao conectar ao MySQL durante a inicialização.', error);
        await closeDatabase().catch((closeError) => {
            console.error('Falha ao encerrar o pool MySQL após erro de inicialização.', closeError);
        });
        process.exit(1);
    }

// Estado intermediário: `server` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const server = createServer(app);
// Estado intermediário: `tabletopGateway` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const tabletopGateway = createTabletopGateway(server);
    server.listen(env.PORT, () => {
        console.log(`Backend executando na porta ${env.PORT}`);
    });

// Estado intermediário: `isShuttingDown` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    let isShuttingDown = false;

// Estado intermediário: `shutdown` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const shutdown = (signal: NodeJS.Signals): void => {
// Regra de negócio: a validação abaixo decide se o fluxo pode continuar ou deve retornar antecipadamente.
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`Sinal ${signal} recebido. Encerrando o backend...`);

        tabletopGateway.close(async () => {
// Tratamento protegido: garante que o recurso seja finalizado e que erros sigam para o fluxo central de tratamento.
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
