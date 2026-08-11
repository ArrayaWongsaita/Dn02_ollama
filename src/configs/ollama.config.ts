import { Ollama } from "ollama";
import { env } from "./env.config.js";

export const ollama = new Ollama({
  host: env.OLLAMA_HOST,
  headers: {
    Authorization: `Bearer ${env.OLLAMA_API_KEY}`,
  },
});
