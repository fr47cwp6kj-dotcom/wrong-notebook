# 本地数学教材范围

本复刻版按用户选择，将所有数学错题本的自动知识点范围统一设为“浙教版初二上”。原项目的 `math.ts` 注明为人教版，不能用其中“八年级上”的节点代替浙教版范围。独立清单放在 `src/lib/tag-data/math-zhejiang.ts`；原标签树与历史记录保留。

本地清单覆盖三角形与证明、特殊三角形、一元一次不等式、图形与坐标、一次函数，并列出解题常用的前置基础。浙教版本学期的一次函数和勾股定理不会因原人教版标签树把它们放在八下而被排除。

## 依据与边界

- 可访问的[浙教版八上公开目录（2024 审定版转录）](https://www.dzskb.com/zjbsx8sc-2024.html)用于核对章节范围。该页面是第三方整理，不作为答案正确性的保证。
- 正版教材入口为[浙江省数字教材服务平台](https://zjeav.com/)。本次未取得用户所用印次的完整教材，不宣称已接入官方教材知识库。
- 标签是本项目整理的检索名称，不是逐字复制的教材目录。`轴对称最短路径`是应用标签：必须有利用对称点转化路径并检查取等条件的依据；其他最值题按实际方法标注，信息不足时留空。
- 这次修正约束标签候选和解题年级提示，不提供联网检索或逐题核对教参答案。AI 的具体解法仍需对照原题检查；教材目录、老师讲解可用于后续进一步校准。

## 生效路径

图片识别、文字解题、校对页重新解题、单题/整本重新识别知识点及输入标签时的建议使用同一范围。AI 返回的范围外标签会被过滤；手工自定义标签仍可使用。其他学科按原错题本学段处理。

识别多题时，校对页展开“知识点”后可以分别修改各题标签，每题最多 5 个，汇总自动去重。空的逐题对象表示没有分题结果，保留旧版整份标签的编辑方式；不把整页标签猜分到各题。

逐题映射随题目保存，并包含在导出和恢复中。旧题不会自动重新分析，也不会把所有“最值问题”批量替换成最短路径。需要更新时点击“重新识别知识点”；该操作按整份记录重新标注，清除过时的逐题对应关系，保留自定义标签。校对页“重新解题”则用新返回的逐题映射替换旧映射。

## English

All math notebooks in this fork use a locally maintained Zhejiang-edition Grade 8 first-semester candidate list, including prerequisite skills. The original library follows the People's Education Press sequence, so its semester nodes are not used to approximate Zhejiang coverage. Other subjects retain their existing stage scope. This is a local tagging rule, not an official textbook or answer-reference integration; the exact textbook printing and individual solutions still require review.

Image analysis, text solving, re-solving, re-tagging and tag suggestions share this scope. Per-question tags can be edited on the review page, with up to five per question and an automatic combined list. Empty mappings preserve single-question tags. The mapping is stored and included in backups. Existing questions are not automatically re-tagged. Whole-record re-tagging clears stale per-question mappings while preserving custom tags.
