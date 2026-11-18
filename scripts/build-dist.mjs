/** Limpa e compila a saída distribuível, preservando apenas artefatos gerados. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Constante ou estado local: `scriptsDirectory` mantém o dado necessário ao fluxo abaixo.
const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
// Constante ou estado local: `projectDirectory` mantém o dado necessário ao fluxo abaixo.
const projectDirectory = join(scriptsDirectory, '..');
// Constante ou estado local: `distDirectory` mantém o dado necessário ao fluxo abaixo.
const distDirectory = join(projectDirectory, 'dist');

// Bloco local: `run` concentra uma responsabilidade reutilizada dentro deste módulo.
function run(command, args) {
    return new Promise((resolve, reject) => {
// Constante ou estado local: `child` mantém o dado necessário ao fluxo abaixo.
        const child = spawn(command, args, {
            cwd: projectDirectory,
            stdio: 'inherit',
        });

        child.on('error', reject);
        child.on('exit', (code) => {
// Condição: altera o caminho de execução somente quando a regra indicada é verdadeira.
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

await rm(distDirectory, { recursive: true, force: true });
await run(process.execPath, [join(projectDirectory, 'node_modules/typescript/bin/tsc')]);

// Constante ou estado local: `packageJson` mantém o dado necessário ao fluxo abaixo.
const packageJson = JSON.parse(
    await readFile(join(projectDirectory, 'package.json'), 'utf8'),
);

// Constante ou estado local: `distPackageJson` mantém o dado necessário ao fluxo abaixo.
const distPackageJson = {
    name: `${packageJson.name}-dist`,
    version: packageJson.version,
    private: true,
    type: 'module',
    main: 'server.js',
    scripts: {
        start: 'node server.js',
        'migrate:make': 'node database/cli.js make',
        'migrate:up': 'node database/cli.js up',
        'migrate:down': 'node database/cli.js down',
        'migrate:rollback': 'node database/cli.js rollback',
    },
    dependencies: packageJson.dependencies,
};

await mkdir(distDirectory, { recursive: true });
await writeFile(
    join(distDirectory, 'package.json'),
    `${JSON.stringify(distPackageJson, null, 2)}\n`,
    'utf8',
);
