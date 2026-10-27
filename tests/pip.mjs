import { load, wait } from './harness.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

let pipWin = null;

const { dom, errors } = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.documentPictureInPicture = {
      requestWindow: async () => {
        const doc = w.document.implementation.createHTMLDocument('pip');
        pipWin = {
          document: doc,
          listeners: {},
          addEventListener(type, fn) { this.listeners[type] = fn; },
          close() { if (this.listeners.pagehide) this.listeners.pagehide({ type: 'pagehide' }); },
        };
        return pipWin;
      },
    };
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

await wait(300);
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
click($('[data-act="create"]'));
await wait(80);
type($('#fName'), 'Панель поверх');
submit($('#roomForm'));
await wait(300);
esc();
await wait(150);

check('панель видна', $('#roomOverlay').hidden === false, '');
check('кнопка «Поверх окон» есть', !!$('[data-act="overlay-pip"]'), '');

const node = $('#roomOverlay');
click($('[data-act="overlay-pip"]'));
await wait(250);
check('окно PiP открылось', !!pipWin, '');
check('панель переехала в PiP', !!pipWin && pipWin.document.body.contains(node), '');
check('панель помечена is-pip', node && node.classList.contains('is-pip'), '');
check('стили скопированы', !!pipWin && pipWin.document.head.querySelector('style') !== null, '');
check('тема перенесена', !!pipWin && pipWin.document.documentElement.getAttribute('data-theme') === 'dark', '');
check('кнопка теперь «Вернуть на сайт»', /Вернуть на сайт/.test(node.textContent), '');

const pipOpen = pipWin.document.querySelector('[data-act="overlay-open"]');
check('в PiP есть кнопка открытия комнаты', !!pipOpen, '');
click(pipOpen);
await wait(250);
check('клик в PiP открывает комнату', !!$('#modal .dialog') && /Панель поверх/.test($('#modal').textContent), '');

pipWin.close();
await wait(250);
check('панель вернулась на страницу', d.body.contains(node), '');
check('класс is-pip снят', !node.classList.contains('is-pip'), '');
check('чистая консоль', errors.length === 0, errors.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed ? 'FAILED ' + failed + '/' + results.length : 'ALL PASS ' + results.length + '/' + results.length));
window.close();
process.exit(failed ? 1 : 0);
