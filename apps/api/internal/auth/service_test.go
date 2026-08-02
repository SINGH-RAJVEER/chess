package auth

import "testing"

func TestPasswordHashIsBetterAuthCompatible(t *testing.T) {
	hash, err := hashPassword("pa\u212Bssword")
	if err != nil {
		t.Fatal(err)
	}
	if !verifyPassword(hash, "pa\u00C5ssword") || verifyPassword(hash, "wrong") {
		t.Fatal("password normalization or verification failed")
	}
}
