import type { Message } from "ollama";
import z from "zod";
import { ollama } from "./configs/ollama.config.js";
import { env } from "./configs/env.config.js";

const systemPrompt: Message = {
  role: "system",
  content: `
    Return ONLY valid JSON.
    Do not use markdown
    Do not use txt Format

    Format:
    {
    "number": "string",
    }

    `,
};

const Country = z.object({
  name: z.string(),
  capital: z.string(),
});

const userPrompt: Message = {
  role: "user",
  content: "ช่วยแสดงเลขหลังจาก 4 มา 3 ลำดับ",
};

const agentPrompt = {
  role: "assistant",
  content: '{"number":"5, 6, 7"}',
  thinking:
    'The user says: "ช่วยแสดงเลขหลังจาก 4 มา 3 ลำดับ". That is Thai: "Please display the numbers after 4 for 3 sequences" or "Show numbers after 4 for 3 sequenced???"\n' +
    "\n" +
    'Interpretation: They want to show numbers after 4? Maybe they want " "the next 3 numbers after 4"? That would be 5,6,7. Or "Show numbers after 4" for 3 sequences. Context unclear.\n' +
    "\n" +
    'Given the instruction: format must be JSON with "number": "string". But maybe they want "number" to be output string that includes a result.\n' +
    "\n" +
    'I think expected output: JSON object: "number": "5, 6, 7". That satisfies. It uses string. The format says must contain "number": "string". So we respond:\n' +
    "\n" +
    "{\n" +
    '"number":"5, 6, 7"\n' +
    "}\n" +
    "\n" +
    "Let's produce that.",
};

const res = await ollama.chat({
  model: env.OLLAMA_MODEL,
  messages: [
    systemPrompt,
    userPrompt,
    agentPrompt,
    { role: "user", content: "นับต่อไปอีก 6 ลำดับ" },
    {
      role: "assistant",
      content: '{"number":"8, 9, 10, 11, 12, 13"}',
      thinking: `User: "นับต่อไปอีก 6 ลำดับ" Means: count five, six, seven, now he wants to count continue for 6 more numbers. Initially 5,6,7. They want 6 more: 8,9,10,11,12,13? Let's calculate: Starting from 4? They had "เลขหลังจาก 4 มา 3 ลำดับ" (numbers after 4, 3 numbers). That yields 5,6,7. Now "นับต่อไปอีก 6 ลำดับ" means continue counting for 6 more numbers after 7. So 8,9,10,11,12,13. Provide JSON: {"number":"8, 9, 10, 11, 12, 13"}. Ensure format meets: number strings. Accept.`,
    },
    { role: "user", content: "นับต่อไปอีก 4 ลำดับ" },
  ],
});

console.log("res", res.message);
