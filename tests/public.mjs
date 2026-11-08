import { load, wait } from './harness.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

const LOBBY = 'https://link.standoff2.com/ru/lobby/join/6af0348fdc88aaeaf3294783pTwy9?token=cw900XGuvjBfpai5lOss6jcHM4DkR5vj';
const opened = [];
const copied = [];

const { dom, errors } = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.open = (url) => { opened.push(url); return {}; };
    Object.defineProperty(w.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => { copied.push(text); } },
    });
  },
});

const { window } = dom;
const d = window.document;
const $ = (s) => d.querySelector(s);
const $$ = (s) => Array.from(d.querySelectorAll(s));
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const submit = (f) => f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const roomsLS = () => JSON.parse(window.localStorage.getItem('mx_rooms') || '{}');
const roomId = () => Object.keys(roomsLS())[0];
const toasts = () => $$('.toast').map((t) => t.textContent);

await wait(350);

click($('[data-act="auth"]'));
await wait(60);
click($('[data-act="auth-tab"][data-tab="register"]'));
await wait(60);
type($('#rId'), '42073869');
submit($('#verifyForm'));
await wait(900);
type($('#rgPass'), 'qwerty1');
type($('#rgPass2'), 'qwerty1');
submit($('#regForm'));
await wait(320);

/* ---------- форма ---------- */
click($('[data-act="create"]'));
await wait(120);
check('в форме есть выбор входа', !!$('#fAccess') && $('#fAccess').options.length === 2, '');
check('ссылка скрыта для комнаты по коду', $('#lobbyWrap').hidden === true, '');
check('по умолчанию вход по коду', $('#fAccess').value === 'code', $('#fAccess').value);

change($('#fAccess'), 'public');
await wait(60);
check('ссылка показывается для hvh public', $('#lobbyWrap').hidden === false, '');
check('подсказка про ссылку', /лобби/.test($('#accessHint').textContent), $('#accessHint').textContent.slice(0, 40));

type($('#fName'), 'HVH Public 3x3');
$('#fMode').value = '3x3';
type($('#fLobby'), 'https://example.com/lobby/join/abc?token=1');
submit($('#roomForm'));
await wait(150);
check('чужой домен отклоняется', /link\.standoff2\.com/.test(($('#fErr') || {}).textContent || '') &&
  Object.keys(roomsLS()).length === 0, ($('#fErr') || {}).textContent);

type($('#fLobby'), 'link.standoff2.com/ru/lobby/join/6af0348fdc88aaeaf3294783pTwy9?token=cw900XGuvjBfpai5lOss6jcHM4DkR5vj');
submit($('#roomForm'));
await wait(300);

/* ---------- создание ---------- */
const room = roomsLS()[roomId()];
check('комната создана', !!room, '');
check('ссылка сохранена с https', room && room.lobby === LOBBY, room ? room.lobby : '');
check('доступ помечен как public', room && room.access === 'public', room ? room.access : '');
check('ссылка без https принимается', room && room.lobby.indexOf('https://link.standoff2.com/') === 0, '');

/* ---------- карточка ---------- */
const card = $('.card');
check('на карточке бейдж public', !!$('.card .badge--public'), '');
check('на карточке кнопка «В лобби»', !!$('.card [data-act="lobby"]'), '');
check('в мете указан вход по ссылке', /по ссылке/.test($('.card-meta').textContent), $('.card-meta').textContent);

click($('.card [data-act="lobby"]'));
await wait(80);
check('кнопка карточки открывает лобби', opened[0] === LOBBY, opened[0] || 'не открылось');
check('клик по кнопке не открывает комнату поверх', !!$('.card'), '');

/* ---------- окно комнаты ---------- */
click($('.card-title'));
await wait(150);
check('в комнате есть блок лобби', !!$('.lobby-row') && !!$('#modal .lobby-row'), '');
check('ссылка в комнате видна', /6af0348f/.test($('.lobby-link').textContent), $('.lobby-link').textContent);
check('кнопки «Открыть лобби» и «Скопировать»', !!$('#modal [data-act="lobby"]') && !!$('#modal [data-act="copy-lobby"]'), '');
check('подсказка про одноразовую ссылку', /одноразовая/.test($('#modal').textContent), '');

click($('#modal [data-act="copy-lobby"]'));
await wait(120);
check('ссылка копируется', copied[0] === LOBBY, copied[0] || 'не скопировалось');

click($('#modal [data-act="lobby"]'));
await wait(80);
check('кнопка в комнате открывает лобби', opened.length === 2 && opened[1] === LOBBY, opened.join(' | '));

click($('#modal [data-act="copy-invite"]'));
await wait(120);
check('приглашение копируется', /HVH · HVH Public 3x3/.test(copied[1] || '') && (copied[1] || '').indexOf(LOBBY) > 0 &&
  /код комнаты: MX-/.test(copied[1] || ''), (copied[1] || '').replace(/\n/g, ' | ').slice(0, 90));

d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(60);

/* ---------- фильтр ---------- */
check('есть фильтр входа', !!$('#accessFilters [data-key="public"]'), '');
check('счётчик public считает комнату', /hvhpublic1/.test($('#accessFilters').textContent.replace(/\s+/g, '')),
  $('#accessFilters').textContent.replace(/\s+/g, ' '));

click($('#accessFilters [data-key="public"]'));
await wait(80);
check('фильтр public показывает комнату', $$('[data-room-open]').length === 1, '');
click($('#accessFilters [data-key="code"]'));
await wait(80);
check('фильтр «по коду» скрывает public', $$('[data-room-open]').length === 0, '');
check('пустое состояние объясняет фильтр', /Под эти фильтры комнат нет/.test($('.state') ? $('.state').textContent : ''),
  $('.state') ? $('.state').textContent.slice(0, 50) : 'нет .state');
click($('#accessFilters [data-key="all"]'));
await wait(80);
check('фильтр «все» возвращает комнату', $$('[data-room-open]').length === 1, '');

/* ---------- поиск ---------- */
type($('#searchInput'), 'public');
await wait(120);
check('поиск по слову public находит комнату', $$('[data-room-open]').length === 1, '');
type($('#searchInput'), '');
await wait(120);

/* ---------- правка ---------- */
click($('[data-room-open]'));
await wait(150);
click($('#modal [data-act="edit"]'));
await wait(150);
check('в правке ссылка подставлена', $('#fAccess').value === 'public' && $('#fLobby').value === LOBBY,
  $('#fAccess').value + ' / ' + ($('#fLobby') ? $('#fLobby').value.slice(0, 30) : ''));
type($('#fLobby'), '');
submit($('#roomForm'));
await wait(150);
check('пустая ссылка не проходит', /Нужна ссылка/.test(($('#fErr') || {}).textContent || ''), ($('#fErr') || {}).textContent);

change($('#fAccess'), 'code');
await wait(60);
submit($('#roomForm'));
await wait(300);
const updated = roomsLS()[roomId()];
check('room переключается обратно на код', updated.access === 'code' && updated.lobby === '', JSON.stringify(updated.access) + '/' + JSON.stringify(updated.lobby));
check('после правки ссылка убрана с карточки', !$('.card .badge--public'), '');

/* ---------- кривая ссылка в базе ---------- */
const rooms = roomsLS();
const id = Object.keys(rooms)[0];
rooms[id].access = 'public';
rooms[id].lobby = 'javascript:alert(1)';
window.localStorage.setItem('mx_rooms', JSON.stringify(rooms));
window.dispatchEvent(new window.StorageEvent('storage', { key: 'mx_rooms' }));
await wait(200);
check('опасная ссылка отбрасывается', !$('.card .badge--public') && !$('[data-act="lobby"]'), '');

check('чистая консоль', errors.length === 0, errors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? '\nFAILED ' + failed.length + '/' + results.length
  : '\nALL PASS ' + results.length + '/' + results.length);
if (failed.length) process.exitCode = 1;
window.close();
