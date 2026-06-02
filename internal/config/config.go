package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ArchiServer ArchiServerConfig
}

type ArchiServerConfig struct {
	Host string
	Port int
}

const (
	defaultArchiHost = "localhost"
	defaultArchiPort = 8080
)

func Load(logger *slog.Logger) (*Config, error) {
	host := os.Getenv("ARCHI_HOST")
	portStr := os.Getenv("ARCHI_PORT")

	var missing []string

	if host == "" {
		missing = append(missing, "ARCHI_HOST")
		host = defaultArchiHost
	}

	port := defaultArchiPort
	if portStr == "" {
		missing = append(missing, "ARCHI_PORT")
	} else {
		v, err := strconv.Atoi(portStr)
		if err != nil {
			return nil, fmt.Errorf("config: %w", err)
		}

		port = v
	}

	cfg := &Config{
		ArchiServer: ArchiServerConfig{
			Host: host,
			Port: port,
		},
	}

	if err := Validate(cfg); err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}

	if len(missing) > 0 {
		logger.Warn("env vars not set, using defaults",
			"vars", missing,
		)
	}

	logger.Info("config loaded",
		"host", cfg.ArchiServer.Host,
		"port", cfg.ArchiServer.Port,
	)

	return cfg, nil
}

func Validate(cfg *Config) error {
	var errs []string

	if cfg.ArchiServer.Host == "" {
		errs = append(errs, "server host is required")
	}
	if cfg.ArchiServer.Port <= 0 || cfg.ArchiServer.Port > 65535 {
		errs = append(errs, fmt.Sprintf("server port %d out of range [1, 65535]", cfg.ArchiServer.Port))
	}

	if len(errs) > 0 {
		return errors.New(strings.Join(errs, "; "))
	}

	return nil
}

func getEnv(key string, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}

	return v
}

func getEnvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}

	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}

	return n
}
