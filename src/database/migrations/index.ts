/** Descobre e ordena as migrações TypeScript disponíveis no diretório. */
// Importações: reúnem bibliotecas, tipos e módulos locais usados pelos blocos seguintes.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Migration } from './types.js';

export async function loadMigrations(): Promise<readonly Migration[]> {
// Constante ou estado local: `directory` mantém o dado necessário ao fluxo abaixo.
    const directory = fileURLToPath(new URL('./', import.meta.url));
// Constante ou estado local: `files` mantém o dado necessário ao fluxo abaixo.
    const files = (await readdir(directory))
        .filter((file) => /^\d+_.+\.(?:js|ts)$/.test(file) && !file.endsWith('.d.ts'))
        .sort();

// Constante ou estado local: `loaded` mantém o dado necessário ao fluxo abaixo.
    const loaded = await Promise.all(files.map(async (file) => {
// Constante ou estado local: `module` mantém o dado necessário ao fluxo abaixo.
        const module = await import(pathToFileURL(join(directory, file)).href) as { default: Migration };
        return module.default;
    }));

    return loaded;
}
