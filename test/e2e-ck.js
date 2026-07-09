// 「城市与骑士」端到端冒烟：两名玩家通过真实 Socket.IO 连接
// 选模式 → 初始放置（第二轮为城市）→ 随机玩若干回合（处理弃牌/强盗/引水渠/野蛮人毁城）
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const ALL = [...RES, 'cloth', 'coin', 'paper'];

function makeClient(name) {
  const socket = io(URL, { forceNew: true });
  const c = { name, socket, state: null, picking: null, index: -1, code: null, token: null };
  socket.on('state', (s) => { c.state = s; c.index = s.you.index; });
  socket.on('picking', (pk) => { c.picking = pk; });
  socket.on('joined', (d) => { c.code = d.code; c.token = d.token; c.index = d.index; });
  socket.on('gameError', ({ msg }) => console.log(`  [${name}] 错误提示: ${msg}`));
  return c;
}

async function until(fn, desc, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn()) return;
    await wait(50);
  }
  throw new Error(`超时: ${desc}`);
}

const A = makeClient('小明');
const B = makeClient('小红');
const clients = [A, B];
const byIndex = (i) => clients.find((c) => c.index === i);

// 1. 建房 + 加入
A.socket.emit('createRoom', { name: '小明' });
await until(() => A.code, 'A 创建房间');
B.socket.emit('joinRoom', { code: A.code, name: '小红', token: null });
await until(() => B.code, 'B 加入房间');
console.log(`✔ 房间 ${A.code}，两人已加入`);

// 2. 选模式（城市与骑士）+ 选颜色 + 开局
A.socket.emit('startGame');
await until(() => A.picking && B.picking, '进入选择阶段');
A.socket.emit('pickMode', { mode: 'ck' });
await until(() => B.picking?.mode === 'ck', '模式同步为城市与骑士');
console.log('✔ 房主选择「城市与骑士」，全员可见');
A.socket.emit('pickColor', { colorIdx: 0 });
B.socket.emit('pickColor', { colorIdx: 1 });
A.socket.emit('pickFirst', { index: 0 });
await until(() => A.picking?.players.every((p) => p.colorIdx !== null), '颜色选完');
A.socket.emit('pickConfirm');
await until(() => A.state && B.state, '游戏开始');
if (A.state.mode !== 'ck' || A.state.winGoal !== 13) throw new Error('模式/胜利目标不对');
if (!('cloth' in A.state.you.hand)) throw new Error('手牌缺少商品');
console.log('✔ ck 对局开始：13 分制，手牌含商品');

// 3. 初始放置（第二轮应为城市）
let sawCitySetup = false;
while (true) {
  const st = A.state;
  if (st.phase !== 'setup') break;
  const cur = byIndex(st.setup.current);
  await until(() => cur.state.phase !== 'setup'
    || cur.state.setup.current === cur.index, '轮到当前玩家');
  const s = cur.state;
  if (s.phase !== 'setup') break;
  if (s.setup.awaiting === 'settlement') {
    if (s.setup.building === 'city') sawCitySetup = true;
    cur.socket.emit('action', { type: 'setupSettlement', vertex: s.you.hints.settlements[0] });
  } else {
    cur.socket.emit('action', { type: 'setupRoad', edge: s.you.hints.roads[0] });
  }
  const before = s.log[s.log.length - 1]?.seq;
  await until(() => cur.state.log[cur.state.log.length - 1]?.seq !== before, '放置生效');
}
if (!sawCitySetup) throw new Error('第二轮初始放置不是城市');
const cities = Object.values(A.state.buildings).filter((b) => b.type === 'city').length;
if (cities !== 2) throw new Error(`应有 2 座初始城市，实际 ${cities}`);
console.log('✔ 初始放置完成：每人 1 村庄 + 1 城市');

// 4. 玩若干回合：处理各种中间状态
let knightBuilt = false;
let sawEventDie = false;
for (let turn = 0; turn < 60 && A.state.phase === 'play'; ) {
  const st = A.state;
  const s = st.turn.state;
  const cur = byIndex(st.turn.player);
  const logSeq = st.log[st.log.length - 1]?.seq;
  const changed = () => A.state.log[A.state.log.length - 1]?.seq !== logSeq
    || A.state.turn.state !== s || A.state.phase !== 'play';

  if (s === 'preroll') {
    cur.socket.emit('action', { type: 'roll' });
  } else if (s === 'discard') {
    const idx = Number(Object.keys(st.turn.pendingDiscards)[0]);
    const c = byIndex(idx);
    const need = st.turn.pendingDiscards[idx];
    const sel = {};
    let left = need;
    for (const r of ALL) {
      const take = Math.min(left, c.state.you.hand[r] || 0);
      sel[r] = take; left -= take;
    }
    c.socket.emit('action', { type: 'discard', resources: sel });
  } else if (s === 'robber') {
    const hex = st.board.hexes.find((h) => h.id !== st.robber);
    cur.socket.emit('action', { type: 'moveRobber', hex: hex.id });
  } else if (s === 'steal') {
    cur.socket.emit('action', { type: 'steal', target: st.turn.stealTargets[0] });
  } else if (s === 'aqueduct') {
    const idx = st.ck.pendingAqueduct[0];
    byIndex(idx).socket.emit('action', { type: 'aqueductPick', res: 'wheat' });
  } else if (s === 'barbarianLoss') {
    const idx = st.ck.pendingCityLoss[0];
    const c = byIndex(idx);
    await until(() => (c.state.you.hints.cityLoss || []).length > 0, '收到毁城选项');
    c.socket.emit('action', { type: 'chooseCityLoss', vertex: c.state.you.hints.cityLoss[0] });
    console.log('✔ 野蛮人毁城：玩家选择了城市');
  } else if (s === 'main') {
    if (st.ck.eventDie) sawEventDie = true;
    // 有条件就招募一个骑士
    const hand = cur.state.you.hand;
    const spots = cur.state.you.hints.knightSpots || [];
    if (!knightBuilt && hand.sheep >= 1 && hand.ore >= 1 && spots.length > 0) {
      cur.socket.emit('action', { type: 'buildKnight', vertex: spots[0] });
      await until(() => Object.keys(A.state.ck.knights).length > 0, '骑士出现在棋盘');
      knightBuilt = true;
      console.log('✔ 招募骑士成功，全员状态同步');
    }
    cur.socket.emit('action', { type: 'endTurn' });
    turn++;
  } else if (s === 'ended') {
    break;
  }
  await until(changed, `状态推进(${s})`, 8000);
}
if (!sawEventDie) throw new Error('事件骰从未出现');
console.log(`✔ 跑完 ${A.state.turn.count} 个回合，野蛮人来袭 ${A.state.ck.barbarians.attacks} 次`);

// 5. 非法操作应被拒绝（由当前回合玩家发起，确保拿到 ck 专属报错）
if (A.state.phase === 'play') {
  const cur = byIndex(A.state.turn.player);
  let rejectMsg = null;
  cur.socket.once('gameError', ({ msg }) => { rejectMsg = msg; });
  cur.socket.emit('action', { type: 'buyDev' });
  await until(() => rejectMsg !== null, 'ck 模式购买发展卡被拒绝');
  if (!/没有发展卡/.test(rejectMsg)) throw new Error(`报错不符: ${rejectMsg}`);
  console.log('✔ ck 模式发展卡被正确拒绝');
}

console.log('\n城市与骑士冒烟测试通过 🎉');
process.exit(0);
