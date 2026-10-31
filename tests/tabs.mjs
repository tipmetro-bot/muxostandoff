import { load, wait } from './harness.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

function canvasStub(w) {
  const calls = { clear: 0, arcs: 0, lines: 0 };
  w.HTMLCanvasElement.prototype.getContext = function () {
    return {
      canvas: this,
      setTransform() {},
      clearRect() { calls.clear += 1; },
      beginPath() {},
      arc() { calls.arcs += 1; },
      moveTo() {},
      lineTo() {},
      stroke() { calls.lines += 1; },
      fill() {},
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    };
  };
  return calls;
}

const { dom, errors } = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.__canvas = canvasStub(w);
  },
});

const { window } = dom;
const d = window.document;
const $ = (s) => d.querySelector(s);
const $$ = (s) => Array.from(d.querySelectorAll(s));
const click = (el) => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const submit = (f) => f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const esc = () => d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const uiLS = () => JSON.parse(window.localStorage.getItem('mx_ui') || 'null');

await wait(300);

/* ---------- вкладки ---------- */
const tabs = $$('#tabbar [role="tab"]');
check('две вкладки в шапке', tabs.length === 2, 'вкладок: ' + tabs.length);
check('по умолчанию открыты комнаты', !$('#pane-rooms').hidden && $('#cheats').hidden === true,
  'rooms hidden=' + $('#pane-rooms').hidden + ' cheats hidden=' + $('#cheats').hidden);
check('активная вкладка помечена', $('#tabRooms').getAttribute('aria-selected') === 'true' &&
  $('#tabCheats').getAttribute('aria-selected') === 'false' && $('#tabRooms').classList.contains('is-active'), '');

click($('#tabCheats'));
await wait(60);
check('вкладка «Читы» показывает читы', $('#cheats').hidden === false && $('#pane-rooms').hidden === true, '');
check('адрес отражает вкладку', window.location.hash === '#cheats', window.location.hash);
check('aria-selected переключён', $('#tabCheats').getAttribute('aria-selected') === 'true' &&
  $('#tabRooms').getAttribute('aria-selected') === 'false', '');

click($('#tabRooms'));
await wait(60);
check('возврат на комнаты', $('#pane-rooms').hidden === false && $('#cheats').hidden === true, '');
check('адрес снова комнаты', window.location.hash === '#rooms', window.location.hash);

window.location.hash = '#cheats';
window.dispatchEvent(new window.Event('hashchange'));
await wait(60);
check('хеш переключает вкладку', $('#cheats').hidden === false, '');
window.location.hash = '#rooms';
window.dispatchEvent(new window.Event('hashchange'));
await wait(60);

/* ---------- счётчики ---------- */
check('счётчик комнат в вкладке', $('#tabCountRooms').textContent === '0', $('#tabCountRooms').textContent);
check('сводка в интро', /комнат:/.test($('#introStats').textContent), $('#introStats').textContent);

click($('[data-act="auth"]'));
await wait(50);
click($('[data-act="auth-tab"][data-tab="register"]'));
await wait(50);
type($('#rId'), '42073869');
submit($('#verifyForm'));
await wait(900);
type($('#rgPass'), 'qwerty1');
type($('#rgPass2'), 'qwerty1');
submit($('#regForm'));
await wait(250);

click($('#tabCheats'));
await wait(40);
click($('[data-act="create"]'));
await wait(80);
check('создание возвращает на комнаты', $('#pane-rooms').hidden === false && $('#cheats').hidden === true, '');
type($('#fName'), 'Точки и линии');
$('#fMode').value = '1x1';
submit($('#roomForm'));
await wait(300);
check('счётчик обновился', $('#tabCountRooms').textContent === '1', $('#tabCountRooms').textContent);
check('сводка считает игрока', /игроков в лобби: 1/.test($('#introStats').textContent), $('#introStats').textContent);

/* ---------- окно «Вид» ---------- */
click($('[data-act="open-view"]'));
await wait(60);
check('окно вида открылось', $('#modal').hidden === false && !!$('#modal .view-grid'), '');
check('четыре варианта фона', $$('#modal .view-option').length === 4, 'вариантов: ' + $$('#modal .view-option').length);
check('по умолчанию сетка', d.documentElement.getAttribute('data-bg') === 'grid' &&
  d.documentElement.getAttribute('data-bg-density') === 'mid' &&
  $('#bgCanvas').hidden === true, d.documentElement.getAttribute('data-bg'));

click($('#modal .view-option[data-bg="stars"]'));
await wait(80);
check('звёзды сохраняются', uiLS().bg === 'stars' && d.documentElement.getAttribute('data-bg') === 'stars', JSON.stringify(uiLS()));
check('холст включён для звёзд', $('#bgCanvas').hidden === false && $('#bgCanvas').width > 0,
  'w=' + $('#bgCanvas').width + ' h=' + $('#bgCanvas').height);
check('звёзды нарисованы', window.__canvas.arcs > 0, 'точек: ' + window.__canvas.arcs);
check('переключатель темы в окне вида', !!$('#modal .chip[data-act="set-theme"][data-theme="dark"]'), '');
click($('#modal .chip[data-act="set-theme"][data-theme="light"]'));
await wait(60);
check('тема меняется из окна вида', d.documentElement.getAttribute('data-theme') === 'light' &&
  JSON.parse(window.localStorage.getItem('mx_theme')) === 'light', d.documentElement.getAttribute('data-theme'));
click($('#modal .chip[data-act="set-theme"][data-theme="dark"]'));
await wait(60);

check('в окне отмечен выбор', $('#modal .view-option[data-bg="stars"]').classList.contains('is-active') &&
  $('#modal .view-option[data-bg="stars"]').getAttribute('aria-pressed') === 'true', '');

click($('#modal .chip[data-density="high"]'));
await wait(60);
check('плотность сохраняется', uiLS().density === 'high' &&
  d.documentElement.getAttribute('data-bg-density') === 'high', JSON.stringify(uiLS()));

click($('#modal .view-option[data-bg="network"]'));
await wait(80);
check('линии включаются', d.documentElement.getAttribute('data-bg') === 'network' && uiLS().bg === 'network', '');
check('линии рисуются', window.__canvas.lines > 0 || window.__canvas.arcs > 0, '');

const motion = $('#viewMotion');
motion.checked = false;
motion.dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(40);
check('анимацию можно выключить', uiLS().motion === false, JSON.stringify(uiLS()));

click($('#modal .view-option[data-bg="none"]'));
await wait(60);
check('без фона холст скрыт', $('#bgCanvas').hidden === true && d.documentElement.getAttribute('data-bg') === 'none', '');

click($('[data-act="view-reset"]'));
await wait(60);
check('сброс возвращает сетку', d.documentElement.getAttribute('data-bg') === 'grid' &&
  d.documentElement.getAttribute('data-bg-density') === 'mid' && uiLS().motion === true, JSON.stringify(uiLS()));

esc();
await wait(40);
check('Esc закрывает окно вида', $('#modal').hidden === true, '');
check('чистая консоль', errors.length === 0, errors.join(' | '));
window.close();

/* ---------- выбор переживает перезагрузку ---------- */
const second = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    canvasStub(w);
    w.localStorage.setItem('mx_ui', JSON.stringify({ bg: 'network', density: 'high', motion: false }));
  },
});
await wait(300);
const d2 = second.dom.window.document;
check('фон восстановлен после перезагрузки',
  d2.documentElement.getAttribute('data-bg') === 'network' &&
  d2.documentElement.getAttribute('data-bg-density') === 'high' &&
  d2.querySelector('#bgCanvas').hidden === false,
  d2.documentElement.getAttribute('data-bg') + '/' + d2.documentElement.getAttribute('data-bg-density'));
check('мёртвая настройка не ломает вид',
  d2.querySelector('#viewBtn') !== null, '');
check('чистая консоль после перезагрузки', second.errors.length === 0, second.errors.join(' | '));
second.dom.window.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? '\nFAILED ' + failed.length + '/' + results.length
  : '\nALL PASS ' + results.length + '/' + results.length);
if (failed.length) process.exitCode = 1;
