import { load, wait, REPO } from './harness.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

const { dom, errors } = load(undefined, { beforeParse: (w) => { w.fetch = undefined; } });
const { window } = dom;
const d = window.document;
const $ = (sel) => d.querySelector(sel);
const $$ = (sel) => Array.from(d.querySelectorAll(sel));
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const submit = (form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const type = (el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };

await wait(300);

/* ---------- читы: разметка и файлы ---------- */
const cheats = $('#cheats');
check('секция «Читы» есть', !!cheats, '');
check('три карточки читов', $$('.cheat').length === 3, 'карточек: ' + $$('.cheat').length);
const titles = $$('.cheat h3').map((h) => h.textContent.trim());
check('Exodium, ZeninLoader, Neptunium', titles.join('/') === 'Exodium/ZeninLoader/Neptunium', titles.join(' / '));
check('ключ в @exodiumdlc_bot', !!$('.cheat a[href="https://t.me/exodiumdlc_bot"]'), '');
check('пометка про кряк', /кряк/.test(cheats.textContent), '');
check('Neptunium: официальный и бесплатный', /официальный · бесплатный/.test(cheats.textContent) && /банят/.test(cheats.textContent), '');
check('Neptunium: ссылка на релиз', !!$('.cheat a[href$="/releases/tag/fgd"]'), '');
check('ADB-инструкция', /ADB/.test(cheats.textContent) && /Android Debug Bridge/.test(cheats.textContent), '');
check('предупреждение о рисках', /антивирусом не проверялись/.test(cheats.textContent), '');

const releaseLinks = $$('.cheat a[href*="releases/download"]').map((a) => a.getAttribute('href'));
check('файлы релиза на месте', releaseLinks.length === 2 &&
  releaseLinks.some((h) => /neptunium\.pc\.loader\.1\.4-f1\.1\.zip$/.test(h)) &&
  releaseLinks.some((h) => /28cb0e6619cbfb3470f9070f66e209a0\.2\.exe$/.test(h)), releaseLinks.length + ' ссылок');

const localLinks = $$('.cheat a[download]').map((a) => a.getAttribute('href'));
check('четыре локальных файла', localLinks.length === 4, localLinks.join(' | '));

const expected = {
  'Exodium(4).exe': '414e77447248b32aa20f7d398a0eca465f146b7caf3bd16183fef60a02999783',
  'BlueStacksInstaller_5_22_130_1019_native_e0175934c4a0a56f1db683585ffd1bcf(1).exe':
    '801895b346e936c1a7958135c285bab8d337e2d908e7d7b2fca4e3c39a786ed7',
  'ZeninLoader(3).apk': 'b97e1843fdb0481be98f93230ab395bf49ad5840684c83f2d55c33983971ed47',
  'BlueStacks_App_Player_v5.20.101.exe': 'baa2597a8b5b5574c3d5b5308edc44cd2a8eb16223ba0b21d2bad59aa1cd488c',
};

let filesOk = true;
Object.keys(expected).forEach((name) => {
  const file = REPO + '/' + name;
  if (!fs.existsSync(file)) { filesOk = false; console.log('  нет файла: ' + name); return; }
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (hash !== expected[name]) { filesOk = false; console.log('  хеш не совпал: ' + name); }
});
check('локальные файлы и SHA-256', filesOk, '');

const hashesOnPage = $$('.file-hashes code').map((c) => c.textContent.trim());
check('хеши на странице полные', hashesOnPage.length === 6 && hashesOnPage.every((h) => /^[0-9a-f]{64}$/.test(h)), hashesOnPage.length + ' шт.');
check('хеш Neptunium совпадает с релизом', hashesOnPage.indexOf('57b4da4361d59de88c0199538d742cfa1450f1491dff4a6bccee9e161ebf77a1') >= 0, '');
check('ссылка «Читы» в шапке', $('.header-actions a').getAttribute('href') === '#cheats', '');

/* ---------- базовые сценарии ---------- */
check('пустой список', /Пока никто не создал комнату/.test($('.state') ? $('.state').textContent : ''), '');
check('статус локальной базы', /локально/.test($('#dbStatus') ? $('#dbStatus').textContent : ''), '');
check('панель комнаты скрыта', $('#roomOverlay').hidden === true, '');

click($('[data-act="auth"]'));
await wait(50);
click($('[data-act="auth-tab"][data-tab="register"]'));
await wait(50);
type($('#rId'), '42073869');
submit($('#verifyForm'));
await wait(60);
check('кнопка «Проверяю…»', /Проверяю/.test($('#rVerifyBtn') ? $('#rVerifyBtn').textContent : ''), '');
await wait(900);
const nick = $('.verified b').textContent;
check('демо-ник из ID', /^[A-Za-zА-Яа-яЁё0-9]+_\d{2}$/.test(nick), nick);
type($('#rgPass'), 'qwerty1');
type($('#rgPass2'), 'qwerty1');
submit($('#regForm'));
await wait(250);
check('аккаунт создан', $('.me-nick').textContent === nick, $('.me-nick').textContent);
check('ник в профиле хранится как проверенный', JSON.parse(window.localStorage.getItem('mx_users'))['42073869'].verifiedNick === nick, '');

click($('[data-act="create"]'));
await wait(80);
check('фокус в названии', d.activeElement && d.activeElement.id === 'fName', d.activeElement ? d.activeElement.id : '');
type($('#fName'), 'ХВХ дуэль');
submit($('#roomForm'));
await wait(300);
check('комната создана', $$('[data-room-open]').length === 1, '');
check('при открытой комнате панель скрыта', $('#roomOverlay').hidden === true, '');

d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(120);
check('панель комнаты поверх страницы', $('#roomOverlay').hidden === false && /Открыть комнату/.test($('#roomOverlay').textContent), '');
check('в панели есть игрок', $('#roomOverlay .overlay-player') !== null && /Fury_51/.test($('#roomOverlay').textContent), '');

click($('[data-act="overlay-open"]'));
await wait(200);
check('панель открывает комнату', !!$('#modal .dialog') && /ХВХ дуэль/.test($('#modal').textContent), '');
check('панель скрыта при открытой комнате', $('#roomOverlay').hidden === true, '');

/* ---------- смена ника ---------- */
d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(120);
check('после закрытия панель снова видна', $('#roomOverlay').hidden === false, '');
click($('.me-nick-btn'));
await wait(120);
check('модалка смены ника', !!$('#nickForm') && $('#nickInput').value === nick, '');
type($('#nickInput'), 'X');
submit($('#nickForm'));
await wait(120);
check('короткий ник отклонён', !!$('#nickErr') && !$('#nickErr').hidden, $('#nickErr') ? $('#nickErr').textContent : '');
type($('#nickInput'), '  Дарк\tПульс  ');
submit($('#nickForm'));
await wait(300);
check('ник сохранён и очищен от пробелов', $('.me-nick').textContent === 'Дарк Пульс', $('.me-nick').textContent);
check('подсказка с проверенным ником', /проверенный/.test($('.me').getAttribute('title') + $('.me-nick-btn').getAttribute('title')), '');
check('ник обновлён в комнате', /Дарк Пульс/.test($('.card').textContent) && /Дарк Пульс/.test($('#roomOverlay').textContent), '');
check('сессия помнит новый ник', JSON.parse(window.localStorage.getItem('mx_session')).nick === 'Дарк Пульс', '');
check('проверенный ник не потерян', JSON.parse(window.localStorage.getItem('mx_users'))['42073869'].verifiedNick === nick, '');

/* ---------- панель: сворачивание и отсутствие PiP в jsdom ---------- */
click($('[data-act="overlay-toggle"]'));
await wait(80);
check('панель сворачивается', $('#roomOverlay').classList.contains('is-collapsed'), '');
click($('[data-act="overlay-toggle"]'));
await wait(80);
check('панель разворачивается', !$('#roomOverlay').classList.contains('is-collapsed'), '');
check('без PiP честная подсказка', /Chrome или Edge 116/.test($('#roomOverlay').textContent) && !$('[data-act="overlay-pip"]'), '');

/* ---------- тема и консоль ---------- */
const themeBefore = d.documentElement.getAttribute('data-theme');
click($('#themeToggle'));
await wait(100);
check('переключение темы', themeBefore !== d.documentElement.getAttribute('data-theme'), '');
check('чистая консоль', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed ? 'FAILED ' + failed + '/' + results.length : 'ALL PASS ' + results.length + '/' + results.length));
window.close();
process.exit(failed ? 1 : 0);
