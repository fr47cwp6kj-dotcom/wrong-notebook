# V2/V3 数据契约（规划）

本契约用于约束后续自动识别与诊断服务，避免把系统过早绑定到某个 OCR 引擎或大模型。V1 阶段只需要保持原始照片目录不变。

核心原则：系统保存原图和识别文本，但不把错题整理成电子抄题本。每条有效诊断必须指向一个可复查的卡点、一条证据和一个候选知识单元漏洞。

## 原始文件命名

V1 不强制重命名。V2 服务读取文件时可建立内部映射，不移动或覆盖原图：

```text
photo_id: UUID
stage: junior | senior
source_path: 原始照片绝对路径
file_hash: SHA-256
captured_at: 可从 EXIF 读取，失败则为空
imported_at: UTC 时间
```

`source_path` 和 `file_hash` 用于保证同一张照片不会被重复导入。

## 核心表

```sql
CREATE TABLE photos (
  photo_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK (stage IN ('junior', 'senior')),
  source_path TEXT NOT NULL UNIQUE,
  file_hash TEXT NOT NULL UNIQUE,
  captured_at TEXT,
  imported_at TEXT NOT NULL,
  archived_path TEXT,
  status TEXT NOT NULL
);

CREATE TABLE recognition_jobs (
  job_id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(photo_id),
  engine TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  error_message TEXT
);

CREATE TABLE questions (
  question_id TEXT PRIMARY KEY,
  photo_id TEXT REFERENCES photos(photo_id),
  stage TEXT NOT NULL,
  subject TEXT,
  stem_text TEXT,
  student_answer TEXT,
  teacher_answer TEXT,
  knowledge_points TEXT,
  review_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE question_steps (
  step_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  step_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  student_reached INTEGER NOT NULL DEFAULT 0,
  is_stuck_candidate INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (question_id, step_order)
);

CREATE TABLE knowledge_units (
  unit_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL CHECK (stage IN ('junior', 'senior')),
  subject TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_pattern TEXT,
  prerequisite_unit_ids TEXT NOT NULL DEFAULT '[]',
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (
    status IN ('candidate', 'reviewed', 'approved', 'active', 'deprecated')
  ),
  reviewed_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (stage, subject, code)
);

CREATE TABLE question_knowledge_units (
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  unit_id TEXT NOT NULL REFERENCES knowledge_units(unit_id),
  role TEXT NOT NULL CHECK (role IN ('required', 'candidate', 'reviewed')),
  evidence TEXT,
  confidence REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (question_id, unit_id)
);

CREATE TABLE mistake_reasons (
  reason_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  reason_code TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai_candidate', 'student_confirmed')),
  confidence REAL,
  confirmed_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE gap_diagnoses (
  diagnosis_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(question_id),
  stuck_step_order INTEGER,
  unused_condition TEXT,
  gap_type TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  evidence TEXT NOT NULL,
  trigger_rule TEXT,
  ai_confidence REAL,
  student_status TEXT NOT NULL CHECK (
    student_status IN ('candidate', 'confirmed', 'rejected', 'uncertain')
  ),
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (question_id, stuck_step_order)
    REFERENCES question_steps(question_id, step_order)
);

CREATE TABLE diagnosis_knowledge_units (
  diagnosis_id TEXT NOT NULL REFERENCES gap_diagnoses(diagnosis_id),
  unit_id TEXT NOT NULL REFERENCES knowledge_units(unit_id),
  relation TEXT NOT NULL CHECK (relation IN ('primary', 'supporting', 'missing')),
  PRIMARY KEY (diagnosis_id, unit_id)
);

CREATE TABLE knowledge_unit_mastery (
  unit_id TEXT PRIMARY KEY REFERENCES knowledge_units(unit_id),
  mastery_score REAL NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_result TEXT CHECK (last_result IN ('correct', 'partial', 'incorrect', 'unattempted')),
  next_review_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE mastery_events (
  event_id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES knowledge_units(unit_id),
  event_type TEXT NOT NULL CHECK (
    event_type IN ('trigger_recognition', 'unit_drill', 'variant_question', 'full_question')
  ),
  result TEXT NOT NULL CHECK (result IN ('correct', 'partial', 'incorrect', 'unattempted')),
  elapsed_seconds INTEGER,
  context_variant_count INTEGER,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_questions_status ON questions(review_status);
CREATE INDEX idx_gap_diagnoses_question ON gap_diagnoses(question_id);
CREATE INDEX idx_gap_diagnoses_status ON gap_diagnoses(student_status);
CREATE INDEX idx_mastery_next_review ON knowledge_unit_mastery(next_review_at);
CREATE INDEX idx_knowledge_units_status ON knowledge_units(stage, subject, status);
```

## 表层错因

```text
read_condition_missed    审题漏条件
concept_misunderstood    概念未理解
calculation_or_copy      计算 / 抄写错误
step_skipped             解题步骤跳跃
other                    其他
uncertain                不确定
```

表层错因用于观察学习习惯。AI 只能写入候选解释，学生确认后的记录 `source = 'student_confirmed'`。允许一题多因，也允许暂时留空。

## 深层漏洞类型

`gap_diagnoses.gap_type` 使用以下枚举：

```text
condition_signal_missed          条件信号未识别
concept_definition_unstable      概念定义或边界不稳
formula_condition_misapplied     公式适用条件误用
unit_connection_missing          知识单元连接缺失
representation_conversion_failed 文字 / 符号 / 图形转换失败
strategy_selection_missing       路线选择缺失
execution_slip                   计算 / 符号 / 单位失误
other                            其他
uncertain                        不确定
```

深层漏洞用于决定补什么、练什么；表层错因用于观察学习习惯。两者不可互相替代。

`questions.knowledge_points` 只允许作为粗粒度临时标签，不得直接作为复习或掌握度对象。掌握度必须挂在 `knowledge_units.unit_id` 和 `mastery_events` 上。

## 必填诊断证据

AI 写入 `gap_diagnoses` 时，以下要求必须满足：

- `hypothesis` 不能为空。
- `evidence` 不能为空，且必须来自题干、学生作答、教师批改或人工校对文本。
- `stuck_step_order` 与 `unused_condition` 至少一项有值。
- `gap_type` 不能为空。
- 初始 `student_status` 必须为 `candidate`。

学生确认后才能改为 `confirmed`，拒绝则改为 `rejected`，无法判断则改为 `uncertain`。

`trigger_rule` 建议格式：

```text
看到 <条件信号 A> + <条件信号 B>，先检查 / 想到 <知识单元或动作 C>。
```

没有触发规则时不得自动判定已掌握。

## 状态流

```text
待识别
  -> 待定位漏洞
  -> 待确认诊断
  -> 待巩固
  -> 复习中
  -> 已掌握

任意识别失败 -> 识别失败 / 人工处理
诊断无法确认 -> 不确定 / 人工处理
```

状态必须由服务或人工显式更新，禁止识别过程中静默归档原图。

## V2 最小验收

- 新增照片能生成唯一记录。
- 重复文件不会重复入库。
- 识别结果可人工校对。
- 识别失败可进入 `识别失败` 并支持重试。
- 原始照片路径始终可追溯。

## V3 最小验收

- 能拆出解题步骤并标记候选卡点。
- 每条 AI 诊断都有证据，不输出空泛标签。
- 能把诊断关联到一个或多个知识单元。
- 学生能确认、拒绝或标记不确定。
- 能生成“看到 A + B，想到 C”的触发规则。
- 确认后的漏洞能进入 `待巩固`，而不是只归档原题。

## V5 掌握度规则

- 只根据 `mastery_events` 更新掌握度，不根据浏览次数更新。
- 触发识别、单元小练、变式题、完整题可以设置不同权重。
- 连续通过必须跨至少两个题干外壳，避免只记住原题。
- 任何失败诊断不得被自动删除，只能进入待复查或重新诊断。
