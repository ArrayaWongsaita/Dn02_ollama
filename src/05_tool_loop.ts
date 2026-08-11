import type { Message, Tool } from "ollama";
import { getTemperatureParameters } from "./libs/tools/get-temperature.tool.js";
import { currentTimeParameters } from "./libs/tools/current-time.tool.js";
import { calculatorParameters } from "./libs/tools/calculator.tool.js";
import { ollama } from "./configs/ollama.config.js";
import { env } from "./configs/env.config.js";

async function main() {
  const userPrompt: Message = {
    role: "user",
    content: "ตอนนี้ที่กรุงเทพ เป็นเวลาเท่าไร และอณหภูมิเท่าไร",
  };

  const tools: Tool[] = [
    getTemperatureParameters,
    currentTimeParameters,
    calculatorParameters,
  ];

  const context: Message[] = [userPrompt];

  const res = ollama.chat({
    model: env.OLLAMA_MODEL,
    messages: context,
    tools: tools,
  });
}
