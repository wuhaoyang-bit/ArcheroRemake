import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const apk = join(root, 'releases/ArcheroRemake-v0.1.0-debug.apk');
const entry = (name: string) => execFileSync('unzip', ['-p', apk, name], { maxBuffer: 32 * 1024 * 1024 });
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(entry('assets/web-build-manifest.json').toString()) as { files: Record<string, string> };
for (const [name, expected] of Object.entries(manifest.files)) {
  const packed = entry(`assets/www/${name}`);
  if (sha(packed) !== expected || !packed.equals(await readFile(join(root, 'dist', name)))) {
    throw new Error(`APK 与网页资源不一致：${name}`);
  }
}
const params = entry('assets/www/params.json');
if (!params.equals(await readFile(join(root, 'public/params.json')))) throw new Error('APK 参数与当前 JSON 不一致');
const report = { apk, bytes: (await readFile(apk)).length, sha256: sha(await readFile(apk)),
  verifiedWebFiles: Object.keys(manifest.files).length, settings: JSON.parse(params.toString()).settings,
  deviceTest: 'Not performed: REDMI K80 Ultra is not connected' };
await mkdir(join(root, 'analysis/android-checks'), { recursive: true });
await writeFile(join(root, 'analysis/android-checks/apk-verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log('APK resources and current JSON verified:', report);
