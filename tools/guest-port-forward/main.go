// guest-port-forward is a tiny userspace TCP/UDP proxy for rootless Podman.
//
// Rootless Podman delivers host-published ports into the container netns as local
// traffic. dockur's QEMU_DNAT PREROUTING rules never see that path (pkts=0), so
// traffic must be accepted by a listener inside the container and forwarded to
// the Windows guest (typically 172.30.0.2).
//
// Usage:
//
//	guest-port-forward -proto tcp -listen 0.0.0.0:7148 -dial 172.30.0.2:7148
//	guest-port-forward -proto udp -listen 0.0.0.0:3389 -dial 172.30.0.2:3389
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"sync"
	"time"
)

// runConfig is the validated CLI configuration.
type runConfig struct {
	proto  string
	listen string
	dial   string
}

// validateArgs is a testable seam for required flags and proto values.
// Returns a config or an error describing the validation failure.
func validateArgs(proto, listen, dial string) (runConfig, error) {
	if listen == "" || dial == "" {
		return runConfig{}, fmt.Errorf("usage: guest-port-forward -proto tcp|udp -listen host:port -dial host:port")
	}
	switch proto {
	case "tcp", "udp":
		return runConfig{proto: proto, listen: listen, dial: dial}, nil
	default:
		return runConfig{}, fmt.Errorf("unsupported proto %q", proto)
	}
}

func main() {
	proto := flag.String("proto", "tcp", "protocol: tcp or udp")
	listen := flag.String("listen", "", "listen address host:port")
	dial := flag.String("dial", "", "dial address host:port (guest)")
	flag.Parse()

	cfg, err := validateArgs(*proto, *listen, *dial)
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(2)
	}

	switch cfg.proto {
	case "tcp":
		if err := serveTCP(cfg.listen, cfg.dial); err != nil {
			log.Fatal(err)
		}
	case "udp":
		if err := serveUDP(cfg.listen, cfg.dial); err != nil {
			log.Fatal(err)
		}
	}
}

func serveTCP(listenAddr, dialAddr string) error {
	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return err
	}
	log.Printf("tcp listen %s -> %s", listenAddr, dialAddr)
	for {
		c, err := ln.Accept()
		if err != nil {
			return err
		}
		go proxyTCP(c, dialAddr)
	}
}

func proxyTCP(client net.Conn, dialAddr string) {
	defer client.Close()
	_ = client.SetDeadline(time.Time{})
	upstream, err := net.DialTimeout("tcp", dialAddr, 10*time.Second)
	if err != nil {
		return
	}
	defer upstream.Close()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(upstream, client)
		_ = closeWrite(upstream)
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(client, upstream)
		_ = closeWrite(client)
	}()
	wg.Wait()
}

func closeWrite(c net.Conn) error {
	type closeWriter interface {
		CloseWrite() error
	}
	if cw, ok := c.(closeWriter); ok {
		return cw.CloseWrite()
	}
	return nil
}

// serveUDP proxies UDP datagrams with a short-lived client map.
// RDP UDP (when negotiated) needs a userspace path under rootless port publish
// for the same reason as TCP: PREROUTING DNAT is not on the pasta/slirp path.
func serveUDP(listenAddr, dialAddr string) error {
	pc, err := net.ListenPacket("udp", listenAddr)
	if err != nil {
		return err
	}
	defer pc.Close()
	log.Printf("udp listen %s -> %s", listenAddr, dialAddr)

	guestAddr, err := net.ResolveUDPAddr("udp", dialAddr)
	if err != nil {
		return err
	}

	type session struct {
		conn       *net.UDPConn
		lastActive time.Time
	}
	var mu sync.Mutex
	sessions := map[string]*session{}

	// cleanup idle
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			mu.Lock()
			now := time.Now()
			for k, s := range sessions {
				if now.Sub(s.lastActive) > 2*time.Minute {
					_ = s.conn.Close()
					delete(sessions, k)
				}
			}
			mu.Unlock()
		}
	}()

	buf := make([]byte, 65535)
	for {
		n, clientAddr, err := pc.ReadFrom(buf)
		if err != nil {
			return err
		}
		key := clientAddr.String()
		payload := make([]byte, n)
		copy(payload, buf[:n])

		mu.Lock()
		s, ok := sessions[key]
		if !ok {
			uc, err := net.DialUDP("udp", nil, guestAddr)
			if err != nil {
				mu.Unlock()
				continue
			}
			s = &session{conn: uc, lastActive: time.Now()}
			sessions[key] = s
			ca := clientAddr
			go func(sess *session, caddr net.Addr) {
				rbuf := make([]byte, 65535)
				for {
					_ = sess.conn.SetReadDeadline(time.Now().Add(2 * time.Minute))
					rn, err := sess.conn.Read(rbuf)
					if err != nil {
						mu.Lock()
						if sessions[key] == sess {
							delete(sessions, key)
						}
						mu.Unlock()
						_ = sess.conn.Close()
						return
					}
					mu.Lock()
					sess.lastActive = time.Now()
					mu.Unlock()
					_, _ = pc.WriteTo(rbuf[:rn], caddr)
				}
			}(s, ca)
		}
		s.lastActive = time.Now()
		conn := s.conn
		mu.Unlock()
		_, _ = conn.Write(payload)
	}
}
