import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildFriendSearchFields, parseFriendSearchQuery, resultScore } = require('../functions/friend-search');

const profile = buildFriendSearchFields(
  {
    displayName: 'Müller Weiß',
    username: 'mueller.weiss',
    initials: 'MW',
  },
  'anyone',
);

assert.equal(profile.discoverable, true);
assert.ok(profile.searchPrefixes.includes('mull'));
assert.ok(profile.searchPrefixes.includes('muel'));
assert.ok(profile.searchPrefixes.includes('weis'));
assert.equal(buildFriendSearchFields({ ...profile }, 'nobody').discoverable, false);

const query = parseFriendSearchQuery('Müll');
assert.equal(query.valid, true);
assert.ok(resultScore(profile, query) >= 0);
assert.equal(parseFriendSearchQuery('ab').valid, false);
const shortHandle = buildFriendSearchFields(
  { displayName: 'Ada Beispiel', username: 'ab', initials: 'AB' },
  'anyone',
);
const shortHandleQuery = parseFriendSearchQuery('@ab');
assert.equal(shortHandleQuery.valid, true);
assert.ok(shortHandle.searchPrefixes.includes('ab'));
assert.ok(resultScore(shortHandle, shortHandleQuery) >= 0);

console.log('friend search normalization and index fields: OK');
