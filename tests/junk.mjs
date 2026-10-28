import { load, wait } from './harness.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

const hour = 3600000;

const junk = {
  'rOwnerBad': {
    name: 'Без названия', mode: 'custom', cap: 2, map: 'Любая', region: 'EU', ping: null,
    style: 'rage', passHash: '', ownerId: '', ownerNick: 'Игрок', code: 'MX-AAAA',
    createdAt: Date.now() - 1000, players: {},
  },
  'rNoPlayers': {
    name: 'Пустая', mode: '1x1', cap: 2, map: 'Любая', region: 'EU', ping: null,
    style: 'rage', passHash: '', ownerId: '293102919', ownerNick: 'Umbra_38', code: 'MX-BBBB',
    createdAt: Date.now() - 5000, players: {},
  },
  'rNameless': {
    name: '', mode: '1x1', cap: 2, map: 'Любая', region: 'EU', ping: null,
    style: 'rage', passHash: '', ownerId: '293102919', ownerNick: 'Umbra_38', code: 'MX-CCCC',
    createdAt: Date.now() - 5000, players: { '293102919': { id: '293102919', nick: 'Umbra_38', at: Date.now() } },
  },
  'rStale': {
    name: 'UMBRA_38 VS PULSE43', mode: '1x1', cap: 2, map: 'Sandstone', region: 'RU', ping: null,
    style: 'rage', passHash: '', ownerId: '293102919', ownerNick: 'Umbra_38', code: 'MX-DDDD',
    createdAt: Date.now() - 5 * hour,
    players: { '293102919': { id: '293102919', nick: 'Umbra_38', at: Date.now() - 5 * hour } },
  },
  'rFresh': {
    name: 'Живая комната', mode: '1x1', cap: 2, map: 'Sandstone', region: 'RU', ping: null,
    style: 'semi', passHash: '', ownerId: '42073869', ownerNick: 'Живой', code: 'MX-EEEE',
    createdAt: Date.now() - 60000,
    players: { '42073869': { id: '42073869', nick: 'Живой', at: Date.now() } },
  },
};

const { dom, errors } = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.localStorage.setItem('mx_rooms', JSON.stringify(junk));
  },
});

const { window } = dom;
const d = window.document;
const $ = (s) => d.querySelector(s);
const $$ = (s) => Array.from(d.querySelectorAll(s));
const roomsLS = () => JSON.parse(window.localStorage.getItem('mx_rooms') || '{}');

await wait(500);

const titles = $$('.card-title').map((t) => t.textContent.trim());
check('мусор не показан в списке', titles.length === 1 && titles[0] === 'Живая комната', JSON.stringify(titles));
check('живая комната на месте', titles.indexOf('Живая комната') >= 0, '');

const counts = $$('.filters [data-act="filter"]').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
check('счётчик «Все» без мусора', /^Все\s*1$/.test(counts[0] || ''), counts[0] || 'нет');

await wait(400);
const left = roomsLS();
check('мусорные комнаты удалены из базы', !left.rOwnerBad && !left.rNoPlayers && !left.rNameless && !left.rStale,
  'осталось: ' + Object.keys(left).join(','));
check('живая комната не тронута', !!left.rFresh, '');

/* ---------- своя старая комната не удаляется ---------- */
const mine = JSON.parse(JSON.stringify(junk));
mine.rMine = {
  name: 'Моя старая', mode: '1x1', cap: 2, map: 'Любая', region: 'EU', ping: null,
  style: 'rage', passHash: '', ownerId: '42073869', ownerNick: 'Я', code: 'MX-FFFF',
  createdAt: Date.now() - 6 * hour,
  players: { '42073869': { id: '42073869', nick: 'Я', at: Date.now() - 6 * hour } },
};
const users = { '42073869': { id: '42073869', nick: 'Я', verifiedNick: 'Я', pass: 'x', createdAt: Date.now() } };
const second = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.localStorage.setItem('mx_rooms', JSON.stringify(mine));
    w.localStorage.setItem('mx_users', JSON.stringify(users));
    w.localStorage.setItem('mx_session', JSON.stringify({ id: '42073869', nick: 'Я', verifiedNick: 'Я', wins: 0 }));
  },
});
await wait(600);
const d2 = second.dom.window.document;
const titles2 = Array.from(d2.querySelectorAll('.card-title')).map((t) => t.textContent.trim());
check('своя старая комната остаётся', titles2.indexOf('Моя старая') >= 0, JSON.stringify(titles2));
const left2 = JSON.parse(second.dom.window.localStorage.getItem('mx_rooms') || '{}');
check('своя комната не удалена из базы', !!left2.rMine, '');
check('чужой мусор убран и во второй сессии', !left2.rStale && !left2.rNoPlayers, '');

check('чистая консоль', errors.length === 0 && second.errors.length === 0, [...errors, ...second.errors].slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed ? 'FAILED ' + failed + '/' + results.length : 'ALL PASS ' + results.length + '/' + results.length));
window.close();
second.dom.window.close();
process.exit(failed ? 1 : 0);
