import { env } from './config/env.js';
import { checkDatabaseConnection, closeDatabase } from './config/database.js';
import app from './app.js';

async function startServer(): Promise<void> {
    try {
        await checkDatabaseConnection();
    } catch (error) {
        console.error('Falha ao conectar ao MySQL durante a inicialização.', error);
        await closeDatabase().catch((closeError) => {
            console.error('Falha ao encerrar o pool MySQL após erro de inicialização.', closeError);
        });
        process.exit(1);
    }

    const server = app.listen(env.PORT, () => {
        console.log(`Backend executando na porta ${env.PORT}`);
    });

    let isShuttingDown = false;

    const shutdown = (signal: NodeJS.Signals): void => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        console.log(`Sinal ${signal} recebido. Encerrando o backend...`);

        server.close(async (serverError) => {
            if (serverError) {
                console.error('Falha ao encerrar o servidor HTTP.', serverError);
            }

            try {
                await closeDatabase();
                console.log('Pool MySQL encerrado com sucesso.');
                process.exit(serverError ? 1 : 0);
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
