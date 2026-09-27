// 对比当前 tsc 输出与基线 tsc-errors.txt，找出新增错误（忽略行列号）
// 基线是相对路径（app/...），当前是绝对路径，统一截取 app/ 以后的部分对比
const fs = require('fs');

const CUR = 'E:/RE-SON_work_20260827_004629/tsc-current.txt';
const BASE = 'E:/RE-SON_work_20260827_004629/tsc-errors.txt';

function normFile(p) {
  let s = p.replace(/\\/g, '/').toLowerCase();
  const i = s.lastIndexOf('/app/');
  if (i >= 0) s = s.slice(i + 1);
  else if (s.startsWith('app/')) s = s;
  return s;
}

function sig(text) {
  const errs = [];
  for (const line of text.split('\n')) {
    const i = line.indexOf(': error TS');
    if (i === -1) continue;
    const m = line.match(/^([^()]+)\((\d+),(\d+)\):/);
    const file = normFile(m ? m[1] : line.slice(0, i));
    errs.push(file + ' :: ' + line.slice(i + 2, i + 150));
  }
  return errs;
}

const cur = sig(fs.readFileSync(CUR, 'utf8'));
const base = new Set(sig(fs.readFileSync(BASE, 'utf8')));
console.log('当前错误数:', cur.length, '| 基线错误数:', base.size);

const only = cur.filter((s) => !base.has(s));
console.log('--- 新增错误（基线没有，共 ' + only.length + ' 条）---');
for (const l of only.slice(0, 60)) console.log(l);
const gone = [...base].filter((s) => !cur.includes(s));
console.log('--- 已消失的基线错误（共 ' + gone.length + ' 条，仅供了解）---');
