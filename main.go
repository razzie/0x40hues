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

func sortRespacks(respacks []*Respack) {
	sort.Slice(respacks, func(i, j int) bool {
		iResCount := respacks[i].ImageCount() + respacks[i].SongCount()
		jResCount := respacks[j].ImageCount() + respacks[j].SongCount()
		return iResCount > jResCount || (iResCount == jResCount && respacks[i].Name() < respacks[j].Name())
	})
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

	sortRespacks(respacks)

	router := GetHandlers(respacks)

	log.Println("Starting web server on address", addr)
	http.ListenAndServe(addr, router)
}
