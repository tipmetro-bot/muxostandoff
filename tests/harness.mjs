import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SITE = path.resolve(HERE, '..', 'index.html');
export const REPO = path.resolve(HERE, '..');

export function load(file = SITE, opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
  vc.on('warn', () => {});
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://tipmetro-bot.github.io/muxostandoff/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse: opts.beforeParse,
  });
  return { dom, errors };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
