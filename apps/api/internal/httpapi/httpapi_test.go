package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/rajveer/sixtyfour/apps/api/internal/auth"
	"github.com/rajveer/sixtyfour/apps/api/internal/game"
	"github.com/rajveer/sixtyfour/apps/api/internal/httpapi"
	"github.com/rajveer/sixtyfour/apps/api/internal/testdb"
)

func TestMovePushesOneSnapshotAndAcknowledgesRevision(t *testing.T) {
	db := testdb.Open(t)
	authService := auth.NewService(db, "move-test", auth.GoogleConfig{})
	server := httptest.NewServer(httpapi.NewHandler(authService, game.NewService(db)))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	var message struct {
		Type     string             `json:"type"`
		ID       string             `json:"id"`
		Board    game.BoardResponse `json:"board"`
		Revision int64              `json:"revision"`
	}
	if err := wsjson.Read(ctx, conn, &message); err != nil {
		t.Fatal(err)
	}
	if err := wsjson.Write(ctx, conn, map[string]any{"id": "new", "type": "game.new", "mode": "vs_player"}); err != nil {
		t.Fatal(err)
	}
	for message.ID != "new" {
		if err := wsjson.Read(ctx, conn, &message); err != nil {
			t.Fatal(err)
		}
	}
	id := message.Board.ID
	if err := wsjson.Write(ctx, conn, map[string]any{"id": "move", "type": "game.move", "gameId": id, "from": 52, "to": 36}); err != nil {
		t.Fatal(err)
	}
	pushes := 0
	for {
		message.ID = ""
		if err := wsjson.Read(ctx, conn, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type == "game.state" {
			if message.Board.Revision == 0 {
				continue
			}
			pushes++
			if message.Board.Revision != 1 || message.Board.MoveCount != 1 || len(message.Board.LegalMoves[12]) == 0 {
				t.Fatalf("invalid snapshot: %+v", message.Board)
			}
		}
		if message.ID == "move" {
			if message.Type != "game.move.ok" || message.Revision != 1 || pushes != 1 {
				t.Fatalf("move response=%+v snapshots=%d", message, pushes)
			}
			break
		}
	}
}

func TestComputerArchivesAreValidatedVersionedAndPrivate(t *testing.T) {
	db := testdb.Open(t)
	authService := auth.NewService(db, "archive-test", auth.GoogleConfig{})
	first, err := authService.SignUp(context.Background(), "archive-first@example.com", "password123", "First", "", "")
	if err != nil {
		t.Fatal(err)
	}
	second, err := authService.SignUp(context.Background(), "archive-second@example.com", "password123", "Second", "", "")
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.NewHandler(authService, game.NewService(db))
	request := func(method, path, body, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if token != "" {
			r.AddCookie(&http.Cookie{Name: "better-auth.session_token", Value: token})
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	valid := `{"version":1,"id":1,"revision":2,"moves":["e4","e5"],"opponent":"minimax","level":4}`
	if got := request("POST", "/api/computer-games", valid, ""); got.Code != 401 {
		t.Fatalf("anonymous archive: %d", got.Code)
	}
	if got := request("POST", "/api/computer-games", valid, first.Session.Token); got.Code != 200 {
		t.Fatalf("archive: %d %s", got.Code, got.Body)
	}
	old := strings.Replace(valid, `"revision":2`, `"revision":1`, 1)
	if got := request("POST", "/api/computer-games", old, first.Session.Token); got.Code != 200 {
		t.Fatal(got.Code)
	}
	got := request("GET", "/api/computer-games/latest", "", first.Session.Token)
	var saved game.ArchivedGame
	if err := json.Unmarshal(got.Body.Bytes(), &saved); err != nil || saved.Revision != 2 {
		t.Fatalf("archive regressed: %s", got.Body)
	}
	if got := request("GET", "/api/computer-games/latest", "", second.Session.Token); strings.TrimSpace(got.Body.String()) != "null" {
		t.Fatalf("another user's archive exposed: %s", got.Body)
	}
	illegal := strings.Replace(valid, `["e4","e5"]`, `["e4","e4"]`, 1)
	if got := request("POST", "/api/computer-games", illegal, first.Session.Token); got.Code != 400 {
		t.Fatalf("illegal archive: %d", got.Code)
	}
}

func TestHealthAndCORS(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	response := httptest.NewRecorder()
	httpapi.NewHandler(nil, nil).ServeHTTP(response, request)
	if response.Code != 200 || response.Header().Get("Access-Control-Allow-Origin") != "*" || strings.TrimSpace(response.Body.String()) != `{"ok":true}` {
		t.Fatalf("status=%d cors=%q body=%s", response.Code, response.Header().Get("Access-Control-Allow-Origin"), response.Body.String())
	}
}

func TestCredentialedCORS(t *testing.T) {
	request := httptest.NewRequest(http.MethodOptions, "/api/auth/get-session", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response := httptest.NewRecorder()
	httpapi.NewHandler(nil, nil, httpapi.WithCORSOrigin("http://localhost:3000")).ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" || response.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("status=%d headers=%v", response.Code, response.Header())
	}
}

func TestCredentialedCORSAllowlist(t *testing.T) {
	handler := httpapi.NewHandler(nil, nil, httpapi.WithCORSOrigin("http://localhost:3000, app://sixtyfour"))
	request := httptest.NewRequest(http.MethodOptions, "/api/auth/get-session", nil)
	request.Header.Set("Origin", "app://sixtyfour")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || response.Header().Get("Access-Control-Allow-Origin") != "app://sixtyfour" || response.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("status=%d headers=%v", response.Code, response.Header())
	}
}

func TestValidationContracts(t *testing.T) {
	tests := []struct{ method, path, body, message string }{
		{http.MethodPost, "/api/auth/sign-up", `{}`, "Email, password, and name are required"},
		{http.MethodPost, "/api/auth/sign-in", `{}`, "Email and password are required"},
	}
	handler := httpapi.NewHandler(nil, nil)
	for _, test := range tests {
		t.Run(test.path+test.message, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			var result map[string]string
			_ = json.Unmarshal(response.Body.Bytes(), &result)
			if response.Code != 400 || result["error"] != test.message {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestGameRestEndpointsAreGone(t *testing.T) {
	// Game play is websocket-only (`GET /api/ws`). The legacy REST game
	// endpoints must stay removed so no client can bypass turn ownership
	// and room broadcasts.
	removed := []struct{ method, path, body string }{
		{http.MethodGet, "/api/board", ""},
		{http.MethodGet, "/api/moves?square=52&gameId=1", ""},
		{http.MethodGet, "/api/queue-status?playerId=alice", ""},
		{http.MethodPost, "/api/reset", `{}`},
		{http.MethodPost, "/api/join-queue", `{}`},
		{http.MethodPost, "/api/move", `{}`},
		{http.MethodPost, "/api/undo", `{}`},
		{http.MethodPost, "/api/resign", `{}`},
		{http.MethodPost, "/api/draw-offer", `{}`},
		{http.MethodPost, "/api/draw-respond", `{}`},
	}
	handler := httpapi.NewHandler(nil, nil)
	for _, test := range removed {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusNotFound {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestUnsupportedGoogleAuth(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/auth/sign-in/social", strings.NewReader(`{"provider":"google"}`))
	response := httptest.NewRecorder()
	authService := auth.NewService(nil, "secret", auth.GoogleConfig{WebOrigin: "http://localhost:3000"})
	httpapi.NewHandler(authService, nil).ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), "not configured") {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestAuthValidation(t *testing.T) {
	// A nil database is fine here: every case below returns before any
	// query, except googleCallback which only clears a cookie first.
	authService := auth.NewService(nil, "secret", auth.GoogleConfig{})
	handler := httpapi.NewHandler(authService, nil)
	tests := []struct{ name, method, path, body string }{
		{"short password", http.MethodPost, "/api/auth/sign-up", `{"email":"a@b.c","password":"short","name":"A"}`},
		{"social non-google", http.MethodPost, "/api/auth/sign-in/social", `{"provider":"yahoo"}`},
		{"social malformed", http.MethodPost, "/api/auth/sign-in/social", `{"provider":`},
		{"callback error", http.MethodGet, "/api/auth/callback/google?error=access_denied", ""},
		{"callback missing", http.MethodGet, "/api/auth/callback/google", ""},
		{"session id required", http.MethodGet, "/api/auth/session", ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var reader *strings.Reader
			if test.body != "" {
				reader = strings.NewReader(test.body)
			} else {
				reader = strings.NewReader("")
			}
			request := httptest.NewRequest(test.method, test.path, reader)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != 400 {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			var result map[string]string
			_ = json.Unmarshal(response.Body.Bytes(), &result)
			if result["error"] == "" {
				t.Fatalf("missing error message: %s", response.Body.String())
			}
		})
	}
}

func TestRoutingContracts(t *testing.T) {
	handler := httpapi.NewHandler(nil, nil)
	request := httptest.NewRequest(http.MethodGet, "/api/nope", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown route status=%d", response.Code)
	}
	request = httptest.NewRequest(http.MethodPost, "/api/health", nil)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("wrong method status=%d", response.Code)
	}
}
