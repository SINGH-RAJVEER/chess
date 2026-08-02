package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
)

const googleStateCookie = "chess.google_oauth_state"

var ErrGoogleNotConfigured = errors.New("Google OAuth is not configured")

type oauthState struct {
	Nonce       string `json:"nonce"`
	CallbackURL string `json:"callbackUrl"`
	ExpiresAt   int64  `json:"expiresAt"`
}

type googleUser struct {
	ID            string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func (auth *Service) BeginGoogle(writer http.ResponseWriter, callbackURL string) (string, error) {
	if auth.google == nil {
		return "", ErrGoogleNotConfigured
	}
	callbackURL, err := auth.validateCallbackURL(callbackURL)
	if err != nil {
		return "", err
	}
	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", fmt.Errorf("generate OAuth state: %w", err)
	}
	nonce := base64.RawURLEncoding.EncodeToString(nonceBytes)
	state, err := auth.signOAuthState(oauthState{
		Nonce:       nonce,
		CallbackURL: callbackURL,
		ExpiresAt:   time.Now().Add(10 * time.Minute).Unix(),
	})
	if err != nil {
		return "", err
	}
	http.SetCookie(writer, &http.Cookie{
		Name:     googleStateCookie,
		Value:    nonce,
		Path:     "/api/auth/callback/google",
		MaxAge:   10 * 60,
		HttpOnly: true,
		Secure:   auth.secure,
		SameSite: http.SameSiteLaxMode,
	})
	return auth.google.AuthCodeURL(
		state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "select_account"),
	), nil
}

func (auth *Service) CompleteGoogle(ctx context.Context, request *http.Request, code, encodedState string) (AuthResponse, string, error) {
	if auth.google == nil {
		return AuthResponse{}, "", ErrGoogleNotConfigured
	}
	state, err := auth.verifyOAuthState(request, encodedState)
	if err != nil {
		return AuthResponse{}, "", err
	}
	token, err := auth.google.Exchange(ctx, code)
	if err != nil {
		return AuthResponse{}, "", fmt.Errorf("exchange Google authorization code: %w", err)
	}
	response, err := auth.google.Client(ctx, token).Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return AuthResponse{}, "", fmt.Errorf("fetch Google user: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return AuthResponse{}, "", fmt.Errorf("Google user endpoint returned %s", response.Status)
	}
	var profile googleUser
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		return AuthResponse{}, "", fmt.Errorf("decode Google user: %w", err)
	}
	if profile.ID == "" || profile.Email == "" || !profile.EmailVerified {
		return AuthResponse{}, "", errors.New("Google account does not have a verified email")
	}

	result, err := auth.signInGoogle(ctx, profile, token, request.RemoteAddr, request.UserAgent())
	if err != nil {
		return AuthResponse{}, "", err
	}
	return result, state.CallbackURL, nil
}

func (auth *Service) ClearGoogleStateCookie(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{
		Name:     googleStateCookie,
		Value:    "",
		Path:     "/api/auth/callback/google",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   auth.secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (auth *Service) validateCallbackURL(rawURL string) (string, error) {
	if rawURL == "" {
		rawURL = auth.webOrigin
	}
	callback, err := url.Parse(rawURL)
	if err != nil || callback.Scheme == "" || callback.Host == "" || callback.User != nil {
		return "", errors.New("invalid OAuth callback URL")
	}
	allowed, err := url.Parse(auth.webOrigin)
	if err != nil || callback.Scheme != allowed.Scheme || !strings.EqualFold(callback.Host, allowed.Host) {
		return "", errors.New("OAuth callback URL is not allowed")
	}
	return callback.String(), nil
}

func (auth *Service) signOAuthState(state oauthState) (string, error) {
	contents, err := json.Marshal(state)
	if err != nil {
		return "", fmt.Errorf("encode OAuth state: %w", err)
	}
	payload := base64.RawURLEncoding.EncodeToString(contents)
	digest := hmac.New(sha256.New, []byte(auth.secret))
	_, _ = digest.Write([]byte(payload))
	signature := base64.RawURLEncoding.EncodeToString(digest.Sum(nil))
	return payload + "." + signature, nil
}

func (auth *Service) verifyOAuthState(request *http.Request, encoded string) (oauthState, error) {
	parts := strings.Split(encoded, ".")
	if len(parts) != 2 {
		return oauthState{}, errors.New("invalid OAuth state")
	}
	digest := hmac.New(sha256.New, []byte(auth.secret))
	_, _ = digest.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(digest.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(parts[1]), []byte(expected)) != 1 {
		return oauthState{}, errors.New("invalid OAuth state signature")
	}
	contents, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return oauthState{}, errors.New("invalid OAuth state encoding")
	}
	var state oauthState
	if err := json.Unmarshal(contents, &state); err != nil || state.ExpiresAt < time.Now().Unix() {
		return oauthState{}, errors.New("expired OAuth state")
	}
	cookie, err := request.Cookie(googleStateCookie)
	if err != nil || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(state.Nonce)) != 1 {
		return oauthState{}, errors.New("OAuth state does not match browser session")
	}
	if _, err := auth.validateCallbackURL(state.CallbackURL); err != nil {
		return oauthState{}, err
	}
	return state, nil
}

func (auth *Service) signInGoogle(ctx context.Context, profile googleUser, token *oauth2.Token, ip, agent string) (AuthResponse, error) {
	tx, err := auth.db.Begin(ctx)
	if err != nil {
		return AuthResponse{}, err
	}
	defer tx.Rollback(ctx)

	var user User
	err = tx.QueryRow(ctx, `SELECT u.id,u.name,u.email,u.email_verified,u.image,u.created_at,u.updated_at FROM account a JOIN "user" u ON u.id=a.user_id WHERE a.provider_id='google' AND a.account_id=$1 LIMIT 1`, profile.ID).Scan(&user.ID, &user.Name, &user.Email, &user.EmailVerified, &user.Image, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT id,name,email,email_verified,image,created_at,updated_at FROM "user" WHERE lower(email)=lower($1) LIMIT 1`, profile.Email).Scan(&user.ID, &user.Name, &user.Email, &user.EmailVerified, &user.Image, &user.CreatedAt, &user.UpdatedAt)
	}
	now := time.Now().UTC()
	if errors.Is(err, pgx.ErrNoRows) {
		user = User{ID: uuid.NewString(), Name: profile.Name, Email: strings.ToLower(profile.Email), EmailVerified: true, CreatedAt: now, UpdatedAt: now}
		if profile.Picture != "" {
			user.Image = &profile.Picture
		}
		_, err = tx.Exec(ctx, `INSERT INTO "user"(id,name,email,email_verified,image,created_at,updated_at) VALUES($1,$2,$3,true,$4,$5,$5)`, user.ID, user.Name, user.Email, user.Image, now)
	} else if err == nil {
		user.EmailVerified = true
		user.UpdatedAt = now
		if profile.Picture != "" {
			user.Image = &profile.Picture
		}
		_, err = tx.Exec(ctx, `UPDATE "user" SET email_verified=true,image=COALESCE($1,image),updated_at=$2 WHERE id=$3`, user.Image, now, user.ID)
	}
	if err != nil {
		return AuthResponse{}, err
	}

	var accountExists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM account WHERE provider_id='google' AND account_id=$1)`, profile.ID).Scan(&accountExists); err != nil {
		return AuthResponse{}, err
	}
	var expiresAt any
	if !token.Expiry.IsZero() {
		expiresAt = token.Expiry
	}
	idToken, _ := token.Extra("id_token").(string)
	if accountExists {
		_, err = tx.Exec(ctx, `UPDATE account SET access_token=$1,refresh_token=COALESCE(NULLIF($2,''),refresh_token),id_token=$3,expires_at=$4,updated_at=$5 WHERE provider_id='google' AND account_id=$6`, token.AccessToken, token.RefreshToken, idToken, expiresAt, now, profile.ID)
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO account(id,account_id,provider_id,user_id,access_token,refresh_token,id_token,expires_at,created_at,updated_at) VALUES($1,$2,'google',$3,$4,NULLIF($5,''),$6,$7,$8,$8)`, uuid.NewString(), profile.ID, user.ID, token.AccessToken, token.RefreshToken, idToken, expiresAt, now)
	}
	if err != nil {
		return AuthResponse{}, err
	}

	session := newSession(user.ID, ip, agent)
	if _, err := tx.Exec(ctx, `INSERT INTO session(id,expires_at,token,created_at,updated_at,ip_address,user_agent,user_id) VALUES($1,$2,$3,$4,$4,$5,$6,$7)`, session.ID, session.ExpiresAt, session.Token, session.CreatedAt, session.IPAddress, session.UserAgent, user.ID); err != nil {
		return AuthResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AuthResponse{}, err
	}
	return AuthResponse{User: user, Session: session}, nil
}
