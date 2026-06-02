package web

import (
	"embed"
	"html/template"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"

	"architree/internal/config"
	"architree/internal/handler"

	"github.com/gin-gonic/gin"
)

func SetupRouter(log *slog.Logger, cfg *config.Config, efs *embed.FS) *gin.Engine {
	h := handler.New(log, cfg)

	r := gin.New()
	r.Use(gin.Recovery())

	staticFS, err := fs.Sub(efs, "static")
	if err != nil {
		log.Error("static sub fs", "error", err)
	}
	r.StaticFS("/static", http.FS(staticFS))

	r.SetHTMLTemplate(parseTemplates(efs))

	r.GET("/", func(c *gin.Context) {
		c.HTML(200, "index.html", nil)
	})

	r.POST("/api/scan", h.Scan)
	r.POST("/api/tests/run", h.RunTests)

	return r
}

func parseTemplates(efs *embed.FS) *template.Template {
	tmpl := template.New("")

	data, err := efs.ReadFile("templates/base.html")
	if err == nil {
		tmpl = template.Must(tmpl.Parse(string(data)))
	}

	compFiles, _ := fs.Glob(efs, "templates/components/*.html")
	for _, f := range compFiles {
		data, err := efs.ReadFile(f)
		if err != nil {
			continue
		}
		name := f[strings.LastIndex(f, "/")+1:]
		tmpl = template.Must(tmpl.New(name).Parse(string(data)))
	}

	pageFiles, _ := fs.Glob(efs, "templates/pages/*.html")
	for _, f := range pageFiles {
		data, err := efs.ReadFile(f)
		if err != nil {
			continue
		}
		name := f[strings.LastIndex(f, "/")+1:]
		tmpl = template.Must(tmpl.New(name).Parse(string(data)))
	}

	return tmpl
}
