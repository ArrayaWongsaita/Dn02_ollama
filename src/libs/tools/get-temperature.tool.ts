import { z } from "zod";
import type { Tool } from "ollama";
import type { AgentTool } from "../tooling.js";

/**
 * === Get Temperature Tool — 5-Layer Pattern ===
 *
 * คืนค่าอุณหภูมิตัวอย่างสำหรับเมืองที่ระบุ — **ข้อมูล mock สำหรับการเรียนรู้**
 * ไม่ได้ต่อกับ API weather service จริง
 *
 * **จุดประสงค์:** สาธิต tool calling ด้วยข้อมูล static —
 * เหมาะสำหรับสอนให้ LLM รู้จักการเรียก tool เพื่อดึงข้อมูล
 * โดยไม่ต้องตั้งค่า API key หรือ external service
 *
 * @see {@link ../tooling.js} คำอธิบาย 5-layer pattern แบบเต็ม
 */

// ─── Layer 1: Zod Runtime Schema ───────────────────────────────────────────
// `.trim().min(1)` — ตัด whitespace หัวท้าย และบังคับว่า city ต้องไม่ว่าง
// ป้องกัน LLM ส่ง string ว่างหรือ whitespace ล้วน
/**
 * Zod schema สำหรับ validate city input
 *
 * ใช้ `z.string().trim().min(1)` — `.trim()` ตัด whitespace หัวท้าย
 * ก่อน validation; `.min(1)` รับประกันว่า string ไม่ว่างหลัง trim
 */
export const getTemperatureSchema = z.object({
  city: z.string().trim().min(1),
});

// ─── Layer 4: Typed Function (business logic) ──────────────────────────────
// ฟังก์ชันรับ city: string (plain type ไม่ใช่ Zod output object)
// เพราะ logic นี้แยกเดี่ยว — ไม่ขึ้นกับ tool lifecycle
/**
 * Pure function — lookup อุณหภูมิจาก static data record
 *
 * **Side effects:** ไม่มี
 * **Unknown city:** คืน "Unknown" แทนการ throw — LLM จะเห็น "Unknown"
 *   และแจ้งผู้ใช้ว่าไม่พบข้อมูล
 *
 * @param city — ชื่อเมือง; เมื่อเรียกผ่าน `getTemperatureTool.execute`
 *   ค่านี้จะผ่านการ validate จาก layer 1 ก่อน
 * @returns อุณหภูมิในรูปแบบ string เช่น "34°C" หรือ "Unknown"
 */
export function getTemperature(city: string): string {
  // Static data record — ตัวอย่างข้อมูลสำหรับการเรียนรู้
  const temperatures: Record<string, string> = {
    Bangkok: "34°C",
    Tokyo: "18°C",
    London: "15°C",
  };

  return temperatures[city] ?? "Unknown";
}

// ─── Layer 2: JSON-compatible Schema (ส่งให้ LLM) ──────────────────────────
export const getTemperatureParameters: Tool = {
  type: "object",
  function: {
    description: "Input for retrieving the example temperature of one city.",
    parameters: {
      required: ["city"],
      properties: {
        city: {
          type: "string",
          description:
            "The city whose example temperature should be returned, such as Bangkok, Tokyo, or London.",
        },
      },
    },
  },
};

// ─── Layer 3: Tool Definition ──────────────────────────────────────────────
/**
 * Tool definition สำหรับส่งให้ Ollama — `get_temperature` เป็น tool
 * สำหรับการเรียนรู้ tool calling ด้วย mock data
 */
export const getTemperatureDefinition: Tool = {
  type: "function",
  function: {
    name: "get_temperature",
    description:
      "Return an example temperature for a city. This is mock data for learning tool calling, not a live weather service.",
    parameters: getTemperatureParameters,
  },
};

// ─── Layer 4 adapter: ห่อ function ธรรมดาให้รับ object (ตาม Zod schema)
// getTemperature รับ city: string แต่ schema ผลิต { city: string }
// adapter นี้ destructure city ออกจาก object ก่อนส่งให้ getTemperature
const getTemperatureFn = ({ city }: z.output<typeof getTemperatureSchema>) =>
  getTemperature(city);

// ─── Layer 5: Execute Validation Boundary ──────────────────────────────────
/**
 * Get temperature tool instance — รวมทั้ง 5 layers
 *
 * `execute` ทำหน้าที่: รับ rawArguments → Zod parse → adapter destructure →
 * เรียก getTemperature → คืนผลลัพธ์
 */
export const getTemperatureTool: AgentTool<typeof getTemperatureSchema> = {
  schema: getTemperatureSchema,
  fn: getTemperatureFn,
  definition: getTemperatureDefinition,
  execute: async (rawArguments) =>
    getTemperatureFn(getTemperatureSchema.parse(rawArguments)),
};
