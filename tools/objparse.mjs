// Minimal OBJ reader: returns flat triangle lists grouped by material (with group name per face).
import fs from 'fs';
export function readOBJ(file) {
  const V = [], VT = [], VN = [];
  const faces = []; // {g, m, v:[a,b,c], t:[...], n:[...]}
  let g = '', m = '';
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    switch (p[0]) {
      case 'v': V.push([+p[1], +p[2], +p[3]]); break;
      case 'vt': VT.push([+p[1], +p[2]]); break;
      case 'vn': VN.push([+p[1], +p[2], +p[3]]); break;
      case 'g': g = p.slice(1).join(' '); break;
      case 'usemtl': m = p[1]; break;
      case 'f': {
        const idx = p.slice(1).map((s) => s.split('/').map((x) => (x ? parseInt(x, 10) : 0)));
        const fix = (i, arr) => (i < 0 ? arr.length + i : i - 1);
        const ix = idx.map(([a, b, c]) => [fix(a, V), b ? fix(b, VT) : -1, c ? fix(c, VN) : -1]);
        for (let k = 1; k + 1 < ix.length; k++) faces.push({ g, m, c: [ix[0], ix[k], ix[k + 1]] });
        break;
      }
    }
  }
  return { V, VT, VN, faces };
}
