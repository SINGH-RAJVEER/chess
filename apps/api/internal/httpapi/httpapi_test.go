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

func TestCredentialedCORSAllowlist(t *testing.T) {
	handler := httpapi.NewHandler(nil, nil, httpapi.WithCORSOrigin("http://localhost:3000, https://tauri.localhost"))
	request := httptest.NewRequest(http.MethodOptions, "/api/auth/get-session", nil)
	request.Header.Set("Origin", "https://tauri.localhost")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || response.Header().Get("Access-Control-Allow-Origin") != "https://tauri.localhost" || response.Header().Get("Access-Control-Allow-Credentials") != "true" {
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
