import type { BoardResponse } from "./board";
import type {
    Color,
    ComputerOpponent,
    GameMode,
    GameStatus,
    PromotionPiece,
    QueueStatus,
} from "./chess";

// Single persistent socket per client. Every client message carries an
// opaque id so request/response pairs can be correlated after reconnects.
// Server pushes (game.state, queue.status, presence, offers) arrive
// without an id and must be applied immediately.

export type WsRequestId = string;

export type WsClientMessage =
    | { id: WsRequestId; type: "hello"; token?: string }
    | { id: WsRequestId; type: "queue.join"; timeControl: number; increment?: number }
    | { id: WsRequestId; type: "queue.leave" }
    | { id: WsRequestId; type: "game.new"; mode: GameMode; timeControl?: number; increment?: number; opponent?: ComputerOpponent }
    | { id: WsRequestId; type: "game.join"; gameId: number }
    | { id: WsRequestId; type: "game.leave"; gameId: number }
    | { id: WsRequestId; type: "board.get"; gameId?: number; mode?: GameMode }
    | { id: WsRequestId; type: "moves.get"; gameId: number; square: number }
    | { id: WsRequestId; type: "game.move"; gameId: number; from: number; to: number; promotion?: PromotionPiece; opponent?: ComputerOpponent }
    | { id: WsRequestId; type: "game.resign"; gameId: number }
    | { id: WsRequestId; type: "game.draw.offer"; gameId: number }
    | { id: WsRequestId; type: "game.draw.respond"; gameId: number; accept: boolean }
    | { id: WsRequestId; type: "game.undo.request"; gameId: number }
    | { id: WsRequestId; type: "game.undo.respond"; gameId: number; accept: boolean }
    | { id: WsRequestId; type: "game.rematch.offer"; gameId: number }
    | { id: WsRequestId; type: "game.rematch.respond"; gameId: number; accept: boolean }
    | { id: WsRequestId; type: "ping" };

export type WsQueuePayload = {
    status: QueueStatus;
    gameId?: number;
    timeControl?: number;
};

export type WsGameMatchedPayload = {
    gameId: number;
    color: Color;
    timeControl: number;
    increment: number;
};

export type WsPresencePayload = {
    gameId: number;
    whiteOnline: boolean;
    blackOnline: boolean;
};

export type WsGameOverPayload = {
    gameId: number;
    status: GameStatus;
    winner?: Color | null;
    reason: string;
};

export type WsServerMessage =
    | { id?: WsRequestId; type: "hello.ok"; userId: string | null }
    | { id?: WsRequestId; type: "pong" }
    | { id?: WsRequestId; type: "queue.status"; status: QueueStatus; gameId?: number; timeControl?: number }
    | { id?: WsRequestId; type: "game.matched"; gameId: number; color: Color; timeControl: number; increment: number }
    | { id?: WsRequestId; type: "game.state"; board: BoardResponse }
    | { id?: WsRequestId; type: "moves.result"; gameId: number; square: number; targets: number[] }
    | { id?: WsRequestId; type: "game.draw.offered"; gameId: number; by: Color }
    | { id?: WsRequestId; type: "game.undo.requested"; gameId: number; by: Color }
    | { id?: WsRequestId; type: "game.undo.result"; gameId: number; accepted: boolean }
    | { id?: WsRequestId; type: "game.rematch.offered"; gameId: number; by: Color }
    | { id?: WsRequestId; type: "presence"; gameId: number; whiteOnline: boolean; blackOnline: boolean }
    | { id?: WsRequestId; type: "game.over"; gameId: number; status: GameStatus; winner?: Color | null; reason: string }
    | { id?: WsRequestId; type: "error"; message: string };

export function wsProtocolVersion(): string {
    return "1";
}
