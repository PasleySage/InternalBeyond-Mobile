/* _deploy_ctx_ledger.js —— 把上下文账本功能版推为镜像 main 的 index.html（执行案 §二流程）
 *
 * 用法：node _deploy_ctx_ledger.js [本地功能版路径] [repo] [期望IB_VER] [用途标签]
 *   默认 本地=<本工作区>/.scratch/ib-ctx-ledger/out/IB-ctx-ledger-功能版.html
 *        repo=PasleySage/InternalBeyond-Mobile  期望IB_VER=v350-p  用途=上下文账本上线（非官方修改版）
 *   ⚠ 2026-10-18 v351-p 验证部署起：期望版本可传（如 v351-p）——底版换成上游新版时 in-app 版本随之变，
 *     守卫改为「本地 IB_VER 必须等于传入的期望值」，仍是不符即中止。
 *
 * 步骤：读 main 当前 sha（before）→ 功能版全文建 blob → 读 main 当前 tree(recursive)，
 *   只把 index.html 换成新 blob（其余条目 ib-ver.html 等原样）→ 建 tree → 建 commit
 *   （parent＝before，message 记版本号＋「非官方修改版」标注＋回滚锚点）→ PATCH ref
 *   （force=false；PATCH 前再读一次 ref，与 before 不符即中止防并发）→ 回读核对
 *   main sha／index.html blob sha／文件大小／IB_VER 维持 v350-p。
 *
 * 与 _sync_mirror.js（上游同步专用）互斥：本脚本是「对上号 app 的 main 直接推」。
 * 下次同步上游前须先台账化（台账＝.scratch/ib-ctx-ledger/out/改动一览.md）。
 */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execSync } = require('child_process');
const local = process.argv[2] || __dirname + '/.scratch/ib-ctx-ledger/out/IB-ctx-ledger-功能版.html';
const repo = process.argv[3] || 'PasleySage/InternalBeyond-Mobile';
const expectVer = process.argv[4] || 'v350-p';
const purpose = process.argv[5] || '上下文账本上线（非官方修改版）';
if (!process.env.GH_CONFIG_DIR) process.env.GH_CONFIG_DIR = 'C:\\Users\\20513\\AppData\\Roaming\\GitHub CLI';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ibdep-'));
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

try {
  /* ── 0. 本地功能版（明文 sha256＋字节大小，供回读与线上核对）── */
  const buf = fs.readFileSync(local);
  const localSha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const localSize = buf.length;
  const localB64 = buf.toString('base64');
  const localVer = (buf.toString('utf8').match(/IB_VER\s*=\s*'([^']+)'/) || [])[1] || '(未找到)';
  console.log('本地功能版：' + local + '（' + localSize + ' B，sha256 ' + localSha256.slice(0, 16) + '…，IB_VER=' + localVer + '）');
  if (localVer !== expectVer) { console.error('❌ IB_VER 不是 ' + expectVer + '（' + localVer + '），与传入期望不符，已中止'); process.exit(1); }

  /* ── 1. 读 main 当前 sha ── */
  const before = api('/commits/main');
  const curMain = before.sha, curTree = before.commit.tree.sha;
  console.log('main（部署前 parent）= ' + curMain + '（tree ' + curTree.slice(0, 8) + '）');

  /* ── 2. 功能版全文建 blob ── */
  const fb = path.join(tmp, 'blob.json');
  fs.writeFileSync(fb, JSON.stringify({ content: localB64, encoding: 'base64' }), 'utf8');
  const newBlob = JSON.parse(ghIn('-X POST /repos/' + repo + '/git/blobs', fb));
  console.log('新 blob = ' + newBlob.sha + '（' + localSize + ' B）');

  /* ── 3. 读 main 当前 tree，只换 index.html ── */
  const tree = api('/git/trees/' + curTree + '?recursive=1');
  const idx = (tree.tree || []).find(e => e.path === 'index.html');
  if (!idx) { console.error('❌ main tree 里没有 index.html，已中止'); process.exit(1); }
  console.log('待替换 index.html：blob ' + idx.sha.slice(0, 8) + '（' + (idx.size != null ? idx.size + ' B' : 'size 未知') + '）');
  const nt = path.join(tmp, 'tree.json');
  fs.writeFileSync(nt, JSON.stringify({ base_tree: curTree, tree: [{ path: 'index.html', mode: '100644', type: 'blob', sha: newBlob.sha }] }), 'utf8');
  const newTree = JSON.parse(ghIn('-X POST /repos/' + repo + '/git/trees', nt)).sha;
  console.log('新 tree = ' + newTree + '（base＝main 现 tree，仅换 index.html）');

  /* ── 4. 建 commit（message 带非官方修改版标注＋回滚锚点）── */
  const msg = [
    purpose + '：_ctxLedgerM 功能版 ' + localVer + '（IB_VER＝' + localVer + '）',
    '',
    '本提交把镜像 main 的 index.html 全文替换为上述功能版；树＝上一版 ＋ 仅换 index.html，',
    '其余条目（ib-sw.js／ib-ver.html 等）原样不动。许可：PolyForm Noncommercial 1.0.0 ——',
    '本仓库为「非官方修改版」，原仓库 Sui-IB/InternalBeyond-Mobile。',
    '台账：.scratch/ib-ctx-ledger/out/改动一览.md（R1–R3＋patch12–33＋§二十四 v351-p 重放＋§二十七 D17＋§二十八 D17.1＋§二十九 D18.1 全账）；桩测 119 过 0 败。',
    '回滚：node Android/_rollback_main.js ' + curMain + '（本提交 parent；另打 tag good-d171 指向它）。'
  ].join('\n');
  const bc = path.join(tmp, 'commit.json');
  fs.writeFileSync(bc, JSON.stringify({ message: msg, tree: newTree, parents: [curMain] }), 'utf8');
  const newCommit = JSON.parse(ghIn('-X POST /repos/' + repo + '/git/commits', bc));
  console.log('新 commit = ' + newCommit.sha);

  /* ── 5. 快进 ref（非 force；PATCH 前再读一次防并发）── */
  const nowMain = api('/git/ref/heads/main').object.sha;
  if (nowMain !== curMain) { console.error('❌ main 在建提交期间被推进（' + nowMain + ' ≠ ' + curMain + '），已中止，不覆盖'); process.exit(1); }
  const br = path.join(tmp, 'ref.json');
  fs.writeFileSync(br, JSON.stringify({ sha: newCommit.sha, force: false }), 'utf8');
  const ref = JSON.parse(ghIn('-X PATCH /repos/' + repo + '/git/refs/heads/main', br));
  console.log('refs/heads/main → ' + ref.object.sha);

  /* ── 6. 回读核对（写操作必须回读）── */
  const after = api('/commits/main');
  const okSha = after.sha === newCommit.sha, okTree = after.commit.tree.sha === newTree;
  console.log('回读 main = ' + after.sha + (okSha ? ' ✅' : ' ❌'));
  console.log('回读 tree = ' + after.commit.tree.sha + (okTree ? ' ✅' : ' ❌'));
  const c = api('/contents/index.html?ref=main');
  const okBlob = c.sha === newBlob.sha, okSize = c.size === localSize;
  console.log('回读 index.html：blob ' + c.sha + (okBlob ? ' ✅' : ' ❌（期望 ' + newBlob.sha + '）') + '；' + c.size + ' B' + (okSize ? ' ✅' : ' ❌（本地 ' + localSize + ' B）'));
  const cB64 = JSON.parse(gh('-H "Accept: application/vnd.github+json" /repos/' + repo + '/git/blobs/' + newBlob.sha));
  const onlineBuf = Buffer.from(cB64.content || '', 'base64');
  const okBin = crypto.createHash('sha256').update(onlineBuf).digest('hex') === localSha256;
  const onlineVer = (onlineBuf.toString('utf8').match(/IB_VER\s*=\s*'([^']+)'/) || [])[1] || '(未找到)';
  const okVer = onlineVer === expectVer;
  console.log('回读内容 sha256 ' + (okBin ? '与本地逐字节一致 ✅' : '❌ 不一致') + '；IB_VER=' + onlineVer + (okVer ? ' ✅（＝期望 ' + expectVer + '）' : ' ❌（期望 ' + expectVer + '）'));

  fs.rmSync(tmp, { recursive: true, force: true });
  const pass = okSha && okTree && okBlob && okSize && okBin && okVer;
  console.log(pass ? '✅ 部署回读六项全过（sha/tree/blob/size/sha256/IB_VER）' : '❌ 回读存在不一致，详见上行');
  process.exit(pass ? 0 : 1);
} catch (e) {
  console.error('失败：' + String(e.message || e).slice(0, 400));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) {}
  process.exit(1);
}
