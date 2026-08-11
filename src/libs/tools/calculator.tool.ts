import { z } from "zod";
import type { Tool } from "ollama";
import type { AgentTool } from "../tooling.js";

/**
 * === Calculator Tool — 5-Layer Pattern ===
 *
 * เครื่องคิดเลข arithmetic พร้อม division-by-zero guard
 * สาธิตโครงสร้าง tool แบบสมบูรณ์ตาม 5-layer pattern
 *
 * @see {@link ../tooling.js} คำอธิบาย 5-layer pattern แบบเต็ม
 */

// ─── Layer 1: Zod Runtime Schema ───────────────────────────────────────────
// Schema นี้ validate input ณ runtime — LLM อาจส่งข้อมูลผิดประเภทหรือข้าม
// required field; Zod จะ throw ZodError ที่มี message ชัดเจนให้ LLM self-correct
/**
 * Zod schema สำหรับตรวจสอบ input ของ calculator tool ณ runtime
 *
 * ใช้ `z.enum` สำหรับ operation เพื่อให้ LLM เลือกแค่ค่าที่อนุญาต
 * ถ้า LLM ส่ง operation นอก enum → Zod จะ throw พร้อมข้อความผิดพลาด
 */
export const calculatorSchema = z.object({
  operation: z.enum(["add", "subtract", "multiply", "divide"]),
  a: z.number(),
  b: z.number(),
});

// ─── Layer 4: Typed Function (business logic) ──────────────────────────────
// ฟังก์ชันนี้รับ typed input จาก z.output ของ layer 1 — แยกจาก layer 5
// เพื่อให้ test ได้โดยตรงโดยไม่ต้องผ่าน tool call lifecycle
/**
 * Pure function สำหรับคำนวณ arithmetic — แยกจาก tool call lifecycle
 *
 * **Side effects:** ไม่มี (pure function)
 * **Division by zero:** throw Error แทนการคืน NaN — LLM จะเห็น error message
 *   และสื่อสารกลับไปยังผู้ใช้
 *
 * @param input — `{ operation, a, b }` ผ่านการ validate จาก layer 1 แล้ว
 * @returns `{ operation, a, b, result }`
 * @throws {Error} ถ้า operation เป็น divide และ b === 0
 */
export function calculate({
  operation,
  a,
  b,
}: z.output<typeof calculatorSchema>) {
  if (operation === "add") return { operation, a, b, result: a + b };
  if (operation === "subtract") return { operation, a, b, result: a - b };
  if (operation === "multiply") return { operation, a, b, result: a * b };
  if (b === 0) throw new Error("Cannot divide by zero.");
  return { operation, a, b, result: a / b };
}

// ─── Layer 2: JSON-compatible Schema (ส่งให้ LLM) ──────────────────────────
// Plain object ที่ LLM ใช้ทำความเข้าใจ contract ของ tool
// ต้องเป็น JSON Schema subset ที่ Ollama รองรับ
export const calculatorParameters: Tool = {
  type: "function",
  function: {
    name: "calculate",
    description:
      "Perform an arithmetic operation on two numbers. Use divide only when the second number is not zero.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["add", "subtract", "multiply", "divide"],
          description:
            "The arithmetic operation to perform: add, subtract, multiply, or divide.",
        },
        a: {
          type: "number",
          description: "The first number in the calculation.",
        },
        b: {
          type: "number",
          description:
            "The second number in the calculation; it must not be zero when dividing.",
        },
      },
      required: ["operation", "a", "b"],
    },
  },
};

// ─── Layer 3: Tool Definition ──────────────────────────────────────────────
// Ollama Tool type — ชื่อ, คำอธิบาย, และ parameters ที่ LLM ใช้ตัดสินใจ
// ว่าจะเรียก tool นี้เมื่อไหร่ และส่ง arguments อะไร
/**
 * Tool definition สำหรับส่งให้ Ollama — LLM ใช้ `name`, `description`
 * และ `parameters` เพื่อตัดสินใจเรียก tool และสร้าง arguments
 */
export const calculatorDefinition: Tool = calculatorParameters;

// ─── Layer 5: Execute Validation Boundary ──────────────────────────────────
// รวมทุก layer เข้าด้วยกัน: schema (1), fn (4), definition (3)
// `execute` รับ rawArguments (unknown) จาก LLM, ผ่าน Zod parse,
// แล้วเรียก fn — เป็น entry point เดียวที่ runToolLoop เรียก
/**
 * Calculator tool instance — รวมทั้ง 5 layers เข้าด้วยกัน
 *
 * `execute` ทำหน้าที่เป็น validation boundary: รับ `rawArguments: unknown`
 * จาก LLM tool call → validate ด้วย Zod schema → เรียก pure function
 * ถ้า validation fail → ZodError จะ propagate ขึ้นไปยัง {@link dispatchToolCall}
 * ซึ่งจะแปลงเป็น error payload ให้ LLM self-correct
 */
export const calculatorTool: AgentTool<typeof calculatorSchema> = {
  schema: calculatorSchema,
  fn: calculate,
  definition: calculatorDefinition,
  execute: async (rawArguments) =>
    calculate(calculatorSchema.parse(rawArguments)),
};
