package main

import (
	"embed"
	"flag"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"sort"
)

//go:embed assets
var assets embed.FS

var (
	mainPage     = template.Must(loadTemplate("", "assets/index.html"))
	respacksPage = template.Must(loadTemplate("", "assets/respacks.html"))
)

type HuesConfig struct {
	Respack     string `json:"respack"`
	DefaultSong int    `json:"defaultSong"`
	AutoPlay    bool   `json:"autoPlay"`
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

func listRespacks() ([]string, error) {
	var respacks []string
	dir, err := os.Open("respacks")
	if err != nil {
		return nil, err
	}
	defer dir.Close()
	fileInfos, err := dir.Readdir(0)
	if err != nil {
		return nil, err
	}
	for _, fileInfo := range fileInfos {
		if fileInfo.IsDir() {
			name := fileInfo.Name()
			if name == "builtin" {
				continue
			}
			respacks = append(respacks, name)
		}
	}
	return respacks, nil
}

func main() {
	var addr string
	flag.StringVar(&addr, "addr", ":8080", "HTTP listener address")
	flag.Parse()

	respacks, err := listRespacks()
	if err != nil {
		panic(err)
	}
	sort.Strings(respacks)
	log.Println("Respacks:", respacks)

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		respacksPage.Execute(w, respacks)
	})

	http.Handle("/respacks/", http.StripPrefix("/respacks/", http.FileServer(http.Dir("respacks"))))

	assets, _ := fs.Sub(assets, "assets")
	fs := http.FileServer(http.FS(assets))
	for _, respack := range respacks {
		respack := respack
		respackPath := "/" + respack + "/"
		http.HandleFunc(respackPath, func(w http.ResponseWriter, r *http.Request) {
			config := &HuesConfig{Respack: respack, AutoPlay: true}
			mainPage.Execute(w, config)
		})
		staticAssets := http.StripPrefix(respackPath, fs)
		http.Handle(respackPath+"css/", staticAssets)
		http.Handle(respackPath+"js/", staticAssets)
		http.Handle(respackPath+"fonts/", staticAssets)
	}

	log.Println("Starting web server on address", addr)
	http.ListenAndServe(addr, nil)
}
