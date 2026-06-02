package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) RunTests(c *gin.Context) {
	var req struct {
		Path   string `json:"path"`
		Target string `json:"target"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"passed":  0,
		"failed":  0,
		"skipped": 0,
		"output":  "",
	})
}
