package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/scrypt"
	"golang.org/x/text/unicode/norm"
)

const sessionCookie = "better-auth.session_token"

type Service struct {
	db     *pgxpool.Pool
	secret string
}

func NewService(db *pgxpool.Pool, secret string) *Service {
	return &Service{db: db, secret: secret}
}

func hashPassword(password string) (string, error) {
	saltBytes := make([]byte, 16)
	if _, err := rand.Read(saltBytes); err != nil {
		return "", err
	}
	salt := hex.EncodeToString(saltBytes)
	key, err := scrypt.Key([]byte(norm.NFKC.String(password)), []byte(salt), 16384, 16, 1, 64)
	if err != nil {
		return "", err
	}
	return salt + ":" + hex.EncodeToString(key), nil
}

func verifyPassword(hash, password string) bool {
	parts := strings.Split(hash, ":")
	if len(parts) != 2 {
		return false
	}
	expected, err := hex.DecodeString(parts[1])
	if err != nil {
		return false
	}
	actual, err := scrypt.Key([]byte(norm.NFKC.String(password)), []byte(parts[0]), 16384, 16, 1, 64)
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func (auth *Service) SignUp(ctx context.Context, email, password, name, ip, agent string) (AuthResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	hash, err := hashPassword(password)
	if err != nil {
		return AuthResponse{}, err
	}
	tx, err := auth.db.Begin(ctx)
	if err != nil {
		return AuthResponse{}, err
	}
	defer tx.Rollback(ctx)
	now := time.Now().UTC()
	userID, accountID := uuid.NewString(), uuid.NewString()
	user := User{ID: userID, Name: name, Email: email, CreatedAt: now, UpdatedAt: now}
	_, err = tx.Exec(ctx, `INSERT INTO "user"(id,name,email,email_verified,image,created_at,updated_at) VALUES($1,$2,$3,false,NULL,$4,$4)`, userID, name, email, now)
	if err != nil {
		return AuthResponse{}, errors.New("User already exists. Use another email")
	}
	_, err = tx.Exec(ctx, `INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES($1,$2,'credential',$2,$3,$4,$4)`, accountID, userID, hash, now)
	if err != nil {
		return AuthResponse{}, err
	}
	session := newSession(userID, ip, agent)
	if err := tx.QueryRow(ctx, `INSERT INTO session(id,expires_at,token,created_at,updated_at,ip_address,user_agent,user_id) VALUES($1,$2,$3,$4,$4,$5,$6,$7) RETURNING id`, session.ID, session.ExpiresAt, session.Token, session.CreatedAt, session.IPAddress, session.UserAgent, userID).Scan(&session.ID); err != nil {
		return AuthResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return AuthResponse{}, err
	}
	return AuthResponse{User: user, Session: session}, nil
}

func (auth *Service) SignIn(ctx context.Context, email, password, ip, agent string) (AuthResponse, error) {
	var user User
	var hash string
	err := auth.db.QueryRow(ctx, `SELECT u.id,u.name,u.email,u.email_verified,u.image,u.created_at,u.updated_at,COALESCE(a.password,u.password,p.password_hash) FROM "user" u LEFT JOIN account a ON a.user_id=u.id AND a.provider_id='credential' LEFT JOIN password p ON p.user_id=u.id WHERE lower(u.email)=lower($1) LIMIT 1`, strings.TrimSpace(email)).Scan(&user.ID, &user.Name, &user.Email, &user.EmailVerified, &user.Image, &user.CreatedAt, &user.UpdatedAt, &hash)
	if err != nil || !verifyPassword(hash, password) {
		return AuthResponse{}, errors.New("Invalid credentials")
	}
	session := newSession(user.ID, ip, agent)
	if err := auth.db.QueryRow(ctx, `INSERT INTO session(id,expires_at,token,created_at,updated_at,ip_address,user_agent,user_id) VALUES($1,$2,$3,$4,$4,$5,$6,$7) RETURNING id`, session.ID, session.ExpiresAt, session.Token, session.CreatedAt, session.IPAddress, session.UserAgent, user.ID).Scan(&session.ID); err != nil {
		return AuthResponse{}, err
	}
	return AuthResponse{User: user, Session: session}, nil
}

func newSession(userID, ip, agent string) Session {
	now := time.Now().UTC()
	session := Session{ID: uuid.NewString(), Token: uuid.NewString(), UserID: userID, CreatedAt: now, UpdatedAt: now, ExpiresAt: now.Add(7 * 24 * time.Hour)}
	if ip != "" {
		session.IPAddress = &ip
	}
	if agent != "" {
		session.UserAgent = &agent
	}
	return session
}

func (auth *Service) GetSession(ctx context.Context, token string) (*AuthResponse, error) {
	token = unsignedCookieToken(token)
	if token == "" {
		return nil, nil
	}
	var result AuthResponse
	err := auth.db.QueryRow(ctx, `SELECT u.id,u.name,u.email,u.email_verified,u.image,u.created_at,u.updated_at,s.id,s.expires_at,s.token,s.created_at,s.updated_at,s.ip_address,s.user_agent,s.user_id FROM session s JOIN "user" u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now()`, token).Scan(&result.User.ID, &result.User.Name, &result.User.Email, &result.User.EmailVerified, &result.User.Image, &result.User.CreatedAt, &result.User.UpdatedAt, &result.Session.ID, &result.Session.ExpiresAt, &result.Session.Token, &result.Session.CreatedAt, &result.Session.UpdatedAt, &result.Session.IPAddress, &result.Session.UserAgent, &result.Session.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &result, nil
}
func (auth *Service) SignOut(ctx context.Context, token string) error {
	token = unsignedCookieToken(token)
	if token == "" {
		return nil
	}
	_, err := auth.db.Exec(ctx, `DELETE FROM session WHERE token=$1`, token)
	return err
}
func unsignedCookieToken(value string) string {
	if decoded, err := url.QueryUnescape(value); err == nil {
		value = decoded
	}
	if index := strings.IndexByte(value, '.'); index > 0 {
		return value[:index]
	}
	return value
}
func setSessionCookie(writer http.ResponseWriter, token, secret string) {
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write([]byte(token))
	signed := token + "." + base64.StdEncoding.EncodeToString(digest.Sum(nil))
	http.SetCookie(writer, &http.Cookie{Name: sessionCookie, Value: url.QueryEscape(signed), Path: "/", MaxAge: 7 * 24 * 60 * 60, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}
func clearSessionCookie(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}
func requestToken(request *http.Request) string {
	for _, name := range []string{sessionCookie, "__Secure-" + sessionCookie, "session_token"} {
		if cookie, err := request.Cookie(name); err == nil {
			return cookie.Value
		}
	}
	return ""
}

func (auth *Service) SetSessionCookie(writer http.ResponseWriter, token string) {
	setSessionCookie(writer, token, auth.secret)
}

func (auth *Service) ClearSessionCookie(writer http.ResponseWriter) {
	clearSessionCookie(writer)
}

func (auth *Service) RequestToken(request *http.Request) string {
	return requestToken(request)
}
