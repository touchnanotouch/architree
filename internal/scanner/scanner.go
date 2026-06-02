package scanner

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Node struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Type     string `json:"type"`
	Children []Node `json:"children,omitempty"`
}

type Result struct {
	Name  string `json:"name"`
	Tree  []Node `json:"tree"`
	Stats Stats  `json:"stats"`
}

type Stats struct {
	Files     int        `json:"files"`
	Dirs      int        `json:"dirs"`
	Lines     int        `json:"lines"`
	Languages []Language `json:"languages,omitempty"`
}

type Language struct {
	Label string `json:"label"`
	Value int    `json:"value"`
}

var skipDirs = map[string]bool{
	".git":        true,
	"node_modules": true,
	"vendor":      true,
	".idea":       true,
	".vscode":     true,
	"__pycache__": true,
	"target":      true,
	"dist":        true,
	"build":       true,
	"env":         true,
	".venv":       true,
	"venv":        true,
}

func Scan(root string) (*Result, error) {
	root = filepath.Clean(root)

	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, os.ErrInvalid
	}

	stats := Stats{}
	tree, err := scanDir(root, root, &stats)
	if err != nil {
		return nil, err
	}

	name := filepath.Base(root)

	return &Result{
		Name:  name,
		Tree:  tree,
		Stats: stats,
	}, nil
}

func scanDir(root, dir string, stats *Stats) ([]Node, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir() != entries[j].IsDir() {
			return entries[i].IsDir()
		}
		return strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
	})

	var nodes []Node

	for _, entry := range entries {
		name := entry.Name()

		if skipDirs[name] {
			continue
		}

		fullPath := filepath.Join(dir, name)

		node := Node{
			Name: name,
			Path: fullPath,
		}

		if entry.IsDir() {
			node.Type = "dir"
			children, err := scanDir(root, fullPath, stats)
			if err != nil {
				continue
			}
			node.Children = children
			stats.Dirs++
		} else {
			node.Type = "file"
			stats.Files++
		}

		nodes = append(nodes, node)
	}

	return nodes, nil
}
