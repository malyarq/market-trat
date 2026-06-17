const assert = require('node:assert/strict');
const { compareVersions, isNewerVersion, normalizeVersion, parseGithubContentJson, updateHelpUrl } = require('./update.js');

assert.equal(normalizeVersion('v0.6.1'), '0.6.1');
assert.equal(compareVersions('0.10.0', '0.9.9') > 0, true);
assert.equal(compareVersions('0.6.0', '0.6'), 0);
assert.equal(isNewerVersion('0.6.1', '0.6.0'), true);
assert.equal(isNewerVersion('0.6.0', '0.6.0'), false);
assert.ok(updateHelpUrl.includes('market-trat#'));
assert.deepEqual(parseGithubContentJson({
  content: Buffer.from(JSON.stringify({ rules: [{ category: 'Дом', tokens: ['тест'] }] })).toString('base64')
}), { rules: [{ category: 'Дом', tokens: ['тест'] }] });
