package handlers

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// Meta WhatsApp template button limits.
const (
	MaxTemplateButtons         = 10
	MaxTemplateURLButtons      = 2
	MaxTemplatePhoneButtons    = 1
	MaxTemplateCopyCodeButtons = 1
	MaxTemplateButtonTextLen   = 25
	MaxTemplateButtonURLLen    = 2000
	MaxTemplateCopyCodeLen     = 15
)

var (
	templatePhoneRe    = regexp.MustCompile(`^\+?[1-9]\d{6,14}$`)
	templatePhoneStrip = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "", ".", "")
	templateURLVarRe   = regexp.MustCompile(`\{\{[^}]*\}\}`)
)

// templateButtonType returns the upper-cased "type" of a stored button.
func templateButtonType(btn any) string {
	m, ok := btn.(map[string]any)
	if !ok {
		return ""
	}
	t, _ := m["type"].(string)
	return strings.ToUpper(strings.TrimSpace(t))
}

// isQuickReplyButton reports whether a button is a quick reply (vs a call-to-action).
func isQuickReplyButton(btn any) bool {
	return templateButtonType(btn) == "QUICK_REPLY"
}

func templateButtonString(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return strings.TrimSpace(s)
}

// templateButtonExample returns the first example value of a button, accepting
// both a plain string and Meta's array form.
func templateButtonExample(m map[string]any) string {
	switch ex := m["example"].(type) {
	case string:
		return strings.TrimSpace(ex)
	case []any:
		if len(ex) > 0 {
			if s, ok := ex[0].(string); ok {
				return strings.TrimSpace(s)
			}
		}
	case []string:
		if len(ex) > 0 {
			return strings.TrimSpace(ex[0])
		}
	}
	return ""
}

// ValidateTemplateButtons checks buttons of a MARKETING/UTILITY template against
// Meta's rules: at most 10 buttons, 2 URL, 1 phone and 1 copy-code button,
// non-empty text up to 25 characters and valid URLs/phone numbers. Grouping of
// quick-reply buttons is fixed by NormalizeTemplateButtons. Authentication templates only carry the OTP button
// and are not validated here.
func ValidateTemplateButtons(category string, buttons []any) error {
	if strings.ToUpper(category) == "AUTHENTICATION" || len(buttons) == 0 {
		return nil
	}
	if len(buttons) > MaxTemplateButtons {
		return fmt.Errorf("a template can have at most %d buttons (got %d)", MaxTemplateButtons, len(buttons))
	}

	var urls, phones, copyCodes int
	for i, raw := range buttons {
		n := i + 1
		m, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("button %d is not a valid object", n)
		}
		btnType := templateButtonType(raw)
		text := templateButtonString(m, "text")

		needsText := btnType != "COPY_CODE" && btnType != "OTP"
		if needsText {
			if text == "" {
				return fmt.Errorf("button %d needs a label", n)
			}
			if len([]rune(text)) > MaxTemplateButtonTextLen {
				return fmt.Errorf("button %d label must be at most %d characters", n, MaxTemplateButtonTextLen)
			}
		}

		switch btnType {
		case "URL":
			urls++
			if err := validateTemplateButtonURL(m, n); err != nil {
				return err
			}
		case "PHONE_NUMBER":
			phones++
			phone := templatePhoneStrip.Replace(templateButtonString(m, "phone_number"))
			if phone == "" {
				return fmt.Errorf("button %d needs a phone number", n)
			}
			if !templatePhoneRe.MatchString(phone) {
				return fmt.Errorf("button %d phone number must be in international format, e.g. +919876543210", n)
			}
		case "COPY_CODE":
			copyCodes++
			if strings.ToUpper(category) != "MARKETING" && strings.ToUpper(category) != "UTILITY" {
				return fmt.Errorf("copy code buttons are only allowed on marketing or utility templates")
			}
			code := templateButtonExample(m)
			if code == "" {
				return fmt.Errorf("button %d needs an example offer code", n)
			}
			if len([]rune(code)) > MaxTemplateCopyCodeLen {
				return fmt.Errorf("button %d example code must be at most %d characters", n, MaxTemplateCopyCodeLen)
			}
		case "OTP":
			return fmt.Errorf("one-time password buttons are only allowed on authentication templates")
		case "":
			return fmt.Errorf("button %d is missing a type", n)
		default:
			// Other Meta types (CATALOG, MPM, ...) synced from Meta are passed
			// through untouched so existing templates stay editable.
		}
	}

	if urls > MaxTemplateURLButtons {
		return fmt.Errorf("a template can have at most %d website (URL) buttons", MaxTemplateURLButtons)
	}
	if phones > MaxTemplatePhoneButtons {
		return fmt.Errorf("a template can have at most %d phone number button", MaxTemplatePhoneButtons)
	}
	if copyCodes > MaxTemplateCopyCodeButtons {
		return fmt.Errorf("a template can have at most %d copy code button", MaxTemplateCopyCodeButtons)
	}
	return nil
}

func validateTemplateButtonURL(m map[string]any, n int) error {
	raw := templateButtonString(m, "url")
	if raw == "" {
		return fmt.Errorf("button %d needs a website URL", n)
	}
	if len(raw) > MaxTemplateButtonURLLen {
		return fmt.Errorf("button %d URL must be at most %d characters", n, MaxTemplateButtonURLLen)
	}
	vars := templateURLVarRe.FindAllString(raw, -1)
	if len(vars) > 1 || (len(vars) == 1 && (vars[0] != "{{1}}" || !strings.HasSuffix(raw, "{{1}}"))) {
		return fmt.Errorf("button %d URL can only have one variable, {{1}}, at the end", n)
	}
	base := strings.Replace(raw, "{{1}}", "", 1)
	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || !strings.Contains(u.Host, ".") {
		return fmt.Errorf("button %d URL must be a valid http(s) link, e.g. https://example.com", n)
	}
	if len(vars) == 1 && templateButtonExample(m) == "" {
		return fmt.Errorf("button %d URL has {{1}}, so Meta needs an example URL", n)
	}
	return nil
}

// NormalizeTemplateButtons returns the buttons with quick-reply buttons grouped
// together, as Meta requires. The group that appears first keeps its position
// (quick replies first if the first button is a quick reply, call-to-action
// buttons first otherwise); relative order within each group is preserved.
// Phone numbers are stripped of spaces and punctuation.
func NormalizeTemplateButtons(buttons []any) []any {
	if len(buttons) == 0 {
		return buttons
	}
	var quick, cta []any
	for _, b := range buttons {
		if m, ok := b.(map[string]any); ok && templateButtonType(b) == "PHONE_NUMBER" {
			copied := make(map[string]any, len(m))
			for k, v := range m {
				copied[k] = v
			}
			copied["phone_number"] = templatePhoneStrip.Replace(templateButtonString(m, "phone_number"))
			b = copied
		}
		if isQuickReplyButton(b) {
			quick = append(quick, b)
		} else {
			cta = append(cta, b)
		}
	}
	out := make([]any, 0, len(buttons))
	if isQuickReplyButton(buttons[0]) {
		out = append(append(out, quick...), cta...)
	} else {
		out = append(append(out, cta...), quick...)
	}
	return out
}
