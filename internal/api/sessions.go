package api

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const sessionCookieName = "ps_session"

var sessionTTL = 24 * time.Hour

type session struct {
	username  string
	expiresAt time.Time
}

type sessionManager struct {
	mu       sync.RWMutex
	sessions map[string]session
}

func newSessionManager() *sessionManager {
	return &sessionManager{sessions: make(map[string]session)}
}

func (m *sessionManager) create(username string) (string, time.Time, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", time.Time{}, err
	}

	id := hex.EncodeToString(buf)
	expiresAt := time.Now().Add(sessionTTL)

	m.mu.Lock()
	m.sessions[id] = session{username: username, expiresAt: expiresAt}
	m.mu.Unlock()

	return id, expiresAt, nil
}

func (m *sessionManager) get(id string) (session, bool) {
	m.mu.RLock()
	s, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return session{}, false
	}
	if time.Now().After(s.expiresAt) {
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
		return session{}, false
	}
	return s, true
}

func (m *sessionManager) isValid(id string) bool {
	m.mu.RLock()
	s, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return false
	}

	if time.Now().After(s.expiresAt) {
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
		return false
	}
	return true
}

func (m *sessionManager) delete(id string) {
	if id == "" {
		return
	}
	m.mu.Lock()
	delete(m.sessions, id)
	m.mu.Unlock()
}
