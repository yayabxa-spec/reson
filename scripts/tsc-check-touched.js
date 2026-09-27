// 针对我改动过的文件，逐条核对错误信息是否在基线中已存在（按错误消息文本匹配）
const fs = require('fs');
const cur = fs.readFileSync('E:/RE-SON_work_20260827_004629/tsc-current.txt', 'utf8');
const base = fs.readFileSync('E:/RE-SON_work_20260827_004629/tsc-errors.txt', 'utf8');

const touched = [
  'app/anim/',
  'app/utils/haptics',
  'app/_layout.tsx',
  '(tabs)/_layout.tsx',
  'app/component/base/TouchableOpacity',
  'app/pages/chats/component/ChatList.tsx',
  'ConvoLongPressMenu.tsx',
  'PlusMenu.tsx',
  'app/pages/chats/index.tsx',
  'app/component/business/MsgReceiver/index.tsx',
  'app/pages/chats/msg-chats/component/ChatList.tsx',
  'app/component/business/MsgActionMenu.tsx',
  'app/pages/chats/msg-chats/index.tsx',
  'app/pages/discover/moments/index.tsx',
  'app/pages/discover/index.tsx',
  'app/pages/contacts/screens/friend-info/index.tsx',
];

function errsOf(text) {
  return text.split('\n').filter((l) => l.includes(': error TS'));
}

const curErrs = errsOf(cur).filter((l) => touched.some((t) => l.replace(/\\/g, '/').includes(t)));
console.log('改动文件中的错误数:', curErrs.length, '\n');

// 错误消息归一：文件路径去掉、行号去掉、消息截前 90 字符
const norm = (l) => l.split(': error TS')[1].slice(0, 90);
const baseMsgs = new Set(errsOf(base).map(norm));

for (const e of curErrs) {
  const f = e.replace(/\\/g, '/');
  const n = norm(e);
  const known = baseMsgs.has(n);
  console.log((known ? '[基线已有] ' : '[★需人工确认] ') + f.split('/').slice(-2).join('/') + ' :: error TS' + n);
}
