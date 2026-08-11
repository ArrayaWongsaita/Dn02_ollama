import type { Message, Tool } from "ollama";
import {
  getTemperature,
  getTemperatureParameters,
  getTemperatureSchema,
} from "./libs/tools/get-temperature.tool.js";
import {
  currentTimeParameters,
  currentTimeSchema,
  currentTimeTool,
  getCurrentTime,
} from "./libs/tools/current-time.tool.js";
import { calculatorParameters } from "./libs/tools/calculator.tool.js";
import { ollama } from "./configs/ollama.config.js";
import { env } from "./configs/env.config.js";
import { ZodError } from "zod";

async function main() {
  const userPrompt: Message = {
    role: "user",
    content:
      "ตอนนี้ที่กรุงเทพ เป็นเวลาเท่าไร และอณหภูมิเท่าไร และ 4 + 4 เท่ากับเท่าไร",
  };

  const tools: Tool[] = [
    getTemperatureParameters,
    currentTimeParameters,
    calculatorParameters,
  ];

  const context: Message[] = [userPrompt];

  for (let index = 0; index <= 3; index++) {
    console.log(index);

    const res = await ollama.chat({
      model: env.OLLAMA_MODEL,
      messages: context,
      tools: tools,
    });

    context.push(res.message);
    // console.log("res.message", res.message);
    const toolCall = res.message.tool_calls;
    if (!toolCall || toolCall.length === 0) {
      return context;
    }

    toolCall.forEach((el) => {
      try {
        console.log("----", el.function);
        if (el.function.name === "get_city_temperature") {
          console.log("get_city_temperature", el.function.arguments);
          const result = getTemperature(
            getTemperatureSchema.parse(el.function.arguments).city,
          );
          context.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_name: el.function.name,
          });
        }
        if (el.function.name === "get_current_time") {
          const result = getCurrentTime(
            currentTimeSchema.parse(el.function.arguments),
          );
          context.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_name: el.function.name,
          });
        }
      } catch (error) {
        if (error instanceof ZodError) {
          console.log("error----", el.function);
          context.push({
            role: "error:" + el.function.name,
            content: JSON.stringify(error),
          });
        }
      }
    });

    // console.log("context", context);
  }

  return context;
}

console.log(await main());
