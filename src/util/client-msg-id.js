const MAX_MOD = 2147483547;
const STEP = 100;

const stateBySeed = new Map();

function javaStringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function baseId(timeMillis, deviceHash) {
  const base = Math.floor((timeMillis % MAX_MOD) / STEP) * STEP;
  return base + deviceHash;
}

function getState(seed) {
  const key = seed || '';
  let state = stateBySeed.get(key);
  if (!state) {
    const deviceHash = javaStringHash(key) % 100;
    const initial = baseId(Date.now(), deviceHash);
    state = {
      deviceHash,
      lastId: initial,
      lastGenId: initial,
    };
    stateBySeed.set(key, state);
  }
  return state;
}

function nextClientMsgId(seed, timeMillis = Date.now()) {
  const state = getState(seed);
  const gen = baseId(timeMillis, state.deviceHash);

  if (gen <= state.lastId && gen >= state.lastGenId) {
    let next = state.lastId + STEP;
    if (next > 2147483647) {
      next = baseId(next, state.deviceHash);
    }
    state.lastId = next;
    state.lastGenId = gen;
    return state.lastId;
  }

  state.lastId = gen;
  state.lastGenId = gen;
  return state.lastId;
}

module.exports = { nextClientMsgId };
