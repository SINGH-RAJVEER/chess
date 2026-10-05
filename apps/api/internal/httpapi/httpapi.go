package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/rajveer/sixtyfour/apps/api/internal/auth"
	"github.com/rajveer/sixtyfour/apps/api/internal/game"
	"github.com/rajveer/sixtyfour/apps/api/internal/realtime"
)

type App struct {
	auth       *auth.Service
	hub        *realtime.Hub
	broker     realtime.Broker
	games      *game.Service
	corsOrigin string
}

type Option func(*App)

func WithCORSOrigin(origin string) Option {
	return func(app *App) {
		app.corsOrigin = strings.TrimRight(origin, "/")
	}
}

func WithBroker(broker realtime.Broker) Option {
	return func(app *App) {
		app.broker = broker
	}
}

func NewHandler(authService *auth.Service, gameService *game.Service, options ...Option) http.Handler {
	app := &App{auth: authService, games: gameService}
	for _, option := range options {
		option(app)
	}
	app.hub = realtime.NewHub(authService, gameService, app.broker)
	return app.handler()
}

func (app *App) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]bool{"ok": true}) })
	mux.HandleFunc("GET /api/ws", app.hub.ServeWS)
	mux.HandleFunc("GET /api/computer-games/latest", app.latestComputerGame)
	mux.HandleFunc("POST /api/computer-games", app.saveComputerGame)
	// Game play is websocket-only; auth stays on REST.
	mux.HandleFunc("POST /api/auth/sign-up", app.signUp)
	mux.HandleFunc("POST /api/auth/sign-up/email", app.signUp)
	mux.HandleFunc("POST /api/auth/sign-in", app.signIn)
	mux.HandleFunc("POST /api/auth/sign-in/email", app.signIn)
	mux.HandleFunc("GET /api/auth/get-session", app.getSession)
	mux.HandleFunc("GET /api/auth/session", app.getSession)
	mux.HandleFunc("POST /api/auth/sign-out", app.signOut)
	mux.HandleFunc("POST /api/auth/sign-in/social", app.signInSocial)
	mux.HandleFunc("GET /api/auth/callback/google", app.googleCallback)
	return recoverMiddleware(corsMiddleware(mux, app.corsOrigin))
}

func (app *App) archiveUser(w http.ResponseWriter, r *http.Request) string {
	if app.auth == nil {
		writeJSON(w, 401, map[string]string{"error": "Sign in required"})
		return ""
	}
	session, err := app.auth.GetSession(r.Context(), app.auth.RequestToken(r))
	if err != nil || session == nil {
		writeJSON(w, 401, map[string]string{"error": "Sign in required"})
		return ""
	}
	return session.User.ID
}

func (app *App) latestComputerGame(w http.ResponseWriter, r *http.Request) {
	userID := app.archiveUser(w, r)
	if userID == "" {
		return
	}
	state, err := app.games.LatestArchive(r.Context(), userID)
	if err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, state)
}

func (app *App) saveComputerGame(w http.ResponseWriter, r *http.Request) {
	userID := app.archiveUser(w, r)
	if userID == "" {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var state game.ArchivedGame
	if decode(r, &state) != nil {
		writeJSON(w, 400, map[string]string{"error": "Invalid archive"})
		return
	}
	if err := game.ValidateArchive(state); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if err := app.games.Archive(r.Context(), userID, state); err != nil {
		fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}

// parseOriginAllowlist splits a comma-separated WEB_ORIGIN value into the
// ordered allowlist plus a lookup set. A single origin behaves exactly as
// before; multiple entries additionally let the packaged desktop webview
// origin sit alongside the browser origin.
func parseOriginAllowlist(configured string) ([]string, map[string]bool) {
	ordered := []string{}
	lookup := map[string]bool{}
	for _, origin := range strings.Split(configured, ",") {
		origin = strings.TrimSpace(strings.TrimRight(origin, "/"))
		if origin == "" || lookup[origin] {
			continue
		}
		lookup[origin] = true
		ordered = append(ordered, origin)
	}
	return ordered, lookup
}

func corsMiddleware(next http.Handler, allowedOrigin string) http.Handler {
	allowed, lookup := parseOriginAllowlist(allowedOrigin)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			origin := "*"
			if len(allowed) > 0 {
				// Echo a listed request origin so credentialed browser and
				// desktop-webview callers pass CORS. Unlisted origins get
				// the first configured value, preserving the previous
				// single-origin behavior.
				origin = allowed[0]
				if requestOrigin := r.Header.Get("Origin"); lookup[requestOrigin] {
					origin = requestOrigin
				}
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

type authRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	Name      string `json:"name"`
	SessionID string `json:"sessionId"`
}

type socialAuthRequest struct {
	Provider    string `json:"provider"`
	CallbackURL string `json:"callbackURL"`
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

func (app *App) signInSocial(w http.ResponseWriter, r *http.Request) {
	var body socialAuthRequest
	if decode(r, &body) != nil || body.Provider != "google" {
		writeJSON(w, 400, map[string]string{"error": "provider must be google"})
		return
	}
	redirectURL, err := app.auth.BeginGoogle(w, body.CallbackURL)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, auth.ErrGoogleNotConfigured) {
			status = http.StatusServiceUnavailable
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"url": redirectURL})
}

func (app *App) googleCallback(w http.ResponseWriter, r *http.Request) {
	app.auth.ClearGoogleStateCookie(w)
	if oauthError := r.URL.Query().Get("error"); oauthError != "" {
		writeJSON(w, 400, map[string]string{"error": "Google authorization failed: " + oauthError})
		return
	}
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		writeJSON(w, 400, map[string]string{"error": "code and state are required"})
		return
	}
	result, callbackURL, err := app.auth.CompleteGoogle(r.Context(), r, code, state)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, auth.ErrGoogleNotConfigured) {
			status = http.StatusServiceUnavailable
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	app.auth.SetSessionCookie(w, result.Session.Token)
	http.Redirect(w, r, callbackURL, http.StatusFound)
}
