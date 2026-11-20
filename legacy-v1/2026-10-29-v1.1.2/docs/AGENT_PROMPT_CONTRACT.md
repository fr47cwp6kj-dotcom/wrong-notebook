# V3 Agent 诊断行为契约

本契约约束后续本地模型或服务的诊断输出。它不是已部署功能，也不绑定任何模型。

## 输入

```text
stage: junior | senior
subject: math | physics | chemistry | ...
stem_text: 人工校对后的题干
student_answer: 学生原始作答或识别文本
teacher_annotation: 教师批改或正确答案
knowledge_units: 候选知识单元库片段
taxonomy: config/diagnosis-taxonomy.json
```

输入不足时，Agent 必须进入 `needs_more_information`，不得编造学生当时没有写出的思考过程。

## 推理流程

1. **条件提取**：列出题干中的显式条件、隐藏条件和图形信号。
2. **目标识别**：明确题目要求、适用范围和单位。
3. **路径重建**：给出一条最短可行解题路径，并拆成可检查步骤。
4. **作答对齐**：判断学生写到了哪一步，哪一步缺失或偏离。
5. **卡点定位**：选择第一个关键卡点，不把后面连锁错误当成根因。
6. **单元映射**：把卡点映射到知识单元或单元连接。
7. **候选漏洞**：从深层漏洞枚举中选择，可多选。
8. **学生追问**：用 1-3 个问题区分“没看到信号”“知道但没想起”“不知道单元”“不会连接”。
9. **最小巩固**：只设计针对卡点的触发识别或小步练习。

## 输出 JSON

```json
{
  "status": "candidate_diagnosis",
  "evidence": {
    "conditions": [],
    "goal": "",
    "student_reached_step": 2,
    "first_stuck_step": 3,
    "unused_signals": []
  },
  "diagnoses": [
    {
      "gap_type": "unit_connection_missing",
      "surface_reason": "step_skipped",
      "knowledge_unit_ids": [],
      "hypothesis": "",
      "evidence": "",
      "confidence": 0.0,
      "trigger_rule": "",
      "questions_to_student": []
    }
  ],
  "minimal_practice": {
    "type": "trigger_recognition | unit_drill | variant_question",
    "instructions": "",
    "items": [],
    "human_review_required": true
  },
  "uncertainty": {
    "needs_more_information": false,
    "missing_fields": [],
    "reason": ""
  }
}
```

## 质量规则

- `confidence` 只表示模型对候选诊断的把握，不是学生的掌握度。
- 每个诊断必须有 `evidence`，不能只输出标签。
- 不能把后续计算错误当成根因，先定位第一个关键断点。
- 不输出人格评价、努力程度评价或成绩预测。
- 不要求学生誊抄题干。
- 不把“不确定”硬改成某个分类。
- 生成练习必须保留 `human_review_required: true`，家长或学生复核后再进入复习。
- 初中与高中知识单元库分开，不得把高阶知识默认引入低学段。

## 几何示例

```text
输入信号：等腰三角形、底边中点、需要证明垂直
学生作答：只写出 AM = MC，之后改用全等，但缺少可用条件
候选卡点：未连接 AD，也没有调用三线合一
候选单元：等腰三角形三线合一
候选漏洞：unit_connection_missing
追问：你是没注意到“底边中点”，还是知道中点但没想到三线合一？
最小练习：给出 5 个“等腰 + 中点”图形，只判断应该作哪条辅助线并说明理由。
```

这个示例用于定义行为，不代表所有等腰三角形题都只有这一种解法。
