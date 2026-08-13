import type { Tool } from "ollama";
import { prisma } from "../prisma.js";
import z from "zod";

export const createTaskTool: Tool = {
  type: "function",
  function: {
    name: "create_task",
    description: "Input for creating one new task",
    parameters: {
      type: "object",
      required: ["title"],
      properties: {
        title: {
          type: "string",
          description:
            "The short title of the new task, It must contain 1 to 200 characters",
        },
      },
    },
  },
};

export const createTaskSchema = z.object({
  title: z.string().min(1),
});

export function createTask(data: { title: string }) {
  return prisma.task.create({ data });
}
