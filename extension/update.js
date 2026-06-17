(function exposeUpdate(root) {
  const releaseApiUrl = 'https://api.github.com/repos/malyarq/market-trat/releases/latest';
  const categoryPackApiUrl = 'https://api.github.com/repos/malyarq/market-trat/contents/extension/category-rules.json?ref=main';
  const latestReleaseUrl = 'https://github.com/malyarq/market-trat/releases/latest';

  function normalizeVersion(value) {
    return String(value || '').trim().replace(/^v/i, '');
  }

  function compareVersions(left, right) {
    const leftParts = normalizeVersion(left).split('.').map((part) => Number(part) || 0);
    const rightParts = normalizeVersion(right).split('.').map((part) => Number(part) || 0);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
      const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  function isNewerVersion(latest, current) {
    return compareVersions(latest, current) > 0;
  }

  function decodeBase64Utf8(value) {
    const clean = String(value || '').replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf8');
    const binary = root.atob(clean);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function parseGithubContentJson(json) {
    return JSON.parse(decodeBase64Utf8(json?.content || ''));
  }

  const exported = {
    releaseApiUrl,
    categoryPackApiUrl,
    latestReleaseUrl,
    normalizeVersion,
    compareVersions,
    isNewerVersion,
    parseGithubContentJson
  };

  root.MarketTratUpdate = exported;
  if (typeof module !== 'undefined') module.exports = exported;
})(typeof globalThis !== 'undefined' ? globalThis : window);
