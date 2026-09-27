const fs = require('fs');
const s = fs.readFileSync('E:/RE-SON_work_20260827_004629/tsc-current.txt', 'utf8');
const lines = s.split('\n').filter((l) => l.includes('error TS'));
console.log('含 error TS 的行数:', lines.length);
const re = /^(.+?)\((\d+),(\d+)\): (error TS\d+:.*)$/;
let ok = 0;
for (const l of lines) {
  if (re.test(l.trim())) ok++;
}
console.log('regex 匹配行数:', ok);
console.log('样例:', JSON.stringify(lines[0].slice(0, 90)));
console.log('样例trim后匹配:', re.test(lines[0].trim()));
