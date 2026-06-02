package handler

import (
	"net/http"

	"architree/internal/scanner"

	"github.com/gin-gonic/gin"
)

func (h *Handler) Scan(c *gin.Context) {
	var req struct {
		Path string `json:"path" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "path is required"})
		return
	}

	result, err := scanner.Scan(req.Path)
	if err != nil {
		h.log.Error("scan failed", "path", req.Path, "error", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
