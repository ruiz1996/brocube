import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(projectRoot, 'dist');

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(resolve(projectRoot, 'src'), resolve(outputRoot, 'src'), { recursive: true });
await cp(resolve(projectRoot, 'styles.css'), resolve(outputRoot, 'styles.css'));

const sourceHtml = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
const nativeHtml = sourceHtml.replace(
  '<html lang="zh-CN">',
  '<html lang="zh-CN" data-release-channel="beta">',
);
if (nativeHtml === sourceHtml) throw new Error('Unable to mark the Android build as beta');
await writeFile(resolve(outputRoot, 'index.html'), nativeHtml);

console.log('Built Beta web assets in dist/');
