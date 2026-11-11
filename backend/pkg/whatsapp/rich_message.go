package whatsapp

import (
	"context"
	"fmt"
	"strings"
)

// Limits for the rich (non-media) message types.
const (
	MaxContactCards          = 20
	MaxProductListSections   = 10
	MaxProductListItems      = 30
	MaxProductSectionTitle   = 24
	interactiveLocationReq   = "location_request_message"
	interactiveTypeProduct   = "product"
	interactiveTypeProductLs = "product_list"
)

// Location is a WhatsApp location pin.
type Location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Name      string  `json:"name,omitempty"`
	Address   string  `json:"address,omitempty"`
}

// ContactPhone is one phone number of a contact card.
type ContactPhone struct {
	Phone string `json:"phone"`
	Type  string `json:"type,omitempty"`  // CELL, MAIN, HOME, WORK...
	WaID  string `json:"wa_id,omitempty"` // adds a "Message" button in WhatsApp
}

// ContactEmail is one email address of a contact card.
type ContactEmail struct {
	Email string `json:"email"`
	Type  string `json:"type,omitempty"` // HOME or WORK
}

// ContactCard is a vCard-like contact sent with a "contacts" message.
type ContactCard struct {
	Name    string         `json:"name"` // formatted name, required
	Phones  []ContactPhone `json:"phones,omitempty"`
	Emails  []ContactEmail `json:"emails,omitempty"`
	Company string         `json:"company,omitempty"`
	Title   string         `json:"title,omitempty"`
}

// ProductSection groups products of a multi-product message.
type ProductSection struct {
	Title              string   `json:"title"`
	ProductRetailerIDs []string `json:"product_retailer_ids"`
}

// ProductMessage is a single-product or multi-product (product_list) message.
// Meta rules: a single product takes an optional body and footer and no
// header; a product list needs a text header and a body, footer optional,
// up to 10 sections and 30 products.
type ProductMessage struct {
	CatalogID         string
	ProductRetailerID string           // single product
	Sections          []ProductSection // product_list
	Header            string           // product_list only (required there)
	Body              string
	Footer            string
}

// IsList reports whether the message is a multi-product list.
func (p ProductMessage) IsList() bool { return len(p.Sections) > 0 }

// BuildLocationPayload returns the "location" object of a message.
func BuildLocationPayload(loc Location) (map[string]any, error) {
	if loc.Latitude < -90 || loc.Latitude > 90 || loc.Longitude < -180 || loc.Longitude > 180 {
		return nil, fmt.Errorf("latitude must be -90..90 and longitude -180..180")
	}
	out := map[string]any{"latitude": loc.Latitude, "longitude": loc.Longitude}
	if s := strings.TrimSpace(loc.Name); s != "" {
		out["name"] = s
	}
	if s := strings.TrimSpace(loc.Address); s != "" {
		out["address"] = s
	}
	return out, nil
}

// BuildContactsPayload returns the "contacts" array of a message.
func BuildContactsPayload(cards []ContactCard) ([]map[string]any, error) {
	if len(cards) == 0 || len(cards) > MaxContactCards {
		return nil, fmt.Errorf("send 1 to %d contacts, got %d", MaxContactCards, len(cards))
	}
	out := make([]map[string]any, 0, len(cards))
	for _, c := range cards {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			return nil, fmt.Errorf("every contact needs a name")
		}
		if len(c.Phones) == 0 && len(c.Emails) == 0 {
			return nil, fmt.Errorf("contact %q needs a phone number or email", name)
		}
		first, last := name, ""
		if i := strings.LastIndex(name, " "); i > 0 {
			first, last = name[:i], name[i+1:]
		}
		nameObj := map[string]any{"formatted_name": name, "first_name": first}
		if last != "" {
			nameObj["last_name"] = last
		}
		card := map[string]any{"name": nameObj}
		if len(c.Phones) > 0 {
			phones := make([]map[string]any, 0, len(c.Phones))
			for _, p := range c.Phones {
				if strings.TrimSpace(p.Phone) == "" {
					continue
				}
				ph := map[string]any{"phone": strings.TrimSpace(p.Phone), "type": orDefault(p.Type, "CELL")}
				if p.WaID != "" {
					ph["wa_id"] = p.WaID
				}
				phones = append(phones, ph)
			}
			card["phones"] = phones
		}
		if len(c.Emails) > 0 {
			emails := make([]map[string]any, 0, len(c.Emails))
			for _, e := range c.Emails {
				if strings.TrimSpace(e.Email) == "" {
					continue
				}
				emails = append(emails, map[string]any{"email": strings.TrimSpace(e.Email), "type": orDefault(e.Type, "WORK")})
			}
			card["emails"] = emails
		}
		if c.Company != "" || c.Title != "" {
			org := map[string]any{}
			if c.Company != "" {
				org["company"] = c.Company
			}
			if c.Title != "" {
				org["title"] = c.Title
			}
			card["org"] = org
		}
		out = append(out, card)
	}
	return out, nil
}

// BuildLocationRequestPayload returns the "interactive" object asking the
// customer to share their location.
func BuildLocationRequestPayload(body string) (map[string]any, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, fmt.Errorf("location request body is required")
	}
	return map[string]any{
		"type":   interactiveLocationReq,
		"body":   map[string]any{"text": truncateLabel(body, MaxInteractiveBody)},
		"action": map[string]any{"name": "send_location"},
	}, nil
}

// BuildProductPayload returns the "interactive" object of a single-product
// or multi-product message.
func BuildProductPayload(p ProductMessage) (map[string]any, error) {
	if strings.TrimSpace(p.CatalogID) == "" {
		return nil, fmt.Errorf("catalog_id is required")
	}
	interactive := map[string]any{}
	if p.Footer != "" {
		interactive["footer"] = map[string]any{"text": truncateLabel(p.Footer, MaxInteractiveFooter)}
	}
	if !p.IsList() {
		if strings.TrimSpace(p.ProductRetailerID) == "" {
			return nil, fmt.Errorf("product_retailer_id is required")
		}
		interactive["type"] = interactiveTypeProduct
		if p.Body != "" {
			interactive["body"] = map[string]any{"text": truncateLabel(p.Body, MaxInteractiveBody)}
		}
		interactive["action"] = map[string]any{
			"catalog_id":          p.CatalogID,
			"product_retailer_id": p.ProductRetailerID,
		}
		return interactive, nil
	}

	if strings.TrimSpace(p.Header) == "" {
		return nil, fmt.Errorf("a product list needs a header")
	}
	if strings.TrimSpace(p.Body) == "" {
		return nil, fmt.Errorf("a product list needs a body")
	}
	if len(p.Sections) > MaxProductListSections {
		return nil, fmt.Errorf("a product list takes at most %d sections", MaxProductListSections)
	}
	total := 0
	sections := make([]map[string]any, 0, len(p.Sections))
	for i, s := range p.Sections {
		items := make([]map[string]any, 0, len(s.ProductRetailerIDs))
		for _, id := range s.ProductRetailerIDs {
			if strings.TrimSpace(id) == "" {
				continue
			}
			items = append(items, map[string]any{"product_retailer_id": id})
		}
		if len(items) == 0 {
			continue
		}
		total += len(items)
		title := strings.TrimSpace(s.Title)
		if title == "" {
			title = fmt.Sprintf("Products %d", i+1)
		}
		sections = append(sections, map[string]any{
			"title":         truncateLabel(title, MaxProductSectionTitle),
			"product_items": items,
		})
	}
	if total == 0 || total > MaxProductListItems {
		return nil, fmt.Errorf("a product list needs 1 to %d products, got %d", MaxProductListItems, total)
	}
	interactive["type"] = interactiveTypeProductLs
	interactive["header"] = map[string]any{"type": "text", "text": truncateLabel(p.Header, MaxInteractiveHeader)}
	interactive["body"] = map[string]any{"text": truncateLabel(p.Body, MaxInteractiveBody)}
	interactive["action"] = map[string]any{"catalog_id": p.CatalogID, "sections": sections}
	return interactive, nil
}

func orDefault(s, def string) string {
	if strings.TrimSpace(s) == "" {
		return def
	}
	return strings.ToUpper(strings.TrimSpace(s))
}

// sendTyped posts a message of msgType whose content object is content.
func (c *Client) sendTyped(ctx context.Context, account *Account, rcpt Recipient, msgType string, content any) (string, error) {
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"type":              msgType,
		msgType:             content,
	}
	rcpt.SetOnPayload(payload)

	respBody, err := c.doRequest(ctx, "POST", c.buildMessagesURL(account), payload, account.AccessToken)
	if err != nil {
		c.Log.Error("Failed to send message", "type", msgType, "error", err, "phone", rcpt.Phone)
		return "", fmt.Errorf("failed to send %s message: %w", msgType, err)
	}
	messageID, err := parseMessageID(respBody)
	if err != nil {
		return "", err
	}
	c.Log.Info("Message sent", "type", msgType, "message_id", messageID, "phone", rcpt.Phone)
	return messageID, nil
}

// SendLocation sends a location pin.
func (c *Client) SendLocation(ctx context.Context, account *Account, rcpt Recipient, loc Location) (string, error) {
	content, err := BuildLocationPayload(loc)
	if err != nil {
		return "", err
	}
	return c.sendTyped(ctx, account, rcpt, "location", content)
}

// SendContacts sends one or more contact cards.
func (c *Client) SendContacts(ctx context.Context, account *Account, rcpt Recipient, cards []ContactCard) (string, error) {
	content, err := BuildContactsPayload(cards)
	if err != nil {
		return "", err
	}
	return c.sendTyped(ctx, account, rcpt, "contacts", content)
}

// SendLocationRequest sends an interactive "Send location" request.
func (c *Client) SendLocationRequest(ctx context.Context, account *Account, rcpt Recipient, body string) (string, error) {
	content, err := BuildLocationRequestPayload(body)
	if err != nil {
		return "", err
	}
	return c.sendTyped(ctx, account, rcpt, "interactive", content)
}

// SendProduct sends a single catalogue product.
func (c *Client) SendProduct(ctx context.Context, account *Account, rcpt Recipient, p ProductMessage) (string, error) {
	p.Sections = nil
	content, err := BuildProductPayload(p)
	if err != nil {
		return "", err
	}
	return c.sendTyped(ctx, account, rcpt, "interactive", content)
}

// SendProductList sends a multi-product message with sections.
func (c *Client) SendProductList(ctx context.Context, account *Account, rcpt Recipient, p ProductMessage) (string, error) {
	if !p.IsList() {
		return "", fmt.Errorf("a product list needs at least one section")
	}
	content, err := BuildProductPayload(p)
	if err != nil {
		return "", err
	}
	return c.sendTyped(ctx, account, rcpt, "interactive", content)
}
