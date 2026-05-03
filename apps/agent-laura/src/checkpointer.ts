import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { MemorySaver } from "@langchain/langgraph";
import { config } from "./config/index.js";

let checkpointer: PostgresSaver | MemorySaver | null = null;
let isPostgres = false;

export async function getCheckpointer(): Promise<PostgresSaver | MemorySaver> {
  if (checkpointer) return checkpointer;

  if (config.databaseUrl) {
    checkpointer = PostgresSaver.fromConnString(config.databaseUrl);
    await (checkpointer as PostgresSaver).setup();
    isPostgres = true;
    console.log("PostgresSaver checkpointer initialized");
  } else {
    checkpointer = new MemorySaver();
    isPostgres = false;
    console.log("MemorySaver checkpointer initialized (no DATABASE_URL — state not persisted across restarts)");
  }

  return checkpointer;
}

export function isPostgresCheckpointer(): boolean {
  return isPostgres;
}

export async function closeCheckpointer(): Promise<void> {
  if (checkpointer && isPostgres) {
    await (checkpointer as PostgresSaver).end();
    console.log("PostgresSaver checkpointer closed");
  }
  checkpointer = null;
  isPostgres = false;
}