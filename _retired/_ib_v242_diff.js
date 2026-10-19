const { execSync } = require('child_process');
const fs = require('fs');
const env = Object.assign({}, process.env, { GH_CONFIG_DIR: 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI' });
const UP = 'Sui-IB/InternalBeyond-Mobile';
const BASE = '27d87d6ef94129883fc28e5796a078e87db72ecf';
const HEAD = 'eae90dec299d';
const gh = (a) => { try { return execSync('gh ' + a, { env, encoding: 'utf8', maxBuffer: 1 << 27 }).trim(); } catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 200); } };
const out = [];
const cp = JSON.parse(gh('api repos/' + UP + '/compare/' + BASE + '...' + HEAD));
(cp.files || []).forEach(f => {
  out.push('### ' + f.filename + '  +' + f.additions + '/-' + f.deletions);
  (f.patch || '(无 patch)').split('\n').forEach(l => {
    if (l.startsWith('@@')) out.push('\n' + l);
    else if (l.startsWith('+') && !l.startsWith('+++')) out.push('  + ' + (l.length > 400 ? l.slice(1, 401) + ' …' : l.slice(1)));
    else if (l.startsWith('-') && !l.startsWith('---')) out.push('  - ' + (l.length > 160 ? l.slice(1, 161) + ' …' : l.slice(1)));
  });
});
fs.writeFileSync(__dirname + '/_ib_v242_diff.txt', out.join('\n'), 'utf8');
console.log('done');
