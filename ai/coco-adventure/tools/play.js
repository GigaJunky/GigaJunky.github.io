// Headless player: node tools/play.js adventures/x.json "cmd1" "cmd2" ...  (or a file of commands with -f)
require('../engine.js');
const fs = require('fs');
const [file, ...rest] = process.argv.slice(2);
let cmds = rest;
if (rest[0] === '-f') cmds = fs.readFileSync(rest[1], 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const adv = JSON.parse(fs.readFileSync(file, 'utf8'));
const warn = console.warn; let warnings = 0; console.warn = (...a) => { warnings++; warn('WARN', ...a); };
const quiet = process.env.QUIET;
const g = new GTA.Game(adv, { output: (t) => { if (!quiet) console.log(t); } });
Math.random = (() => { let s = 42; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
g.start();
for (const c of cmds) { if (!quiet) console.log('\n> ' + c); g.input(c); g.picture(); }
console.log(`\n== score ${g.state.score}/${adv.maxScore} turns ${g.state.turns} over=${g.state.over} warnings=${warnings}`);
