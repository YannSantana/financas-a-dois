import { mkdir } from 'node:fs/promises';

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
