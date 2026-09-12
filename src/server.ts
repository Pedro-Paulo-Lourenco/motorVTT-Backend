import app from './app.js';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('A variável PORT deve ser um número inteiro entre 1 e 65535.');
}

app.listen(port, () => {
    console.log(`Backend executando na porta ${port}`);
});
