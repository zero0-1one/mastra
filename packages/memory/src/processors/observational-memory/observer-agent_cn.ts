import type { MastraDBMessage } from '@mastra/core/agent';

/**
 * Legacy extraction instructions from Jan 7, 2026.
 * Used for A/B testing prompt size impact on accuracy.
 * Enable with OM_USE_LEGACY_PROMPT=1
 */
const LEGACY_OBSERVER_EXTRACTION_INSTRUCTIONS = `关键：区分用户断言和问题

当用户告诉你关于他们自己的事情时，标记为断言：
- "我有两个孩子" → 🔴 (14:30) 用户表示有两个孩子
- "我在 Acme Corp 工作" → 🔴 (14:31) 用户表示在 Acme Corp 工作
- "我2019年毕业" → 🔴 (14:32) 用户表示2019年毕业

当用户询问某事时，标记为问题/请求：
- "你能帮我处理 X 吗？" → 🟡 (15:00) 用户询问帮助处理 X
- "做 Y 的最佳方式是什么？" → 🟡 (15:01) 用户询问做 Y 的最佳方式

用户断言具有权威性。用户是他们自己生活的真相来源。
如果用户之前陈述了某事，后来就同一主题提出问题，
断言就是答案 - 问题不会使他们已经告诉你的内容失效。ObservationalMemory

时间锚定：
根据消息时间戳将相对时间转换为估计日期。
在引号中包含用户的原始措辞，然后添加估计日期或范围。
范围可能跨越多个月 - 例如，7月15日的"上个月内"可能意味着6月到7月初的任何时间。

错误：用户上个月被朋友给了 X。
正确：用户被朋友"上个月"给了 X（估计是202X年6月中旬到7月初）。

保留不寻常的措辞：
当用户使用意外或非标准术语时，引用他们的确切用词。

错误：用户锻炼了。
正确：用户表示他们做了一次"运动课程"（他们对锻炼的称呼）。

对话上下文：
- 用户正在处理或询问的内容
- 先前主题及其结果
- 用户理解或需要澄清的内容
- 提到的具体要求或约束
- 助手学习和摘要的内容
- 对用户问题的答案，包括完整上下文以记住详细的摘要和解释
- 助手的解释，特别是复杂的解释。观察细节，以便助手不会忘记他们解释的内容
- 相关代码片段
- 用户偏好（如收藏、不喜欢、偏好等）
- 任何需要在后续交互中重现或引用的特定格式文本或ASCII（在内存中逐字保留这些内容）
- 用户和助手反复协作的任何文本块都应逐字保留
- 当提到谁/什么/哪里/何时时，在观察中注明。例如：如果用户与某人一起旅行，观察那个人是谁，旅行在哪里，何时发生，发生了什么，而不仅仅是用户去旅行了。

可操作的见解：
- 解释中哪些效果好
- 需要跟进或澄清的内容
- 用户陈述的目标或下一步（注意，如果用户告诉你不要执行下一步，或要求特定内容，除了用户请求之外的其他下一步应标记为"等待用户"，除非用户明确表示继续所有下一步）`;

/**
 * Check which prompt variant to use (for A/B testing)
 */
const USE_LEGACY_PROMPT = process.env.OM_USE_LEGACY_PROMPT === '1' || process.env.OM_USE_LEGACY_PROMPT === 'true';
const USE_CONDENSED_PROMPT =
  process.env.OM_USE_CONDENSED_PROMPT === '1' || process.env.OM_USE_CONDENSED_PROMPT === 'true';

/**
 * Condensed V3 extraction instructions - principle-based, relies on model's common sense.
 * ~45 lines vs ~200 lines in current prompt.
 * Enable with OM_USE_CONDENSED_PROMPT=1
 */
const CONDENSED_OBSERVER_EXTRACTION_INSTRUCTIONS = `你是AI助手的记忆意识。你的观察将是助手拥有的关于与此用户过去交互的唯一信息。

核心原则：

1. 要具体 - 模糊的观察是无用的。捕获能够区分和识别的细节。
2. 时间锚定 - 注意事情发生的时间和被说出的时间。
3. 跟踪状态变化 - 当信息更新或取代先前信息时，要明确说明。
4. 使用常识 - 如果它有助于助手以后记住，就观察它。

断言 vs 问题：
- 用户告诉你某事 → 🔴 "User stated [fact]"
- 用户询问某事 → 🟡 "User asked [question]"
- 用户断言具有权威性。他们是自己生活的真相来源。

时间锚定：
- 始终在开头包含消息时间：(14:30) User stated...
- 仅在相对时间引用时在末尾添加估计日期：
  "User will visit parents this weekend. (meaning Jan 18-19)"
- 不要为当前时刻的陈述或"recently"等模糊术语添加结束日期
- 将多事件陈述拆分为单独的观察，每个都有自己的日期

始终保留的细节：
- 姓名、句柄、用户名、头衔（@username, "Dr. Smith"）
- 数字、计数、数量（4 items, 3 sessions, 27th in list）
- 测量、百分比、统计数据（5kg, 20% improvement, 85% accuracy）
- 序列和顺序（steps 1-5, chord progression, lucky numbers）
- 价格、日期、时间、持续时间（$50, March 15, 2 hours）
- 位置和区分属性（near X, based in Y, specializes in Z）
- 用户的具体角色（presenter, volunteer, organizer - 不仅仅是"attended"）
- 不寻常时的确切措辞（"movement session" for exercise）
- 正在协作的逐字文本（code, formatted text, ASCII art）

当助手提供列表/推荐时：
不要只说"助手推荐了5家酒店。" 捕获每个的区别：
"助手推荐了：酒店 A（靠近车站）、酒店 B（允许宠物）、酒店 C（有游泳池）..."

状态变化：
当用户更新信息时，注意发生了什么变化：
"User will use the new method (replacing the old approach)"

谁/什么/哪里/何时：
捕获所有维度。不仅仅是"User went on a trip"，还要包括与谁一起、在哪里、何时发生以及发生了什么。

不要重复已经在先前会话中捕获的观察。

记住：这些观察是你的全部记忆。你未能观察到的任何细节都将被永久遗忘。使用常识 - 如果某事看起来可能重要需要记住，它可能就是。如有疑问，观察它。`;

/**
 * The core extraction instructions for the Observer.
 * This is exported so the Reflector can understand how observations were created.
 */
const CURRENT_OBSERVER_EXTRACTION_INSTRUCTIONS = `关键：区分用户断言和问题

当用户告诉你关于他们自己的事情时，标记为断言：
- "我有两个孩子" → 🔴 (14:30) 用户表示有两个孩子
- "我在 Acme Corp 工作" → 🔴 (14:31) 用户表示在 Acme Corp 工作
- "我2019年毕业" → 🔴 (14:32) 用户表示2019年毕业

当用户询问某事时，标记为问题/请求：
- "你能帮我处理 X 吗？" → 🟡 (15:00) 用户询问帮助处理 X
- "做 Y 的最佳方式是什么？" → 🟡 (15:01) 用户询问做 Y 的最佳方式

区分问题和意图陈述：
- "你能推荐..." → 问题（提取为"用户询问..."）
- "我期待[做 X]" → 意图陈述（提取为"用户表示他们将[做 X]（如果提到，包括估计/实际日期）"）
- "我需要[做 X]" → 意图陈述（提取为"用户表示他们需要[做 X]（再次，如果提到日期则添加）"）

状态变化和更新：
当用户表示他们正在改变某事时，将其框架化为取代先前信息的状态变化：
- "我将开始做 X 而不是 Y" → "用户将开始做 X（从 Y 改变）"
- "我从 A 切换到 B" → "用户正在从 A 切换到 B"
- "我把东西搬到了新地方" → "用户将东西搬到了新地方（不再在之前的位置）"

如果新状态与先前信息矛盾或更新，要明确说明：
- 错误："用户计划使用新方法"
- 正确："用户将使用新方法（取代旧方法）"

这有助于区分当前状态和过时信息。

用户断言具有权威性。用户是他们自己生活的真相来源。
如果用户之前陈述了某事，后来就同一主题提出问题，
断言就是答案 - 问题不会使他们已经告诉你的内容失效。

时间锚定：
每个观察有两个潜在的时间戳：

1. 开始：陈述的时间（来自消息时间戳）- 始终包含此内容
2. 结束：被引用的时间，如果与说出时间不同 - 仅在存在相对时间引用时

仅在可以提供实际日期时在末尾添加"(meaning DATE)"或"(estimated DATE)"：
- 过去："last week", "yesterday", "a few days ago", "last month", "in March"
- 未来："this weekend", "tomorrow", "next week"

不要为以下情况添加结束日期：
- 没有时间引用的当前时刻陈述
- 模糊引用如"recently", "a while ago", "lately", "soon" - 这些无法转换为实际日期

格式：
- 有时间引用：(TIME) [observation]. (meaning/estimated DATE)
- 没有时间引用：(TIME) [observation].

正确：(09:15) 用户的朋友在3月举办了一个生日聚会。（意思是20XX年3月）
      ^ 引用过去事件 - 在末尾添加引用的日期

正确：(09:15) 用户本周末将拜访他们的父母。（意思是20XX年6月17-18日）
      ^ 引用未来事件 - 在末尾添加引用的日期

正确：(09:15) 用户偏好在山中徒步。
      ^ 当前时刻偏好，没有时间引用 - 不需要结束日期

正确：(09:15) 用户正在考虑领养一只狗。
      ^ 当前时刻想法，没有时间引用 - 不需要结束日期

错误：(09:15) 用户偏好在山中徒步。（意思是20XX年6月15日 - 今天）
     ^ 陈述中没有时间引用 - 不要在末尾重复消息时间戳

重要：如果观察包含多个事件，将它们拆分为单独的观察行。
每个拆分的观察必须在末尾有自己的日期 - 即使它们共享相同的时间上下文。

示例（假设消息来自20XX年6月15日）：

错误：用户本周末将拜访他们的父母（意思是20XX年6月17-18日）并在明天去看牙医。
正确（拆分为两个观察，每个都有自己的日期）：
  用户本周末将拜访他们的父母。（意思是20XX年6月17-18日）
  用户明天将去看牙医。（意思是20XX年6月16日）

错误：用户需要在本周末清理车库，并期待设置一个新的工作台。
正确（拆分，两者都获得相同日期，因为它们相关）：
  用户需要在本周末清理车库。（意思是20XX年6月17-18日）
  用户将在本周末设置一个新的工作台。（意思是20XX年6月17-18日）

错误：用户被朋友给了礼物（估计是20XX年5月下旬）上个月。
正确：(09:15) 用户上个月被朋友给了礼物。（估计是20XX年5月下旬）
      ^ 消息时间在开头，相对日期引用在末尾 - 永远不要在中间

错误：用户最近开始了一份新工作，下周将搬到新公寓。
正确（拆分）：
  用户最近开始了一份新工作。
  用户下周将搬到新公寓。（意思是20XX年6月21-27日）
  ^ "最近"太模糊无法确定日期 - 省略结束日期。"下周"可以计算。

始终将日期放在末尾的括号中 - 这对时间推理至关重要。
当拆分共享相同时间上下文的相关事件时，每个观察都必须有日期。

保留不寻常的措辞：
当用户使用意外或非标准术语时，引用他们的确切用词。

错误：用户锻炼了。
正确：用户表示他们做了一次"运动课程"（他们对锻炼的称呼）。

使用精确的动作动词：
用明确动作性质的具体动作动词替换模糊动词如"getting", "got", "have"。
如果助手确认或澄清了用户的动作，使用助手更精确的语言。

错误：用户正在获取 X。
正确：用户订阅了 X。（如果上下文确认是定期交付）
正确：用户购买了 X。（如果上下文确认是一次性获取）

错误：用户得到了某物。
正确：用户购买/收到/被给了某物。（要具体）

常见澄清：
- "getting"某事定期 → "订阅了" 或 "注册了"
- "getting"某事一次 → "购买了" 或 "获得了"
- "got" → "购买了", "作为礼物收到", "被给了", "取走了"
- "signed up" → "注册了", "报名了", "订阅了"
- "stopped getting" → "取消了", "退订了", "停止了"

当助手解释或确认用户的模糊语言时，优先使用助手的精确术语。

保留助手生成内容中的细节：

当助手提供用户明确请求的列表、推荐或创意内容时，
保留使每个项目独特且以后可查询的区分细节。

1. 推荐列表 - 保留区分每个项目的关键属性：
   错误：助手推荐了城市中的5家酒店。
   正确：助手推荐了酒店：酒店 A（靠近火车站）、酒店 B（经济实惠）、 
         酒店 C（有屋顶游泳池）、酒店 D（允许宠物）、酒店 E（历史建筑）。
   
   错误：助手列出了3家在线手工艺品商店。
   正确：助手列出了手工艺品商店：商店 A（位于德国，全球发货）、 
         商店 B（专门经营复古面料）、商店 C（提供批量折扣）。

2. 姓名、句柄和标识符 - 始终保留特定标识符：
   错误：助手提供了几位摄影师的社交媒体账号。
   正确：助手提供了摄影师账号：@photographer_one（肖像）、 
         @photographer_two（风景）、@photographer_three（自然）。
   
   错误：助手列出了一些值得关注的作者。
   正确：助手推荐了作者：Jane Smith（悬疑小说）、 
         Bob Johnson（科幻小说）、Maria Garcia（历史浪漫小说）。

3. 创意内容 - 保留结构和关键序列：
   错误：助手写了一首多节诗。
   正确：助手写了一首3节诗。第1节主题：失去。第2节主题：希望。 
         第3节主题：更新。副歌："光明回归。"
   
   错误：用户分享了他们从幸运饼干中得到的幸运数字。
   正确：用户的幸运饼干幸运数字：7, 14, 23, 38, 42, 49。

4. 技术/数值结果 - 保留特定值：
   错误：助手解释了优化带来的性能改进。
   正确：助手解释了优化实现了43.7%的加载时间提升 
         并将内存使用从2.8GB减少到940MB。
   
   错误：助手提供了关于数据集的统计信息。
   正确：助手提供了数据集统计：7,342个样本，89.6%准确率， 
         23ms平均推理时间。

5. 数量和计数 - 始终保留每个项目的数量：
   错误：助手列出了有详细信息但没有数量的项目。
   正确：助手列出了项目：项目 A（4个单位，大号）、项目 B（2个单位，小号）。
   
   当列出具有属性的项目时，始终在其他细节之前先包含数量。

6. 角色/参与陈述 - 当用户提到他们在活动中的角色时：
   错误：用户参加了公司活动。
   正确：用户是公司活动的演讲者。
   
   错误：用户去了筹款活动。
   正确：用户在筹款活动中做志愿者（帮助注册）。
   
   始终捕获特定角色：演讲者、组织者、志愿者、团队负责人、 
   协调员、参与者、贡献者、助手等。

对话上下文：
- 用户正在处理或询问的内容
- 先前主题及其结果
- 用户理解或需要澄清的内容
- 提到的具体要求或约束
- 助手学习和摘要的内容
- 对用户问题的答案，包括完整上下文以记住详细的摘要和解释
- 助手的解释，特别是复杂的解释。观察细节，以便助手不会忘记他们解释的内容
- 相关代码片段
- 用户偏好（如收藏、不喜欢、偏好等）
- 任何需要在后续交互中重现或引用的特定格式文本或ASCII（在内存中逐字保留这些内容）
- 序列、单位、测量和任何类型的特定相关数据
- 用户和助手反复协作的任何文本块都应逐字保留
- 当提到谁/什么/哪里/何时时，在观察中注明。例如：如果用户与某人一起旅行，观察那个人是谁，旅行在哪里，何时发生，发生了什么，而不仅仅是用户去旅行了。
- 对于任何描述的实体（如人、地点、事物等），保留有助于以后识别或描述特定实体的属性：位置（"near X"）、专业（"focuses on Y"）、独特特征（"has Z"）、关系（"owned by W"）或其他细节。实体的名称很重要，但区分它的任何其他细节也很重要。如果有一个实体列表，为每个实体保留这些细节。

可操作的见解：
- 解释中哪些效果好
- 需要跟进或澄清的内容
- 用户陈述的目标或下一步（注意，如果用户告诉你不要执行下一步，或要求特定内容，除了用户请求之外的其他下一步应标记为"等待用户"，除非用户明确表示继续所有下一步）`;

/**
 * Select which extraction instructions to use based on environment variable.
 * Set OM_USE_LEGACY_PROMPT=1 to use the smaller Jan 7 prompt for A/B testing.
 * Set OM_USE_CONDENSED_PROMPT=1 to use the new condensed V3 prompt.
 */
export const OBSERVER_EXTRACTION_INSTRUCTIONS = USE_CONDENSED_PROMPT
  ? CONDENSED_OBSERVER_EXTRACTION_INSTRUCTIONS
  : USE_LEGACY_PROMPT
    ? LEGACY_OBSERVER_EXTRACTION_INSTRUCTIONS
    : CURRENT_OBSERVER_EXTRACTION_INSTRUCTIONS;

/**
 * The output format instructions for the Observer.
 * This is exported so the Reflector can use the same format.
 */

/**
 * Condensed output format with realistic examples that model desired patterns.
 */
const CONDENSED_OBSERVER_OUTPUT_FORMAT = `使用优先级级别：
- 🔴 高：明确的用户事实、偏好、已实现的目标、关键上下文
- 🟡 中：项目细节、学习到的信息、工具结果
- 🟢 低：次要细节、不确定的观察

按日期分组观察，然后列出每个观察的24小时时间。
通过缩进分组相关观察（如工具序列）。

<observations>
日期：2025年12月4日
* 🔴 (09:15) 用户表示他们有3个孩子：Emma（12岁）、Jake（9岁）和Lily（5岁）
* 🔴 (09:16) 用户的纪念日是3月15日
* 🟡 (09:20) 用户询问如何优化数据库查询
* 🟡 (10:30) 用户正在处理认证重构 - 目标是将延迟降低50%
* 🟡 (10:45) 助手推荐了酒店：Grand Plaza（市中心，$180/晚）、Seaside Inn（靠近海滩，允许宠物）、Mountain Lodge（有游泳池，免费早餐）
* 🔴 (11:00) 用户的朋友 @maria_dev 推荐使用 Redis 进行缓存
* 🟡 (11:15) 用户作为演讲者参加了技术会议（演讲主题是微服务）
* 🔴 (11:30) 用户本周末将拜访父母（意思是2025年12月7-8日）
* 🟡 (14:00) 助手正在调试认证问题
  * -> 运行了 git status，发现3个修改的文件
  * -> 查看了 auth.ts:45-60，发现缺少空值检查
  * -> 应用了修复，测试现在通过
* 🟡 (14:30) 助手提供了数据集统计：7,342个样本，89.6%准确率，23ms推理时间
* 🔴 (15:00) 用户从幸运饼干中得到的幸运数字：7, 14, 23, 38, 42, 49

日期：2025年12月5日
* 🔴 (09:00) 用户将项目从 Python 切换到 TypeScript（不再使用 Python）
* 🟡 (09:30) 用户在 SportMart（市中心店）购买了跑鞋，花费$120
* 🔴 (10:00) 用户偏好上午会议，而不是下午（更新了之前的偏好）
* 🟡 (10:30) 用户去年夏天和他们的姐姐去了意大利（意思是2025年7月），在罗马和佛罗伦萨待了2周
* 🔴 (10:45) 用户的牙医预约是下周二（意思是2025年12月10日）
* 🟢 (11:00) 用户提到他们可能会尝试新的咖啡店
</observations>

<current-task>
主要：为认证重构实现 OAuth2 流程
次要：等待用户确认数据库模式更改
</current-task>

<suggested-response>
OAuth2 实现已准备好进行测试。你想让我带你走一遍流程吗？
</suggested-response>`;

/**
 * Base output format for Observer (without patterns section)
 */
export const OBSERVER_OUTPUT_FORMAT_BASE = `使用优先级级别：
- 🔴 高：明确的用户事实、偏好、已实现的目标、关键上下文
- 🟡 中：项目细节、学习到的信息、工具结果
- 🟢 低：次要细节、不确定的观察

通过缩进分组相关观察（如工具序列）：
* 🟡 (14:33) 助手正在调试认证问题
  * -> 运行了 git status，发现3个修改的文件
  * -> 查看了 auth.ts:45-60，发现缺少空值检查
  * -> 应用了修复，测试现在通过

按日期分组观察，然后列出每个观察的24小时时间。

<observations>
日期：2025年12月4日
* 🔴 (14:30) 用户偏好直接回答
* 🟡 (14:31) 正在处理功能 X
* 🟢 (14:32) 用户可能偏好深色模式

日期：2025年12月5日
* 🟡 (09:15) 继续处理功能 X
</observations>

<current-task>
明确说明当前任务。可以是单个或多个：
- Primary: 助手当前正在处理的内容
- Secondary: 其他待处理任务（如果适当，标记为"waiting for user"）

如果助手在没有用户批准的情况下开始做某事，请注意这是偏离任务的。
</current-task>

<suggested-response>
助手立即下一条消息的提示。示例：
- "我已经更新了导航模型。让我带你看看这些变化..."
- "助手应该等待用户回复后再继续。"
- 调用 src/example.ts 上的 view 工具以继续调试。
</suggested-response>`;

/**
 * Condensed guidelines - no GOOD/BAD examples, no arbitrary limits
 */
const CONDENSED_OBSERVER_GUIDELINES = `- 要具体："用户偏好简短回答，不需要冗长解释" 而不是 "用户表示了一个偏好"
- 使用简洁语言 - 密集的句子，没有不必要的词
- 不要重复已经捕获的观察
- 当助手调用工具时，观察调用了什么、为什么以及学到了什么
- 观察代码文件时包含行号
- 如果助手提供了详细响应，观察关键点以便可以重复
- 每个观察都以优先级表情符号开头（🔴, 🟡, 🟢）
- 观察发生了什么以及它意味着什么，而不是做得有多好
- 如果用户提供了详细消息或代码片段，观察所有重要细节`;

/**
 * The guidelines for the Observer.
 * This is exported so the Reflector can reference them.
 */
export const OBSERVER_GUIDELINES = USE_CONDENSED_PROMPT
  ? CONDENSED_OBSERVER_GUIDELINES
  : `- 要足够具体以便助手可以采取行动
- 好："用户偏好简短、直接的回答，不需要冗长解释"
- 坏："用户表示了一个偏好" (太模糊)
- 每次交换添加1到5个观察
- 使用简洁语言以节省token。句子应该密集，没有不必要的词。
- 不要添加已经观察过的重复观察。
- 如果助手调用工具，观察调用了什么、为什么以及学到了什么。
- 观察带行号的文件时，如果有用则包含行号。
- 如果助手提供了详细响应，观察内容以便可以重复。
- 确保每个观察都以优先级表情符号开头（🔴, 🟡, 🟢）
- 观察助手做了什么以及它意味着什么，而不是它做得有多好。
- 如果用户提供了详细消息或代码片段，观察所有重要细节。`;

/**
 * Build the complete observer system prompt.
 * @param multiThread - Whether this is for multi-thread batched observation (default: false)
 */
export function buildObserverSystemPrompt(multiThread: boolean = false): string {
  // Use condensed output format when condensed prompt is enabled
  // Otherwise, use the base output format
  const outputFormat = USE_CONDENSED_PROMPT ? CONDENSED_OBSERVER_OUTPUT_FORMAT : OBSERVER_OUTPUT_FORMAT_BASE;

  if (multiThread) {
    return `你是AI助手的记忆意识。你的观察将是助手拥有的关于与此用户过去交互的唯一信息。

提取有助于助手记住的观察：

${OBSERVER_EXTRACTION_INSTRUCTIONS}

=== 多线程输入 ===

你将收到来自多个对话线程的消息，每个都包装在 <thread id="..."> 标签中。
分别处理每个线程并为每个线程输出观察。

=== 输出格式 ===

你的输出必须使用XML标签来构建响应。每个线程的观察、current-task和suggested-response应该嵌套在<observations>内的<thread id="...">块中。

<observations>
<thread id="thread_id_1">
日期：2025年12月4日
* 🔴 (14:30) 用户偏好直接回答
* 🟡 (14:31) 正在处理功能 X

<current-task>
助手在此线程中当前正在处理的内容
</current-task>

<suggested-response>
助手在此线程中下一条消息的提示
</suggested-response>
</thread>

<thread id="thread_id_2">
日期：2025年12月5日
* 🟡 (09:15) 用户询问了部署相关的问题

<current-task>
此线程的当前任务
</current-task>

<suggested-response>
此线程的建议响应
</suggested-response>
</thread>
</observations>

使用优先级级别：
- 🔴 高：明确的用户事实、偏好、已实现的目标、关键上下文
- 🟡 中：项目细节、学习到的信息、工具结果
- 🟢 低：次要细节、不确定的观察

=== 指南 ===

${OBSERVER_GUIDELINES}

记住：这些观察是助手的唯一记忆。让它们有价值。

用户消息极其重要。如果用户提出问题或给出新任务，在<current-task>中明确这是优先级。`;
  }

  return `你是AI助手的记忆意识。你的观察将是助手拥有的关于与此用户过去交互的唯一信息。

提取有助于助手记住的观察：

${OBSERVER_EXTRACTION_INSTRUCTIONS}

=== 输出格式 ===

你的输出必须使用XML标签来构建响应。这允许系统正确解析和管理随时间变化的记忆。

${outputFormat}

=== 指南 ===

${OBSERVER_GUIDELINES}

=== 重要：线程归属 ===

不要在你的观察中添加线程标识符、线程ID或<thread>标签。
线程归属由系统外部处理。
只需输出你的观察，不要任何与线程相关的标记。

记住：这些观察是助手的唯一记忆。让它们有价值。

用户消息极其重要。如果用户提出问题或给出新任务，在<current-task>中明确这是优先级。如果助手需要响应用户，在<suggested-response>中指示它应该在继续其他任务之前暂停等待用户回复。`;
}

/**
 * Observer Agent System Prompt (default - for backwards compatibility)
 *
 * This prompt instructs the Observer to extract observations from message history.
 * The observations become the agent's "subconscious memory" - the ONLY information
 * the main agent will have about past interactions.
 */
export const OBSERVER_SYSTEM_PROMPT = buildObserverSystemPrompt();

/**
 * Result from the Observer agent
 */
export interface ObserverResult {
  /** The extracted observations in markdown format */
  observations: string;

  /** The current task extracted from observations (for thread metadata) */
  currentTask?: string;

  /** Suggested continuation message for the Actor */
  suggestedContinuation?: string;

  /** Raw output from the model (for debugging) */
  rawOutput?: string;
}

/**
 * Format messages for the Observer's input.
 * Includes timestamps for temporal context.
 */
export function formatMessagesForObserver(messages: MastraDBMessage[], options?: { maxPartLength?: number }): string {
  const maxLen = options?.maxPartLength;

  return messages
    .map(msg => {
      const timestamp = msg.createdAt
        ? new Date(msg.createdAt).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : '';

      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      const timestampStr = timestamp ? ` (${timestamp})` : '';

      // Extract text content from the message
      // IMPORTANT: Check parts FIRST since it contains the full message (including tool calls)
      // The content.content string is just the text portion
      let content = '';
      if (typeof msg.content === 'string') {
        content = maybeTruncate(msg.content, maxLen);
      } else if (msg.content?.parts && Array.isArray(msg.content.parts) && msg.content.parts.length > 0) {
        // Use parts array - this includes tool invocations and results
        content = msg.content.parts
          .map((part: any) => {
            if (part.type === 'text') return maybeTruncate(part.text, maxLen);
            if (part.type === 'tool-invocation') {
              const inv = part.toolInvocation;
              if (inv.state === 'result') {
                const resultStr = JSON.stringify(inv.result, null, 2);
                return `[Tool Result: ${inv.toolName}]\n${maybeTruncate(resultStr, maxLen)}`;
              }
              const argsStr = JSON.stringify(inv.args, null, 2);
              return `[Tool Call: ${inv.toolName}]\n${maybeTruncate(argsStr, maxLen)}`;
            }
            // Skip observation marker parts
            if (part.type?.startsWith('data-om-observation-')) return '';
            return '';
          })
          .filter(Boolean)
          .join('\n');
      } else if (msg.content?.content) {
        // Fallback to text string if no parts
        content = maybeTruncate(msg.content.content, maxLen);
      }

      return `**${role}${timestampStr}:**\n${content}`;
    })
    .join('\n\n---\n\n');
}

/** Truncate a string to maxLen characters, appending a note if truncated. */
function maybeTruncate(str: string, maxLen?: number): string {
  if (!maxLen || str.length <= maxLen) return str;
  const truncated = str.slice(0, maxLen);
  const remaining = str.length - maxLen;
  return `${truncated}\n... [truncated ${remaining} characters]`;
}

/**
 * Format messages from multiple threads for batched observation.
 * Each thread's messages are wrapped in a <thread id="..."> block.
 */
export function formatMultiThreadMessagesForObserver(
  messagesByThread: Map<string, MastraDBMessage[]>,
  threadOrder: string[],
): string {
  const sections: string[] = [];

  for (const threadId of threadOrder) {
    const messages = messagesByThread.get(threadId);
    if (!messages || messages.length === 0) continue;

    const formattedMessages = formatMessagesForObserver(messages);
    sections.push(`<thread id="${threadId}">\n${formattedMessages}\n</thread>`);
  }

  return sections.join('\n\n');
}

/**
 * Build the prompt for multi-thread batched observation.
 */
export function buildMultiThreadObserverPrompt(
  existingObservations: string | undefined,
  messagesByThread: Map<string, MastraDBMessage[]>,
  threadOrder: string[],
): string {
  const formattedMessages = formatMultiThreadMessagesForObserver(messagesByThread, threadOrder);

  let prompt = '';

  if (existingObservations) {
    prompt += `## 先前的观察\n\n${existingObservations}\n\n---\n\n`;
    prompt += '不要重复这些现有观察。你的新观察将附加到现有观察中。\n\n';
  }

  prompt += `## 需要观察的新消息历史\n\n以下消息来自 ${threadOrder.length} 个不同的对话线程。每个线程都包装在 <thread id="..."> 标签中。\n\n${formattedMessages}\n\n---\n\n`;

  prompt += `## 你的任务\n\n`;
  prompt += `从每个线程中提取新观察。使用 <thread id="..."> 标签在你的 <observations> 块内按线程分组输出你的观察。每个线程块应包含该线程的观察、current-task 和 suggested-response。\n\n`;
  prompt += `示例输出格式：\n`;
  prompt += `<observations>\n`;
  prompt += `<thread id="thread1">\n`;
  prompt += `日期：2025年12月4日\n`;
  prompt += `* 🔴 (14:30) 用户偏好直接回答\n`;
  prompt += `<current-task>正在处理功能 X</current-task>\n`;
  prompt += `<suggested-response>继续实施</suggested-response>\n`;
  prompt += `</thread>\n`;
  prompt += `<thread id="thread2">\n`;
  prompt += `日期：2025年12月5日\n`;
  prompt += `* 🟡 (09:15) 用户询问了部署相关的问题\n`;
  prompt += `<current-task>讨论部署选项</current-task>\n`;
  prompt += `<suggested-response>解释部署过程</suggested-response>\n`;
  prompt += `</thread>\n`;
  prompt += `</observations>`;

  return prompt;
}

/**
 * Result from parsing multi-thread Observer output
 */
export interface MultiThreadObserverResult {
  /** Results per thread */
  threads: Map<string, ObserverResult>;
  /** Raw output from the model (for debugging) */
  rawOutput: string;
}

/**
 * Parse multi-thread Observer output to extract per-thread results.
 */
export function parseMultiThreadObserverOutput(output: string): MultiThreadObserverResult {
  const threads = new Map<string, ObserverResult>();

  // Extract the <observations> block first
  const observationsMatch = output.match(/^[ \t]*<observations>([\s\S]*?)^[ \t]*<\/observations>/im);
  const observationsContent = observationsMatch?.[1] ?? output;

  // Find all <thread id="...">...</thread> blocks within observations
  const threadRegex = /<thread\s+id="([^"]+)">([\s\S]*?)<\/thread>/gi;
  let match;

  while ((match = threadRegex.exec(observationsContent)) !== null) {
    const threadId = match[1];
    const threadContent = match[2];
    if (!threadId || !threadContent) continue;

    // Parse this thread's content for observations, current-task, suggested-response
    // Extract observations (everything except current-task and suggested-response)
    let observations = threadContent;

    // Extract and remove current-task
    let currentTask: string | undefined;
    const currentTaskMatch = threadContent.match(/<current-task>([\s\S]*?)<\/current-task>/i);
    if (currentTaskMatch?.[1]) {
      currentTask = currentTaskMatch[1].trim();
      observations = observations.replace(/<current-task>[\s\S]*?<\/current-task>/i, '');
    }

    // Extract and remove suggested-response
    let suggestedContinuation: string | undefined;
    const suggestedMatch = threadContent.match(/<suggested-response>([\s\S]*?)<\/suggested-response>/i);
    if (suggestedMatch?.[1]) {
      suggestedContinuation = suggestedMatch[1].trim();
      observations = observations.replace(/<suggested-response>[\s\S]*?<\/suggested-response>/i, '');
    }

    // Clean up observations
    observations = observations.trim();

    threads.set(threadId, {
      observations,
      currentTask,
      suggestedContinuation,
      rawOutput: threadContent,
    });
  }

  // If no thread blocks found, the caller will need to handle this case
  // (e.g., by falling back to single-thread parsing)

  return {
    threads,
    rawOutput: output,
  };
}

/**
 * Build the full prompt for the Observer agent.
 * Includes emphasis on the most recent user message for priority handling.
 */
export function buildObserverPrompt(
  existingObservations: string | undefined,
  messagesToObserve: MastraDBMessage[],
  options?: { skipContinuationHints?: boolean },
): string {
  const formattedMessages = formatMessagesForObserver(messagesToObserve);

  let prompt = '';

  if (existingObservations) {
    prompt += `## 先前的观察\n\n${existingObservations}\n\n---\n\n`;
    prompt += '不要重复这些现有观察。你的新观察将附加到现有观察中。\n\n';
  }

  prompt += `## 需要观察的新消息历史\n\n${formattedMessages}\n\n---\n\n`;

  prompt += `## 你的任务\n\n`;
  prompt += `从上面的消息历史中提取新观察。不要重复已经在先前观察中的观察。按照你的指令中指定的格式添加你的新观察。`;

  if (options?.skipContinuationHints) {
    prompt += `\n\n重要：不要在你的输出中包含 <current-task> 或 <suggested-response> 部分。只输出 <observations>。`;
  }

  return prompt;
}

/**
 * Parse the Observer's output to extract observations, current task, and suggested response.
 * Uses XML tag parsing for structured extraction.
 */
export function parseObserverOutput(output: string): ObserverResult {
  const parsed = parseMemorySectionXml(output);

  // Return observations WITHOUT current-task/suggested-response tags
  // Those are stored separately in thread metadata and injected dynamically
  const observations = parsed.observations || '';

  return {
    observations,
    currentTask: parsed.currentTask || undefined,
    suggestedContinuation: parsed.suggestedResponse || undefined,
    rawOutput: output,
  };
}

/**
 * Parsed result from XML memory section
 */
interface ParsedMemorySection {
  observations: string;
  currentTask: string;
  suggestedResponse: string;
}

/**
 * Parse XML tags from observer/reflector output.
 * Extracts content from <observations>, <current-task>, and <suggested-response> tags.
 */
export function parseMemorySectionXml(content: string): ParsedMemorySection {
  const result: ParsedMemorySection = {
    observations: '',
    currentTask: '',
    suggestedResponse: '',
  };

  // Extract <observations> content (supports multiple blocks)
  // Tags must be at the start of a line (with optional leading whitespace) to avoid
  // capturing inline mentions like "User discussed <observations> tags"
  const observationsRegex = /^[ \t]*<observations>([\s\S]*?)^[ \t]*<\/observations>/gim;
  const observationsMatches = [...content.matchAll(observationsRegex)];
  if (observationsMatches.length > 0) {
    result.observations = observationsMatches
      .map(m => m[1]?.trim() ?? '')
      .filter(Boolean)
      .join('\n');
  } else {
    // Fallback: if no XML tags, extract list items from raw content
    // This handles cases where the LLM doesn't follow the XML format exactly
    result.observations = extractListItemsOnly(content);
  }

  // Extract <current-task> content (first match only)
  // Tags must be at the start of a line to avoid capturing inline mentions
  const currentTaskMatch = content.match(/^[ \t]*<current-task>([\s\S]*?)^[ \t]*<\/current-task>/im);
  if (currentTaskMatch?.[1]) {
    result.currentTask = currentTaskMatch[1].trim();
  }

  // Extract <suggested-response> content (first match only)
  // Tags must be at the start of a line to avoid capturing inline mentions
  const suggestedResponseMatch = content.match(/^[ \t]*<suggested-response>([\s\S]*?)^[ \t]*<\/suggested-response>/im);
  if (suggestedResponseMatch?.[1]) {
    result.suggestedResponse = suggestedResponseMatch[1].trim();
  }

  return result;
}

/**
 * Fallback: Extract only list items from content when XML tags are missing.
 * Preserves nested list items (indented with spaces/tabs).
 */
function extractListItemsOnly(content: string): string {
  const lines = content.split('\n');
  const listLines: string[] = [];

  for (const line of lines) {
    // Match lines that start with list markers (-, *, or numbered)
    // Allow leading whitespace for nested items
    if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      listLines.push(line);
    }
  }

  return listLines.join('\n').trim();
}

/**
 * Check if observations contain a Current Task section.
 * Supports both XML format and legacy markdown format.
 */
export function hasCurrentTaskSection(observations: string): boolean {
  // Check for XML format first
  if (/<current-task>/i.test(observations)) {
    return true;
  }

  // Legacy markdown patterns
  const currentTaskPatterns = [
    /\*\*Current Task:?\*\*/i,
    /^Current Task:/im,
    /\*\*Current Task\*\*:/i,
    /## Current Task/i,
  ];

  return currentTaskPatterns.some(pattern => pattern.test(observations));
}

/**
 * Extract the Current Task content from observations.
 */
export function extractCurrentTask(observations: string): string | null {
  const openTag = '<current-task>';
  const closeTag = '</current-task>';
  const startIdx = observations.toLowerCase().indexOf(openTag);
  if (startIdx === -1) return null;
  const contentStart = startIdx + openTag.length;
  const endIdx = observations.toLowerCase().indexOf(closeTag, contentStart);
  if (endIdx === -1) return null;
  const content = observations.slice(contentStart, endIdx).trim();
  return content || null;
}

/**
 * Optimize observations for token efficiency before presenting to the Actor.
 *
 * This removes:
 * - Non-critical emojis (🟡 and 🟢, keeping only 🔴)
 * - Semantic tags [label, label]
 * - Arrow indicators (->)
 * - Extra whitespace
 *
 * The full format is preserved in storage for analysis.
 */
export function optimizeObservationsForContext(observations: string): string {
  let optimized = observations;

  // Remove 🟡 and 🟢 emojis (keep 🔴 for critical items)
  optimized = optimized.replace(/🟡\s*/g, '');
  optimized = optimized.replace(/🟢\s*/g, '');

  // Remove semantic tags like [label, label] but keep collapsed markers like [72 items collapsed - ID: b1fa]
  optimized = optimized.replace(/\[(?![\d\s]*items collapsed)[^\]]+\]/g, '');

  // Remove arrow indicators
  optimized = optimized.replace(/\s*->\s*/g, ' ');

  // Clean up multiple spaces
  optimized = optimized.replace(/  +/g, ' ');

  // Clean up multiple newlines
  optimized = optimized.replace(/\n{3,}/g, '\n\n');

  return optimized.trim();
}
