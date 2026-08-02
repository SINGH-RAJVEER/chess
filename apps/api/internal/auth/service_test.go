package auth

import (
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestPasswordHashIsBetterAuthCompatible(t *testing.T) {
	hash, err := hashPassword("pa\u212Bssword")
	if err != nil {
		t.Fatal(err)
	}
	if !verifyPassword(hash, "pa\u00C5ssword") || verifyPassword(hash, "wrong") {
		t.Fatal("password normalization or verification failed")
	}
}

func TestBeginGoogleCreatesProtectedState(t *testing.T) {
	service := NewService(nil, "test-secret", GoogleConfig{
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		AuthBaseURL:  "http://localhost:4000/api/auth",
		WebOrigin:    "http://localhost:3000",
	})
	recorder := httptest.NewRecorder()
	redirect, err := service.BeginGoogle(recorder, "http://localhost:3000/computer")
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(redirect)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Host != "accounts.google.com" || parsed.Query().Get("client_id") != "client-id" || parsed.Query().Get("redirect_uri") != "http://localhost:4000/api/auth/callback/google" {
		t.Fatalf("unexpected Google redirect: %s", redirect)
	}
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != googleStateCookie || cookies[0].Value == "" || parsed.Query().Get("state") == "" {
		t.Fatalf("missing OAuth state protection: headers=%v redirect=%s", recorder.Header(), redirect)
	}
}

func TestBeginGoogleRejectsUntrustedCallback(t *testing.T) {
	service := NewService(nil, "test-secret", GoogleConfig{
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		AuthBaseURL:  "http://localhost:4000/api/auth",
		WebOrigin:    "http://localhost:3000",
	})
	_, err := service.BeginGoogle(httptest.NewRecorder(), "https://attacker.example")
	if err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Fatalf("expected callback validation error, got %v", err)
	}
}
