import type { Tool } from "ollama";
import z from "zod";

export const getTaskTool: Tool = {
  type: "function",
  function: {
    name: "get_tasks",
    description:
      "Input for listing task with an optional completion-status filter",
    parameters: {
      type: "object",
      required: ["completed"],
      properties: {
        completed: {
          type: "boolean",
          description:
            "Option status filter: true for completed task or false for incomplete task",
        },
      },
    },
  },
};

export const getTasksSchema = z.object({
  completed: z.boolean().optional(),
});
