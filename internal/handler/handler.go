package handler

import (
	"log/slog"

	"architree/internal/config"
)

type Handler struct {
	log *slog.Logger
	cfg *config.Config
}

func New(log *slog.Logger, cfg *config.Config) *Handler {
	return &Handler{
		log: log,
		cfg: cfg,
	}
}
