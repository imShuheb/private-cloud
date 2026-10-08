package api

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// loginLimiter blocks a username+client pair after too many failed logins within a window.
type loginLimiter struct {
	mu       sync.Mutex
	max      int
	window   time.Duration
	failures map[string][]time.Time
	now      func() time.Time
}

func newLoginLimiter(max int, window time.Duration) *loginLimiter {
	return &loginLimiter{max: max, window: window, failures: map[string][]time.Time{}, now: time.Now}
}

func loginLimitKey(r *http.Request, username string) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return host + "|" + strings.ToLower(strings.TrimSpace(username))
}

// recent drops failures older than the window and returns the rest; callers hold mu.
func (l *loginLimiter) recent(key string) []time.Time {
	cutoff := l.now().Add(-l.window)
	kept := l.failures[key][:0]
	for _, t := range l.failures[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.failures, key)
		return nil
	}
	l.failures[key] = kept
	return kept
}

// retryAfter returns how long key is blocked for, or 0 if it may try again.
func (l *loginLimiter) retryAfter(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	recent := l.recent(key)
	if len(recent) < l.max {
		return 0
	}
	return recent[0].Add(l.window).Sub(l.now())
}

func (l *loginLimiter) fail(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.failures[key] = append(l.recent(key), l.now())
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}
