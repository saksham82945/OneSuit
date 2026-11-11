package handlers

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/internal/utils"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// Chat History: read-only, date-ranged views over past conversations.
// Every endpoint scopes to the caller's organization and to the contacts the
// caller may see in Live Chat (scopeAssignedContact), so agents without
// contacts:read only ever see their own chats here too.

const (
	historyMaxSearchLen   = 200
	historyMaxExportRows  = 50000
	historyDefaultRange   = 30 * 24 * time.Hour
	historySnippetContext = 60
)

// HistoryConversation is one contact that had messages in the range.
type HistoryConversation struct {
	ContactID          uuid.UUID  `json:"contact_id"`
	Name               string     `json:"name"`
	PhoneNumber        string     `json:"phone_number"`
	WhatsAppAccount    string     `json:"whatsapp_account,omitempty"`
	Tags               []string   `json:"tags"`
	AssignedUserID     *uuid.UUID `json:"assigned_user_id,omitempty"`
	AssignedUserName   string     `json:"assigned_user_name,omitempty"`
	IncomingCount      int64      `json:"incoming_count"`
	OutgoingCount      int64      `json:"outgoing_count"`
	MessageCount       int64      `json:"message_count"`
	FirstMessageAt     time.Time  `json:"first_message_at"`
	LastMessageAt      time.Time  `json:"last_message_at"`
	LastMessagePreview string     `json:"last_message_preview"`
	LastMessageType    string     `json:"last_message_type"`
	LastDirection      string     `json:"last_direction"`
}

// HistoryStats summarises a range.
type HistoryStats struct {
	Conversations              int64    `json:"conversations"`
	MessagesIn                 int64    `json:"messages_in"`
	MessagesOut                int64    `json:"messages_out"`
	MedianFirstResponseSeconds *float64 `json:"median_first_response_seconds"`
}

// HistorySearchHit is one message matching a full-text search.
type HistorySearchHit struct {
	MessageID   uuid.UUID `json:"message_id"`
	ContactID   uuid.UUID `json:"contact_id"`
	ContactName string    `json:"contact_name"`
	PhoneNumber string    `json:"phone_number"`
	Direction   string    `json:"direction"`
	MessageType string    `json:"message_type"`
	Snippet     string    `json:"snippet"`
	CreatedAt   time.Time `json:"created_at"`
}

// historyRange holds the parsed from/to window: [From, To).
type historyRange struct {
	From time.Time
	To   time.Time
}

// parseHistoryTime accepts RFC3339 timestamps or YYYY-MM-DD dates (UTC).
// endOfDay moves a plain date to the start of the next day so "to" is inclusive.
func parseHistoryTime(s string, endOfDay bool) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, true
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		if endOfDay {
			t = t.AddDate(0, 0, 1)
		}
		return t, true
	}
	return time.Time{}, false
}

// parseHistoryRange reads from/to. Defaults to the last 30 days. ok is false
// (and an error envelope sent) for malformed or inverted ranges.
func parseHistoryRange(r *fastglue.Request) (historyRange, bool) {
	args := r.RequestCtx.QueryArgs()
	now := time.Now()
	rng := historyRange{From: now.Add(-historyDefaultRange), To: now.Add(time.Minute)}
	if s := string(args.Peek("from")); s != "" {
		t, ok := parseHistoryTime(s, false)
		if !ok {
			_ = r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid from date", nil, "")
			return rng, false
		}
		rng.From = t
	}
	if s := string(args.Peek("to")); s != "" {
		t, ok := parseHistoryTime(s, true)
		if !ok {
			_ = r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid to date", nil, "")
			return rng, false
		}
		rng.To = t
	}
	if !rng.To.After(rng.From) {
		_ = r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The end of the range must be after the start", nil, "")
		return rng, false
	}
	return rng, true
}

func historyQueryString(r *fastglue.Request, key string, maxLen int) string {
	s := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek(key)))
	if len(s) > maxLen {
		s = s[:maxLen]
	}
	return s
}

// historyEscapeLike escapes LIKE wildcards so user input matches literally.
func historyEscapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// historyContactScope returns a subquery selecting the IDs of contacts the
// caller may see, narrowed by the tags/assigned/search filters. ok is false
// (and an error envelope sent) for an invalid assigned filter.
func (a *App) historyContactScope(r *fastglue.Request, orgID, userID uuid.UUID, rng historyRange) (*gorm.DB, bool) {
	q := a.DB.Model(&models.Contact{}).Select("id").Where("organization_id = ?", orgID)
	q = a.scopeAssignedContact(q, userID, orgID)

	if tagsParam := historyQueryString(r, "tags", 1000); tagsParam != "" {
		conds := []string{}
		args := []any{}
		for _, tag := range strings.Split(tagsParam, ",") {
			if tag = strings.TrimSpace(tag); tag != "" {
				b, _ := json.Marshal([]string{tag})
				conds = append(conds, "tags @> ?::jsonb")
				args = append(args, string(b))
			}
		}
		if len(conds) > 0 {
			q = q.Where("("+strings.Join(conds, " OR ")+")", args...)
		}
	}

	if assigned := historyQueryString(r, "assigned", 100); assigned != "" {
		filtered, ok := applyAssignedFilter(q, assigned, userID)
		if !ok {
			_ = r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid assigned filter", nil, "")
			return nil, false
		}
		q = filtered
	}

	// search matches the contact's name/phone or any message text in range.
	if search := historyQueryString(r, "search", historyMaxSearchLen); search != "" {
		pattern := "%" + historyEscapeLike(search) + "%"
		q = q.Where("(profile_name ILIKE ? OR phone_number LIKE ? OR id IN (?))", pattern, pattern,
			a.DB.Model(&models.Message{}).Select("contact_id").
				Where("organization_id = ? AND created_at >= ? AND created_at < ? AND content ILIKE ?",
					orgID, rng.From, rng.To, pattern))
	}
	return q, true
}

// historyMessageBase returns a query over messages in range for the scoped
// contacts, with the account/direction filters applied.
func (a *App) historyMessageBase(r *fastglue.Request, orgID uuid.UUID, rng historyRange, contacts *gorm.DB) *gorm.DB {
	q := a.DB.Model(&models.Message{}).
		Where("messages.organization_id = ? AND messages.created_at >= ? AND messages.created_at < ?", orgID, rng.From, rng.To).
		Where("messages.contact_id IN (?)", contacts)
	if account := historyQueryString(r, "account", 100); account != "" {
		q = q.Where("messages.whats_app_account = ?", account)
	}
	switch historyQueryString(r, "direction", 20) {
	case "incoming":
		q = q.Where("messages.direction = ?", models.DirectionIncoming)
	case "outgoing":
		q = q.Where("messages.direction = ?", models.DirectionOutgoing)
	}
	return q
}

func contactTags(c *models.Contact) []string {
	tags := []string{}
	for _, t := range c.Tags {
		if s, ok := t.(string); ok {
			tags = append(tags, s)
		}
	}
	return tags
}

func historyPreview(msgType, content, filename string) string {
	content = strings.TrimSpace(content)
	if content != "" {
		if len([]rune(content)) > 140 {
			return string([]rune(content)[:140]) + "…"
		}
		return content
	}
	if filename != "" {
		return filename
	}
	if msgType != "" && msgType != string(models.MessageTypeText) {
		return "[" + msgType + "]"
	}
	return ""
}

// ListHistoryConversations returns the contacts that had messages in the range.
// GET /api/history/conversations
func (a *App) ListHistoryConversations(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceChat, models.ActionRead)
	if err != nil {
		return nil
	}
	rng, ok := parseHistoryRange(r)
	if !ok {
		return nil
	}
	contacts, ok := a.historyContactScope(r, orgID, userID, rng)
	if !ok {
		return nil
	}
	pg := parsePagination(r)
	base := a.historyMessageBase(r, orgID, rng, contacts)

	var total int64
	if err := base.Session(&gorm.Session{}).Distinct("messages.contact_id").Count(&total).Error; err != nil {
		a.Log.Error("Failed to count history conversations", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load history", nil, "")
	}

	var rows []struct {
		ContactID uuid.UUID
		Incoming  int64
		Outgoing  int64
		FirstAt   time.Time
		LastAt    time.Time
	}
	if err := base.Session(&gorm.Session{}).
		Select("messages.contact_id AS contact_id, " +
			"COUNT(*) FILTER (WHERE messages.direction = 'incoming') AS incoming, " +
			"COUNT(*) FILTER (WHERE messages.direction = 'outgoing') AS outgoing, " +
			"MIN(messages.created_at) AS first_at, MAX(messages.created_at) AS last_at").
		Group("messages.contact_id").
		Order("last_at DESC, messages.contact_id").
		Offset(pg.Offset).Limit(pg.Limit).
		Scan(&rows).Error; err != nil {
		a.Log.Error("Failed to list history conversations", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load history", nil, "")
	}

	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ContactID
	}

	contactByID := map[uuid.UUID]models.Contact{}
	lastByID := map[uuid.UUID]models.Message{}
	userNames := map[uuid.UUID]string{}
	if len(ids) > 0 {
		var cs []models.Contact
		a.DB.Where("id IN ? AND organization_id = ?", ids, orgID).Find(&cs)
		userIDs := []uuid.UUID{}
		for _, c := range cs {
			contactByID[c.ID] = c
			if c.AssignedUserID != nil {
				userIDs = append(userIDs, *c.AssignedUserID)
			}
		}
		var lasts []models.Message
		base.Session(&gorm.Session{}).
			Select("DISTINCT ON (messages.contact_id) messages.*").
			Where("messages.contact_id IN ?", ids).
			Order("messages.contact_id, messages.created_at DESC").
			Find(&lasts)
		for _, m := range lasts {
			lastByID[m.ContactID] = m
		}
		if len(userIDs) > 0 {
			var users []models.User
			a.DB.Select("id, full_name, email").Where("id IN ?", userIDs).Find(&users)
			for _, u := range users {
				name := u.FullName
				if name == "" {
					name = u.Email
				}
				userNames[u.ID] = name
			}
		}
	}

	mask := a.ShouldMaskPhoneNumbers(orgID)
	out := make([]HistoryConversation, 0, len(rows))
	for _, row := range rows {
		c := contactByID[row.ContactID]
		name, phone := c.ProfileName, c.PhoneNumber
		if mask {
			name, phone = utils.MaskIfPhoneNumber(name), utils.MaskPhoneNumber(phone)
		}
		last := lastByID[row.ContactID]
		conv := HistoryConversation{
			ContactID:          row.ContactID,
			Name:               name,
			PhoneNumber:        phone,
			WhatsAppAccount:    c.WhatsAppAccount,
			Tags:               contactTags(&c),
			AssignedUserID:     c.AssignedUserID,
			IncomingCount:      row.Incoming,
			OutgoingCount:      row.Outgoing,
			MessageCount:       row.Incoming + row.Outgoing,
			FirstMessageAt:     row.FirstAt,
			LastMessageAt:      row.LastAt,
			LastMessagePreview: historyPreview(string(last.MessageType), last.Content, last.MediaFilename),
			LastMessageType:    string(last.MessageType),
			LastDirection:      string(last.Direction),
		}
		if c.AssignedUserID != nil {
			conv.AssignedUserName = userNames[*c.AssignedUserID]
		}
		out = append(out, conv)
	}

	return r.SendEnvelope(map[string]any{
		"conversations": out,
		"total":         total,
		"page":          pg.Page,
		"limit":         pg.Limit,
		"from":          rng.From,
		"to":            rng.To,
	})
}

// GetHistoryStats summarises the range under the same filters as the
// conversation list. GET /api/history/stats
func (a *App) GetHistoryStats(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceChat, models.ActionRead)
	if err != nil {
		return nil
	}
	rng, ok := parseHistoryRange(r)
	if !ok {
		return nil
	}
	contacts, ok := a.historyContactScope(r, orgID, userID, rng)
	if !ok {
		return nil
	}
	base := a.historyMessageBase(r, orgID, rng, contacts)

	var agg struct {
		Conversations int64
		MessagesIn    int64
		MessagesOut   int64
	}
	if err := base.Session(&gorm.Session{}).
		Select("COUNT(DISTINCT messages.contact_id) AS conversations, " +
			"COUNT(*) FILTER (WHERE messages.direction = 'incoming') AS messages_in, " +
			"COUNT(*) FILTER (WHERE messages.direction = 'outgoing') AS messages_out").
		Scan(&agg).Error; err != nil {
		a.Log.Error("Failed to compute history stats", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load history", nil, "")
	}
	stats := HistoryStats{Conversations: agg.Conversations, MessagesIn: agg.MessagesIn, MessagesOut: agg.MessagesOut}

	// Median time from each contact's first incoming message in range to the
	// first reply after it (independent of the direction filter).
	firsts := a.DB.Model(&models.Message{}).
		Select("messages.contact_id, MIN(messages.created_at) AS first_in").
		Where("messages.organization_id = ? AND messages.created_at >= ? AND messages.created_at < ?", orgID, rng.From, rng.To).
		Where("messages.contact_id IN (?)", contacts).
		Where("messages.direction = ?", models.DirectionIncoming).
		Group("messages.contact_id")
	if account := historyQueryString(r, "account", 100); account != "" {
		firsts = firsts.Where("messages.whats_app_account = ?", account)
	}
	var median struct{ Median *float64 }
	if err := a.DB.Raw(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (r.first_out - f.first_in))) AS median
		FROM (?) f
		CROSS JOIN LATERAL (
			SELECT MIN(o.created_at) AS first_out FROM messages o
			WHERE o.contact_id = f.contact_id AND o.direction = 'outgoing'
			  AND o.created_at > f.first_in AND o.created_at < ? AND o.deleted_at IS NULL
		) r
		WHERE r.first_out IS NOT NULL`, firsts, rng.To).Scan(&median).Error; err != nil {
		a.Log.Warn("Failed to compute median first response", "error", err)
	} else {
		stats.MedianFirstResponseSeconds = median.Median
	}

	return r.SendEnvelope(stats)
}

// historyContactForCaller loads a contact the caller may see.
func (a *App) historyContactForCaller(orgID, userID, contactID uuid.UUID) (*models.Contact, bool) {
	var contact models.Contact
	q := a.DB.Where("id = ? AND organization_id = ?", contactID, orgID)
	q = a.scopeAssignedContact(q, userID, orgID)
	if err := q.First(&contact).Error; err != nil {
		return nil, false
	}
	return &contact, true
}

// historyContactMessages returns the query for one contact's messages in range,
// honouring the "current conversation only" agent setting like GetMessages.
func (a *App) historyContactMessages(orgID, userID, contactID uuid.UUID, rng historyRange) *gorm.DB {
	q := a.DB.Model(&models.Message{}).
		Where("organization_id = ? AND contact_id = ? AND created_at >= ? AND created_at < ?", orgID, contactID, rng.From, rng.To)
	if !a.HasPermission(userID, models.ResourceContacts, models.ActionRead, orgID) {
		if settings, err := a.getChatbotSettingsCached(orgID, ""); err == nil && settings.AgentAssignment.CurrentConversationOnly {
			var session models.ChatbotSession
			if err := a.DB.Where("contact_id = ? AND organization_id = ?", contactID, orgID).
				Order("started_at DESC").First(&session).Error; err == nil {
				q = q.Where("created_at >= ?", session.StartedAt)
			}
		}
	}
	return q
}

// ListHistoryMessages returns one contact's messages in the range, oldest
// first. With around=<message id> the page holding that message is returned.
// GET /api/history/messages
func (a *App) ListHistoryMessages(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceChat, models.ActionRead)
	if err != nil {
		return nil
	}
	contactID, err := uuid.Parse(historyQueryString(r, "contact_id", 64))
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid contact_id", nil, "")
	}
	rng, ok := parseHistoryRange(r)
	if !ok {
		return nil
	}
	contact, ok := a.historyContactForCaller(orgID, userID, contactID)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Contact not found", nil, "")
	}

	q := a.historyContactMessages(orgID, userID, contactID, rng)
	if search := historyQueryString(r, "search", historyMaxSearchLen); search != "" {
		q = q.Where("content ILIKE ?", "%"+historyEscapeLike(search)+"%")
	}
	if t := historyQueryString(r, "type", 30); t != "" {
		if t == "media" {
			q = q.Where("message_type IN ?", []string{"image", "video", "audio", "document", "sticker"})
		} else {
			q = q.Where("message_type = ?", t)
		}
	}
	switch historyQueryString(r, "direction", 20) {
	case "incoming":
		q = q.Where("direction = ?", models.DirectionIncoming)
	case "outgoing":
		q = q.Where("direction = ?", models.DirectionOutgoing)
	}

	pg := parsePaginationWithDefaults(r, 100, 200)
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		a.Log.Error("Failed to count history messages", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load messages", nil, "")
	}

	if aroundStr := historyQueryString(r, "around", 64); aroundStr != "" {
		if aroundID, err := uuid.Parse(aroundStr); err == nil {
			var target models.Message
			if err := q.Session(&gorm.Session{}).Where("id = ?", aroundID).First(&target).Error; err == nil {
				var before int64
				q.Session(&gorm.Session{}).
					Where("(created_at < ? OR (created_at = ? AND id < ?))", target.CreatedAt, target.CreatedAt, target.ID).
					Count(&before)
				pg.Page = int(before)/pg.Limit + 1
				pg.Offset = (pg.Page - 1) * pg.Limit
			}
		}
	}

	var messages []models.Message
	if err := q.Session(&gorm.Session{}).Preload("ReplyToMessage").
		Order("created_at ASC, id ASC").Offset(pg.Offset).Limit(pg.Limit).
		Find(&messages).Error; err != nil {
		a.Log.Error("Failed to list history messages", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load messages", nil, "")
	}

	senders := a.historySenderNames(messages)
	resp := a.buildMessagesResponse(messages)
	type historyMessage struct {
		MessageResponse
		SenderName string `json:"sender_name,omitempty"`
	}
	out := make([]historyMessage, len(resp))
	for i := range resp {
		out[i] = historyMessage{MessageResponse: resp[i]}
		if messages[i].SentByUserID != nil {
			out[i].SenderName = senders[*messages[i].SentByUserID]
		}
	}

	name, phone := contact.ProfileName, contact.PhoneNumber
	if a.ShouldMaskPhoneNumbers(orgID) {
		name, phone = utils.MaskIfPhoneNumber(name), utils.MaskPhoneNumber(phone)
	}
	return r.SendEnvelope(map[string]any{
		"contact": map[string]any{
			"id":               contact.ID,
			"name":             name,
			"phone_number":     phone,
			"whatsapp_account": contact.WhatsAppAccount,
			"tags":             contactTags(contact),
		},
		"messages": out,
		"total":    total,
		"page":     pg.Page,
		"limit":    pg.Limit,
		"has_more": int64(pg.Offset+len(messages)) < total,
	})
}

func (a *App) historySenderNames(messages []models.Message) map[uuid.UUID]string {
	names := map[uuid.UUID]string{}
	ids := []uuid.UUID{}
	seen := map[uuid.UUID]bool{}
	for _, m := range messages {
		if m.SentByUserID != nil && !seen[*m.SentByUserID] {
			seen[*m.SentByUserID] = true
			ids = append(ids, *m.SentByUserID)
		}
	}
	if len(ids) == 0 {
		return names
	}
	var users []models.User
	a.DB.Select("id, full_name, email").Where("id IN ?", ids).Find(&users)
	for _, u := range users {
		if u.FullName != "" {
			names[u.ID] = u.FullName
		} else {
			names[u.ID] = u.Email
		}
	}
	return names
}

// historySnippet cuts text down to the area around the first match.
func historySnippet(content, q string) string {
	runes := []rune(content)
	idx := strings.Index(strings.ToLower(content), strings.ToLower(q))
	if idx < 0 {
		if len(runes) > 2*historySnippetContext {
			return string(runes[:2*historySnippetContext]) + "…"
		}
		return content
	}
	start := len([]rune(content[:idx]))
	end := start + len([]rune(q))
	from := max(0, start-historySnippetContext)
	to := min(len(runes), end+historySnippetContext)
	s := string(runes[from:to])
	if from > 0 {
		s = "…" + s
	}
	if to < len(runes) {
		s += "…"
	}
	return s
}

// SearchHistory runs a text search over every message the caller may see in
// the range, newest first. GET /api/history/search
func (a *App) SearchHistory(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceChat, models.ActionRead)
	if err != nil {
		return nil
	}
	q := historyQueryString(r, "q", historyMaxSearchLen)
	if len([]rune(q)) < 2 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Search needs at least 2 characters", nil, "")
	}
	rng, ok := parseHistoryRange(r)
	if !ok {
		return nil
	}
	contacts := a.scopeAssignedContact(
		a.DB.Model(&models.Contact{}).Select("id").Where("organization_id = ?", orgID), userID, orgID)
	base := a.historyMessageBase(r, orgID, rng, contacts).
		Where("messages.content ILIKE ?", "%"+historyEscapeLike(q)+"%")
	if cid := historyQueryString(r, "contact_id", 64); cid != "" {
		if id, err := uuid.Parse(cid); err == nil {
			base = base.Where("messages.contact_id = ?", id)
		}
	}

	pg := parsePaginationWithDefaults(r, 30, 100)
	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		a.Log.Error("Failed to count history search", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Search failed", nil, "")
	}
	var messages []models.Message
	if err := base.Session(&gorm.Session{}).Preload("Contact").
		Order("messages.created_at DESC, messages.id DESC").
		Offset(pg.Offset).Limit(pg.Limit).Find(&messages).Error; err != nil {
		a.Log.Error("Failed to search history", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Search failed", nil, "")
	}

	mask := a.ShouldMaskPhoneNumbers(orgID)
	hits := make([]HistorySearchHit, 0, len(messages))
	for _, m := range messages {
		hit := HistorySearchHit{
			MessageID:   m.ID,
			ContactID:   m.ContactID,
			Direction:   string(m.Direction),
			MessageType: string(m.MessageType),
			Snippet:     historySnippet(m.Content, q),
			CreatedAt:   m.CreatedAt,
		}
		if m.Contact != nil {
			hit.ContactName, hit.PhoneNumber = m.Contact.ProfileName, m.Contact.PhoneNumber
			if mask {
				hit.ContactName = utils.MaskIfPhoneNumber(hit.ContactName)
				hit.PhoneNumber = utils.MaskPhoneNumber(hit.PhoneNumber)
			}
		}
		hits = append(hits, hit)
	}
	return r.SendEnvelope(map[string]any{
		"results": hits,
		"total":   total,
		"page":    pg.Page,
		"limit":   pg.Limit,
	})
}

// csvSafe stops spreadsheet apps from treating a cell as a formula.
func csvSafe(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

// ExportHistoryTranscript downloads one contact's transcript for the range.
// GET /api/history/export?format=csv|txt
func (a *App) ExportHistoryTranscript(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceChat, models.ActionRead)
	if err != nil {
		return nil
	}
	contactID, err := uuid.Parse(historyQueryString(r, "contact_id", 64))
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid contact_id", nil, "")
	}
	format := historyQueryString(r, "format", 10)
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "txt" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "format must be csv or txt", nil, "")
	}
	rng, ok := parseHistoryRange(r)
	if !ok {
		return nil
	}
	contact, ok := a.historyContactForCaller(orgID, userID, contactID)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Contact not found", nil, "")
	}

	var messages []models.Message
	if err := a.historyContactMessages(orgID, userID, contactID, rng).
		Order("created_at ASC, id ASC").Limit(historyMaxExportRows).Find(&messages).Error; err != nil {
		a.Log.Error("Failed to export history", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Export failed", nil, "")
	}
	senders := a.historySenderNames(messages)

	name, phone := contact.ProfileName, contact.PhoneNumber
	if a.ShouldMaskPhoneNumbers(orgID) {
		name, phone = utils.MaskIfPhoneNumber(name), utils.MaskPhoneNumber(phone)
	}
	customer := name
	if customer == "" {
		customer = phone
	}
	senderOf := func(m *models.Message) string {
		if m.Direction == models.DirectionIncoming {
			return customer
		}
		if m.SentByUserID != nil {
			if n := senders[*m.SentByUserID]; n != "" {
				return n
			}
		}
		return "Business"
	}
	text := func(m *models.Message) string {
		if strings.TrimSpace(m.Content) != "" {
			return m.Content
		}
		if m.MessageType != models.MessageTypeText {
			return "[" + string(m.MessageType) + "]"
		}
		return ""
	}

	var buf bytes.Buffer
	if format == "csv" {
		buf.WriteString("\xEF\xBB\xBF") // BOM so Excel reads UTF-8
		w := csv.NewWriter(&buf)
		_ = w.Write([]string{"time", "direction", "sender", "type", "text", "media_filename", "status"})
		for i := range messages {
			m := &messages[i]
			_ = w.Write([]string{
				m.CreatedAt.UTC().Format(time.RFC3339),
				string(m.Direction),
				csvSafe(senderOf(m)),
				string(m.MessageType),
				csvSafe(text(m)),
				csvSafe(m.MediaFilename),
				string(m.Status),
			})
		}
		w.Flush()
		r.RequestCtx.Response.Header.Set("Content-Type", "text/csv; charset=utf-8")
	} else {
		fmt.Fprintf(&buf, "Chat transcript: %s (%s)\n", customer, phone)
		fmt.Fprintf(&buf, "Range: %s to %s (UTC)\n", rng.From.UTC().Format("2006-01-02 15:04"), rng.To.UTC().Format("2006-01-02 15:04"))
		fmt.Fprintf(&buf, "Messages: %d\n", len(messages))
		lastDay := ""
		for i := range messages {
			m := &messages[i]
			day := m.CreatedAt.UTC().Format("Monday, 2 January 2006")
			if day != lastDay {
				fmt.Fprintf(&buf, "\n--- %s ---\n", day)
				lastDay = day
			}
			line := text(m)
			if m.MediaFilename != "" {
				line += " [file: " + m.MediaFilename + "]"
			}
			fmt.Fprintf(&buf, "[%s] %s: %s\n", m.CreatedAt.UTC().Format("15:04"), senderOf(m), line)
		}
		r.RequestCtx.Response.Header.Set("Content-Type", "text/plain; charset=utf-8")
	}

	filename := sanitizeFilename(fmt.Sprintf("chat_%s_%s_%s.%s",
		strings.ReplaceAll(customer, " ", "_"), rng.From.UTC().Format("20060102"), rng.To.UTC().Format("20060102"), format))
	r.RequestCtx.Response.Header.Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	r.RequestCtx.Response.Header.Set("X-Message-Count", strconv.Itoa(len(messages)))
	r.RequestCtx.SetStatusCode(fasthttp.StatusOK)
	r.RequestCtx.SetBody(buf.Bytes())
	return nil
}
