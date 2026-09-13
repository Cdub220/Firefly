/**
 * The demo runs live for a judge and must not depend on a network call. Fails if any
 * source file under src/ui reaches for the network: fetch, XHR, WebSocket, EventSource,
 * or a dynamic import of a URL. Test files are excluded (this one names the words).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_DIR = join(__dirname);
const ROOT = join(__dirname, '..', '..');
/** The page shell and entry outside src/ui that the browser loads too. */
const SHELL_FILES = [join(ROOT, 'index.html'), join(ROOT, 'src', 'main.tsx'), join(ROOT, 'src', 'index.css')];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__snapshots__') out.push(...sourceFiles(p)); continue; }
    if (!/\.(ts|tsx|css)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

// Assembled at runtime so this file does not itself contain the forbidden spellings.
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'fet' + 'ch(', re: new RegExp('\\bfet' + 'ch\\s*\\(') },
  { label: 'XMLHttp' + 'Request', re: new RegExp('XMLHttp' + 'Request') },
  { label: 'new Web' + 'Socket', re: new RegExp('new\\s+Web' + 'Socket\\b') },
  { label: 'new Event' + 'Source', re: new RegExp('new\\s+Event' + 'Source\\b') },
  { label: 'import(<url>)', re: new RegExp('import\\s*\\(\\s*[\'"`](?:https?:)?//') },
  { label: 'navigator.send' + 'Beacon', re: new RegExp('send' + 'Beacon\\s*\\(') },
  { label: 'http(s):// url in css', re: new RegExp('url\\(\\s*[\'"]?https?://') },
  { label: 'http(s):// href/src in html', re: new RegExp('(?:href|src)\\s*=\\s*[\'"]https?://') },
  { label: '@import of a url', re: new RegExp('@import\\s+(?:url\\()?\\s*[\'"]?https?://') },
];

describe('no network in src/ui', () => {
  const files = [...sourceFiles(UI_DIR), ...SHELL_FILES];
  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith('store.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('index.html'))).toBe(true);
  });
  for (const file of files) {
    it(`${file.slice(ROOT.length + 1)} makes no network call`, () => {
      const src = readFileSync(file, 'utf8');
      for (const f of FORBIDDEN) expect(src, `${f.label} in ${file}`).not.toMatch(f.re);
    });
  }
  it('the rule itself catches each forbidden form', () => {
    const samples = ['await fet' + 'ch("/x")', 'new XMLHttp' + 'Request()', 'new Web' + 'Socket("ws://x")', 'new Event' + 'Source("/e")', 'import("https://cdn/x.js")', 'navigator.send' + 'Beacon("/x")', 'background: url("https://x/y.png")', '<link rel="stylesheet" href="https://fonts.example/css">', '<script src="http://cdn/x.js">', '@import url("https://x/y.css");'];
    for (const s of samples) expect(FORBIDDEN.some((f) => f.re.test(s)), s).toBe(true);
    // A local dynamic import of a module, a local script and a package import are fine.
    for (const s of ["import('./x')", '<script type="module" src="/src/main.tsx">', '@import "tailwindcss";']) expect(FORBIDDEN.some((f) => f.re.test(s)), s).toBe(false);
  });
});
