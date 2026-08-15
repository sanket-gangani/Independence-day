/**
 * The education, hidden inside the reward.
 *
 * You do not answer a question to get one of these — you get one *because* you
 * took a pull. That is the whole difference between this and a quiz: the child
 * is being given something, not tested.
 *
 * Written to be told out loud by a parent to a seven-year-old.
 */
export const FACTS = [
  'The Ashoka Chakra has exactly 24 spokes — one for every hour of the day, so the wheel of the nation never stops turning.',
  'The tricolour was designed by Pingali Venkayya, a freedom fighter from Andhra Pradesh who also spoke fluent Japanese.',
  'Saffron stands for courage, white for truth and peace, and green for the land and everything that grows on it.',
  'By law, the flag must be made from khadi — hand-spun cloth. Almost all of it is woven in one district in Karnataka.',
  'India\'s first flag hoisting as a free country happened at midnight, not in the morning — 15 August 1947.',
  'The wheel on the flag comes from the Lion Capital at Sarnath, carved more than 2,000 years ago.',
  'Until 2002, ordinary citizens could not fly the flag at home. A businessman went to court to change that — and won.',
  'The flag is always raised briskly and lowered slowly. Rising is joy; lowering is respect.',
  'India\'s Constitution is the longest handwritten constitution in the world, and it was calligraphed, not printed.',
  '"Jana Gana Mana" takes 52 seconds to sing — the timing is written into the rules.',
  'The Indian flag has been to the summit of Everest, the floor of the ocean, and the surface of the Moon.',
  'Every state in India has its own official language list. The country recognises 22 of them.',
];

/**
 * Positional titles for the card. The first person in a community and the one
 * who tops the flag out both deserve a different line.
 */
export function cardCopy({ rank, count, target, name }) {
  const ordinal = ordinalise(rank);

  if (count >= target) {
    return { rank: 'You topped it out', title: `${name}, you raised it all the way` };
  }
  if (rank === 1) {
    return { rank: 'You are first', title: `${name} started the hoisting` };
  }
  if (count / target >= 0.5 && (count - 1) / target < 0.5) {
    return { rank: `You're the ${ordinal}`, title: 'Halfway up the pole' };
  }
  return { rank: `You're the ${ordinal}`, title: 'The flag is rising' };
}

function ordinalise(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function pickFact(index) {
  return FACTS[index % FACTS.length];
}
