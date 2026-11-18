import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(scriptsDirectory, '..');
const distDirectory = join(projectDirectory, 'dist');

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: projectDirectory,
            stdio: 'inherit',
        });

        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

await rm(distDirectory, { recursive: true, force: true });
await run(process.execPath, [join(projectDirectory, 'node_modules/typescript/bin/tsc')]);

const packageJson = JSON.parse(
    await readFile(join(projectDirectory, 'package.json'), 'utf8'),
);

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
