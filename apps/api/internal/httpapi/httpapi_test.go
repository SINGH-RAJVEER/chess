package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rajveer/chess/apps/api/internal/auth"
	"github.com/rajveer/chess/apps/api/internal/httpapi"
)

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

func TestValidationContracts(t *testing.T) {
	tests := []struct{ method, path, body, message string }{
		{http.MethodGet, "/api/moves", "", "square and gameId are required"},
		{http.MethodGet, "/api/queue-status", "", "playerId is required"},
		{http.MethodPost, "/api/move", `{}`, "from, to, and gameId are required"},
		{http.MethodPost, "/api/undo", `{}`, "gameId is required"},
		{http.MethodPost, "/api/resign", `{}`, "gameId and color are required"},
		{http.MethodPost, "/api/draw-offer", `{}`, "gameId and color are required"},
		{http.MethodPost, "/api/draw-respond", `{}`, "gameId and accept are required"},
		{http.MethodPost, "/api/join-queue", `{}`, "playerId and timeControl are required"},
		{http.MethodPost, "/api/auth/sign-up", `{}`, "Email, password, and name are required"},
		{http.MethodPost, "/api/auth/sign-in", `{}`, "Email and password are required"},
		{http.MethodPost, "/api/move", `{"from":52,"to":36,"gameId":1,"opponent":"unknown"}`, "opponent must be minimax or dqn"},
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

func TestUnsupportedGoogleAuth(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/api/auth/sign-in/social", strings.NewReader(`{"provider":"google"}`))
	response := httptest.NewRecorder()
	authService := auth.NewService(nil, "secret", auth.GoogleConfig{WebOrigin: "http://localhost:3000"})
	httpapi.NewHandler(authService, nil).ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || !strings.Contains(response.Body.String(), "not configured") {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}
