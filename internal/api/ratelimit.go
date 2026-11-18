package api

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// loginLimiter blocks a key (client, or client+username) after too many failed logins within a window.
type loginLimiter struct {
	mu       sync.Mutex
	max      int
	window   time.Duration
	failures map[string][]time.Time
	now      func() time.Time
}

// maxTrackedKeys bounds memory when many different addresses fail logins.
const maxTrackedKeys = 10000

func newLoginLimiter(max int, window time.Duration) *loginLimiter {
	return &loginLimiter{max: max, window: window, failures: map[string][]time.Time{}, now: time.Now}
}

// loginGuard combines a per client+username limit with a looser per client limit,
// so one address cannot guess passwords for many usernames. Shared by web and SFTP logins.
type loginGuard struct {
	perUser   *loginLimiter
	perClient *loginLimiter
}

func newLoginGuard() *loginGuard {
	return &loginGuard{
		perUser:   newLoginLimiter(10, 15*time.Minute),
		perClient: newLoginLimiter(30, 15*time.Minute),
	}
}

func userLimitKey(ip, username string) string {
	return ip + "|" + strings.ToLower(strings.TrimSpace(username))
}

// retryAfter returns how long this client/username is blocked for, or 0.
func (g *loginGuard) retryAfter(ip, username string) time.Duration {
	return max(g.perUser.retryAfter(userLimitKey(ip, username)), g.perClient.retryAfter(ip))
}

func (g *loginGuard) fail(ip, username string) {
	g.perUser.fail(userLimitKey(ip, username))
	g.perClient.fail(ip)
}

// succeed clears the username's failures; the per client count is left to expire.
func (g *loginGuard) succeed(ip, username string) {
	g.perUser.reset(userLimitKey(ip, username))
}

// trustProxyHeaders is read once: when true, the client address comes from
// X-Forwarded-For / X-Real-IP, but only for requests arriving from a private or
// loopback address (the reverse proxy). Never enable it when the app is reachable directly.
var trustProxyHeaders = parseEnvBool(os.Getenv("TRUST_PROXY_HEADERS"))

func parseEnvBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// clientIP returns the address used for login rate limiting.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !trustProxyHeaders || !isInternalIP(host) {
		return host
	}
	// The proxy appends the address it saw, so the last entry is the one it vouches for
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); net.ParseIP(ip) != nil {
			return ip
		}
	}
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); net.ParseIP(ip) != nil {
		return ip
	}
	return host
}

func isInternalIP(host string) bool {
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
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
	if len(l.failures) >= maxTrackedKeys {
		for k := range l.failures {
			l.recent(k)
		}
	}
	l.failures[key] = append(l.recent(key), l.now())
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, key)
}
