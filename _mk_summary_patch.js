/* _mk_summary_patch.js —— 生成「摘要修复」自用补丁（锚点替换，不依赖行号，供上游每次发版后重放）
 *
 * 用法：node _mk_summary_patch.js <上游 index.html> [输出文件]
 *   默认输出 _up_patched.html；环境变量 IB_PR=1 时跳过镜像专用处（生成「提交给上游」的版本）。
 *
 * 本文件现在只是参数转发：
 *   引擎 = _patch_engine.js（断言、EOL 处理、清单打印）
 *   清单 = _patch_r6_summary.js（13 处锚点，数据）
 * ⇒ 新增或修改补丁请改**清单**，不要改这里；也不要再为下一个补丁抄一份脚本。
 */
const {run}=require('./_patch_engine');
const spec=require('./_patch_r6_summary');
run(spec,process.argv[2]||'_up_index.html',process.argv[3]||'_up_patched.html');
