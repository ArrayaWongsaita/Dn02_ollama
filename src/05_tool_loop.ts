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
import { tuple, ZodError } from "zod";
import {
  createTask,
  createTaskSchema,
  createTaskTool,
} from "./libs/tools/create-task.tool.js";
import { getTasksSchema, getTaskTool } from "./libs/tools/get-task.tool.js";
import { prisma } from "./libs/prisma.js";

async function main() {
  const userPrompt: Message = {
    role: "user",
    content: "check ข้อมูล tasks ทั้งหมดให้หน่อย ",
  };

  const tools: Tool[] = [
    getTemperatureParameters,
    currentTimeParameters,
    calculatorParameters,
    createTaskTool,
    getTaskTool,
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
      return res.message.content;
    }
    for await (const el of toolCall) {
      try {
        console.log("tool call", el.function);

        if (el.function.name === "get_tasks") {
          try {
            console.log("---------------------");
            const where = getTasksSchema.parse(el.function.arguments) ?? {};

            const result = await prisma.task.findMany({
              where: where,
            });
            console.log("result", result);
            context.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_name: "get_tasks",
            });
          } catch (error) {
            console.log("error", error);
          }
        }

        if (el.function.name === "create_task") {
          const result = await createTask(
            createTaskSchema.parse(el.function.arguments),
          );
          context.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_name: "create_task",
          });
        }

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
    }
  }
}

console.log(await main());
