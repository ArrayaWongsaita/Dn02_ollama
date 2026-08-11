import { ollama } from "./configs/ollama.config.js";
import { env } from "./configs/env.config.js";

const stream = await ollama.chat({
  model: env.OLLAMA_MODEL,
  messages: [{ role: "user", content: "ทำไมท้องฟ้าถึงสีฟ้า" }],
  stream: true,
});
let message = "";
for await (const chunk of stream) {
  message += chunk.message.content;
  console.log("\n\n\n\n\n\n");
  console.log(message);
}
