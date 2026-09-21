// Le duel de la salle : on défie un joueur présent dans la salle (même salon), il
// reçoit le défi où qu'il soit dans la salle, et une pièce tranche. Le gagnant
// prend les deux mises : aucun avantage de la maison, comme dans Discord.
import { balance, rand, settle, stake } from '../economy.js';
import { accepted, checkBet, presentIn, refuse } from './common.js';

export const timing = { expires: 60_000 };
const duels = new Map(); // id → duel
const newId = () => `${Date.now().toString(36)}${rand(1_000_000).toString(36)}`;

function close(duel, status) {
  clearTimeout(duel.timer);
  duel.status = status;
  duel.closedAt = Date.now();
  // On garde le duel une minute, le temps que les deux joueurs voient l'issue.
  setTimeout(() => duels.delete(duel.id), 60_000).unref();
}

async function refundChallenger(duel, status) {
  if (duel.status !== 'attente') return;
  close(duel, status);
  await settle(duel.from.id, duel.bet, duel.bet); // mise rendue, sans gain ni perte
}

const publicDuel = (duel, userId) => ({
  id: duel.id,
  from: duel.from.name,
  to: duel.to.name,
  mine: duel.from.id === userId,
  bet: duel.bet,
  status: duel.status,
  expiresAt: duel.expiresAt,
  result: duel.result ? { side: duel.result.side, winner: duel.result.winnerName, iWon: duel.result.winnerId === userId } : null,
});

/** Les défis qui attendent ce joueur, où qu'il soit dans la salle (pour la fenêtre d'invitation). */
export function incomingFor(roomId, userId) {
  return [...duels.values()].filter((duel) => duel.roomId === roomId && duel.to.id === userId && duel.status === 'attente').map((duel) => publicDuel(duel, userId));
}

export async function view(roomId, user) {
  const mine = [...duels.values()].filter((duel) => duel.roomId === roomId && (duel.from.id === user.id || duel.to.id === user.id));
  return {
    now: Date.now(),
    me: { balance: await balance(user.id) },
    present: presentIn(roomId).filter((entry) => entry.id !== user.id).map(({ id, name }) => ({ id, name })),
    duels: mine.sort((a, b) => b.created - a.created).slice(0, 6).map((duel) => publicDuel(duel, user.id)),
  };
}

export async function act(roomId, user, { action, to, bet, id }) {
  if (action === 'defier') {
    const target = presentIn(roomId).find((entry) => entry.id === to);
    if (!target || target.id === user.id) return refuse('Ce joueur n’est plus dans la salle.');
    if ([...duels.values()].some((duel) => duel.from.id === user.id && duel.status === 'attente')) return refuse('Tu as déjà un défi en attente.');
    const refusal = await checkBet(user.id, bet);
    if (refusal) return refuse(refusal);
    if ((await stake(user.id, bet)) === null) return refuse('Solde insuffisant.');
    const duel = {
      id: newId(),
      roomId,
      from: { id: user.id, name: user.name },
      to: { id: target.id, name: target.name },
      bet,
      status: 'attente',
      created: Date.now(),
      expiresAt: Date.now() + timing.expires,
    };
    duel.timer = setTimeout(() => refundChallenger(duel, 'expire').catch(() => {}), timing.expires);
    duel.timer.unref();
    duels.set(duel.id, duel);
    return accepted({ id: duel.id });
  }

  const duel = duels.get(id);
  if (!duel || duel.roomId !== roomId) return refuse('Ce défi n’existe plus.');
  if (duel.status !== 'attente') return refuse('Ce défi est déjà terminé.');

  if (action === 'annuler') {
    if (duel.from.id !== user.id) return refuse('Ce n’est pas ton défi.');
    await refundChallenger(duel, 'annule');
    return accepted();
  }
  if (duel.to.id !== user.id) return refuse('Ce défi ne t’est pas adressé.');
  if (action === 'refuser') {
    await refundChallenger(duel, 'refuse');
    return accepted();
  }
  if (action === 'accepter') {
    if ((await stake(user.id, duel.bet)) === null) return refuse(`Il te faut ${duel.bet.toLocaleString('fr-FR')} jetons pour relever ce défi.`);
    // Le défi a pu expirer pendant qu'on prélevait : la mise est rendue.
    if (duel.status !== 'attente') {
      await settle(user.id, duel.bet, duel.bet);
      return refuse('Ce défi vient d’expirer.');
    }
    // Pile : le défieur gagne ; face : le défié.
    const side = rand(2) === 0 ? 'pile' : 'face';
    const winner = side === 'pile' ? duel.from : duel.to;
    const loser = side === 'pile' ? duel.to : duel.from;
    close(duel, 'fini');
    await settle(winner.id, duel.bet * 2, duel.bet);
    await settle(loser.id, 0, duel.bet);
    duel.result = { side, winnerId: winner.id, winnerName: winner.name };
    return accepted();
  }
  return refuse('Action inconnue.');
}

export const activity = () => 0;
export function resetDuels() {
  for (const duel of duels.values()) clearTimeout(duel.timer);
  duels.clear();
}
