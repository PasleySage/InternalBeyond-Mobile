/* _mk_mirror.js —— 生成镜像产物：把全部补丁清单**按顺序**应用到上游原文
 *
 * 用法：node _mk_mirror.js <上游 index.html> [输出文件]（默认输出 index.html）
 *   IB_PR=1 —— 跳过各清单里 mirrorOnly 的处（生成「提交给上游」的版本）
 *
 * 链条：r6 摘要修复 → r7 启动等待
 *   补丁是累积的：r7 的版本标记行以 r6 之后的状态为锚点，所以顺序不能颠倒
 *   （清单里用 needs 声明依赖，顺序传错会直接报错）。
 *
 * 单跑某一个补丁请用它的薄壳（如 _mk_summary_patch.js）；本脚本只管"完整镜像"。
 */
const {runChain}=require('./_patch_engine');
const specs=[require('./_patch_r6_summary'),require('./_patch_r7_startup_wait')];
runChain(specs,process.argv[2]||'_up_index.html',process.argv[3]||'index.html');
