package auth

import (
	"context"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/rajveer/chess/apps/api/internal/testdb"
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

func TestSignUpSignInSessionSignOut(t *testing.T) {
	service := NewService(testdb.Open(t), "test-secret", GoogleConfig{})
	ctx := context.Background()

	created, err := service.SignUp(ctx, "carol@example.com", "s3cret-pass", "Carol", "", "")
	if err != nil {
		t.Fatalf("signup: %v", err)
	}
	if created.User.Email != "carol@example.com" || created.Session.Token == "" {
		t.Fatalf("unexpected signup response: %+v", created.User)
	}

	signedIn, err := service.SignIn(ctx, "carol@example.com", "s3cret-pass", "", "")
	if err != nil {
		t.Fatalf("signin: %v", err)
	}
	if signedIn.User.ID != created.User.ID {
		t.Fatal("signin returned a different user")
	}

	session, err := service.GetSession(ctx, signedIn.Session.Token)
	if err != nil || session == nil || session.User.ID != created.User.ID {
		t.Fatalf("get session = %+v, err = %v", session, err)
	}

	if err := service.SignOut(ctx, signedIn.Session.Token); err != nil {
		t.Fatalf("signout: %v", err)
	}
	gone, err := service.GetSession(ctx, signedIn.Session.Token)
	if err != nil || gone != nil {
		t.Fatalf("session survived signout: %+v, err = %v", gone, err)
	}
}

func TestSignUpDuplicateAndBadPassword(t *testing.T) {
	service := NewService(testdb.Open(t), "test-secret", GoogleConfig{})
	ctx := context.Background()

	if _, err := service.SignUp(ctx, "dave@example.com", "s3cret-pass", "Dave", "", ""); err != nil {
		t.Fatalf("signup: %v", err)
	}
	if _, err := service.SignUp(ctx, "dave@example.com", "s3cret-pass", "Dave", "", ""); err == nil {
		t.Fatal("duplicate signup should fail")
	}
	if _, err := service.SignIn(ctx, "dave@example.com", "wrong-pass", "", ""); err == nil {
		t.Fatal("signin with wrong password should fail")
	}
	if _, err := service.SignIn(ctx, "nobody@example.com", "s3cret-pass", "", ""); err == nil {
		t.Fatal("signin with unknown email should fail")
	}
}
