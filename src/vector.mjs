const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export function terms(text) {
  const words = (text.toLowerCase().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[a-z0-9_./-]+/gu) || []);
  const out = [];
  for (const word of words) {
    if (CJK.test(word)) {
      const chars = [...word];
      for (let i = 0; i < chars.length; i++) {
        if (chars.length === 1 || i < chars.length - 1) out.push(chars.slice(i, i + 2).join(''));
      }
    } else out.push(word);
  }
  return out;
}

function hash(text) {
  let h = 2166136261;
  for (const char of text) { h ^= char.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function vector(text) {
  const counts = new Map();
  for (const term of terms(text)) {
    const key = hash(term) % 2048;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const norm = Math.hypot(...counts.values()) || 1;
  return [...counts].map(([key, n]) => [key, n / norm]).sort((a, b) => a[0] - b[0]);
}

export function similarity(a, b) {
  let i = 0, j = 0, score = 0;
  while (i < a.length && j < b.length) {
    if (a[i][0] === b[j][0]) { score += a[i][1] * b[j][1]; i++; j++; }
    else if (a[i][0] < b[j][0]) i++;
    else j++;
  }
  return score;
}
