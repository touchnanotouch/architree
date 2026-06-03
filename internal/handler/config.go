package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func (h *Handler) SaveConfig(c *gin.Context) {
	var req struct {
		Path string          `json:"path" binding:"required"`
		Data json.RawMessage `json:"data" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path and data are required"})
		return
	}

	dir := filepath.Join(req.Path, ".architree")

	if err := os.MkdirAll(dir, 0755); err != nil {
		h.log.Error("mkdir .architree", "path", dir, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create .architree directory"})
		return
	}

	fpath := filepath.Join(dir, "config.json")

	if err := os.WriteFile(fpath, req.Data, 0644); err != nil {
		h.log.Error("write config", "path", fpath, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) LoadConfig(c *gin.Context) {
	path := c.Query("path")

	if path == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	fpath := filepath.Join(path, ".architree", "config.json")

	data, err := os.ReadFile(fpath)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"groups": []interface{}{}})
			return
		}

		h.log.Error("read config", "path", fpath, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read config"})
		return
	}

	var parsed interface{}

	if err := json.Unmarshal(data, &parsed); err != nil {
		h.log.Error("parse config", "path", fpath, "error", err)
		c.JSON(http.StatusOK, gin.H{"groups": []interface{}{}})
		return
	}

	c.JSON(http.StatusOK, parsed)
}
