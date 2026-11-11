package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm/clause"
)

// ============================================================================
// Rich chat messages: location, contact cards, catalogue products, location
// requests, quick polls (reply buttons / list) and scheduled messages.
// ============================================================================

// pollButtonPrefix marks the reply ids of a quick poll: "poll:<poll_id>:<n>".
const pollButtonPrefix = "poll:"

// ProductDisplay is what the chat bubble shows for a product (the WhatsApp
// payload only carries ids).
type ProductDisplay struct {
	CatalogID         string `json:"catalog_id,omitempty"`
	ProductRetailerID string `json:"product_retailer_id"`
	Name              string `json:"name,omitempty"`
	Price             string `json:"price,omitempty"`
	ImageURL          string `json:"image_url,omitempty"`
}

// IncomingOrder is a cart a customer sends from a catalogue.
type IncomingOrder struct {
	CatalogID    string `json:"catalog_id"`
	Text         string `json:"text,omitempty"`
	ProductItems []struct {
		ProductRetailerID string      `json:"product_retailer_id"`
		Quantity          json.Number `json:"quantity"`
		ItemPrice         json.Number `json:"item_price"`
		Currency          string      `json:"currency"`
	} `json:"product_items"`
}

// incomingOrderContent stores an order as JSON so the chat can render it.
func incomingOrderContent(o *IncomingOrder) string {
	items := make([]map[string]any, 0, len(o.ProductItems))
	total := 0.0
	currency := ""
	for _, it := range o.ProductItems {
		qty, _ := it.Quantity.Float64()
		price, _ := it.ItemPrice.Float64()
		total += qty * price
		if currency == "" {
			currency = it.Currency
		}
		items = append(items, map[string]any{
			"product_retailer_id": it.ProductRetailerID,
			"quantity":            qty,
			"item_price":          price,
			"currency":            it.Currency,
		})
	}
	out := map[string]any{
		"catalog_id": o.CatalogID,
		"items":      items,
		"total":      math.Round(total*100) / 100,
		"currency":   currency,
	}
	if o.Text != "" {
		out["text"] = o.Text
	}
	b, _ := json.Marshal(out)
	return string(b)
}

// richMessageContent is the stored content of location and contacts
// messages: the same JSON shape incoming ones are stored with.
func richMessageContent(req OutgoingMessageRequest) string {
	switch req.Type {
	case models.MessageTypeLocation:
		if req.Location == nil {
			return ""
		}
		data := map[string]any{"latitude": req.Location.Latitude, "longitude": req.Location.Longitude}
		if req.Location.Name != "" {
			data["name"] = req.Location.Name
		}
		if req.Location.Address != "" {
			data["address"] = req.Location.Address
		}
		b, _ := json.Marshal(data)
		return string(b)
	case models.MessageTypeContacts:
		cards := make([]map[string]any, 0, len(req.ContactCards))
		for _, c := range req.ContactCards {
			card := map[string]any{"name": c.Name}
			if len(c.Phones) > 0 {
				phones := make([]string, 0, len(c.Phones))
				for _, p := range c.Phones {
					phones = append(phones, p.Phone)
				}
				card["phones"] = phones
			}
			if len(c.Emails) > 0 {
				emails := make([]string, 0, len(c.Emails))
				for _, e := range c.Emails {
					emails = append(emails, e.Email)
				}
				card["emails"] = emails
			}
			if c.Company != "" {
				card["company"] = c.Company
			}
			cards = append(cards, card)
		}
		b, _ := json.Marshal(cards)
		return string(b)
	}
	return ""
}

// richMessagePreview is the inbox preview of a rich message.
func richMessagePreview(req OutgoingMessageRequest) string {
	switch req.Type {
	case models.MessageTypeLocation:
		if req.Location != nil && req.Location.Name != "" {
			return truncateString("📍 "+req.Location.Name, 100)
		}
		return "📍 Location"
	case models.MessageTypeContacts:
		if len(req.ContactCards) == 1 {
			return truncateString("👤 "+req.ContactCards[0].Name, 100)
		}
		return fmt.Sprintf("👤 %d contacts", len(req.ContactCards))
	}
	switch req.RichData["type"] {
	case "poll":
		return truncateString("📊 "+req.BodyText, 100)
	case "location_request":
		return "📍 Location request"
	case "product", "product_list":
		return "🛍️ " + truncateString(firstNonEmpty(req.BodyText, "Product"), 90)
	}
	return truncateString(req.BodyText, 100)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// applyRichMessage fills msgReq for the rich message types of a chat send.
// It returns a user-facing error for a bad request, or "".
func (a *App) applyRichMessage(orgID uuid.UUID, req *SendMessageRequest, msgReq *OutgoingMessageRequest) string {
	switch req.Type {
	case models.MessageTypeLocation:
		if req.Location == nil {
			return "location is required"
		}
		if _, err := whatsapp.BuildLocationPayload(*req.Location); err != nil {
			return err.Error()
		}
		loc := *req.Location
		msgReq.Location = &loc
		return ""
	case models.MessageTypeContacts, models.MessageTypeContact:
		if _, err := whatsapp.BuildContactsPayload(req.Contacts); err != nil {
			return err.Error()
		}
		msgReq.Type = models.MessageTypeContacts
		msgReq.ContactCards = req.Contacts
		return ""
	case models.MessageTypeInteractive:
	default:
		return ""
	}
	in := req.Interactive
	if in == nil {
		return ""
	}
	switch in.Type {
	case "location_request", "location_request_message":
		body := firstNonEmpty(in.Body, req.Content.Body, "Please share your location.")
		msgReq.InteractiveType = "location_request_message"
		msgReq.BodyText = body
		msgReq.RichData = models.JSONB{"type": "location_request", "body": body}
	case "product", "product_list":
		p := whatsapp.ProductMessage{
			CatalogID:         strings.TrimSpace(in.CatalogID),
			ProductRetailerID: strings.TrimSpace(in.ProductRetailerID),
			Header:            strings.TrimSpace(in.Header),
			Body:              strings.TrimSpace(in.Body),
			Footer:            strings.TrimSpace(in.Footer),
		}
		if in.Type == "product_list" {
			p.Sections = in.Sections
			if len(p.Sections) == 0 {
				return "a product list needs at least one section"
			}
		}
		if _, err := whatsapp.BuildProductPayload(p); err != nil {
			return err.Error()
		}
		msgReq.Product = &p
		msgReq.BodyText = p.Body
		products := make([]any, 0, len(in.Products))
		for _, pd := range in.Products {
			products = append(products, map[string]any{
				"catalog_id":          pd.CatalogID,
				"product_retailer_id": pd.ProductRetailerID,
				"name":                pd.Name,
				"price":               pd.Price,
				"image_url":           pd.ImageURL,
			})
		}
		data := models.JSONB{
			"type":       in.Type,
			"catalog_id": p.CatalogID,
			"body":       p.Body,
			"products":   products,
		}
		if p.Footer != "" {
			data["footer"] = p.Footer
		}
		if p.IsList() {
			data["header"] = p.Header
			sections := make([]any, 0, len(p.Sections))
			for _, s := range p.Sections {
				ids := make([]any, 0, len(s.ProductRetailerIDs))
				for _, id := range s.ProductRetailerIDs {
					ids = append(ids, id)
				}
				sections = append(sections, map[string]any{"title": s.Title, "product_retailer_ids": ids})
			}
			data["sections"] = sections
		} else {
			data["product_retailer_id"] = p.ProductRetailerID
		}
		msgReq.RichData = data
	case "poll":
		return applyPoll(req, msgReq)
	}
	return ""
}

// applyPoll turns a quick poll into reply buttons (≤3 options) or a list
// (4–10 options). WhatsApp has no poll type in the Cloud API.
func applyPoll(req *SendMessageRequest, msgReq *OutgoingMessageRequest) string {
	in := req.Interactive
	question := strings.TrimSpace(firstNonEmpty(in.Body, req.Content.Body))
	if question == "" {
		return "a poll needs a question"
	}
	seen := map[string]bool{}
	options := make([]string, 0, len(in.Options))
	for _, o := range in.Options {
		o = strings.TrimSpace(o)
		if o == "" || seen[strings.ToLower(o)] {
			continue
		}
		seen[strings.ToLower(o)] = true
		options = append(options, o)
	}
	if len(options) < 2 || len(options) > whatsapp.MaxListRows {
		return fmt.Sprintf("a poll needs 2 to %d different options", whatsapp.MaxListRows)
	}
	mode := "button"
	maxLen := whatsapp.MaxReplyButtonTitle
	if len(options) > whatsapp.MaxReplyButtons {
		mode = "list"
		maxLen = whatsapp.MaxListRowTitle
	}
	for _, o := range options {
		if len([]rune(o)) > maxLen {
			return fmt.Sprintf("option %q is too long: WhatsApp allows %d characters for a %s poll", o, maxLen, map[string]string{"button": "3-option", "list": "4–10 option"}[mode])
		}
	}

	pollID := strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	msg := &whatsapp.InteractiveMessage{Type: mode, Body: question, Footer: "Tap an option to vote"}
	stored := make([]any, 0, len(options))
	rows := make([]whatsapp.ListRow, 0, len(options))
	for i, o := range options {
		id := fmt.Sprintf("%s%s:%d", pollButtonPrefix, pollID, i)
		stored = append(stored, map[string]any{"id": id, "title": o})
		if mode == "button" {
			msg.Buttons = append(msg.Buttons, whatsapp.Button{ID: id, Title: o})
		} else {
			rows = append(rows, whatsapp.ListRow{ID: id, Title: o})
		}
	}
	if mode == "list" {
		msg.ListButtonText = "Vote"
		msg.Sections = []whatsapp.ListSection{{Title: "Options", Rows: rows}}
	}
	msgReq.Interactive = msg
	msgReq.InteractiveType = mode
	msgReq.BodyText = question
	msgReq.RichData = models.JSONB{
		"type":        "poll",
		"poll_id":     pollID,
		"question":    question,
		"body":        question,
		"mode":        mode,
		"options":     stored,
		"votes":       map[string]any{},
		"total_votes": 0,
	}
	return ""
}

// recordPollVote records a tap on a quick-poll option and refreshes the
// counts on the poll message. It reports whether buttonID was a poll vote.
func (a *App) recordPollVote(orgID, contactID uuid.UUID, buttonID, title string) bool {
	if !strings.HasPrefix(buttonID, pollButtonPrefix) {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(buttonID, pollButtonPrefix), ":")
	if len(parts) != 2 || parts[0] == "" {
		return false
	}
	pollID := parts[0]

	var pollMsg models.Message
	if err := a.DB.Where("organization_id = ? AND contact_id = ? AND direction = ? AND interactive_data->>'poll_id' = ?",
		orgID, contactID, models.DirectionOutgoing, pollID).First(&pollMsg).Error; err != nil {
		a.Log.Warn("Poll vote for an unknown poll", "poll_id", pollID, "contact_id", contactID)
		return false
	}

	vote := models.PollVote{
		BaseModel:      models.BaseModel{ID: uuid.New()},
		OrganizationID: orgID,
		MessageID:      pollMsg.ID,
		ContactID:      contactID,
		PollID:         pollID,
		OptionID:       buttonID,
		OptionTitle:    truncateString(title, 100),
	}
	if err := a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "message_id"}, {Name: "contact_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"option_id", "option_title", "updated_at"}),
	}).Create(&vote).Error; err != nil {
		a.Log.Error("Failed to save poll vote", "error", err, "poll_id", pollID)
		return true
	}
	a.refreshPollCounts(&pollMsg)
	return true
}

// refreshPollCounts recounts the votes of a poll message and stores them
// on its interactive data, which the chat renders as bars.
func (a *App) refreshPollCounts(pollMsg *models.Message) {
	type row struct {
		OptionID string
		N        int
	}
	var rows []row
	a.DB.Model(&models.PollVote{}).Select("option_id, count(*) as n").
		Where("message_id = ?", pollMsg.ID).Group("option_id").Scan(&rows)

	votes := map[string]any{}
	total := 0
	for _, r := range rows {
		votes[r.OptionID] = r.N
		total += r.N
	}
	data := models.JSONB{}
	for k, v := range pollMsg.InteractiveData {
		data[k] = v
	}
	data["votes"] = votes
	data["total_votes"] = total
	var last models.PollVote
	if err := a.DB.Where("message_id = ?", pollMsg.ID).Order("updated_at DESC").First(&last).Error; err == nil {
		data["last_vote"] = last.OptionID
	}
	if err := a.DB.Model(&models.Message{}).Where("id = ?", pollMsg.ID).Update("interactive_data", data).Error; err != nil {
		a.Log.Error("Failed to update poll counts", "error", err, "message_id", pollMsg.ID)
	}
	pollMsg.InteractiveData = data
}

// ============================================================================
// Scheduled messages
// ============================================================================

// ScheduledMessageRequest creates or edits a scheduled message.
type ScheduledMessageRequest struct {
	Kind            string            `json:"kind"` // text | template
	Body            string            `json:"body"`
	TemplateID      string            `json:"template_id"`
	TemplateParams  map[string]string `json:"template_params"`
	ScheduledAt     string            `json:"scheduled_at"` // RFC 3339
	WhatsAppAccount string            `json:"whatsapp_account"`
}

// ScheduledMessageResponse is a scheduled message plus a warning when a
// free-form text is due after the 24-hour window closes.
type ScheduledMessageResponse struct {
	models.ScheduledMessage
	WindowWarning string `json:"window_warning,omitempty"`
}

const windowClosedError = "The 24-hour reply window was closed when this message was due, so WhatsApp would reject free-form text. Schedule an approved template instead."

// serviceWindowOpenAt reports whether free-form messages are allowed at t.
func serviceWindowOpenAt(c *models.Contact, t time.Time) bool {
	return c.LastInboundAt != nil && t.Before(c.LastInboundAt.Add(24*time.Hour))
}

func (a *App) scopedContact(r *fastglue.Request, orgID, userID, contactID uuid.UUID) (*models.Contact, bool) {
	var contact models.Contact
	q := a.DB.Where("id = ? AND organization_id = ?", contactID, orgID)
	q = a.scopeAssignedContact(q, userID, orgID)
	if err := q.First(&contact).Error; err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "Contact not found", nil, "")
		return nil, false
	}
	return &contact, true
}

// fillScheduled validates req and copies it onto sm. It returns a
// user-facing error or "".
func (a *App) fillScheduled(orgID uuid.UUID, contact *models.Contact, req ScheduledMessageRequest, sm *models.ScheduledMessage) (string, string) {
	at, err := time.Parse(time.RFC3339, strings.TrimSpace(req.ScheduledAt))
	if err != nil {
		return "", "scheduled_at must be a date and time (RFC 3339)"
	}
	now := time.Now()
	if at.Before(now.Add(-time.Minute)) {
		return "", "Pick a time in the future"
	}
	if at.After(now.AddDate(1, 0, 0)) {
		return "", "Messages can be scheduled up to a year ahead"
	}
	kind := strings.ToLower(strings.TrimSpace(req.Kind))
	if kind == "" {
		kind = "text"
	}
	sm.ScheduledAt = at.UTC()
	sm.Kind = kind
	sm.ErrorMessage = ""
	if req.WhatsAppAccount != "" {
		sm.WhatsAppAccount = req.WhatsAppAccount
	} else if sm.WhatsAppAccount == "" {
		sm.WhatsAppAccount = contact.WhatsAppAccount
	}

	warning := ""
	switch kind {
	case "text":
		body := strings.TrimSpace(req.Body)
		if body == "" {
			return "", "Write the message to schedule"
		}
		if len(body) > whatsapp.MaxTextMessageLength {
			return "", fmt.Sprintf("Messages can be at most %d characters", whatsapp.MaxTextMessageLength)
		}
		sm.Content = body
		sm.TemplateID, sm.TemplateName, sm.TemplateParams = nil, "", nil
		if !serviceWindowOpenAt(contact, at) {
			warning = "The 24-hour reply window will be closed by then unless the customer writes again. If it is closed, this message will fail — use a template to be safe."
		}
	case "template":
		tid, err := uuid.Parse(req.TemplateID)
		if err != nil {
			return "", "Pick a template"
		}
		var tpl models.Template
		if err := a.DB.Where("id = ? AND organization_id = ?", tid, orgID).First(&tpl).Error; err != nil {
			return "", "Template not found"
		}
		if !strings.EqualFold(tpl.Status, "APPROVED") {
			return "", "Only approved templates can be scheduled"
		}
		switch strings.ToUpper(tpl.HeaderType) {
		case "IMAGE", "VIDEO", "DOCUMENT":
			return "", "Templates with a media header can't be scheduled yet — send them now instead"
		}
		params := models.JSONB{}
		for k, v := range req.TemplateParams {
			params[k] = v
		}
		sm.TemplateID = &tpl.ID
		sm.TemplateName = tpl.Name
		sm.TemplateParams = params
		sm.Content = tpl.BodyContent
	default:
		return "", "kind must be text or template"
	}
	return warning, ""
}

// ListScheduledMessages returns a contact's pending and failed scheduled messages.
func (a *App) ListScheduledMessages(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	contactID, err := parsePathUUID(r, "id", "contact")
	if err != nil {
		return nil
	}
	if _, ok := a.scopedContact(r, orgID, userID, contactID); !ok {
		return nil
	}
	var list []models.ScheduledMessage
	if err := a.DB.Where("organization_id = ? AND contact_id = ? AND status IN ?", orgID, contactID,
		[]string{models.ScheduledStatusScheduled, models.ScheduledStatusSending, models.ScheduledStatusFailed}).
		Order("scheduled_at ASC").Limit(100).Find(&list).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load scheduled messages", nil, "")
	}
	return r.SendEnvelope(map[string]any{"scheduled_messages": list})
}

// CreateScheduledMessage schedules a text or template for a contact.
func (a *App) CreateScheduledMessage(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	contactID, err := parsePathUUID(r, "id", "contact")
	if err != nil {
		return nil
	}
	contact, ok := a.scopedContact(r, orgID, userID, contactID)
	if !ok {
		return nil
	}
	var req ScheduledMessageRequest
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &req); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}
	sm := models.ScheduledMessage{
		BaseModel:       models.BaseModel{ID: uuid.New()},
		OrganizationID:  orgID,
		ContactID:       contact.ID,
		Status:          models.ScheduledStatusScheduled,
		CreatedByUserID: &userID,
	}
	warning, errMsg := a.fillScheduled(orgID, contact, req, &sm)
	if errMsg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, errMsg, nil, "")
	}
	if err := a.DB.Create(&sm).Error; err != nil {
		a.Log.Error("Failed to schedule message", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to schedule message", nil, "")
	}
	return r.SendEnvelope(ScheduledMessageResponse{ScheduledMessage: sm, WindowWarning: warning})
}

func (a *App) loadScheduled(r *fastglue.Request) (*models.ScheduledMessage, *models.Contact, bool) {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
		return nil, nil, false
	}
	id, err := parsePathUUID(r, "id", "scheduled message")
	if err != nil {
		return nil, nil, false
	}
	var sm models.ScheduledMessage
	if err := a.DB.Where("id = ? AND organization_id = ?", id, orgID).First(&sm).Error; err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "Scheduled message not found", nil, "")
		return nil, nil, false
	}
	contact, ok := a.scopedContact(r, orgID, userID, sm.ContactID)
	if !ok {
		return nil, nil, false
	}
	return &sm, contact, true
}

// UpdateScheduledMessage edits a scheduled (or failed) message; a failed one
// is scheduled again.
func (a *App) UpdateScheduledMessage(r *fastglue.Request) error {
	sm, contact, ok := a.loadScheduled(r)
	if !ok {
		return nil
	}
	if sm.Status != models.ScheduledStatusScheduled && sm.Status != models.ScheduledStatusFailed {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This message was already sent or cancelled", nil, "")
	}
	var req ScheduledMessageRequest
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &req); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}
	warning, errMsg := a.fillScheduled(sm.OrganizationID, contact, req, sm)
	if errMsg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, errMsg, nil, "")
	}
	prev := sm.Status
	sm.Status = models.ScheduledStatusScheduled
	res := a.DB.Model(&models.ScheduledMessage{}).Where("id = ? AND status = ?", sm.ID, prev).Updates(map[string]any{
		"kind":              sm.Kind,
		"content":           sm.Content,
		"template_id":       sm.TemplateID,
		"template_name":     sm.TemplateName,
		"template_params":   sm.TemplateParams,
		"scheduled_at":      sm.ScheduledAt,
		"whats_app_account": sm.WhatsAppAccount,
		"status":            sm.Status,
		"error_message":     "",
	})
	if res.Error != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update scheduled message", nil, "")
	}
	if res.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This message is being sent right now", nil, "")
	}
	return r.SendEnvelope(ScheduledMessageResponse{ScheduledMessage: *sm, WindowWarning: warning})
}

// CancelScheduledMessage cancels a scheduled message (or dismisses a failed one).
func (a *App) CancelScheduledMessage(r *fastglue.Request) error {
	sm, _, ok := a.loadScheduled(r)
	if !ok {
		return nil
	}
	res := a.DB.Model(&models.ScheduledMessage{}).
		Where("id = ? AND status IN ?", sm.ID, []string{models.ScheduledStatusScheduled, models.ScheduledStatusFailed}).
		Update("status", models.ScheduledStatusCancelled)
	if res.Error != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to cancel", nil, "")
	}
	if res.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This message was already sent", nil, "")
	}
	return r.SendEnvelope(map[string]any{"status": models.ScheduledStatusCancelled})
}

// ProcessDueScheduledMessages sends scheduled messages whose time has come.
// It runs every minute from the background processor.
func (a *App) ProcessDueScheduledMessages(ctx context.Context) {
	var due []models.ScheduledMessage
	if err := a.DB.Where("status = ? AND scheduled_at <= ?", models.ScheduledStatusScheduled, time.Now()).
		Order("scheduled_at ASC").Limit(50).Find(&due).Error; err != nil {
		a.Log.Error("Failed to load scheduled messages", "error", err)
		return
	}
	for i := range due {
		if ctx.Err() != nil {
			return
		}
		// Claim it so a second worker (or tick) can't send it twice.
		res := a.DB.Model(&models.ScheduledMessage{}).
			Where("id = ? AND status = ?", due[i].ID, models.ScheduledStatusScheduled).
			Update("status", models.ScheduledStatusSending)
		if res.Error != nil || res.RowsAffected == 0 {
			continue
		}
		a.sendScheduledMessage(ctx, &due[i])
	}
}

func (a *App) failScheduled(sm *models.ScheduledMessage, reason string) {
	a.DB.Model(&models.ScheduledMessage{}).Where("id = ?", sm.ID).Updates(map[string]any{
		"status":        models.ScheduledStatusFailed,
		"error_message": reason,
	})
	sm.Status = models.ScheduledStatusFailed
	sm.ErrorMessage = reason
}

func (a *App) sendScheduledMessage(ctx context.Context, sm *models.ScheduledMessage) {
	var contact models.Contact
	if err := a.DB.Where("id = ? AND organization_id = ?", sm.ContactID, sm.OrganizationID).First(&contact).Error; err != nil {
		a.failScheduled(sm, "The contact no longer exists")
		return
	}
	account, err := a.resolveWhatsAppAccount(sm.OrganizationID, sm.WhatsAppAccount)
	if err != nil {
		a.failScheduled(sm, "WhatsApp account not found")
		return
	}

	req := OutgoingMessageRequest{Account: account, Contact: &contact}
	switch sm.Kind {
	case "template":
		if sm.TemplateID == nil {
			a.failScheduled(sm, "Template missing")
			return
		}
		var tpl models.Template
		if err := a.DB.Where("id = ? AND organization_id = ?", *sm.TemplateID, sm.OrganizationID).First(&tpl).Error; err != nil {
			a.failScheduled(sm, "The template was deleted")
			return
		}
		if !strings.EqualFold(tpl.Status, "APPROVED") {
			a.failScheduled(sm, fmt.Sprintf("The template is no longer approved (status: %s)", tpl.Status))
			return
		}
		params := map[string]string{}
		for k, v := range sm.TemplateParams {
			params[k] = fmt.Sprint(v)
		}
		req.Type = models.MessageTypeTemplate
		req.Template = &tpl
		req.BodyParams = params
	default:
		if !serviceWindowOpenAt(&contact, time.Now()) {
			a.failScheduled(sm, windowClosedError)
			return
		}
		req.Type = models.MessageTypeText
		req.Content = sm.Content
	}

	opts := MessageSendOptions{BroadcastWebSocket: true, DispatchWebhook: true, SentByUserID: sm.CreatedByUserID}
	msg, err := a.SendOutgoingMessage(ctx, req, opts)
	if err != nil {
		a.failScheduled(sm, "Could not send: "+err.Error())
		return
	}
	var sent models.Message
	if err := a.DB.Where("id = ?", msg.ID).First(&sent).Error; err == nil && sent.Status == models.MessageStatusFailed {
		a.DB.Model(&models.ScheduledMessage{}).Where("id = ?", sm.ID).Updates(map[string]any{
			"status":        models.ScheduledStatusFailed,
			"error_message": firstNonEmpty(sent.ErrorMessage, "WhatsApp rejected the message"),
			"message_id":    msg.ID,
		})
		sm.Status = models.ScheduledStatusFailed
		return
	}
	now := time.Now()
	a.DB.Model(&models.ScheduledMessage{}).Where("id = ?", sm.ID).Updates(map[string]any{
		"status":     models.ScheduledStatusSent,
		"message_id": msg.ID,
		"sent_at":    now,
	})
	sm.Status = models.ScheduledStatusSent
	sm.MessageID = &msg.ID
}
