import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function loadMigrations() {
    const directory = fileURLToPath(new URL('./', import.meta.url));
    const files = (await readdir(directory))
        .filter((file) => /^\d+_.+\.(?:ts|js)$/.test(file))
        .sort();
    const loaded = await Promise.all(files.map(async (file) => {
        const module = await import(pathToFileURL(join(directory, file)).href);
        return module.default;
    }));
    return loaded;
}
//# sourceMappingURL=index.js.map