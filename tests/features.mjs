import { load, wait } from './harness.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));
}

const writes = [];
const fake = { mode: 'grant' };
const tracks = [];

function makePC() {
  return class FakePC {
    constructor(cfg) { this.cfg = cfg; this.closed = false; }
    addTrack(track) { this.track = track; }
    async createOffer() { return { type: 'offer', sdp: 'v=0 fake offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0 fake answer' }; }
    async setLocalDescription(dsc) { this.localDescription = dsc; }
    async setRemoteDescription(dsc) { this.remoteDescription = dsc; }
    async addIceCandidate(c) { this.candidate = c; }
    close() { this.closed = true; }
  };
}

const { dom, errors } = load(undefined, {
  beforeParse: (w) => {
    w.fetch = undefined;
    w.RTCPeerConnection = makePC();
    w.HTMLMediaElement.prototype.play = () => Promise.resolve();
    w.HTMLMediaElement.prototype.pause = () => {};
    const stream = { getTracks: () => tracks, getAudioTracks: () => tracks };
    Object.defineProperty(w.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (fake.mode === 'deny') {
            const err = new Error('Permission denied');
            err.name = 'NotAllowedError';
            throw err;
          }
          return stream;
        },
      },
    });
    const setItem = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function (key, value) {
      writes.push({ key, value: String(value) });
      return setItem.call(this, key, value);
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
const esc = (ev) => d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const toasts = () => $$('.toast').map((t) => t.textContent);
const roomsLS = () => JSON.parse(window.localStorage.getItem('mx_rooms') || '{}');
const roomId = () => Object.keys(roomsLS())[0];

function patchRoomLS(mut) {
  const rooms = roomsLS();
  const id = Object.keys(rooms)[0];
  mut(rooms[id], id);
  window.localStorage.setItem('mx_rooms', JSON.stringify(rooms));
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'mx_rooms' }));
}

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
type($('#fName'), 'ХВХ дуэль');
$('#fMode').value = '1x1';
submit($('#roomForm'));
await wait(300);
check('комната 1x1 создана', $$('[data-room-open]').length === 1, '');

patchRoomLS((room) => {
  room.players['42073870'] = { id: '42073870', nick: 'Bolt_22', at: Date.now(), ready: false };
});
await wait(150);

/* ---------- чат ---------- */
check('чат доступен участнику', !!$('#chatInput') && !$('#chatInput').disabled, '');
type($('#chatInput'), 'привет, готов?');
submit($('#chatForm'));
await wait(250);
let texts = $$('.chat-text').map((el) => el.textContent);
check('сообщение появилось', texts.length === 1 && texts[0] === 'привет, готов?', JSON.stringify(texts));

await wait(800);
type($('#chatInput'), '<img src=x onerror="window.__xss=1">');
submit($('#chatForm'));
await wait(250);
texts = $$('.chat-text').map((el) => el.textContent);
check('текст экранируется', texts.length === 2 && texts[1] === '<img src=x onerror="window.__xss=1">', '');
check('XSS не выполнился', window.__xss === undefined && $$('.chat-list img').length === 0, '');

type($('#chatInput'), 'спам');
submit($('#chatForm'));
await wait(200);
check('антифлуд', $$('.chat-text').length === 2 && toasts().some((t) => t === 'Не так быстро'), '');

await wait(350);
click($('.chat-del'));
await wait(200);
check('своё сообщение удалено', $$('.chat-text').length === 1, 'осталось: ' + $$('.chat-text').length);

patchRoomLS((room) => {
  room.messages.mB = { uid: '42073870', nick: 'Bolt_22', text: 'и тебе привет', at: Date.now() };
});
await wait(200);
const rows = $$('.chat-msg');
check('чужое сообщение без кнопки удаления', rows.length && !rows[rows.length - 1].querySelector('.chat-del'), '');

/* ---------- статус и голосование ---------- */
check('до готовности бейдж лобби', /лобби/.test($('.card .badge--lobby') ? $('.card .badge--lobby').textContent : ''), '');
click($('[data-act="ready"]'));
await wait(200);
patchRoomLS((room) => { room.players['42073870'].ready = true; });
await wait(250);
check('все готовы → «в игре»', !!$('.card .badge--game') && $('.card .badge--game').textContent === 'в игре', $('.card .badge--game') ? $('.card .badge--game').textContent : '');
check('баннер «в игре»', /команда в игре/.test($('.banner') ? $('.banner').textContent : ''), '');

const voteA = () => $('[data-act="vote"][data-side="A"]');
const voteB = () => $('[data-act="vote"][data-side="B"]');
click(voteA());
await wait(220);
check('голос A отмечен', voteA() && voteA().classList.contains('is-voted'), '');
click(voteB());
await wait(220);
check('голос можно поменять', voteB() && voteB().classList.contains('is-voted'), '');

click(voteA());
await wait(220);
patchRoomLS((room) => {
  room.result = room.result || { votes: {}, winner: '', settledAt: 0 };
  room.result.votes = Object.assign({}, room.result.votes, { '42073870': 'A' });
});
await wait(400);
check('единогласие фиксирует результат', /победа команды A/.test($('.banner') ? $('.banner').textContent : ''), '');
check('победа в профиле', /1 победа/.test($('.me-nick') ? $('.me-nick').parentNode.textContent : ''), '');

const newMatch = $('[data-act="new-match"]');
check('хост видит «Реванш»', !!newMatch && newMatch.textContent === 'Реванш', '');
click(newMatch);
await wait(300);
check('реванш сбрасывает результат', !/победа команды/.test($('.banner') ? $('.banner').textContent : ''), '');

/* ---------- смена ника в комнате ---------- */
// закрываем комнату, чтобы добраться до шапки
esc();
await wait(120);
click($('.me-nick-btn'));
await wait(120);
type($('#nickInput'), 'Тихий Вихрь');
submit($('#nickForm'));
await wait(300);
check('ник сменился', $('.me-nick').textContent === 'Тихий Вихрь', $('.me-nick').textContent);
check('ник обновлён в слоте комнаты', /Тихий Вихрь/.test(JSON.stringify(roomsLS())), '');
check('панель показывает новый ник', /Тихий Вихрь/.test($('#roomOverlay').textContent), '');

click($('[data-act="overlay-open"]'));
await wait(200);
check('панель открывает комнату', !!$('#modal .dialog') && /Тихий Вихрь/.test($('#modal').textContent), '');
type($('#chatInput'), 'с новым ником');
await wait(1100);
submit($('#chatForm'));
await wait(300);
const lastMsg = $$('.chat-msg').pop();
check('новое сообщение под новым ником', /Тихий Вихрь/.test(lastMsg ? lastMsg.textContent : ''), lastMsg ? lastMsg.textContent.slice(0, 40) : '');

/* ---------- голос ---------- */
fake.mode = 'deny';
click($('[data-act="voice-start"]'));
await wait(300);
check('отказ микрофона', toasts().some((t) => /не дал доступ к микрофону/.test(t)), '');
check('статус после отказа', /нет доступа к микрофону/.test($('#voiceStatus') ? $('#voiceStatus').textContent : ''), '');

fake.mode = 'grant';
tracks.push({ enabled: true, kind: 'audio', stop() { this.stopped = true; } });
click($('[data-act="voice-start"]'));
await wait(300);
check('голос включён', /микрофон вкл\./.test($('#voiceStatus') ? $('#voiceStatus').textContent : ''), '');
const voiceLS = () => (roomsLS()[roomId()] || {}).voice || {};
check('hello записан', Object.keys(voiceLS()).some((k) => voiceLS()[k].kind === 'hello'), '');

patchRoomLS((room) => {
  room.voice.vB1 = { from: 'zzz', to: '', kind: 'hello', nick: 'Bolt_22', sdp: '', candidate: null, at: Date.now() };
});
await wait(1500);
check('на чужой hello уходит offer', Object.keys(voiceLS()).some((k) => voiceLS()[k].kind === 'offer' && voiceLS()[k].to === 'zzz'), '');

click($('[data-act="voice-mute"]'));
await wait(200);
check('mute выключает микрофон', /микрофон выкл\./.test($('#voiceStatus').textContent) && tracks[tracks.length - 1].enabled === false, '');

esc();
await wait(300);
check('голос живёт после закрытия комнаты', /микрофон выкл\./.test($('#roomOverlay').textContent), $('#roomOverlay').textContent.slice(0, 80));
check('в панели есть кнопка микрофона', !!$('#roomOverlay [data-act="voice-mute"]'), '');
click($('#roomOverlay [data-act="voice-mute"]'));
await wait(200);
check('mute возвращает микрофон из панели', tracks[tracks.length - 1].enabled === true, '');
check('состояние в панели обновилось', /в голосе/.test($('#roomOverlay').textContent), '');
check('окно закрылось', $('#modal').hidden === true, '');
check('панель осталась на странице', $('#roomOverlay').hidden === false, '');
window.dispatchEvent(new window.Event('pagehide'));
await wait(300);
check('закрытие вкладки отправляет bye', writes.some((w) => w.key === 'mx_rooms' && w.value.indexOf('"kind":"bye"') >= 0), '');
check('микрофон освобождён', tracks[tracks.length - 1].stopped === true, '');
check('чистая консоль', errors.length === 0, errors.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok).length;
console.log('\n' + (failed ? 'FAILED ' + failed + '/' + results.length : 'ALL PASS ' + results.length + '/' + results.length));
window.close();
process.exit(failed ? 1 : 0);
