const MAX_PREFIXES = 128;
const MIN_SEARCH_LENGTH = 3;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalise(value, { germanAliases = false } = {}) {
  if (typeof value !== 'string') return '';
  const prepared = germanAliases
    ? value.replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue').replace(/ß/g, 'ss')
    : value.replace(/ß/g, 'ss');
  return prepared
    .trim()
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function variants(value) {
  return unique([normalise(value), normalise(value, { germanAliases: true })]);
}

function tokens(value) {
  return variants(value).flatMap((variant) => variant.split(' ').filter(Boolean));
}

function prefixes(values, minLength = MIN_SEARCH_LENGTH) {
  const output = [];
  values.forEach((value) => {
    for (let length = minLength; length <= Math.min(value.length, 30); length += 1) {
      if (!output.includes(value.slice(0, length))) output.push(value.slice(0, length));
      if (output.length >= MAX_PREFIXES) return;
    }
  });
  return output;
}

function buildFriendSearchFields(profile, policy) {
  const username = typeof profile?.username === 'string' ? profile.username.trim().toLowerCase() : '';
  const displayName = typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
  const initials = typeof profile?.initials === 'string' ? profile.initials.trim() : '';
  if (!username || !displayName || !initials) return null;

  const usernameKeys = variants(username.replace(/[._-]+/g, ' '));
  const nameTokens = tokens(displayName);
  return {
    discoverable: policy === 'anyone',
    username,
    usernameKeys,
    displayName,
    initials,
    ...(typeof profile.avatarUrl === 'string' && profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    nameTokens,
    searchPrefixes: unique([...prefixes(usernameKeys, 2), ...prefixes(nameTokens)]).slice(
      0,
      MAX_PREFIXES,
    ),
  };
}

function parseFriendSearchQuery(value) {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  const explicitHandle = rawValue.startsWith('@');
  const raw = rawValue.replace(/^@+/, '');
  const queryTokens = tokens(raw);
  const lookupVariants = variants(queryTokens.at(-1) ?? '');
  const minLength = explicitHandle ? 2 : MIN_SEARCH_LENGTH;
  return {
    valid: lookupVariants.some((item) => item.length >= minLength),
    lookupVariants: lookupVariants.filter((item) => item.length >= minLength),
    queryTokens,
    exactUsername: normalise(raw.replace(/[._-]+/g, ' ')),
  };
}

function resultScore(profile, query) {
  const username = normalise(profile?.username?.replace?.(/[._-]+/g, ' ') ?? '');
  const displayName = normalise(profile?.displayName ?? '');
  const nameTokens = tokens(profile?.displayName ?? '');
  const matchesAllTokens = query.queryTokens.every(
    (token) => username.includes(token) || nameTokens.some((candidate) => candidate.startsWith(token)),
  );
  if (!matchesAllTokens) return -1;
  if (username === query.exactUsername) return 400;
  if (username.startsWith(query.exactUsername)) return 300;
  if (nameTokens.some((candidate) => candidate === query.exactUsername)) return 200;
  if (nameTokens.some((candidate) => candidate.startsWith(query.exactUsername))) return 100;
  return displayName.includes(query.exactUsername) ? 50 : 1;
}

module.exports = {
  buildFriendSearchFields,
  parseFriendSearchQuery,
  resultScore,
};
