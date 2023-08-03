package main

import (
	"embed"
	"html/template"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed assets
var assets embed.FS

var (
	huesT       = must(loadTemplate("", "assets/index.html"))
	respacksT   = must(loadTemplate("", "assets/respacks.html"))
	builtinR    = must(LoadRespackFS(assets, "assets/builtin"))
	builtinImgR = must(LoadRespackFS(assets, "assets/builtin_image"))
)

type huesConfig struct {
	Respacks []string `json:"respack"`
	AutoPlay bool     `json:"autoPlay"`
}

func GetHandlers(respacks []*Respack) http.Handler {
	respackMap := make(map[string]*Respack)
	for _, respack := range respacks {
		respackMap[respack.ID] = respack
	}
	respackMap[builtinR.ID] = builtinR
	respackMap[builtinImgR.ID] = builtinImgR

	assets, _ := fs.Sub(assets, "assets")
	fs := http.FileServer(http.FS(assets))
	r := chi.NewRouter()

	r.Get("/css/*", fs.ServeHTTP)
	r.Get("/js/*", fs.ServeHTTP)
	r.Get("/fonts/*", fs.ServeHTTP)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		respacksT.Execute(w, respacks)
	})

	r.Get("/{respacks}/", func(w http.ResponseWriter, r *http.Request) {
		respacks := strings.Split(chi.URLParam(r, "respacks"), "|")
		images := 0
		for _, respackID := range respacks {
			if respack, ok := respackMap[respackID]; ok {
				images += respack.ImageCount()
			} else {
				http.Error(w, "Unknown respack: "+respackID, http.StatusNotFound)
				return
			}
		}
		if images == 0 {
			respacks = append(respacks, "builtin_image")
		}
		huesT.Execute(w, &huesConfig{Respacks: respacks, AutoPlay: true})
	})

	r.Get("/respacks/{respack}/*", func(w http.ResponseWriter, r *http.Request) {
		respackID := chi.URLParam(r, "respack")
		if respack, ok := respackMap[respackID]; ok {
			filename := chi.URLParam(r, "*")
			f, err := respack.Open(filename)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}
			defer f.Close()
			w.Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(filename)))
			io.Copy(w, f)
		} else {
			http.Error(w, "Not Found", http.StatusNotFound)
		}
	})

	return r
}

func loadTemplate(templateName, filename string) (*template.Template, error) {
	bytes, err := assets.ReadFile(filename)
	if err != nil {
		return nil, err
	}
	tmpl, err := template.New(templateName).Parse(string(bytes))
	if err != nil {
		return nil, err
	}
	return tmpl, err
}

func must[T any](t T, err error) T {
	if err != nil {
		panic(err)
	}
	return t
}
