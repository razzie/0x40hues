package main

import (
	"embed"
	"html/template"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed assets
var assets embed.FS

var (
	templateFuncs = template.FuncMap{
		"mod": func(i, j int) bool {
			return i%j == 0
		},
		"divide": func(a, b int) int {
			return a / b
		},
	}
	huesT        = must(loadTemplate("", "assets/index.html"))
	respacksT    = must(loadTemplate("Respack selector", "assets/layout.html", "assets/respacks.html"))
	respackInfoT = must(loadTemplate("Respack info", "assets/layout.html", "assets/respackinfo.html"))
	builtinR     = must(LoadRespackFS(assets, "assets/builtin"))
	builtinImgR  = must(LoadRespackFS(assets, "assets/builtin_image"))
)

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
	r.Get("/favicon.ico", fs.ServeHTTP)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		search := r.URL.Query().Get("search")
		respacks := filterRespacks(respacks, search)
		respacksT(w, r, &respacksView{
			Search:   search,
			Respacks: respacks,
		})
	})

	renderRespacks := func(w http.ResponseWriter, r *http.Request, respacks ...string) {
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
		song, _ := strconv.Atoi(r.URL.Query().Get("song"))
		huesT(w, r, &huesConfig{
			Respacks:    respacks,
			DefaultSong: song,
			AutoPlay:    true,
		})
	}

	r.Get("/{respacks}/", func(w http.ResponseWriter, r *http.Request) {
		respacks := strings.Split(chi.URLParam(r, "respacks"), ",")
		renderRespacks(w, r, respacks...)
	})

	r.Get("/custom/", func(w http.ResponseWriter, r *http.Request) {
		respacks := strings.Split(r.URL.Query().Get("packs"), ",")
		renderRespacks(w, r, respacks...)
	})

	r.Post("/custom", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		respacks := make([]string, 0, len(r.Form))
		for respack := range r.Form {
			respacks = append(respacks, respack)
		}
		http.Redirect(w, r, "/"+strings.Join(respacks, ",")+"/", http.StatusSeeOther)
	})

	r.Get("/respacks/{respack}/*", func(w http.ResponseWriter, r *http.Request) {
		respackID := chi.URLParam(r, "respack")
		if respack, ok := respackMap[respackID]; ok {
			filename, err := url.QueryUnescape(chi.URLParam(r, "*"))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
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

	r.Get("/respack-info/{respack}/", func(w http.ResponseWriter, r *http.Request) {
		respackID := chi.URLParam(r, "respack")
		if respack, ok := respackMap[respackID]; ok {
			respackInfoT(w, r, respack)
		} else {
			http.Error(w, "Not Found", http.StatusNotFound)
		}
	})

	return r
}

func filterRespacks(respacks []*Respack, query string) (results []*Respack) {
	if query == "" {
		return respacks
	}
	query = strings.ToLower(query)
outer:
	for _, rp := range respacks {
		for _, image := range rp.Images.Image {
			if strings.Contains(strings.ToLower(image.Name), query) ||
				strings.Contains(strings.ToLower(image.FullName), query) {
				results = append(results, rp)
				continue outer
			}
		}
		for _, song := range rp.Songs.Song {
			if strings.Contains(strings.ToLower(song.Name), query) ||
				strings.Contains(strings.ToLower(song.Title), query) {
				results = append(results, rp)
				continue outer
			}
		}
	}
	return
}

type respacksView struct {
	Search   string
	Respacks []*Respack
}

type huesConfig struct {
	Respacks    []string `json:"respack"`
	DefaultSong int      `json:"defaultSong"`
	AutoPlay    bool     `json:"autoPlay"`
}

type tmplView struct {
	Title string
	Base  string
	Data  any
}

func getView(r *http.Request, title string, data any) *tmplView {
	view := &tmplView{
		Title: title,
		Base:  "/",
		Data:  data,
	}
	if slashes := strings.Count(r.URL.Path, "/"); slashes > 1 {
		view.Base = strings.Repeat("../", slashes-1)
	}
	return view
}

func loadTemplate(title string, filenames ...string) (func(w http.ResponseWriter, r *http.Request, data any), error) {
	t := template.New("").Funcs(templateFuncs)
	for _, filename := range filenames {
		bytes, err := assets.ReadFile(filename)
		if err != nil {
			return nil, err
		}
		t, err = t.Parse(string(bytes))
		if err != nil {
			return nil, err
		}
	}
	return func(w http.ResponseWriter, r *http.Request, data any) {
		if r.Header.Get("HX-Request") != "" {
			t.ExecuteTemplate(w, "content", data)
		} else {
			view := getView(r, title, data)
			t.Execute(w, view)
		}
	}, nil
}

func must[T any](t T, err error) T {
	if err != nil {
		panic(err)
	}
	return t
}
