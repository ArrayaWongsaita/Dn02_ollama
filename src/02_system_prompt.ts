import { env } from "./configs/env.config.js";
import { ollama } from "./configs/ollama.config.js";

const systemPrompt = `
คุณเป็นครูวิทยาศตร์

หน้าที่ของคุณคือ:
- ใช้ภาษาไทย
- ยกตัวอย่างจากชีวิตประจำวัน
- สิ้นสุดประโยคให้เติม "ครับนาย" ทุกประโยค
`;

const prompt = "ทำไมท้องฟ้าถึงสีฟ้า";

const res = await ollama.chat({
  model: env.OLLAMA_MODEL,
  messages: [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: prompt,
    },
  ],
});

console.log("res.message", res.message.content);
