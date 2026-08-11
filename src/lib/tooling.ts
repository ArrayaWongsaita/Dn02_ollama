import type { Message, Tool, ToolCall } from "ollama";
import z from "zod";

/**
 * === สถาปัตยกรรม Tool System ===
 *
 * ระบบ tool ของโปรเจกต์นี้ใช้ **5-layer pattern** ที่แยกความกังวลระหว่าง
 * contract ที่สื่อสารกับ LLM กับ logic ที่รันจริง:
 *
 * **Layer 1 — Zod Runtime Schema:** schema การตรวจสอบข้อมูล ณ runtime
 *   (`z.object(...)`) รับประกัน type safety เมื่อข้อมูลเข้ามาจาก LLM
 *   (ซึ่งอาจผิดสเปก)
 * **Layer 2 — JSON-compatible Schema (ส่งให้ LLM):** plain object ที่ระบุ
 *   type/enum/description ในรูปแบบ JSON Schema — LLM อ่าน contract นี้
 *   เพื่อสร้าง tool call arguments
 * **Layer 3 — Tool Definition:** `Tool` type จาก Ollama SDK — ห่อ schema
 *   ของ layer 2 พร้อม `name` และ `description` ที่ LLM ใช้ตัดสินใจเรียก tool
 * **Layer 4 — Typed Function:** ฟังก์ชันที่รับ typed input (จาก `z.output`)
 *   และรัน business logic จริง ซึ่งอาจเป็น pure calculation หรือเรียก use case
 *   ที่มี side effect — แยกจาก layer 5 เพื่อให้ test ได้
 *   โดยไม่ต้อง mock tool call
 * **Layer 5 — Execute Validation Boundary:** ฟังก์ชัน `execute` ที่รับ
 *   `rawArguments: unknown` จาก tool call, ผ่าน Zod parse, แล้วเรียก layer 4
 *   — เป็นสะพานเชื่อมระหว่าง LLM (untyped) กับ business logic (typed)
 */

/**
 * Abstraction เหนือ tool ใด ๆ — interface กลางที่ `runToolLoop` ใช้ dispatch
 *
 * @property definition — `Tool` object ที่ส่งให้ Ollama (layer 3)
 * @property execute — ฟังก์ชันที่รับ raw arguments จาก LLM (unknown type)
 *   แล้วคืนผลลัพธ์เป็น `unknown` (layer 5 — validation boundary)
 */
export interface ToolHandler {
  definition: Tool;
  execute: (rawArguments: unknown) => Promise<unknown>;
}

/**
 * Tool ที่มี generic Zod schema — ให้ type safety เต็มรูปแบบ
 *
 * ใช้ `TSchema` เป็น Zod schema ที่ validate input ก่อนส่งให้ `fn`
 * `fn` รับ type `z.output<TSchema>` ซึ่งเป็น inferred type จาก schema
 *
 * @template TSchema — Zod schema type ที่ใช้ validate input
 * @property schema — Zod schema สำหรับ runtime validation (layer 1)
 * @property fn — typed function ที่ทำงานกับ input หลัง validation (layer 4)
 */
export interface AgentTool<
  TSchema extends z.ZodType = z.ZodType,
> extends ToolHandler {
  schema: TSchema;
  fn: (arguments_: z.output<TSchema>) => unknown | Promise<unknown>;
}

/**
 * Signature ของฟังก์ชันที่ส่งข้อความไปยัง Ollama chat API
 *
 * รับ `messages` (ประวัติการสนทนาทั้งหมด) และ `tools` (รายการ tool definitions)
 * คืนข้อความตอบกลับจาก assistant (อาจมีหรือไม่มี `tool_calls` ก็ได้)
 */
export type ChatTurn = (
  messages: readonly Message[],
  tools: readonly Tool[],
) => Promise<Message>;

/**
 * ตัวเลือกสำหรับ `runToolLoop`
 *
 * @property chat — ฟังก์ชันเรียก Ollama chat API
 * @property messages — ข้อความเริ่มต้น (system prompt + conversation history)
 * @property tools — รายการ tool handlers ที่ LLM สามารถเรียกได้
 * @property maxRounds — จำนวนรอบสูงสุดของ tool loop (default 8)
 *   **เหตุผล:** ป้องกัน infinite loop กรณี LLM เรียก tool ซ้ำไม่รู้จบ
 *   (bounded loop termination) — ถ้า LLM เรียก tool เกิน `maxRounds`
 *   ฟังก์ชันจะ throw Error
 */
export interface RunToolLoopOptions {
  chat: ChatTurn;
  messages: readonly Message[];
  tools: readonly ToolHandler[];
  maxRounds?: number;
}

/**
 * ผลลัพธ์จาก `runToolLoop`
 *
 * @property finalMessage — assistant message สุดท้าย (อันที่ไม่มี tool_calls)
 * @property messages — ประวัติการสนทนาทั้งหมดรวมถึง tool calls/results
 * @property rounds — จำนวนรอบที่ใช้จริง
 */
export interface ToolLoopResult {
  finalMessage: Message;
  messages: Message[];
  rounds: number;
}

/**
 * รัน tool loop: ส่งข้อความ → รับ tool calls → execute tools → ส่งผลลัพธ์
 * กลับ → ทำซ้ำ จนกว่า assistant จะตอบโดยไม่เรียก tool หรือเกิน maxRounds
 *
 * **Bounded Loop Termination:**
 * - loop วนสูงสุด `maxRounds` รอบ (default 8)
 * - แต่ละรอบ: LLM ตอบ → ถ้าไม่มี `tool_calls` → จบทันทีด้วย final message
 * - ถ้ามี tool calls → execute ทีละอัน → เพิ่ม tool result เข้า history → รอบถัดไป
 * - ถ้าครบ `maxRounds` แล้ว LLM ยังเรียก tool → throw Error (ป้องกัน infinite loop)
 *
 * **ประวัติการสนทนา (history):**
 * - `history` เริ่มจาก shallow copy ของอาร์เรย์ `messages` ด้วย spread
 * - assistant message ทุกอันถูกเพิ่มเข้า history
 * - tool result ทุกอันถูกเพิ่มเข้า history หลัง execute
 * - history ทั้งหมดถูกส่งกลับให้ LLM ทุกรอบ (context สะสม)
 *
 * @param options — ดู {@link RunToolLoopOptions}
 * @returns ผลลัพธ์ของ tool loop ดู {@link ToolLoopResult}
 * @throws {RangeError} ถ้า `maxRounds` ไม่ใช่ positive integer
 * @throws {Error} ถ้า loop เกิน `maxRounds` รอบโดย LLM ยังเรียก tool
 */
export async function runToolLoop({
  chat,
  messages,
  tools,
  maxRounds = 8,
}: RunToolLoopOptions): Promise<ToolLoopResult> {
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new RangeError("maxRounds must be a positive integer.");
  }

  // shallow copy อาร์เรย์ต้นทาง — เพิ่ม/ลบสมาชิกใน history ได้โดยไม่ mutate input array
  const history = [...messages];
  // extract definitions (layer 3) จาก handlers เพื่อส่งให้ Ollama
  const definitions = tools.map((tool) => tool.definition);

  for (let round = 1; round <= maxRounds; round++) {
    // รอบที่ round: ส่ง history + definitions ให้ Ollama
    const assistantMessage = await chat(history, definitions);
    history.push(assistantMessage);
    const toolCalls = assistantMessage.tool_calls ?? [];

    // ไม่มี tool calls → assistant ตอบคำถามสุดท้ายแล้ว → จบ loop
    if (toolCalls.length === 0) {
      return { finalMessage: assistantMessage, messages: history, rounds: round };
    }

    // LLM ขอเรียก tool หนึ่งตัวหรือหลายตัว → execute ตามลำดับที่ LLM ส่งมา
    // ใช้ sequential execution (ไม่ใช่ parallel) เพื่อรักษาลำดับผลลัพธ์ตามที่
    // โมเดลส่งมา และหลีกเลี่ยง side effects ของหลาย tools ที่เกิดพร้อมกัน
    for (const toolCall of toolCalls) {
      const result = await dispatchToolCall(toolCall, tools);
      // สร้าง tool message ตาม Ollama protocol:
      // role: "tool", tool_name: ชื่อ tool, content: ผลลัพธ์ (string)
      history.push({
        role: "tool",
        tool_name: result.toolName,
        content: result.content,
      });
    }
  }

  // มาถึงตรงนี้ = loop ครบ maxRounds โดย LLM ยังเรียก tool →
  // throw เพื่อป้องกัน infinite loop
  throw new Error(`Tool loop exceeded the maximum of ${maxRounds} rounds.`);
}

/**
 * Dispatch tool call ไปยัง handler ที่เหมาะสม
 *
 * **ขั้นตอนการ dispatch:**
 * 1. **Lookup:** ค้นหา handler จาก `call.function.name` ในรายการ `tools`
 *    — ใช้ `.find()` O(n) scan ซึ่งเพียงพอสำหรับจำนวน tool ระดับ < 20 อัน
 * 2. **Unknown tool guard:** ถ้าไม่พบ handler → คืน error payload
 *    (ไม่ throw) เพื่อให้ LLM เห็นข้อผิดพลาดและแก้ไขเองในการเรียกครั้งต่อไป
 * 3. **Parse & Execute:** เรียก `handler.execute(call.function.arguments)`
 *    — arguments อาจเป็น `undefined` (LLM ไม่ได้ส่งมา) จึงใช้ `?? {}` fallback
 *    — การ parse/validate เกิดขึ้นภายใน execute ของแต่ละ tool
 * 4. **Serialization:** ถ้าผลลัพธ์เป็น string อยู่แล้ว → ใช้เลย
 *    ถ้าไม่ใช่ → `JSON.stringify` → fallback `String(result)`
 *    **เหตุผล:** Ollama ต้องการ content เป็น string เสมอ
 * 5. **Error handling:** ถ้า execute throw → จับ error, เปลี่ยนเป็น
 *    `{ error: message }` payload → ให้ LLM เห็นและปรับการเรียก
 *    (self-correction pattern)
 *
 * @param call — tool call จาก assistant message
 * @param tools — รายการ tool handlers ที่ลงทะเบียนไว้
 * @returns `{ toolName, content }` — content เป็น string ที่พร้อมใส่ใน tool message
 *   ในกรณี success: `content` คือ JSON string หรือ plain string
 *   ในกรณี error: `content` คือ `{"error":"<message>"}`
 */
export async function dispatchToolCall(
  call: ToolCall,
  tools: readonly ToolHandler[],
): Promise<{ toolName: string; content: string }> {
  const toolName = call.function.name;
  // ขั้นตอนที่ 1: Lookup handler ตามชื่อ tool
  const handler = tools.find(
    (candidate) => candidate.definition.function.name === toolName,
  );

  // ขั้นตอนที่ 2: Unknown tool — คืน error payload ให้ LLM self-correct
  if (!handler) {
    return {
      toolName,
      content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
    };
  }

  // ขั้นตอนที่ 3-5: Execute → serialize → catch error
  try {
    const result = await handler.execute(call.function.arguments ?? {});
    const content =
      typeof result === "string"
        ? result
        : (JSON.stringify(result) ?? String(result));

    return { toolName, content };
  } catch (error) {
    // แปลง error เป็น payload ที่ LLM อ่านเข้าใจ
    const message = error instanceof Error ? error.message : String(error);
    return { toolName, content: JSON.stringify({ error: message }) };
  }
}
