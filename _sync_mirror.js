/* _sync_mirror.js —— 把镜像 main 同步到指定的上游提交（沿用「同步提交」模式）
 *
 * 背景：镜像 main 是自建的同步提交（树＝上游 ＋ ib-ver.html），与上游那枚 commit
 *  不同sha ⇒ 不能走 PATCH ref 快进，必须走 trees/commit API 建一个新提交。
 *
 * 用法：node _sync_mirror.js <上游commit> [repo] [上游repo]
 *   默认 repo=PasleySage/InternalBeyond-Mobile，上游 repo=Sui-IB/InternalBeyond-Mobile
 *
 * 步骤：回读镜像 main →（可选）确认基线→ 以**上游 tree** 为 base_tree，只补镜像专属文件
 *      → 建 commit（parent＝当前镜像 main）→ 快进 ref（PATCH，非 force）→ 回读确认。
 * 注意：PATCH 前会再读一次 main，若已被别人推进则报错退出，不覆盖。
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execSync } = require('child_process');
const upCommit = process.argv[2];
const repo = process.argv[3] || 'PasleySage/InternalBeyond-Mobile';
const upRepo = process.argv[4] || 'Sui-IB/InternalBeyond-Mobile';
/** 镜像专属文件（上游没有，只在镜像这边保留） */
const FORK_ONLY = ['ib-ver.html'];
if (!upCommit) { console.error('用法：node _sync_mirror.js <上游commit> [repo] [上游repo]'); process.exit(1); }
if (!process.env.GH_CONFIG_DIR) process.env.GH_CONFIG_DIR = 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ibsync-'));
function ghRetry(cmd) {
  let last;
  for (let i = 1; i <= 3; i++) {
    try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 28, env: process.env }); }
    catch (e) { last = e; if (i < 3) console.log('（第 ' + i + ' 次 gh 调用失败，重试）'); }
  }
  throw last;
}
const gh = a => ghRetry('gh api ' + a).trim();
const ghIn = (a, f) => ghRetry('gh api ' + a + ' --input "' + f + '"');
const api = p => JSON.parse(gh('-H "Accept: application/vnd.github+json" /repos/' + repo + p));
const apiUp = p => JSON.parse(gh('-H "Accept: application/vnd.github+json" /repos/' + upRepo + p));

try {
  /* ── 1. 读当前状态 ── */
  const before = api('/commits/main');
  const curMain = before.sha;
  const upC = apiUp('/commits/' + upCommit);
  const upTree = upC.commit.tree.sha;
  console.log('镜像 main（当前 parent）= ' + curMain);
  console.log('上游目标 ' + upCommit.slice(0, 8) + ' tree = ' + upTree + '（' + upC.commit.message.split('\n')[0] + '）');

  /* 已是目标？直接退出，避免造空提交 */
  const curTree = before.commit.tree.sha;
  if (curTree === upTree) { console.log('镜像树已等于上游目标，无需同步'); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); }

  /* ── 2. 以「上游 tree」为 base，只补镜像专属文件 ── */
  const entries = [];
  for (const p of FORK_ONLY) {
    try {
      const b = api('/contents/' + p + '?ref=main');
      entries.push({ path: p, mode: '100644', type: 'blob', sha: b.sha });
      console.log('保留镜像专属 ' + p + '（blob ' + b.sha.slice(0, 8) + '）');
    } catch (e) { console.log('镜像没有 ' + p + '，跳过'); }
  }
  const bt = path.join(tmp, 'tree.json');
  fs.writeFileSync(bt, JSON.stringify({ base_tree: upTree, tree: entries }), 'utf8');
  const newTree = JSON.parse(ghIn('-X POST /repos/' + repo + '/git/trees', bt)).sha;
  console.log('新 tree = ' + newTree + '（base＝上游 tree，补 ' + entries.length + ' 个镜像专属文件）');

  /* ── 3. 建 commit ── */
  const msg = '同步上游 ' + upRepo.replace(/^.*\//, '') + ' ' + upCommit.slice(0, 7) + '：' +
    upC.commit.message.split('\n')[0] + '\n\n' +
    '树＝上游 ' + upCommit.slice(0, 8) + ' ＋ 镜像专属 ' + FORK_ONLY.join('、') + '。\n' +
    '零本地补丁：与上游逐文件 blob 全等。变更详见 docs/briefs/ 下的 IB-upstream-*变更一览。';
  const bc = path.join(tmp, 'commit.json');
  fs.writeFileSync(bc, JSON.stringify({ message: msg, tree: newTree, parents: [curMain] }), 'utf8');
  const newCommit = JSON.parse(ghIn('-X POST /repos/' + repo + '/git/commits', bc)).sha;
  console.log('新 commit = ' + newCommit);

  /* ── 4. 快进 ref（非 force；ref 未被别人推进就是 fast-forward） ── */
  const nowMain = api('/git/ref/heads/main').object.sha;
  if (nowMain !== curMain) { console.error('❌ 镜像 main 在建提交期间被推进（' + nowMain + ' ≠ ' + curMain + '），已中止，不覆盖'); process.exit(1); }
  const br = path.join(tmp, 'ref.json');
  fs.writeFileSync(br, JSON.stringify({ sha: newCommit, force: false }), 'utf8');
  const ref = JSON.parse(ghIn('-X PATCH /repos/' + repo + '/git/refs/heads/main', br));
  console.log('refs/heads/main → ' + ref.object.sha);

  /* ── 5. 回读确认（写操作必须回读核对） ── */
  const after = api('/commits/main');
  console.log('回读 main = ' + after.sha + (after.sha === newCommit ? ' ✅' : ' ❌ 与写入值不一致'));
  console.log('回读 tree = ' + after.commit.tree.sha + (after.commit.tree.sha === newTree ? ' ✅' : ' ❌'));
  const cmp = api('/compare/' + upCommit + '...main');
  console.log('compare 上游...main = ' + cmp.status + ' / ahead ' + cmp.ahead_by + ' / behind ' + cmp.behind_by);
  console.log('（镜像 main 恒与上游差 1 个 commit——那是同步提交本身，属正常）');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(after.sha === newCommit && after.commit.tree.sha === newTree ? 0 : 1);
} catch (e) {
  console.error('失败：' + String(e.message || e).slice(0, 400));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
}