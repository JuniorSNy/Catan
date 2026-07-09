// ck 模式模糊测试：随机动作跑若干局，验证状态机不抛非游戏错误
import { Game } from '../server/game.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const ALL = [...RES, 'cloth', 'coin', 'paper'];

for (let seed = 1; seed <= 30; seed++) {
  const rng = seeded(seed);
  const rnd = (n) => Math.floor(rng() * n);
  const g = new Game([{ name: 'A' }, { name: 'B' }, { name: 'C' }], seeded(seed + 999), 0, 'ck');
  // 初始放置
  while (g.phase === 'setup') {
    const p = g.currentSetupPlayer();
    const vs = g.validSettlementVertices(p, true);
    const v = vs[rnd(vs.length)];
    g.placeSetupSettlement(p, v);
    const es = g.validRoadEdges(p, v);
    g.placeSetupRoad(p, es[rnd(es.length)]);
  }
  let steps = 0;
  try {
    while (g.phase === 'play' && steps++ < 3000) {
      const p = g.turn.player;
      const st = g.turn.state;
      if (st === 'preroll') {
        g.roll(p);
      } else if (st === 'discard') {
        const i = Number(Object.keys(g.turn.pendingDiscards)[0]);
        const need = g.turn.pendingDiscards[i];
        const sel = Object.fromEntries(ALL.map((r) => [r, 0]));
        let left = need;
        for (const r of ALL) {
          const take = Math.min(left, g.players[i].hand[r]);
          sel[r] = take; left -= take;
        }
        g.discard(i, sel);
      } else if (st === 'robber') {
        const hexes = g.board.hexes.filter((h) => h.id !== g.robber);
        g.moveRobber(p, hexes[rnd(hexes.length)].id);
      } else if (st === 'steal') {
        g.steal(p, g.turn.stealTargets[0]);
      } else if (st === 'aqueduct') {
        const i = g.turn.pendingAqueduct[0];
        const r = RES.find((x) => g.bank[x] > 0);
        g.aqueductPick(i, r);
      } else if (st === 'barbarianLoss') {
        const i = Number(Object.keys(g.turn.pendingCityLoss)[0]);
        g.chooseCityLoss(i, g.turn.pendingCityLoss[i][0]);
      } else if (st === 'roadbuilding') {
        const es = g.validRoadEdges(p);
        if (es.length === 0) { g.turn.state = 'main'; g.turn.freeRoads = 0; continue; }
        g.buildRoad(p, es[rnd(es.length)]);
      } else if (st === 'main') {
        // 随机做 0-3 个动作再结束回合
        const acts = rnd(4);
        for (let a = 0; a < acts && g.turn.state === 'main' && g.phase === 'play'; a++) {
          const roll = rnd(8);
          try {
            if (roll === 0) {
              const spots = g.validKnightSpots(p);
              if (spots.length) {
                g.players[p].hand.sheep++; g.players[p].hand.ore++;
                g.buildKnight(p, spots[rnd(spots.length)]);
              }
            } else if (roll === 1) {
              const mine = Object.keys(g.knights).filter((v) => g.knights[v].player === p && !g.knights[v].active);
              if (mine.length) {
                g.players[p].hand.wheat++;
                g.activateKnight(p, Number(mine[0]));
              }
            } else if (roll === 2) {
              const t = ['trade', 'politics', 'science'][rnd(3)];
              const com = { trade: 'cloth', politics: 'coin', science: 'paper' }[t];
              g.players[p].hand[com] += 5;
              g.buyImprovement(p, t);
            } else if (roll === 3) {
              const es = g.validRoadEdges(p);
              if (es.length && g.players[p].pieces.road > 0) {
                g.players[p].hand.wood++; g.players[p].hand.brick++;
                g.buildRoad(p, es[rnd(es.length)]);
              }
            } else if (roll === 4) {
              const vs = g.validSettlementVertices(p, false);
              if (vs.length && g.players[p].pieces.settlement > 0) {
                g.players[p].hand.wood++; g.players[p].hand.brick++;
                g.players[p].hand.sheep++; g.players[p].hand.wheat++;
                g.buildSettlement(p, vs[rnd(vs.length)]);
              }
            } else if (roll === 5) {
              const cs = g.validCityVertices(p);
              if (cs.length && g.players[p].pieces.city > 0) {
                g.players[p].hand.wheat += 2; g.players[p].hand.ore += 3;
                g.buildCity(p, cs[rnd(cs.length)]);
              }
            } else if (roll === 6) {
              const walls = g.ownCityVertices(p).filter((v) => g.walls[v] === undefined);
              if (walls.length && g.wallCountOf(p) < 3) {
                g.players[p].hand.brick += 2;
                g.buildWall(p, walls[0]);
              }
            } else if (roll === 7) {
              // 打一张手里的进步卡（无 payload 的类型）
              const simple = g.players[p].progressCards.find((c) => ['warlord', 'crane', 'irrigation', 'mining', 'commercialHarbor', 'wedding', 'saboteur', 'roadBuilding'].includes(c.type));
              if (simple) g.playProgress(p, simple.type);
            }
          } catch (e) {
            if (!e.isGameError) throw e;
          }
        }
        if (g.turn.state === 'main' && g.phase === 'play') g.endTurn(p);
      } else {
        throw new Error(`未知状态 ${st}`);
      }
      // 序列化不应抛错
      g.publicState();
      g.privateState(0); g.privateState(1); g.privateState(2);
    }
  } catch (e) {
    if (!e.isGameError) {
      console.error(`seed ${seed} 第 ${steps} 步崩溃（state=${g.turn.state}）:`, e);
      process.exit(1);
    }
  }
  const w = g.winner === null ? '未分胜负' : `${g.players[g.winner].name} 胜（${g.victoryPoints(g.winner, true)}分）`;
  console.log(`seed ${seed}: ${steps} 步，野蛮人来袭 ${g.barbarians.attacks} 次，${w}`);
}
console.log('模糊测试通过 ✅');
