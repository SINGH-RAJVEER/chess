package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/rajveer/chess/apps/api/internal/auth"
	"github.com/rajveer/chess/apps/api/internal/game"
)

type App struct {
	service    *game.Service
	auth       *auth.Service
	corsOrigin string
}

type Option func(*App)

func WithCORSOrigin(origin string) Option {
	return func(app *App) {
		app.corsOrigin = strings.TrimRight(origin, "/")
	}
}

func NewHandler(authService *auth.Service, gameService *game.Service, options ...Option) http.Handler {
	app := &App{service: gameService, auth: authService}
	for _, option := range options {
		option(app)
	}
	return app.handler()
}

func (app *App) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /api/board", app.board)
	mux.HandleFunc("GET /api/moves", app.moves)
	mux.HandleFunc("GET /api/queue-status", app.queueStatus)
	mux.HandleFunc("POST /api/reset", app.reset)
	mux.HandleFunc("POST /api/join-queue", app.joinQueue)
	mux.HandleFunc("POST /api/move", app.move)
	mux.HandleFunc("POST /api/undo", app.undo)
	mux.HandleFunc("POST /api/resign", app.resign)
	mux.HandleFunc("POST /api/draw-offer", app.drawOffer)
	mux.HandleFunc("POST /api/draw-respond", app.drawRespond)
	mux.HandleFunc("POST /api/auth/sign-up", app.signUp)
	mux.HandleFunc("POST /api/auth/sign-up/email", app.signUp)
	mux.HandleFunc("POST /api/auth/sign-in", app.signIn)
	mux.HandleFunc("POST /api/auth/sign-in/email", app.signIn)
	mux.HandleFunc("GET /api/auth/get-session", app.getSession)
	mux.HandleFunc("GET /api/auth/session", app.getSession)
	mux.HandleFunc("POST /api/auth/sign-out", app.signOut)
	mux.HandleFunc("POST /api/auth/sign-in/social", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "Google social authentication is not configured in the Go API"})
	})
	return recoverMiddleware(corsMiddleware(mux, app.corsOrigin))
}

func corsMiddleware(next http.Handler, allowedOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			origin := "*"
			if allowedOrigin != "" {
				origin = allowedOrigin
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Add("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(204)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				log.Printf("request panic: %v", value)
				writeJSON(w, 500, map[string]string{"error": "Internal Server Error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func decode(r *http.Request, value any) error { return json.NewDecoder(r.Body).Decode(value) }
func fail(w http.ResponseWriter, err error) {
	writeJSON(w, 500, map[string]string{"error": err.Error()})
}
func intQuery(r *http.Request, name string) (int, error) {
	return strconv.Atoi(r.URL.Query().Get(name))
}

func (app *App) board(w http.ResponseWriter, r *http.Request) {
	var gameID *int
	if raw := r.URL.Query().Get("gameId"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err == nil {
			gameID = &value
		}
	}
	result, err := app.service.GetBoard(r.Context(), r.URL.Query().Get("mode"), gameID, r.URL.Query().Get("playerId"))
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) moves(w http.ResponseWriter, r *http.Request) {
	from, e1 := intQuery(r, "square")
	gameID, e2 := intQuery(r, "gameId")
	if e1 != nil || e2 != nil {
		writeJSON(w, 400, map[string]string{"error": "square and gameId are required"})
		return
	}
	result, err := app.service.ValidMoves(r.Context(), gameID, from)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) queueStatus(w http.ResponseWriter, r *http.Request) {
	playerID := r.URL.Query().Get("playerId")
	if playerID == "" {
		writeJSON(w, 400, map[string]string{"error": "playerId is required"})
		return
	}
	result, err := app.service.QueueStatus(r.Context(), playerID)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}

type gameRequest struct {
	GameID      *int           `json:"gameId"`
	From        *int           `json:"from"`
	To          *int           `json:"to"`
	Mode        string         `json:"mode"`
	TimeControl *int           `json:"timeControl"`
	Increment   *int           `json:"increment"`
	PlayerID    string         `json:"playerId"`
	Promotion   game.PieceType `json:"promotion"`
	Opponent    string         `json:"opponent"`
	Color       game.Color     `json:"color"`
	Accept      *bool          `json:"accept"`
}

func (app *App) reset(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	mode := body.Mode
	if mode == "" {
		mode = "vs_player"
	}
	tc := 10
	if body.TimeControl != nil {
		tc = *body.TimeControl
	}
	increment := 0
	if body.Increment != nil {
		increment = *body.Increment
	}
	if err := app.service.Reset(r.Context(), mode, tc, increment); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}
func (app *App) joinQueue(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	if body.PlayerID == "" || body.TimeControl == nil {
		writeJSON(w, 400, map[string]string{"error": "playerId and timeControl are required"})
		return
	}
	increment := 0
	if body.Increment != nil {
		increment = *body.Increment
	}
	result, err := app.service.JoinQueue(r.Context(), body.PlayerID, *body.TimeControl, increment)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) move(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	if body.From == nil || body.To == nil || body.GameID == nil {
		writeJSON(w, 400, map[string]string{"error": "from, to, and gameId are required"})
		return
	}
	if body.Opponent != "" && body.Opponent != "minimax" && body.Opponent != "dqn" {
		writeJSON(w, 400, map[string]string{"error": "opponent must be minimax or dqn"})
		return
	}
	result, err := app.service.MakeMove(r.Context(), *body.GameID, *body.From, *body.To, body.Promotion, body.Opponent)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) undo(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	if body.GameID == nil {
		writeJSON(w, 400, map[string]string{"error": "gameId is required"})
		return
	}
	result, err := app.service.Undo(r.Context(), *body.GameID)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) resign(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	if body.GameID == nil || body.Color == "" {
		writeJSON(w, 400, map[string]string{"error": "gameId and color are required"})
		return
	}
	result, err := app.service.Resign(r.Context(), *body.GameID, body.Color)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) drawOffer(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	if body.GameID == nil || body.Color == "" {
		writeJSON(w, 400, map[string]string{"error": "gameId and color are required"})
		return
	}
	result, err := app.service.OfferDraw(r.Context(), *body.GameID, body.Color)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) drawRespond(w http.ResponseWriter, r *http.Request) {
	var body gameRequest
	if err := decode(r, &body); err != nil {
		fail(w, err)
		return
	}
	if body.GameID == nil || body.Accept == nil {
		writeJSON(w, 400, map[string]string{"error": "gameId and accept are required"})
		return
	}
	result, err := app.service.RespondDraw(r.Context(), *body.GameID, *body.Accept)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, result)
}

type authRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	Name      string `json:"name"`
	SessionID string `json:"sessionId"`
}

func (app *App) signUp(w http.ResponseWriter, r *http.Request) {
	var body authRequest
	if decode(r, &body) != nil {
		writeJSON(w, 400, map[string]string{"error": "Email, password, and name are required"})
		return
	}
	if body.Email == "" || body.Password == "" || body.Name == "" {
		writeJSON(w, 400, map[string]string{"error": "Email, password, and name are required"})
		return
	}
	if len(body.Password) < 8 || len(body.Password) > 128 {
		writeJSON(w, 400, map[string]string{"error": "Password must be between 8 and 128 characters"})
		return
	}
	result, err := app.auth.SignUp(r.Context(), body.Email, body.Password, body.Name, r.RemoteAddr, r.UserAgent())
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	app.auth.SetSessionCookie(w, result.Session.Token)
	writeJSON(w, 200, result)
}
func (app *App) signIn(w http.ResponseWriter, r *http.Request) {
	var body authRequest
	if decode(r, &body) != nil || body.Email == "" || body.Password == "" {
		writeJSON(w, 400, map[string]string{"error": "Email and password are required"})
		return
	}
	result, err := app.auth.SignIn(r.Context(), body.Email, body.Password, r.RemoteAddr, r.UserAgent())
	if err != nil {
		writeJSON(w, 401, map[string]string{"error": err.Error()})
		return
	}
	app.auth.SetSessionCookie(w, result.Session.Token)
	writeJSON(w, 200, result)
}
func (app *App) getSession(w http.ResponseWriter, r *http.Request) {
	token := app.auth.RequestToken(r)
	if query := r.URL.Query().Get("sessionId"); query != "" {
		token = query
	}
	if r.URL.Path == "/api/auth/session" && r.URL.Query().Get("sessionId") == "" {
		writeJSON(w, 400, map[string]string{"error": "Session ID is required"})
		return
	}
	result, err := app.auth.GetSession(r.Context(), token)
	if err != nil {
		fail(w, err)
		return
	}
	if result == nil {
		writeJSON(w, 200, map[string]any{"session": nil, "user": nil})
		return
	}
	writeJSON(w, 200, result)
}
func (app *App) signOut(w http.ResponseWriter, r *http.Request) {
	var body authRequest
	_ = decode(r, &body)
	token := app.auth.RequestToken(r)
	if body.SessionID != "" {
		token = body.SessionID
	}
	if err := app.auth.SignOut(r.Context(), token); err != nil {
		fail(w, err)
		return
	}
	app.auth.ClearSessionCookie(w)
	writeJSON(w, 200, map[string]bool{"success": true})
}
