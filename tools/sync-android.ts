import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '../src/config.ts';
import { parseSettingsDocument } from '../src/settings-store.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const assets = join(root, 'android/app/src/main/assets');
const www = join(assets, 'www');
const params = await readFile(join(dist, 'params.json'));
parseSettingsDocument(JSON.parse(params.toString()), true);
if (!params.equals(await readFile(join(root, 'public/params.json')))) throw new Error('参数在网页构建后发生变化，请重新 npm run build');
await readFile(join(dist, 'index.html')); // Fail before replacing an existing bundle if build is missing.
await rm(www, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
await cp(dist, www, { recursive: true });
await writeFile(join(assets, 'settings-schema.json'), JSON.stringify(LIMITS, null, 2) + '\n');
const hashes: Record<string, string> = {};
async function inspect(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else {
      const rel = relative(dist, path), content = await readFile(path);
      if (!content.equals(await readFile(join(www, rel)))) throw new Error(`Android asset differs: ${rel}`);
      hashes[rel] = createHash('sha256').update(content).digest('hex');
    }
  }
}
await inspect(dist);
await writeFile(join(assets, 'web-build-manifest.json'), JSON.stringify({ format: 1, files: hashes }, null, 2) + '\n');
console.log(`Android assets ready: ${Object.keys(hashes).length} files, byte-for-byte identical to dist/.`);
console.log('Bundled tuning:', JSON.parse(params.toString()).settings);
