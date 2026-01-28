import { cache, action } from "@solidjs/router";
import * as server from "./server";

export const getBoard = cache(server.getBoard, "board");
export const getMoves = server.getMoves;
export const makeMove = action(server.makeMove, "makeMove");
export const resetGame = action(server.resetGame, "resetGame");
