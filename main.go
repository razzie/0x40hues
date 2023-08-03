package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func listRespacks(respackDir string) ([]string, error) {
	var respacks []string
	dir, err := os.Open(respackDir)
	if err != nil {
		return nil, err
	}
	defer dir.Close()
	fileInfos, err := dir.Readdir(0)
	if err != nil {
		return nil, err
	}
	for _, fileInfo := range fileInfos {
		if !fileInfo.IsDir() && strings.HasSuffix(fileInfo.Name(), ".zip") {
			name := fileInfo.Name()
			respacks = append(respacks, strings.TrimSuffix(name, ".zip"))
		}
	}
	return respacks, nil
}

func main() {
	var addr, respackDir string
	flag.StringVar(&addr, "addr", ":8080", "HTTP listener address")
	flag.StringVar(&respackDir, "respacks", "respacks", "Respack directory")
	flag.Parse()

	respackIDs, err := listRespacks(respackDir)
	if err != nil {
		panic(err)
	}
	sort.Strings(respackIDs)

	log.Println("Loading respacks")
	var respacks []*Respack
	for _, respackID := range respackIDs {
		respack, err := LoadRespackZIP(filepath.Join(respackDir, respackID+".zip"))
		if err != nil {
			log.Println(respackID, "-", err)
		} else {
			log.Println(respackID, "loaded -",
				respack.ImageCount(), "images -",
				respack.SongCount(), "songs")
			respacks = append(respacks, respack)
		}
	}

	router := GetHandlers(respacks)

	log.Println("Starting web server on address", addr)
	http.ListenAndServe(addr, router)
}
