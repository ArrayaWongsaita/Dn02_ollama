import { z } from "zod";
import type { Tool } from "ollama";
import type { AgentTool } from "../tooling.js";

/**
 * === Current Time Tool — 5-Layer Pattern ===
 *
 * คืนค่าวันที่และเวลาปัจจุบันตาม timezone ที่ระบุ
 * ใช้ `Intl.DateTimeFormat` API — เป็น Web standard API ที่มีใน Node.js ≥ 14
 * ไม่ต้องพึ่ง library ภายนอก
 *
 * **ข้อสังเกต:** tool นี้ไม่เปลี่ยนแปลง database หรือ application state
 * แต่ผลลัพธ์ขึ้นกับเวลาของ system clock จึงไม่ใช่ pure function แบบ deterministic
 * แต่ยังต้อง validate timezone string เพราะ LLM อาจส่งค่า IANA timezone
 * ที่ไม่ถูกต้อง (`Intl.DateTimeFormat` จะ throw ถ้า timezone invalid)
 *
 * @see {@link ../tooling.js} คำอธิบาย 5-layer pattern แบบเต็ม
 */

// ─── Layer 1: Zod Runtime Schema ───────────────────────────────────────────
// timezone มี default "Asia/Bangkok" — LLM ไม่ต้องส่ง timezone ก็ได้
// ถ้าส่งมา ต้องเป็น string (IANA timezone เช่น "Asia/Tokyo")
/**
 * Zod schema สำหรับ validate timezone input
 *
 * `timezone` มีค่า default เป็น "Asia/Bangkok" — ถ้า LLM ไม่ระบุ timezone
 * default จะถูกใช้โดยอัตโนมัติ (Zod `.default()`)
 *
 * **ข้อจำกัด:** schema นี้ validate แค่ว่า timezone เป็น string
 * ไม่ได้ validate ว่าเป็น IANA timezone ที่ถูกต้อง —
 * `Intl.DateTimeFormat` จะ throw เองถ้า timezone invalid
 */
export const currentTimeSchema = z.object({
  timezone: z.string().default("Asia/Bangkok"),
});

// ─── Layer 4: Typed Function (business logic) ──────────────────────────────
/**
 * ฟังก์ชันสำหรับอ่านวันที่/เวลาปัจจุบันตาม timezone
 *
 * **Side effects:** ไม่ mutate state แต่ผลลัพธ์เปลี่ยนตาม `new Date()`
 * **ข้อผิดพลาดที่อาจเกิด:** ถ้า timezone ไม่ใช่ IANA timezone ที่ถูกต้อง
 *   `Intl.DateTimeFormat` จะ throw RangeError; เมื่อเรียกผ่าน tool loop
 *   `dispatchToolCall` จะจับและแปลงเป็น error payload
 *
 * @param input — `{ timezone }`; เมื่อเรียกผ่าน tool instance ค่านี้จะผ่าน
 *   layer 1 ก่อน แต่ผู้เรียก exported function โดยตรงต้องรับผิดชอบ input เอง
 * @returns `{ timezone, currentTime }` — currentTime เป็น string รูปแบบ
 *   en-GB full date + long time
 */
export function getCurrentTime({ timezone }: z.output<typeof currentTimeSchema>) {
  return {
    timezone,
    currentTime: new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: timezone,
    }).format(new Date()),
  };
}

// ─── Layer 2: JSON-compatible Schema (ส่งให้ LLM) ──────────────────────────
// timezone เป็น optional ใน layer 2 (ไม่มีใน required array) —
// LLM จะเห็นว่าไม่ต้องส่ง timezone ถ้าไม่รู้
const currentTimeParameters = {
  type: "object",
  description: "Input for retrieving the current date and time in a timezone.",
  properties: {
    timezone: {
      type: "string",
      description:
        "An IANA timezone such as Asia/Bangkok, Asia/Tokyo, or Europe/London. Defaults to Asia/Bangkok.",
    },
  },
  additionalProperties: false,
} as NonNullable<Tool["function"]["parameters"]>;

// ─── Layer 3: Tool Definition ──────────────────────────────────────────────
/**
 * Tool definition สำหรับส่งให้ Ollama — `get_current_time` เป็น tool
 * ที่ไม่เปลี่ยนแปลง state (read-only) LLM ควรเรียกเมื่อผู้ใช้ถามเวลา
 */
export const currentTimeDefinition: Tool = {
  type: "function",
  function: {
    name: "get_current_time",
    description:
      "Get the current date and time for an IANA timezone. Use this when the user asks what time it is in a location.",
    parameters: currentTimeParameters,
  },
};

// ─── Layer 5: Execute Validation Boundary ──────────────────────────────────
/**
 * Current time tool instance — รวมทั้ง 5 layers
 *
 * `execute` ทำหน้าที่: รับ rawArguments → Zod parse (พร้อม default) →
 * เรียก getCurrentTime → คืนผลลัพธ์
 */
export const currentTimeTool: AgentTool<typeof currentTimeSchema> = {
  schema: currentTimeSchema,
  fn: getCurrentTime,
  definition: currentTimeDefinition,
  execute: async (rawArguments) =>
    getCurrentTime(currentTimeSchema.parse(rawArguments)),
};
