package main

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"io/fs"
	"path/filepath"
	"strings"
	"time"
)

type XMLType int

const (
	Unknown XMLType = iota
	Info
	Images
	Songs
	Hues
)

type Respack struct {
	ID   string
	Info struct {
		XMLName     xml.Name `xml:"info"`
		Name        string   `xml:"name"`
		Author      string   `xml:"author,omitempty"`
		Description string   `xml:"description,omitempty"`
		Link        string   `xml:"link,omitempty"`
	}
	Images struct {
		XMLName xml.Name `xml:"images"`
		Image   []struct {
			URI           string `xml:"-"`
			Name          string `xml:"name,attr"`
			FullName      string `xml:"fullname,omitempty"`
			CenterPixel   *int   `xml:"centerPixel,omitempty"`
			Align         string `xml:"align,omitempty"`
			FrameDuration *int   `xml:"frameDuration,omitempty"`
			BeatsPerAnim  *int   `xml:"beatsPerAnim,omitempty"`
		} `xml:"image"`
	}
	Songs struct {
		XMLName xml.Name `xml:"songs"`
		Song    []struct {
			URI           string `xml:"-"`
			Name          string `xml:"name,attr"`
			Title         string `xml:"title,omitempty"`
			Rhythm        string `xml:"rythm,omitempty"`
			BuildupURI    string `xml:"-"`
			Buildup       string `xml:"buildup,omitempty"`
			BuildupRhythm string `xml:"buildupRhythm,omitempty"`
			CharsPerBeat  *int   `xml:"charsPerBeat,omitempty"`
		} `xml:"song"`
	}
	Hues struct {
		XMLName xml.Name `xml:"hues"`
		Hue     []struct {
			Name  string `xml:"name,attr"`
			Color string `xml:",chardata"`
		} `xml:"hue"`
	}

	fileHandlers map[string]func() (fs.File, error)
	closer       io.Closer
}

func LoadRespackZIP(filename string) (rp *Respack, err error) {
	r, err := zip.OpenReader(filename)
	if err != nil {
		return nil, err
	}

	defer func() {
		if err != nil && rp != nil && rp.closer != nil {
			rp.closer.Close()
		}
	}()

	rp = &Respack{
		ID:           respackFilenameToID(filename),
		fileHandlers: make(map[string]func() (fs.File, error)),
		closer:       r,
	}
	rp.Info.Name = rp.ID

	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		ext := filepath.Ext(f.Name)
		if ext == ".xml" {
			if err := rp.loadZipXML(f); err != nil {
				return nil, err
			}
		} else {
			basename := filepath.Base(f.Name)
			f := f
			rp.fileHandlers[basename] = func() (fs.File, error) {
				return newFileWrapper(f)
			}
		}
	}

	rp.resolveURIs()

	return rp, nil
}

func LoadRespackFS(root fs.FS, path string) (*Respack, error) {
	rp := &Respack{
		ID:           respackFilenameToID(path),
		fileHandlers: make(map[string]func() (fs.File, error)),
	}
	if err := rp.loadFSDir(root, path); err != nil {
		return nil, err
	}
	rp.resolveURIs()
	return rp, nil
}

func (rp *Respack) loadFSDir(root fs.FS, path string) error {
	dirEntries, err := fs.ReadDir(root, path)
	if err != nil {
		return err
	}
	for _, entry := range dirEntries {
		fullPath := path + "/" + entry.Name()
		if entry.IsDir() {
			if err := rp.loadFSDir(root, fullPath); err != nil {
				return err
			}
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext == ".xml" {
			if err := rp.loadFSXML(root, fullPath); err != nil {
				return err
			}
		} else {
			basename := filepath.Base(entry.Name())
			rp.fileHandlers[basename] = func() (fs.File, error) {
				return root.Open(fullPath)
			}
		}
	}
	return nil
}

func (rp *Respack) loadZipXML(f *zip.File) error {
	r, err := f.Open()
	if err != nil {
		return err
	}
	defer r.Close()
	return rp.unmarshal(r)
}

func (rp *Respack) loadFSXML(root fs.FS, path string) error {
	f, err := root.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return rp.unmarshal(f)
}

func (rp *Respack) unmarshal(r io.Reader) error {
	content, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	xmltype, err := detectXMLType(content)
	if err != nil {
		return err
	}
	var mountFile string
	switch xmltype {
	case Info:
		mountFile = "info.xml"
		err = xml.Unmarshal(content, &rp.Info)
	case Images:
		mountFile = "images.xml"
		err = xml.Unmarshal(content, &rp.Images)
	case Songs:
		mountFile = "songs.xml"
		err = xml.Unmarshal(content, &rp.Songs)
	case Hues:
		mountFile = "hues.xml"
		err = xml.Unmarshal(content, &rp.Hues)
	}
	if err == nil && mountFile != "" {
		rp.fileHandlers[mountFile] = func() (fs.File, error) {
			return &byteFile{reader: bytes.NewReader(content)}, nil
		}
	}
	return err
}

func (rp *Respack) resolveURI(resourceName string, extensions []string) (string, bool) {
	if resourceName == "" {
		return "", false
	}
	for _, ext := range extensions {
		if _, ok := rp.fileHandlers[resourceName+ext]; ok {
			return rp.ID + "/" + resourceName + ext, true
		}
	}
	return "", false
}

func (rp *Respack) resolveImageURI(imageName string) (string, bool) {
	extensions := []string{".png", ".jpg", ".gif"}
	if uri, ok := rp.resolveURI(imageName, extensions); ok {
		return uri, true
	}
	if uri, ok := rp.resolveURI(imageName+"_1", extensions); ok {
		return uri, true
	}
	if uri, ok := rp.resolveURI(imageName+"_01", extensions); ok {
		return uri, true
	}
	if uri, ok := rp.resolveURI(imageName+"_001", extensions); ok {
		return uri, true
	}
	return "", false
}

func (rp *Respack) resolveSongURI(songName string) (string, bool) {
	extensions := []string{".opus", ".ogg", ".mp3"}
	return rp.resolveURI(songName, extensions)
}

func (rp *Respack) resolveURIs() {
	for i, image := range rp.Images.Image {
		if imageURI, ok := rp.resolveImageURI(image.Name); ok {
			rp.Images.Image[i].URI = imageURI
		}
	}
	for i, song := range rp.Songs.Song {
		if songURI, ok := rp.resolveSongURI(song.Name); ok {
			rp.Songs.Song[i].URI = songURI
		}
		if buildupURI, ok := rp.resolveSongURI(song.Buildup); ok {
			rp.Songs.Song[i].BuildupURI = buildupURI
		}
	}
}

func (rp *Respack) Name() string {
	return rp.Info.Name
}

func (rp *Respack) ImageCount() int {
	return len(rp.Images.Image)
}

func (rp *Respack) SongCount() int {
	return len(rp.Songs.Song)
}

func (rp *Respack) Open(name string) (fs.File, error) {
	if fh, ok := rp.fileHandlers[name]; ok {
		return fh()
	} else if name == "info.xml" {
		return &byteFile{reader: strings.NewReader("<info><name>" + rp.ID + "</name></info>")}, nil
	}
	return nil, fmt.Errorf("not found")
}

func (rp *Respack) Close() error {
	if rp.closer != nil {
		return rp.closer.Close()
	}
	return nil
}

type fileInfo int

func (fi fileInfo) Name() string       { return "*" }
func (fi fileInfo) Size() int64        { return int64(fi) }
func (fi fileInfo) Mode() fs.FileMode  { return 0 }
func (fi fileInfo) ModTime() time.Time { return time.Now() }
func (fi fileInfo) IsDir() bool        { return false }
func (fi fileInfo) Sys() interface{}   { return nil }

type reader interface {
	io.ReadSeeker
	Size() int64
}

type byteFile struct {
	reader
}

func (bf *byteFile) Stat() (fs.FileInfo, error) {
	return fileInfo(bf.reader.Size()), nil
}

func (bf *byteFile) Close() error {
	return nil
}

type fileWrapper struct {
	fi fs.FileInfo
	rc io.ReadCloser
}

func newFileWrapper(f *zip.File) (*fileWrapper, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	return &fileWrapper{fi: f.FileInfo(), rc: rc}, nil
}

func (w *fileWrapper) Stat() (fs.FileInfo, error) {
	return w.fi, nil
}

func (w *fileWrapper) Read(p []byte) (int, error) {
	return w.rc.Read(p)
}

func (w *fileWrapper) Close() error {
	return w.rc.Close()
}

func respackFilenameToID(filename string) string {
	basename := filepath.Base(filename)
	id := strings.TrimSuffix(basename, filepath.Ext(basename))
	return strings.ReplaceAll(id, " ", "_")
}

func detectXMLType(content []byte) (XMLType, error) {
	decoder := xml.NewDecoder(bytes.NewReader(content))
	for {
		token, err := decoder.Token()
		if err != nil {
			return Unknown, err
		}
		switch t := token.(type) {
		case xml.StartElement:
			switch strings.ToLower(t.Name.Local) {
			case "info":
				return Info, nil
			case "images":
				return Images, nil
			case "songs":
				return Songs, nil
			case "hues":
				return Hues, nil
			default:
				return Unknown, nil
			}
		}
	}
}
