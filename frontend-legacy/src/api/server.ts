"use server";

import type { BoardResponse } from "./types";

const BACKEND_URL = "http://127.0.0.1:8080";

export async function getBoard(): Promise<BoardResponse> {
  console.log("Fetching board state from:", `${BACKEND_URL}/api/board`);
  try {
    const response = await fetch(`${BACKEND_URL}/api/board`, {
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Board fetch failed with status:", response.status);
      return { pieces: [], turn: "White", status: "Ongoing" };
    }
    const data = await response.json();
    if (!data || !data.pieces) {
      console.error("Board fetch returned invalid data:", data);
      return { pieces: [], turn: "White", status: "Ongoing" };
    }
    return data;
  } catch (e) {
    console.error("SSR Board Fetch Error:", e);
    return { pieces: [], turn: "White", status: "Ongoing" };
  }
}

export async function getMoves(square: number): Promise<number[]> {
  const response = await fetch(`${BACKEND_URL}/api/moves?square=${square}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch moves");
  }
  return response.json();
}

export async function makeMove(args: { from: number; to: number }): Promise<string> {
  const { from, to } = args;
  const response = await fetch(`${BACKEND_URL}/api/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error("Move failed on server:", text);
    throw new Error(text || "Move failed");
  }

  try {
    return await response.json();
  } catch (_e) {
    console.error("Failed to parse move response as JSON, trying text...");
    return "Move accepted";
  }
}

export async function resetGame(): Promise<void> {
  console.log(`Resetting game at ${BACKEND_URL}/api/reset`);
  try {
    const response = await fetch(`${BACKEND_URL}/api/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`Reset failed: ${response.status} ${text}`);
      throw new Error(`Server returned ${response.status}: ${text}`);
    }
    console.log("Reset successful");
  } catch (error: unknown) {
    console.error("Fetch error during reset:", error);
    throw new Error(error instanceof Error ? error.message : "Network error");
  }
}
