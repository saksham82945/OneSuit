package handlers

import (
	"bytes"
	"encoding/csv"
	"strings"
	"unicode"
)

// CSV files people upload come from Excel, Google Sheets or phone exports, so
// the importer accepts the common variations instead of one exact format.

// newImportCSVReader strips Excel's byte-order mark and picks the separator
// (comma, semicolon or tab) from the first line.
func newImportCSVReader(raw []byte) *csv.Reader {
	raw = bytes.TrimPrefix(raw, []byte("\xef\xbb\xbf"))
	firstLine := raw
	if i := bytes.IndexByte(raw, '\n'); i >= 0 {
		firstLine = raw[:i]
	}
	sep := ','
	best := bytes.Count(firstLine, []byte(","))
	for _, c := range []rune{';', '\t'} {
		if n := bytes.Count(firstLine, []byte(string(c))); n > best {
			sep, best = c, n
		}
	}
	reader := csv.NewReader(bytes.NewReader(raw))
	reader.Comma = sep
	reader.FieldsPerRecord = -1 // rows may have fewer or more cells than the header
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true
	return reader
}

// normalizeHeader turns "Phone_Number", " phone-number " and "PHONE NUMBER"
// into "phone number".
func normalizeHeader(h string) string {
	h = strings.TrimPrefix(h, "\ufeff")
	h = strings.ToLower(strings.TrimSpace(h))
	h = strings.Map(func(r rune) rune {
		if r == '_' || r == '-' || r == '.' || r == '#' || r == ':' {
			return ' '
		}
		return r
	}, h)
	return strings.Join(strings.Fields(h), " ")
}

// looksLikePhone reports whether a cell holds a phone number rather than a header.
func looksLikePhone(s string) bool {
	digits := 0
	for _, r := range strings.TrimSpace(s) {
		switch {
		case unicode.IsDigit(r):
			digits++
		case r == '+' || r == ' ' || r == '-' || r == '(' || r == ')' || r == '.':
		default:
			return false
		}
	}
	return digits >= 7
}

// resolveImportHeader renames header cells to the database column names they
// stand for ("Mobile" becomes "phone_number"). When the file has no header row
// (its first line is already a contact) it builds one and returns that first
// line as pending, so it is imported too.
func resolveImportHeader(header []string, aliases map[string][]string) ([]string, []string) {
	lookup := map[string]string{}
	for col, names := range aliases {
		lookup[normalizeHeader(col)] = col
		for _, n := range names {
			lookup[normalizeHeader(n)] = col
		}
	}

	out := make([]string, len(header))
	used := map[string]bool{}
	matched := false
	for i, h := range header {
		out[i] = strings.TrimSpace(strings.TrimPrefix(h, "\ufeff"))
		if col, ok := lookup[normalizeHeader(h)]; ok && !used[col] {
			out[i] = col
			used[col] = true
			matched = true
		}
	}
	if matched || aliases["phone_number"] == nil {
		return out, nil
	}

	// No known header: if a cell is a phone number, the first line is data.
	phoneIdx := -1
	for i, h := range header {
		if looksLikePhone(h) {
			phoneIdx = i
			break
		}
	}
	if phoneIdx < 0 {
		return out, nil
	}
	synthetic := make([]string, len(header))
	synthetic[phoneIdx] = "phone_number"
	for i, h := range header {
		if i != phoneIdx && strings.TrimSpace(h) != "" && !looksLikePhone(h) {
			synthetic[i] = "profile_name"
			break
		}
	}
	return synthetic, header
}

// cleanPhone keeps only the digits of a phone number ("+91 98765-43210" → "919876543210").
func cleanPhone(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
