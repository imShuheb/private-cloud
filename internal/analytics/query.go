package analytics

import (
	"sort"
	"strings"
)

// FileQuery filters and sorts the largest files of a report.
type FileQuery struct {
	Category Category
	Search   string
	Folder   string
	MinSize  int64
	SortBy   string // size (default), name, modified, type
	Desc     bool
	Offset   int
	Limit    int
}

// QueryFiles returns the matching files for q and the total number of matches.
func QueryFiles(r *Report, q FileQuery) ([]FileEntry, int) {
	if r == nil {
		return []FileEntry{}, 0
	}
	search := strings.ToLower(strings.TrimSpace(q.Search))

	matches := make([]FileEntry, 0, len(r.LargestFiles))
	for _, f := range r.LargestFiles {
		if q.Category != "" && f.Category != q.Category {
			continue
		}
		if q.MinSize > 0 && f.Size < q.MinSize {
			continue
		}
		if q.Folder != "" && !strings.HasPrefix(f.Key, q.Folder) {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(f.Key), search) {
			continue
		}
		matches = append(matches, f)
	}

	less := func(i, j int) bool { return matches[i].Size < matches[j].Size }
	switch q.SortBy {
	case "name":
		less = func(i, j int) bool { return strings.ToLower(matches[i].Name) < strings.ToLower(matches[j].Name) }
	case "modified":
		less = func(i, j int) bool { return matches[i].LastModified.Before(matches[j].LastModified) }
	case "type":
		less = func(i, j int) bool {
			if matches[i].Category != matches[j].Category {
				return matches[i].Category < matches[j].Category
			}
			return matches[i].Size > matches[j].Size
		}
	}
	sort.SliceStable(matches, func(i, j int) bool {
		if q.Desc {
			return less(j, i)
		}
		return less(i, j)
	})

	total := len(matches)
	if q.Offset < 0 {
		q.Offset = 0
	}
	if q.Offset > total {
		q.Offset = total
	}
	end := total
	if q.Limit > 0 && q.Offset+q.Limit < total {
		end = q.Offset + q.Limit
	}
	return matches[q.Offset:end], total
}
