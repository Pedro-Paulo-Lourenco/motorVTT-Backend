import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Migration } from './types.js';

export async function loadMigrations(): Promise<readonly Migration[]> {
    const directory = fileURLToPath(new URL('./', import.meta.url));
    const files = (await readdir(directory))
        .filter((file) => /^\d+_.+\.(?:ts|js)$/.test(file))
        .sort();

    const loaded = await Promise.all(files.map(async (file) => {
        const module = await import(pathToFileURL(join(directory, file)).href) as { default: Migration };
        return module.default;
    }));

    return loaded;
}
