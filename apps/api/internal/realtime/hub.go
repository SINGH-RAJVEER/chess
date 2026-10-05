package realtime

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/rajveer/sixtyfour/apps/api/internal/auth"
	"github.com/rajveer/sixtyfour/apps/api/internal/engine"
	"github.com/rajveer/sixtyfour/apps/api/internal/game"
)

// Hub keeps one persistent socket per client and pushes game state instead
// of making clients poll. PostgreSQL remains the source of truth; the hub
// only routes notifications and enforces turn ownership.
type Hub struct {
	auth   *auth.Service
	games  *game.Service
	broker Broker

	mu            sync.Mutex
	clients       map[*Client]bool
	byUser        map[string]map[*Client]bool
	rooms         map[int]map[*Client]bool
	undoRequests  map[int]string
	rematchOffers map[int]string
	lastStatus    map[int]game.GameStatus
	lastMoves     map[int]int
	lastRevision  map[int]int64
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID string
	rooms  map[int]bool
	done   chan struct{}
}

func NewHub(authService *auth.Service, gameService *game.Service, broker Broker) *Hub {
	if broker == nil {
		broker = NewMemoryBroker()
	}
	hub := &Hub{
		auth:          authService,
		games:         gameService,
		broker:        broker,
		clients:       make(map[*Client]bool),
		byUser:        make(map[string]map[*Client]bool),
		rooms:         make(map[int]map[*Client]bool),
		undoRequests:  make(map[int]string),
		rematchOffers: make(map[int]string),
		lastStatus:    make(map[int]game.GameStatus),
		lastMoves:     make(map[int]int),
		lastRevision:  make(map[int]int64),
	}
	// Nil services are tolerated so handler contract tests can construct
	// the mux without a database.
	if gameService != nil {
		gameService.OnUpdate = hub.notifyGame
		gameService.OnSnapshot = func(snapshot game.Snapshot) {
			hub.broker.Publish(Change{GameID: snapshot.Board.ID, Snapshot: &snapshot})
		}
	}
	// Every change flows through the broker so all replicas converge:
	// the local broadcast below serves this instance's subscribers while
	// remote instances deliver to theirs.
	broker.Subscribe(func(change Change) {
		if change.Snapshot != nil {
			hub.broadcastSnapshot(*change.Snapshot)
		} else {
			hub.broadcastGame(change.GameID)
		}
	})
	go hub.timeoutLoop()
	return hub
}

// gameChanged announces a mutation. Delivery to subscribers on this and
// every other replica happens through the broker subscription above.
func (hub *Hub) gameChanged(gameID int) {
	hub.broker.Publish(Change{GameID: gameID})
}

func (hub *Hub) ServeWS(writer http.ResponseWriter, request *http.Request) {
	conn, err := websocket.Accept(writer, request, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"},
	})
	if err != nil {
		return
	}
	userID := ""
	token := hub.auth.RequestToken(request)
	if query := request.URL.Query().Get("token"); query != "" {
		token = query
	}
	if token != "" {
		if session, err := hub.auth.GetSession(request.Context(), token); err == nil && session != nil {
			userID = session.User.ID
		}
	}
	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan []byte, 64),
		userID: userID,
		rooms:  make(map[int]bool),
		done:   make(chan struct{}),
	}
	hub.addClient(client)
	defer hub.removeClient(client)
	go client.writeLoop()
	client.sendJSON(map[string]any{"type": "hello.ok", "userId": userID})
	client.readLoop(request.Context())
}

func (hub *Hub) addClient(client *Client) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	hub.clients[client] = true
	if client.userID != "" {
		if hub.byUser[client.userID] == nil {
			hub.byUser[client.userID] = make(map[*Client]bool)
		}
		hub.byUser[client.userID][client] = true
	}
}

func (hub *Hub) removeClient(client *Client) {
	hub.mu.Lock()
	rooms := make([]int, 0, len(client.rooms))
	for gameID := range client.rooms {
		rooms = append(rooms, gameID)
	}
	delete(hub.clients, client)
	if client.userID != "" {
		delete(hub.byUser[client.userID], client)
		if len(hub.byUser[client.userID]) == 0 {
			delete(hub.byUser, client.userID)
		}
	}
	for _, gameID := range rooms {
		delete(hub.rooms[gameID], client)
		if len(hub.rooms[gameID]) == 0 {
			delete(hub.rooms, gameID)
		}
	}
	hub.mu.Unlock()
	for _, gameID := range rooms {
		hub.broadcastPresence(gameID)
	}
	close(client.done)
}

func (client *Client) sendJSON(value any) {
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	select {
	case client.send <- data:
	default:
	}
}

func (client *Client) writeLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-client.done:
			return
		case data := <-client.send:
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			err := client.conn.Write(ctx, websocket.MessageText, data)
			cancel()
			if err != nil {
				return
			}
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			err := client.conn.Ping(ctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

type incoming struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Token       string `json:"token"`
	TimeControl *int   `json:"timeControl"`
	Increment   *int   `json:"increment"`
	Mode        string `json:"mode"`
	GameID      *int   `json:"gameId"`
	Square      *int   `json:"square"`
	From        *int   `json:"from"`
	To          *int   `json:"to"`
	Promotion   string `json:"promotion"`
	Opponent    string `json:"opponent"`
	Level       *int   `json:"level"`
	Accept      *bool  `json:"accept"`
}

func (client *Client) readLoop(ctx context.Context) {
	for {
		_, data, err := client.conn.Read(ctx)
		if err != nil {
			return
		}
		var msg incoming
		if err := json.Unmarshal(data, &msg); err != nil {
			client.sendJSON(map[string]any{"type": "error", "message": "malformed message"})
			continue
		}
		client.hub.handle(client, msg)
	}
}

func (hub *Hub) handle(client *Client, msg incoming) {
	switch msg.Type {
	case "ping":
		client.sendJSON(map[string]any{"id": msg.ID, "type": "pong"})
	case "hello":
		hub.handleHello(client, msg)
	case "queue.join":
		hub.handleQueueJoin(client, msg)
	case "queue.leave":
		hub.handleQueueLeave(client, msg)
	case "queue.get":
		hub.handleQueueGet(client, msg)
	case "game.new":
		hub.handleGameNew(client, msg)
	case "game.join":
		hub.handleGameJoin(client, msg, true)
	case "game.leave":
		hub.handleGameLeave(client, msg)
	case "board.get":
		hub.handleBoardGet(client, msg)
	case "moves.get":
		hub.handleMovesGet(client, msg)
	case "game.move":
		hub.handleMove(client, msg)
	case "game.resign":
		hub.handleResign(client, msg)
	case "game.draw.offer":
		hub.handleDrawOffer(client, msg)
	case "game.draw.respond":
		hub.handleDrawRespond(client, msg)
	case "game.undo.request":
		hub.handleUndoRequest(client, msg)
	case "game.undo.respond":
		hub.handleUndoRespond(client, msg)
	case "game.rematch.offer":
		hub.handleRematchOffer(client, msg)
	case "game.rematch.respond":
		hub.handleRematchRespond(client, msg)
	default:
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "unknown message type"})
	}
}

func (hub *Hub) handleHello(client *Client, msg incoming) {
	if msg.Token == "" {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "hello.ok", "userId": client.userID})
		return
	}
	session, err := hub.auth.GetSession(context.Background(), msg.Token)
	if err != nil || session == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "invalid session"})
		return
	}
	hub.mu.Lock()
	if client.userID != "" {
		delete(hub.byUser[client.userID], client)
	}
	client.userID = session.User.ID
	if hub.byUser[client.userID] == nil {
		hub.byUser[client.userID] = make(map[*Client]bool)
	}
	hub.byUser[client.userID][client] = true
	hub.mu.Unlock()
	client.sendJSON(map[string]any{"id": msg.ID, "type": "hello.ok", "userId": client.userID})
}

func (hub *Hub) handleQueueJoin(client *Client, msg incoming) {
	if client.userID == "" {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "sign in to play online"})
		return
	}
	if msg.TimeControl == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "timeControl is required"})
		return
	}
	increment := 0
	if msg.Increment != nil {
		increment = *msg.Increment
	}
	result, err := hub.games.JoinQueue(context.Background(), client.userID, *msg.TimeControl, increment)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	status, _ := result["status"].(string)
	if status == "matched" {
		gameID, _ := result["gameId"].(int)
		hub.subscribe(client, gameID)
		info, err := hub.matchedInfo(gameID, client.userID)
		if err == nil {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "game.matched", "gameId": info["gameId"], "color": info["color"], "timeControl": info["timeControl"], "increment": info["increment"]})
		} else {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "queue.status", "status": "matched", "gameId": gameID})
		}
		hub.broadcastGame(gameID)
		hub.pushMatchedToOpponent(gameID, client.userID)
		return
	}
	client.sendJSON(map[string]any{"id": msg.ID, "type": "queue.status", "status": "queued", "timeControl": *msg.TimeControl})
}

func (hub *Hub) handleQueueLeave(client *Client, msg incoming) {
	if client.userID == "" {
		return
	}
	_ = hub.games.LeaveQueue(context.Background(), client.userID)
	client.sendJSON(map[string]any{"id": msg.ID, "type": "queue.status", "status": "idle"})
}

func (hub *Hub) handleQueueGet(client *Client, msg incoming) {
	if client.userID == "" {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "queue.status", "status": "idle"})
		return
	}
	result, err := hub.games.QueueStatus(context.Background(), client.userID)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	status, _ := result["status"].(string)
	payload := map[string]any{"id": msg.ID, "type": "queue.status", "status": status}
	if gameID, ok := result["gameId"].(int); ok {
		payload["gameId"] = gameID
		hub.subscribe(client, gameID)
	}
	if timeControl, ok := result["timeControl"].(int); ok {
		payload["timeControl"] = timeControl
	}
	client.sendJSON(payload)
}

func (hub *Hub) handleGameNew(client *Client, msg incoming) {
	mode := msg.Mode
	if mode == "" {
		mode = "vs_computer"
	}
	// Local boards are always anonymous, for guests and signed-in users
	// alike; rated online games are only created through queue.join.
	timeControl := 0
	increment := 0
	if msg.TimeControl != nil {
		timeControl = *msg.TimeControl
	}
	if msg.Increment != nil {
		increment = *msg.Increment
	}
	created, err := hub.games.NewLocalGame(context.Background(), mode, timeControl, increment)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	hub.subscribe(client, created.ID)
	hub.sendBoard(client, msg.ID, created.ID)
}

func (hub *Hub) handleGameJoin(client *Client, msg incoming, reply bool) {
	if msg.GameID == nil {
		if reply {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId is required"})
		}
		return
	}
	hub.subscribe(client, *msg.GameID)
	if reply {
		hub.sendBoard(client, msg.ID, *msg.GameID)
	} else {
		hub.sendBoard(client, "", *msg.GameID)
	}
	hub.broadcastPresence(*msg.GameID)
}

func (hub *Hub) handleGameLeave(client *Client, msg incoming) {
	if msg.GameID == nil {
		return
	}
	hub.unsubscribe(client, *msg.GameID)
	hub.broadcastPresence(*msg.GameID)
}

func (hub *Hub) handleBoardGet(client *Client, msg incoming) {
	if msg.GameID != nil {
		hub.subscribe(client, *msg.GameID)
		hub.sendBoard(client, msg.ID, *msg.GameID)
		return
	}
	board, err := hub.games.GetBoard(context.Background(), msg.Mode, nil, client.userID)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	client.sendJSON(map[string]any{"id": msg.ID, "type": "game.state", "board": board})
}

func (hub *Hub) handleMovesGet(client *Client, msg incoming) {
	if msg.GameID == nil || msg.Square == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId and square are required"})
		return
	}
	targets, err := hub.games.ValidMoves(context.Background(), *msg.GameID, *msg.Square)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	if targets == nil {
		targets = []int{}
	}
	client.sendJSON(map[string]any{"id": msg.ID, "type": "moves.result", "gameId": *msg.GameID, "square": *msg.Square, "targets": targets})
}

func (hub *Hub) handleMove(client *Client, msg incoming) {
	if msg.GameID == nil || msg.From == nil || msg.To == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId, from and to are required"})
		return
	}
	stored, err := hub.games.GetGame(context.Background(), *msg.GameID)
	if err != nil || stored == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "No game found"})
		return
	}
	if stored.Status != "Ongoing" {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "Game is not ongoing"})
		return
	}
	if err := hub.authorizeTurn(stored, client.userID); err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	opponent := engine.Options{Opponent: msg.Opponent}
	if msg.Level != nil {
		opponent.Level = *msg.Level
	}
	if stored.Mode == "vs_computer" {
		if opponent.Opponent == "" {
			opponent.Opponent = "minimax"
		}
		// Reject before committing the human move; otherwise the game would
		// sit waiting on an engine reply that can never arrive.
		if err := engine.Available(opponent.Opponent); err != nil {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
			return
		}
	}
	hub.subscribe(client, *msg.GameID)
	result, err := hub.games.MakeMove(context.Background(), *msg.GameID, *msg.From, *msg.To, game.PieceType(msg.Promotion), opponent)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	board := result["board"].(game.BoardResponse)
	board = personalizedBoard(game.Snapshot{Board: board, WhitePlayerID: stored.WhitePlayerID, BlackPlayerID: stored.BlackPlayerID}, client.userID)
	client.sendJSON(map[string]any{"id": msg.ID, "type": "game.state", "board": board})
}

func personalizedBoard(snapshot game.Snapshot, userID string) game.BoardResponse {
	board := snapshot.Board
	board.UserColor = "Spectator"
	if snapshot.WhitePlayerID != nil && *snapshot.WhitePlayerID == userID {
		board.UserColor = "White"
	}
	if snapshot.BlackPlayerID != nil && *snapshot.BlackPlayerID == userID {
		board.UserColor = "Black"
	}
	return board
}

func (hub *Hub) broadcastSnapshot(snapshot game.Snapshot) {
	gameID := snapshot.Board.ID
	hub.mu.Lock()
	if revision, seen := hub.lastRevision[gameID]; seen && snapshot.Board.Revision <= revision {
		hub.mu.Unlock()
		return
	}
	hub.lastRevision[gameID] = snapshot.Board.Revision
	hub.lastStatus[gameID] = snapshot.Board.Status
	hub.lastMoves[gameID] = snapshot.Board.MoveCount
	for client := range hub.rooms[gameID] {
		board := personalizedBoard(snapshot, client.userID)
		client.sendJSON(map[string]any{"type": "game.state", "board": board})
		if board.Status != "Ongoing" {
			client.sendJSON(map[string]any{"type": "game.over", "gameId": gameID, "status": board.Status, "winner": winnerFor(board.Turn, board.Status), "reason": string(board.Status)})
		}
	}
	hub.mu.Unlock()
}

func (hub *Hub) handleResign(client *Client, msg incoming) {
	if msg.GameID == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId is required"})
		return
	}
	stored, err := hub.games.GetGame(context.Background(), *msg.GameID)
	if err != nil || stored == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "No game found"})
		return
	}
	color, err := hub.playerColor(stored, client.userID)
	if err != nil {
		// Anonymous sessions (local board and vs_computer) have no color
		// ownership. Single-player resigns as White to match the legacy
		// REST behavior; local boards resign the side to move.
		if stored.WhitePlayerID == nil && stored.BlackPlayerID == nil {
			if stored.Mode == "vs_computer" {
				color = game.White
			} else {
				color = stored.CurrentTurn
			}
		} else {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
			return
		}
	}
	result, err := hub.games.Resign(context.Background(), *msg.GameID, color)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	hub.gameChanged(*msg.GameID)
	winner, _ := result["winner"].(game.Color)
	client.sendJSON(map[string]any{"id": msg.ID, "type": "game.over", "gameId": *msg.GameID, "status": "Resignation", "winner": winner, "reason": "resignation"})
}

func (hub *Hub) handleDrawOffer(client *Client, msg incoming) {
	if msg.GameID == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId is required"})
		return
	}
	stored, err := hub.games.GetGame(context.Background(), *msg.GameID)
	if err != nil || stored == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "No game found"})
		return
	}
	color, err := hub.playerColor(stored, client.userID)
	if err != nil {
		if stored.WhitePlayerID == nil && stored.BlackPlayerID == nil {
			color = stored.CurrentTurn
		} else {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
			return
		}
	}
	if _, err := hub.games.OfferDraw(context.Background(), *msg.GameID, color); err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	hub.subscribe(client, *msg.GameID)
	hub.gameChanged(*msg.GameID)
	hub.sendBoard(client, msg.ID, *msg.GameID)
	hub.broadcastExcept(*msg.GameID, client, map[string]any{"type": "game.draw.offered", "gameId": *msg.GameID, "by": color})
}

func (hub *Hub) handleDrawRespond(client *Client, msg incoming) {
	if msg.GameID == nil || msg.Accept == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId and accept are required"})
		return
	}
	stored, err := hub.games.GetGame(context.Background(), *msg.GameID)
	if err != nil || stored == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "No game found"})
		return
	}
	if _, err := hub.playerColor(stored, client.userID); err != nil {
		if stored.WhitePlayerID != nil || stored.BlackPlayerID != nil {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
			return
		}
	}
	if _, err := hub.games.RespondDraw(context.Background(), *msg.GameID, *msg.Accept); err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	hub.subscribe(client, *msg.GameID)
	hub.gameChanged(*msg.GameID)
	hub.sendBoard(client, msg.ID, *msg.GameID)
}

func (hub *Hub) handleUndoRequest(client *Client, msg incoming) {
	if msg.GameID == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId is required"})
		return
	}
	stored, err := hub.games.GetGame(context.Background(), *msg.GameID)
	if err != nil || stored == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "No game found"})
		return
	}
	color, err := hub.playerColor(stored, client.userID)
	if err != nil {
		// Anonymous boards (local and vs_computer) undo immediately with
		// no consent flow; rated PvP games require the opponent to accept.
		if stored.WhitePlayerID == nil && stored.BlackPlayerID == nil {
			if _, err := hub.games.Undo(context.Background(), *msg.GameID); err != nil {
				client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
				return
			}
			hub.subscribe(client, *msg.GameID)
			hub.gameChanged(*msg.GameID)
			hub.sendBoard(client, msg.ID, *msg.GameID)
			return
		}
		if stored.Mode == "vs_computer" {
			if _, err := hub.games.Undo(context.Background(), *msg.GameID); err != nil {
				client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
				return
			}
			hub.subscribe(client, *msg.GameID)
			hub.gameChanged(*msg.GameID)
			hub.sendBoard(client, msg.ID, *msg.GameID)
			return
		}
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	if stored.Mode == "vs_computer" {
		if _, err := hub.games.Undo(context.Background(), *msg.GameID); err != nil {
			client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
			return
		}
		hub.gameChanged(*msg.GameID)
		return
	}
	hub.mu.Lock()
	hub.undoRequests[*msg.GameID] = client.userID
	hub.mu.Unlock()
	hub.broadcastExcept(*msg.GameID, client, map[string]any{"type": "game.undo.requested", "gameId": *msg.GameID, "by": color})
	client.sendJSON(map[string]any{"id": msg.ID, "type": "game.undo.result", "gameId": *msg.GameID, "accepted": false})
}

func (hub *Hub) handleUndoRespond(client *Client, msg incoming) {
	if msg.GameID == nil || msg.Accept == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId and accept are required"})
		return
	}
	hub.mu.Lock()
	requester, pending := hub.undoRequests[*msg.GameID]
	if pending {
		delete(hub.undoRequests, *msg.GameID)
	}
	hub.mu.Unlock()
	if !pending {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "no pending takeback request"})
		return
	}
	if requester == client.userID {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "cannot answer your own request"})
		return
	}
	if !*msg.Accept {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "game.undo.result", "gameId": *msg.GameID, "accepted": false})
		hub.broadcast(*msg.GameID, map[string]any{"type": "game.undo.result", "gameId": *msg.GameID, "accepted": false})
		return
	}
	if _, err := hub.games.Undo(context.Background(), *msg.GameID); err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	hub.broadcast(*msg.GameID, map[string]any{"type": "game.undo.result", "gameId": *msg.GameID, "accepted": true})
	hub.gameChanged(*msg.GameID)
	hub.sendBoard(client, msg.ID, *msg.GameID)
}

func (hub *Hub) handleRematchOffer(client *Client, msg incoming) {
	if msg.GameID == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId is required"})
		return
	}
	if client.userID == "" {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "sign in to request a rematch"})
		return
	}
	stored, err := hub.games.GetGame(context.Background(), *msg.GameID)
	if err != nil || stored == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "No game found"})
		return
	}
	color, err := hub.playerColor(stored, client.userID)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	hub.mu.Lock()
	hub.rematchOffers[*msg.GameID] = client.userID
	hub.mu.Unlock()
	hub.subscribe(client, *msg.GameID)
	hub.broadcastExcept(*msg.GameID, client, map[string]any{"type": "game.rematch.offered", "gameId": *msg.GameID, "by": color})
	hub.sendBoard(client, msg.ID, *msg.GameID)
}

func (hub *Hub) handleRematchRespond(client *Client, msg incoming) {
	if msg.GameID == nil || msg.Accept == nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "gameId and accept are required"})
		return
	}
	hub.mu.Lock()
	requester, pending := hub.rematchOffers[*msg.GameID]
	if pending {
		delete(hub.rematchOffers, *msg.GameID)
	}
	hub.mu.Unlock()
	if !pending {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "no pending rematch offer"})
		return
	}
	if !*msg.Accept {
		hub.sendBoard(client, msg.ID, *msg.GameID)
		return
	}
	if requester == client.userID {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": "cannot answer your own offer"})
		return
	}
	created, err := hub.games.Rematch(context.Background(), *msg.GameID, client.userID)
	if err != nil {
		client.sendJSON(map[string]any{"id": msg.ID, "type": "error", "message": err.Error()})
		return
	}
	for _, participant := range hub.participantClients(created) {
		hub.subscribe(participant, created.ID)
		info, err := hub.matchedInfo(created.ID, participant.userID)
		if err == nil {
			participant.sendJSON(map[string]any{"type": "game.matched", "gameId": info["gameId"], "color": info["color"], "timeControl": info["timeControl"], "increment": info["increment"]})
		}
	}
	hub.gameChanged(created.ID)
	hub.sendBoard(client, msg.ID, created.ID)
}

func (hub *Hub) authorizeTurn(stored *game.Game, userID string) error {
	// Anonymous games (local and vs_computer) allow the connected client
	// to move; ownership only applies to rated PvP games.
	if stored.WhitePlayerID == nil && stored.BlackPlayerID == nil {
		return nil
	}
	color, err := hub.playerColor(stored, userID)
	if err != nil {
		return err
	}
	if color != stored.CurrentTurn {
		return errNotYourTurn
	}
	return nil
}

var errNotYourTurn = &hubError{"not your turn"}

type hubError struct{ message string }

func (err *hubError) Error() string { return err.message }

func (hub *Hub) playerColor(stored *game.Game, userID string) (game.Color, error) {
	if userID == "" {
		return "", &hubError{"sign in to play this game"}
	}
	if stored.WhitePlayerID != nil && *stored.WhitePlayerID == userID {
		return game.White, nil
	}
	if stored.BlackPlayerID != nil && *stored.BlackPlayerID == userID {
		return game.Black, nil
	}
	return "", &hubError{"you are spectating this game"}
}

func (hub *Hub) subscribe(client *Client, gameID int) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	client.rooms[gameID] = true
	if hub.rooms[gameID] == nil {
		hub.rooms[gameID] = make(map[*Client]bool)
	}
	hub.rooms[gameID][client] = true
}

func (hub *Hub) unsubscribe(client *Client, gameID int) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	delete(client.rooms, gameID)
	if hub.rooms[gameID] != nil {
		delete(hub.rooms[gameID], client)
		if len(hub.rooms[gameID]) == 0 {
			delete(hub.rooms, gameID)
		}
	}
}

func (hub *Hub) sendBoard(client *Client, id string, gameID int) {
	board, err := hub.games.GetBoard(context.Background(), "", &gameID, client.userID)
	if err != nil {
		if id != "" {
			client.sendJSON(map[string]any{"id": id, "type": "error", "message": err.Error()})
		}
		return
	}
	if id != "" {
		client.sendJSON(map[string]any{"id": id, "type": "game.state", "board": board})
		return
	}
	client.sendJSON(map[string]any{"type": "game.state", "board": board})
}

func (hub *Hub) broadcast(gameID int, value any) {
	hub.mu.Lock()
	clients := make([]*Client, 0, len(hub.rooms[gameID]))
	for client := range hub.rooms[gameID] {
		clients = append(clients, client)
	}
	hub.mu.Unlock()
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	for _, client := range clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (hub *Hub) broadcastExcept(gameID int, except *Client, value any) {
	hub.mu.Lock()
	clients := make([]*Client, 0, len(hub.rooms[gameID]))
	for client := range hub.rooms[gameID] {
		if client != except {
			clients = append(clients, client)
		}
	}
	hub.mu.Unlock()
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	for _, client := range clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (hub *Hub) broadcastGame(gameID int) {
	hub.mu.Lock()
	clients := make([]*Client, 0, len(hub.rooms[gameID]))
	for client := range hub.rooms[gameID] {
		clients = append(clients, client)
	}
	hub.mu.Unlock()
	if len(clients) == 0 {
		return
	}
	stored, err := hub.games.GetGame(context.Background(), gameID)
	if err != nil || stored == nil {
		return
	}
	hub.mu.Lock()
	hub.lastStatus[gameID] = stored.Status
	hub.mu.Unlock()
	board, err := hub.games.GetBoard(context.Background(), "", &gameID, "")
	if err != nil {
		return
	}
	hub.broadcastSnapshot(game.Snapshot{Board: board, WhitePlayerID: stored.WhitePlayerID, BlackPlayerID: stored.BlackPlayerID})
	hub.broadcastPresence(gameID)
}

func winnerFor(turn game.Color, status game.GameStatus) *game.Color {
	switch status {
	case "Checkmate", "Timeout", "Resignation":
		winner := game.White
		if turn == game.White {
			winner = game.Black
		}
		return &winner
	default:
		return nil
	}
}

func (hub *Hub) broadcastPresence(gameID int) {
	stored, err := hub.games.GetGame(context.Background(), gameID)
	if err != nil || stored == nil {
		return
	}
	if stored.WhitePlayerID == nil || stored.BlackPlayerID == nil {
		return
	}
	hub.mu.Lock()
	room := hub.rooms[gameID]
	whiteOnline := false
	blackOnline := false
	for client := range room {
		if client.userID == *stored.WhitePlayerID {
			whiteOnline = true
		}
		if client.userID == *stored.BlackPlayerID {
			blackOnline = true
		}
	}
	hub.mu.Unlock()
	hub.broadcast(gameID, map[string]any{"type": "presence", "gameId": gameID, "whiteOnline": whiteOnline, "blackOnline": blackOnline})
}

func (hub *Hub) matchedInfo(gameID int, userID string) (map[string]any, error) {
	stored, err := hub.games.GetGame(context.Background(), gameID)
	if err != nil || stored == nil {
		return nil, err
	}
	color := "Spectator"
	if stored.WhitePlayerID != nil && *stored.WhitePlayerID == userID {
		color = "White"
	}
	if stored.BlackPlayerID != nil && *stored.BlackPlayerID == userID {
		color = "Black"
	}
	return map[string]any{"gameId": gameID, "color": color, "timeControl": stored.TimeControl, "increment": stored.Increment}, nil
}

func (hub *Hub) pushMatchedToOpponent(gameID int, joinerID string) {
	stored, err := hub.games.GetGame(context.Background(), gameID)
	if err != nil || stored == nil {
		return
	}
	opponent := ""
	if stored.WhitePlayerID != nil && *stored.WhitePlayerID != joinerID {
		opponent = *stored.WhitePlayerID
	} else if stored.BlackPlayerID != nil && *stored.BlackPlayerID != joinerID {
		opponent = *stored.BlackPlayerID
	}
	if opponent == "" {
		return
	}
	hub.mu.Lock()
	clients := make([]*Client, 0, len(hub.byUser[opponent]))
	for client := range hub.byUser[opponent] {
		clients = append(clients, client)
	}
	hub.mu.Unlock()
	for _, client := range clients {
		hub.subscribe(client, gameID)
		info, err := hub.matchedInfo(gameID, opponent)
		if err == nil {
			client.sendJSON(map[string]any{"type": "game.matched", "gameId": info["gameId"], "color": info["color"], "timeControl": info["timeControl"], "increment": info["increment"]})
		} else {
			client.sendJSON(map[string]any{"type": "queue.status", "status": "matched", "gameId": gameID})
		}
		board, err := hub.games.GetBoard(context.Background(), "", &gameID, opponent)
		if err == nil {
			client.sendJSON(map[string]any{"type": "game.state", "board": board})
		}
	}
	hub.broadcastPresence(gameID)
}

func (hub *Hub) participantClients(created *game.Game) []*Client {
	ids := []string{}
	if created.WhitePlayerID != nil {
		ids = append(ids, *created.WhitePlayerID)
	}
	if created.BlackPlayerID != nil {
		ids = append(ids, *created.BlackPlayerID)
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	seen := make(map[*Client]bool)
	for _, id := range ids {
		for client := range hub.byUser[id] {
			seen[client] = true
		}
	}
	result := make([]*Client, 0, len(seen))
	for client := range seen {
		result = append(result, client)
	}
	return result
}

func (hub *Hub) notifyGame(gameID int) {
	hub.gameChanged(gameID)
}

func (hub *Hub) timeoutLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for range ticker.C {
		hub.mu.Lock()
		rooms := make([]int, 0, len(hub.rooms))
		for gameID := range hub.rooms {
			rooms = append(rooms, gameID)
		}
		hub.mu.Unlock()
		for _, gameID := range rooms {
			board, err := hub.games.GetBoard(context.Background(), "", &gameID, "")
			if err != nil {
				continue
			}
			hub.mu.Lock()
			previousStatus, seenStatus := hub.lastStatus[gameID]
			previousMoves, seenMoves := hub.lastMoves[gameID]
			hub.lastStatus[gameID] = board.Status
			hub.lastMoves[gameID] = len(board.Moves)
			hub.mu.Unlock()
			if (!seenStatus || previousStatus != board.Status) || (!seenMoves || previousMoves != len(board.Moves)) {
				hub.gameChanged(gameID)
			}
		}
	}
}

func (hub *Hub) Handler() func(http.ResponseWriter, *http.Request) {
	return hub.ServeWS
}

var _ = log.Printf
