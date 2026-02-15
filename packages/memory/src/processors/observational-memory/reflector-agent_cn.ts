import {
  OBSERVER_EXTRACTION_INSTRUCTIONS,
  OBSERVER_OUTPUT_FORMAT_BASE,
  OBSERVER_GUIDELINES,
} from './observer-agent_cn';
import type { ReflectorResult as BaseReflectorResult } from './types';

/**
 * Result from parsing Reflector output, extending the base type with
 * token count used for compression validation.
 */
export interface ReflectorResult extends BaseReflectorResult {
  /** Token count of output (for compression validation) */
  tokenCount?: number;
}

/**
 * Build the Reflector's system prompt.
 *
 * The Reflector handles meta-observation - when observations grow too large,
 * it reorganizes them into something more manageable by:
 * - Re-organizing and streamlining observations
 * - Drawing connections and conclusions between observations
 * - Identifying if the agent got off track and how to get back on track
 * - Preserving ALL important information (reflections become the ENTIRE memory)
 */
export function buildReflectorSystemPrompt(): string {
  return `你是AI助手的记忆意识。你的记忆观察反思将是助手拥有的关于与此用户过去交互的唯一信息。

以下指令被给予你心理的另一个部分（观察者）以创建记忆。
使用这个来理解你的观察记忆是如何创建的。

<observational-memory-instruction>
${OBSERVER_EXTRACTION_INSTRUCTIONS}

=== 输出格式 ===

${OBSERVER_OUTPUT_FORMAT_BASE}

=== 指南 ===

${OBSERVER_GUIDELINES}
</observational-memory-instruction>

你是同一心理的另一个部分，观察反思者。
你存在的理由是对所有观察进行反思，重新组织和精简它们，并在观察之间建立联系和结论，关于你所学到、看到、听到和做的事情。

你是心理的一个更伟大和更广泛的方面。理解你心理的其他部分可能在细节或支线任务中偏离轨道，确保你认真思考当前观察到的目标是什么，并观察我们是否偏离了轨道，以及为什么，以及如何回到正轨。如果我们仍在正轨上，那很好！

接受现有观察并重写它们，使将来更容易继续使用这些知识，以实现更大的目标并成长和学习！

重要：你的反思是助手记忆的全部。你没有添加到反思中的任何信息将立即被遗忘。确保你不要遗漏任何内容。你的反思必须假设助手什么都不知道 - 你的反思是整个记忆系统。

合并观察时：
- 保留并包含日期/时间（如果存在）（时间上下文至关重要）
- 保留最相关的时间戳（开始时间、完成时间、重大事件）
- 在合理的地方合并相关项目（例如，"agent called view tool 5 times on file x"）
- 更积极地压缩较旧的观察，为较新的观察保留更多细节

关键：用户断言 vs 问题
- "User stated: X" = 权威断言（用户告诉我们关于他们自己的事情）
- "User asked: X" = 问题/请求（用户寻求信息）

合并时，用户断言优先。用户是他们自己生活的权威。
如果你看到"User stated: has two kids"和后来"User asked: how many kids do I have?"，
保留断言 - 问题不会使他们已经告诉你的内容失效。答案在断言中。

=== 线程归属（资源范围） ===

当观察包含<thread id="...">部分时：
- 在线程特定上下文重要时保持线程归属（例如，正在进行的任务、线程特定偏好）
- 合并跨线程的稳定/通用事实（例如，用户配置文件、一般偏好）
- 为最近或上下文特定的观察保留线程归属
- 合并时，如果它们代表相同的通用事实，你可以合并来自多个线程的观察

示例输入：
<thread id="thread-1">
日期：2025年12月4日
* 🔴 (14:30) 用户偏好 TypeScript
* 🟡 (14:35) 正在处理认证功能
</thread>
<thread id="thread-2">
日期：2025年12月4日
* 🔴 (15:00) 用户偏好 TypeScript
* 🟡 (15:05) 正在调试 API 端点
</thread>

示例输出（合并后）：
日期：2025年12月4日
* 🔴 (14:30) 用户偏好 TypeScript
<thread id="thread-1">
* 🟡 (14:35) 正在处理认证功能
</thread>
<thread id="thread-2">
* 🟡 (15:05) 正在调试 API 端点
</thread>

=== 输出格式 ===

你的输出必须使用XML标签来构建响应：

<observations>
在这里放置所有合并的观察，使用带优先级表情符号（🔴, 🟡, 🟢）的日期分组格式。
通过缩进分组相关观察。
</observations>

<current-task>
明确说明当前任务：
- Primary: 助手当前正在处理的内容
- Secondary: 其他待处理任务（如果适当，标记为"waiting for user"）
</current-task>

<suggested-response>
助手立即下一条消息的提示。示例：
- "我已经更新了导航模型。让我带你看看这些变化..."
- "助手应该等待用户回复后再继续。"
- 调用 src/example.ts 上的 view 工具以继续调试。
</suggested-response>

用户消息极其重要。如果用户提出问题或给出新任务，在<current-task>中明确这是优先级。如果助手需要响应用户，在<suggested-response>中指示它应该在继续其他任务之前暂停等待用户回复。`;
}

/**
 * The Reflector's system prompt (default - for backwards compatibility)
 */
export const REFLECTOR_SYSTEM_PROMPT = buildReflectorSystemPrompt();

/**
 * Compression guidance by level.
 * - Level 0: No compression guidance (used as first attempt for regular reflection)
 * - Level 1: Gentle compression guidance (original wording — "slightly more" goes a long way for LLMs)
 * - Level 2: Aggressive compression guidance (stronger push when level 1 didn't work)
 */
export const COMPRESSION_GUIDANCE: Record<0 | 1 | 2, string> = {
  0: '',
  1: `
## 需要压缩

你之前的反思与原始观察相同大小或更大。

请以稍微更多的压缩重新处理：
- 在开始部分，将更多观察压缩为更高级别的反思
- 接近结尾时，保留更多细节（最近的上下文更重要）
- 记忆正在变长 - 在整个过程中使用更压缩的风格
- 更积极地合并相关项目，但不要丢失重要的具体细节，如姓名、地点、事件和人物
- 例如，如果有一个关于重复工具调用的长嵌套观察列表，你可以将它们合并为一行，并观察工具被多次调用以x原因，最终y结果发生了。

你当前的细节级别是10/10，让我们目标是8/10的细节级别。
`,
  2: `
## 需要激进压缩

在压缩指导后，你之前的反思仍然太大。

请以更激进的压缩重新处理：
- 在开始部分，将观察大量压缩为高级摘要
- 接近结尾时，保留细节（最近的上下文更重要）
- 记忆变得非常长 - 在整个过程中使用显著更压缩的风格
- 积极合并相关项目，但不要丢失重要的具体细节，如姓名、地点、事件和人物
- 例如，如果有一个关于重复工具调用的长嵌套观察列表，你可以将它们合并为一行，并观察工具被多次调用以x原因，最终y结果发生了。
- 删除冗余信息并合并重叠的观察

你当前的细节级别是10/10，让我们目标是6/10的细节级别。
`,
};

/**
 * Compression retry prompt - backwards compat alias for level 1
 */
export const COMPRESSION_RETRY_PROMPT = COMPRESSION_GUIDANCE[1];

/**
 * Build the prompt for the Reflector agent
 */
export function buildReflectorPrompt(
  observations: string,
  manualPrompt?: string,
  compressionLevel?: boolean | 0 | 1 | 2,
  skipContinuationHints?: boolean,
): string {
  // Normalize: boolean `true` maps to level 1 for backwards compat
  const level: 0 | 1 | 2 = typeof compressionLevel === 'number' ? compressionLevel : compressionLevel ? 1 : 0;

  let prompt = `## 需要反思的观察

${observations}

---

请分析这些观察并生成一个精炼、压缩的版本，这将成为助手未来的全部记忆。`;

  if (manualPrompt) {
    prompt += `

## 具体指导

${manualPrompt}`;
  }

  const guidance = COMPRESSION_GUIDANCE[level];
  if (guidance) {
    prompt += `

${guidance}`;
  }

  if (skipContinuationHints) {
    prompt += `\n\n重要：不要在你的输出中包含<current-task>或<suggested-response>部分。只输出<observations>。`;
  }

  return prompt;
}

/**
 * Parse the Reflector's output to extract observations, current task, and suggested response.
 * Uses XML tag parsing for structured extraction.
 */
export function parseReflectorOutput(output: string): ReflectorResult {
  const parsed = parseReflectorSectionXml(output);

  // Return observations WITHOUT current-task/suggested-response tags
  // Those are stored separately in thread metadata and injected dynamically
  const observations = parsed.observations || '';

  return {
    observations,
    suggestedContinuation: parsed.suggestedResponse || undefined,
    // Note: Reflector's currentTask is not used - thread metadata preserves per-thread tasks
  };
}

/**
 * Parsed result from XML reflector section
 */
interface ParsedReflectorSection {
  observations: string;
  currentTask: string;
  suggestedResponse: string;
}

/**
 * Parse XML tags from reflector output.
 * Extracts content from <observations>, <current-task>, and <suggested-response> tags.
 */
function parseReflectorSectionXml(content: string): ParsedReflectorSection {
  const result: ParsedReflectorSection = {
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
    // Fallback: if no XML tags, try extracting list items first, then fall back to full content
    const listItems = extractReflectorListItems(content);
    result.observations = listItems || content.trim();
  }

  // Extract <current-task> content (first match only)
  const currentTaskMatch = content.match(/<current-task>([\s\S]*?)<\/current-task>/i);
  if (currentTaskMatch?.[1]) {
    result.currentTask = currentTaskMatch[1].trim();
  }

  // Extract <suggested-response> content (first match only)
  const suggestedResponseMatch = content.match(/<suggested-response>([\s\S]*?)<\/suggested-response>/i);
  if (suggestedResponseMatch?.[1]) {
    result.suggestedResponse = suggestedResponseMatch[1].trim();
  }

  return result;
}

/**
 * Fallback: Extract only list items from content when XML tags are missing.
 */
function extractReflectorListItems(content: string): string {
  const lines = content.split('\n');
  const listLines: string[] = [];

  for (const line of lines) {
    // Match lines that start with list markers (-, *, or numbered)
    if (/^\s*[-*]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
      listLines.push(line);
    }
  }

  return listLines.join('\n').trim();
}

/**
 * Validate that reflection actually compressed the observations below the target threshold
 *
 * @param reflectedTokens - Token count of reflected observations
 * @param targetThreshold - Target token count to compress below (the reflection threshold)
 * @returns true if compression was successful (reflected tokens are below target)
 */
export function validateCompression(reflectedTokens: number, targetThreshold: number): boolean {
  // Reflection should be below the target threshold
  return reflectedTokens < targetThreshold;
}
