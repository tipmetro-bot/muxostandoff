import { load, wait } from './harness.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

function streamOf(kind) {
  const audio = { kind: 'audio', enabled: true, stop() { this.stopped = true; } };
  const video = { kind: 'video', enabled: true, stop() { this.stopped = true; } };
  const tracks = kind === 'audio' ? [audio] : [audio, video];
  return {
    getTracks: () => tracks,
    getAudioTracks: () => [audio],
    getVideoTracks: () => (kind === 'audio' ? [] : [video]),
  };
}

const calls = { media: 0, display: 0 };

const { dom, errors } = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.RTCPeerConnection = class FakePC {
      constructor(cfg) { this.cfg = cfg; this.closed = false; }
      addTrack(track) {
        this.track = track;
        return { track, kind: track.kind, replaceTrack: async (t) => { this.replaced = t; } };
      }
      async createOffer() { return { type: 'offer', sdp: 'v=0 fake offer' }; }
      async createAnswer() { return { type: 'answer', sdp: 'v=0 fake answer' }; }
      async setLocalDescription(dsc) { this.localDescription = dsc; }
      async setRemoteDescription(dsc) { this.remoteDescription = dsc; }
      async addIceCandidate(c) { this.candidate = c; }
      close() { this.closed = true; }
    };
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.HTMLMediaElement.prototype.pause = () => {};
    Object.defineProperty(w.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async (c) => { calls.media += 1; return streamOf(c && c.video ? 'video' : 'audio'); },
        getDisplayMedia: async () => { calls.display += 1; return streamOf('video'); },
      },
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
const social = () => JSON.parse(window.localStorage.getItem('mx_social') || '{}');
const friendsOf = (id) => (social().friends || {})[id] || {};

async function register(id, pass = 'qwerty1') {
  click($('[data-act="auth"]'));
  await wait(60);
  click($('[data-act="auth-tab"][data-tab="register"]'));
  await wait(60);
  type($('#rId'), id);
  submit($('#verifyForm'));
  await wait(900);
  type($('#rgPass'), pass);
  type($('#rgPass2'), pass);
  submit($('#regForm'));
  await wait(320);
}

async function login(id, pass = 'qwerty1') {
  click($('[data-act="auth"]'));
  await wait(60);
  type($('#lId'), id);
  type($('#lPass'), pass);
  submit($('#loginForm'));
  await wait(360);
}

async function logout() {
  const btn = $('[data-act="logout"]');
  click(btn);
  await wait(120);
}

async function openFriends() {
  click($('#tabFriends'));
  await wait(450);
}

await wait(350);

/* ---------- гостю показывают вход ---------- */
check('вкладка «Друзья» есть', !!$('#tabFriends'), '');
await openFriends();
check('гость видит приглашение войти', /Войди по Standoff 2 ID/.test($('#friendList').textContent), $('#friendList').textContent.trim().slice(0, 40));
check('у гостя нет списка друзей', !$('#dmPane').innerHTML, '');

/* ---------- два аккаунта ---------- */
await register('42073869');
check('первый аккаунт создан', !!$('.me-nick'), $('.me-nick') ? $('.me-nick').textContent : '');
check('присутствие записано', !!(social().presence || {})['42073869'], JSON.stringify(social().presence || {}));

await logout();
check('после выхода присутствие снято', ((social().presence || {})['42073869'] || {}).at === 0, '');

await register('42073870');
check('второй аккаунт создан', !!$('.me-nick'), $('.me-nick') ? $('.me-nick').textContent : '');

/* ---------- заявка в друзья ---------- */
await openFriends();
type($('#friendSearch'), '42073869');
await wait(400);
check('поиск по ID нашёл игрока', /42073869/.test($('#friendSearchResults').textContent), $('#friendSearchResults').textContent.trim().slice(0, 60));
click($('#friendSearchResults [data-act="friend-add"]'));
await wait(300);
check('заявка записана в обе стороны',
  friendsOf('42073870')['42073869'].status === 'out' && friendsOf('42073869')['42073870'].status === 'in',
  JSON.stringify(friendsOf('42073869')));
check('отправленная заявка видна', /заявка отправлена/.test($('#friendRequests').textContent), '');

await logout();
await login('42073869');
await wait(350);
await openFriends();
check('входящая заявка видна получателю', /хочет добавить тебя/.test($('#friendRequests').textContent), $('#friendRequests').textContent.trim().slice(0, 80));
check('бейдж вкладки показывает заявку', $('#tabCountFriends').hidden === false && $('#tabCountFriends').textContent !== '0', $('#tabCountFriends').textContent);

click($('#friendRequests [data-act="friend-accept"]'));
await wait(300);
check('заявка принята в обе стороны',
  friendsOf('42073869')['42073870'].status === 'friends' && friendsOf('42073870')['42073869'].status === 'friends', '');
check('друг появился в списке', $$('#friendList .friend-row').length === 1, 'строк: ' + $$('#friendList .friend-row').length);
check('у друга виден ID', /ID 42073870/.test($('#friendList').textContent), '');

/* ---------- переписка ---------- */
click($('#friendList [data-act="dm"]'));
await wait(250);
check('переписка открылась', !!$('#dmInput') && !!$('#dmList'), '');
type($('#dmInput'), 'привет, го в 1x1');
submit($('#dmForm'));
await wait(350);
const mine = $$('#dmList .dm-msg');
check('своё сообщение в переписке', mine.length === 1 && mine[0].classList.contains('dm-msg--mine') &&
  /привет, го в 1x1/.test(mine[0].textContent), '');
check('сообщение сохранено в базе', JSON.stringify(social().dm || {}).indexOf('привет, го в 1x1') >= 0, '');
check('мета переписки обновлена', !!(social().dmMeta || {})['42073869~42073870'], '');

await logout();
await login('42073870');
await wait(350);
await openFriends();
check('у получателя помечен чат', /\d/.test($('#tabCountFriends').textContent) && $('#tabCountFriends').hidden === false, $('#tabCountFriends').textContent);
click($('#friendList [data-act="dm"]'));
await wait(300);
check('сообщение друга видно', /привет, го в 1x1/.test($('#dmList').textContent), $('#dmList').textContent.trim().slice(0, 50));

type($('#dmInput'), '<img src=x onerror="window.__xss=1">');
submit($('#dmForm'));
await wait(700);
check('HTML в переписке экранирован', !$('#dmList img') && window.__xss === undefined &&
  /<img src=x/.test($('#dmList').textContent), '');
check('бейдж снят после прочтения', $('#tabCountFriends').hidden === true, $('#tabCountFriends').textContent);

/* ---------- звонок: исходящий ---------- */
click($('#dmPane [data-act="call"]'));
await wait(450);
check('панель звонка открылась', $('#callPanel').hidden === false, '');
check('статус «звоним»', /звоним/.test($('#callPanel').textContent), $('#callPanel').textContent.trim().slice(0, 50));
check('предложение записано', !!(social().calls || {})['42073869~42073870'].offer, '');
check('микрофон запрошен', calls.media === 1, 'запросов: ' + calls.media);

click($('#callPanel [data-act="call-mute"]'));
await wait(60);
check('микрофон выключается', /Включить микрофон/.test($('#callPanel').textContent), '');

click($('#callPanel [data-act="call-end"]'));
await wait(400);
check('исходящий звонок отменён', $('#callPanel').hidden === true, '');
check('отмена записана', !!(social().calls || {})['42073869~42073870'].end, '');

await wait(2800);

/* ---------- звонок: входящий ---------- */
const thread = '42073869~42073870';
const seed = social();
seed.calls = {};
seed.calls[thread] = {
  offer: { from: '42073869', nick: 'Fury_51', kind: 'audio', sdp: 'v=0 fake offer', at: Date.now() },
  state: { phase: 'ring', from: '42073869', at: Date.now() },
};
window.localStorage.setItem('mx_social', JSON.stringify(seed));
await wait(300);
await openFriends();
await wait(400);
check('входящий звонок показан', $('#callPanel').hidden === false && /Принять/.test($('#callPanel').textContent),
  $('#callPanel').textContent.trim().slice(0, 60));

/* звонящий отменил вызов до ответа */
const cancelled = social();
cancelled.calls[thread].state = { phase: 'ended', from: '42073869', at: Date.now() };
cancelled.calls[thread].end = { from: '42073869', reason: 'hangup', at: Date.now() };
window.localStorage.setItem('mx_social', JSON.stringify(cancelled));
await openFriends();
await wait(400);
check('отменённый вызов убирает панель', $('#callPanel').hidden === true, '');

/* звонит снова — уже новый вызов */
const again = social();
again.calls[thread] = {
  offer: { from: '42073869', nick: 'Fury_51', kind: 'audio', sdp: 'v=0 fake offer', at: Date.now() + 5 },
  state: { phase: 'ring', from: '42073869', at: Date.now() + 5 },
};
window.localStorage.setItem('mx_social', JSON.stringify(again));
await openFriends();
await wait(450);
check('повторный звонок снова показывается', $('#callPanel').hidden === false, '');

click($('#callPanel [data-act="call-accept"]'));
await wait(500);
check('звонок принят', /Завершить/.test($('#callPanel').textContent), $('#callPanel').textContent.trim().slice(0, 60));
check('ответ записан', !!((social().calls || {})[thread] || {}).answer, '');
check('статус активного звонка', /0:0/.test($('#callStatus').textContent), $('#callStatus').textContent);

click($('#callPanel [data-act="call-screen"]'));
await wait(200);
check('демонстрация экрана включается', calls.display === 1 && /Стоп экран/.test($('#callPanel').textContent), '');

click($('#callPanel [data-act="call-end"]'));
await wait(400);
check('звонок завершён', $('#callPanel').hidden === true, '');
check('завершение записано', !!((social().calls || {})[thread] || {}).end, '');

/* ---------- удаление из друзей ---------- */
click($('#friendList [data-act="unfriend"]'));
await wait(120);
check('удаление просит подтверждение', /Точно\?/.test($('#friendList').textContent), '');
click($('#friendList [data-act="unfriend"]'));
await wait(300);
check('друг удалён в обе стороны', !friendsOf('42073869')['42073870'] && !friendsOf('42073870')['42073869'], '');
check('список пуст', /Пока никого/.test($('#friendList').textContent), '');

check('чистая консоль', errors.length === 0, errors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? '\nFAILED ' + failed.length + '/' + results.length
  : '\nALL PASS ' + results.length + '/' + results.length);
if (failed.length) process.exitCode = 1;
window.close();
