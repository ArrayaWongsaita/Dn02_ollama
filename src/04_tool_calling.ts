import type { Message, Tool } from "ollama";
import { ollama } from "./configs/ollama.config.js";
import { env } from "./configs/env.config.js";

function getTemperature(city: string): string {
  const temperature: Record<string, string> = {
    Bangkok: "34C",
    Tokyo: "18C",
    London: "15C",
  };
  return temperature[city] ?? "Unknown";
}

const tool: Tool = {
  type: "function",
  function: {
    name: "get_temperature",

    description: "Get the current temperature for a city",

    parameters: {
      type: "object",

      required: ["city"],

      properties: {
        city: {
          type: "string",
          description: "The city name, for example Bangkok, Tokyo, or London",
        },
      },
    },
  },
};

const userPrompt: Message = {
  role: "user",
  content: "ตอนนี้อุณหภูมิที่ กรุงเทพ เท่าไร",
};
const messages: Message[] = [userPrompt];

const res = await ollama.chat({
  model: env.OLLAMA_MODEL,
  messages,
  tools: [tool],
});

messages.push(res.message);
const toolCalls = res.message.tool_calls;

if (toolCalls) {
  //   console.log("toolCalls", toolCalls);
  //   console.log(toolCalls[0]?.function.arguments);
  const parameter = toolCalls[0]?.function.arguments.city;
  const result = getTemperature(parameter);

  messages.push({
    role: "tool",
    tool_name: toolCalls[0]?.function.name ?? "",
    content: result,
  });
}
console.log("messages", messages);
const finalRes = await ollama.chat({
  model: env.OLLAMA_MODEL,
  messages,
});

console.log(finalRes.message);
