/** Descobre e ordena as migrações TypeScript disponíveis no diretório. */
// Dependências deste módulo: cada importação fornece recursos, tipos ou integrações usados na implementação abaixo.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Migration } from './types.js';

export async function loadMigrations(): Promise<readonly Migration[]> {
// Estado intermediário: `directory` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const directory = fileURLToPath(new URL('./', import.meta.url));
// Estado intermediário: `files` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const files = (await readdir(directory))
        .filter((file) => /^\d+_.+\.(?:js|ts)$/.test(file) && !file.endsWith('.d.ts'))
        .sort();

// Estado intermediário: `loaded` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
    const loaded = await Promise.all(files.map(async (file) => {
// Estado intermediário: `module` guarda o valor que será validado, transformado ou persistido nas etapas seguintes.
        const module = await import(pathToFileURL(join(directory, file)).href) as { default: Migration };
        return module.default;
    }));

    return loaded;
}
