package whatsapp

import (
	"context"
	"fmt"
)

// WhatsApp limits for interactive messages (Cloud API).
const (
	MaxInteractiveBody     = 1024
	MaxInteractiveFooter   = 60
	MaxInteractiveHeader   = 60
	MaxReplyButtons        = 3
	MaxReplyButtonTitle    = 20
	MaxListRows            = 10
	MaxListSections        = 10
	MaxListRowTitle        = 24
	MaxListRowDescription  = 72
	MaxListSectionTitle    = 24
	MaxListButtonText      = 20
	MaxCTADisplayText      = 20
	MaxMediaCaptionLength  = 1024
	MaxTextMessageLength   = 4096
	interactiveTypeButton  = "button"
	interactiveTypeList    = "list"
	interactiveTypeCTAURL  = "cta_url"
	interactiveHeaderText  = "text"
	interactiveHeaderImage = "image"
	interactiveHeaderVideo = "video"
	interactiveHeaderDoc   = "document"
)

// InteractiveHeader is the optional header of an interactive message.
// Type is "text", "image", "video" or "document" (WhatsApp does not allow
// audio headers). Media headers take either MediaID (uploaded to Meta) or
// Link (a public URL).
type InteractiveHeader struct {
	Type     string
	Text     string
	MediaID  string
	Link     string
	Filename string // document headers only
}

// ListRow is one selectable row of a list message.
type ListRow struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

// ListSection groups rows of a list message.
type ListSection struct {
	Title string    `json:"title"`
	Rows  []ListRow `json:"rows"`
}

// InteractiveMessage describes a reply-button, list or CTA URL message with
// an optional header and footer.
type InteractiveMessage struct {
	Type   string // "button", "list" or "cta_url"
	Header *InteractiveHeader
	Body   string
	Footer string

	Buttons []Button // Type "button": up to 3 reply buttons

	ListButtonText string        // Type "list": the button that opens the list
	Sections       []ListSection // Type "list"

	CTADisplayText string // Type "cta_url"
	CTAURL         string // Type "cta_url"
}

// BuildInteractivePayload returns the "interactive" object of a Cloud API
// message for msg, or an error when msg breaks a WhatsApp rule the API
// would reject anyway.
func BuildInteractivePayload(msg InteractiveMessage) (map[string]any, error) {
	if msg.Body == "" {
		return nil, fmt.Errorf("interactive message body is required")
	}
	interactive := map[string]any{
		"type": msg.Type,
		"body": map[string]any{"text": truncateLabel(msg.Body, MaxInteractiveBody)},
	}
	if msg.Footer != "" {
		interactive["footer"] = map[string]any{"text": truncateLabel(msg.Footer, MaxInteractiveFooter)}
	}
	if msg.Header != nil && msg.Header.Type != "" {
		header, err := buildInteractiveHeader(msg.Type, *msg.Header)
		if err != nil {
			return nil, err
		}
		interactive["header"] = header
	}

	switch msg.Type {
	case interactiveTypeButton:
		if len(msg.Buttons) == 0 || len(msg.Buttons) > MaxReplyButtons {
			return nil, fmt.Errorf("reply button messages need 1 to %d buttons, got %d", MaxReplyButtons, len(msg.Buttons))
		}
		buttons := make([]map[string]any, 0, len(msg.Buttons))
		for _, b := range msg.Buttons {
			buttons = append(buttons, map[string]any{
				"type":  "reply",
				"reply": map[string]any{"id": b.ID, "title": truncateLabel(b.Title, MaxReplyButtonTitle)},
			})
		}
		interactive["action"] = map[string]any{"buttons": buttons}
	case interactiveTypeList:
		total := 0
		sections := make([]map[string]any, 0, len(msg.Sections))
		for _, s := range msg.Sections {
			rows := make([]map[string]any, 0, len(s.Rows))
			for _, r := range s.Rows {
				row := map[string]any{"id": r.ID, "title": truncateLabel(r.Title, MaxListRowTitle)}
				if r.Description != "" {
					row["description"] = truncateLabel(r.Description, MaxListRowDescription)
				}
				rows = append(rows, row)
			}
			total += len(rows)
			if len(rows) == 0 {
				continue
			}
			section := map[string]any{"rows": rows}
			if s.Title != "" {
				section["title"] = truncateLabel(s.Title, MaxListSectionTitle)
			}
			sections = append(sections, section)
		}
		if total == 0 || total > MaxListRows {
			return nil, fmt.Errorf("list messages need 1 to %d rows, got %d", MaxListRows, total)
		}
		// WhatsApp requires a title on every section once there is more than one.
		if len(sections) > 1 {
			for i, s := range sections {
				if _, ok := s["title"]; !ok {
					s["title"] = fmt.Sprintf("Section %d", i+1)
				}
			}
		}
		buttonText := msg.ListButtonText
		if buttonText == "" {
			buttonText = "Select an option"
		}
		interactive["action"] = map[string]any{
			"button":   truncateLabel(buttonText, MaxListButtonText),
			"sections": sections,
		}
	case interactiveTypeCTAURL:
		if msg.CTADisplayText == "" || msg.CTAURL == "" {
			return nil, fmt.Errorf("button text and URL are required")
		}
		interactive["action"] = map[string]any{
			"name": "cta_url",
			"parameters": map[string]any{
				"display_text": truncateLabel(msg.CTADisplayText, MaxCTADisplayText),
				"url":          msg.CTAURL,
			},
		}
	default:
		return nil, fmt.Errorf("unsupported interactive type %q", msg.Type)
	}
	return interactive, nil
}

func buildInteractiveHeader(msgType string, h InteractiveHeader) (map[string]any, error) {
	switch h.Type {
	case interactiveHeaderText:
		if h.Text == "" {
			return nil, fmt.Errorf("text header is empty")
		}
		return map[string]any{"type": "text", "text": truncateLabel(h.Text, MaxInteractiveHeader)}, nil
	case interactiveHeaderImage, interactiveHeaderVideo, interactiveHeaderDoc:
		if msgType == interactiveTypeList {
			// List messages only take text headers.
			return nil, fmt.Errorf("list messages only support a text header")
		}
		media := map[string]any{}
		switch {
		case h.MediaID != "":
			media["id"] = h.MediaID
		case h.Link != "":
			media["link"] = h.Link
		default:
			return nil, fmt.Errorf("%s header has no media", h.Type)
		}
		if h.Type == interactiveHeaderDoc && h.Filename != "" {
			media["filename"] = h.Filename
		}
		return map[string]any{"type": h.Type, h.Type: media}, nil
	default:
		return nil, fmt.Errorf("unsupported header type %q", h.Type)
	}
}

// SendInteractive sends a reply-button, list or CTA URL message, with an
// optional text/image/video/document header and footer.
func (c *Client) SendInteractive(ctx context.Context, account *Account, rcpt Recipient, msg InteractiveMessage) (string, error) {
	interactive, err := BuildInteractivePayload(msg)
	if err != nil {
		return "", err
	}
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"type":              "interactive",
		"interactive":       interactive,
	}
	rcpt.SetOnPayload(payload)

	url := c.buildMessagesURL(account)
	c.Log.Debug("Sending interactive message", "type", msg.Type, "phone", rcpt.Phone)

	respBody, err := c.doRequest(ctx, "POST", url, payload, account.AccessToken)
	if err != nil {
		c.Log.Error("Failed to send interactive message", "error", err, "phone", rcpt.Phone)
		return "", fmt.Errorf("failed to send interactive %s message: %w", msg.Type, err)
	}
	messageID, err := parseMessageID(respBody)
	if err != nil {
		return "", err
	}
	c.Log.Info("Interactive message sent", "type", msg.Type, "message_id", messageID, "phone", rcpt.Phone)
	return messageID, nil
}
