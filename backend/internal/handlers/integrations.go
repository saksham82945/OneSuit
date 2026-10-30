package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"

	"github.com/shridarpatil/whatomate/internal/contactutil"
	"github.com/shridarpatil/whatomate/internal/models"
)

// Lead integrations. Each connection gets a private lead URL; the lead source
// (IndiaMART Push API, JustDial, a website form, Zapier...) sends every new
// lead to it, and the lead is saved and added to the client's contacts.

// leadFields are the lead details read from what a source sends.
var leadFields = []string{"external_id", "name", "phone", "email", "city", "subject", "message"}

// genericLeadKeys are tried for every integration after its own field map, so
// common shapes work without any setup.
var genericLeadKeys = map[string][]string{
	"external_id": {"lead_id", "leadid", "id", "query_id", "enquiry_id", "inquiry_id", "rfi_id"},
	"name":        {"name", "full_name", "fullname", "customer_name", "sender_name", "contact_name", "first_name"},
	"phone":       {"phone", "mobile", "phone_number", "mobile_number", "mobileno", "contact_number", "whatsapp", "sender_mobile"},
	"email":       {"email", "email_id", "emailid", "sender_email"},
	"city":        {"city", "location", "sender_city"},
	"subject":     {"subject", "product", "product_name", "service", "category", "requirement", "project"},
	"message":     {"message", "comments", "comment", "query", "query_message", "description", "remarks", "details"},
}

type builtinIntegration struct {
	Key, Name, Category, Description, Steps, Docs, Color string
	Map                                                  map[string][]string
}

// builtinIntegrations are added to the catalog once; the super admin can edit
// them, turn them off, and add new ones.
var builtinIntegrations = []builtinIntegration{
	{
		Key: "indiamart", Name: "IndiaMART", Category: "B2B marketplaces", Color: "#2e3192",
		Description: "Get every IndiaMART buy lead and enquiry in your contacts the moment it arrives.",
		Steps:       "Open IndiaMART Seller Panel → Settings → Lead Manager → Push API (CRM integration).\nPaste your lead URL from this page as the Push URL.\nSave. New enquiries now arrive here automatically.",
		Docs:        "https://seller.indiamart.com/",
		Map: map[string][]string{
			"external_id": {"RESPONSE.UNIQUE_QUERY_ID", "UNIQUE_QUERY_ID"},
			"name":        {"RESPONSE.SENDER_NAME", "SENDER_NAME"},
			"phone":       {"RESPONSE.SENDER_MOBILE", "SENDER_MOBILE", "RESPONSE.SENDER_MOBILE_ALT"},
			"email":       {"RESPONSE.SENDER_EMAIL", "SENDER_EMAIL"},
			"city":        {"RESPONSE.SENDER_CITY", "SENDER_CITY"},
			"subject":     {"RESPONSE.QUERY_PRODUCT_NAME", "RESPONSE.SUBJECT", "SUBJECT"},
			"message":     {"RESPONSE.QUERY_MESSAGE", "QUERY_MESSAGE"},
		},
	},
	{
		Key: "justdial", Name: "JustDial", Category: "Local listings", Color: "#ff6f00",
		Description: "Bring JustDial enquiries straight into your contacts.",
		Steps:       "Ask your JustDial account manager to enable lead push (API) for your listing.\nGive them your lead URL from this page.\nEvery new JustDial enquiry is then sent here.",
		Docs:        "https://www.justdial.com/",
		Map: map[string][]string{
			"external_id": {"leadid"}, "name": {"name"}, "phone": {"mobile", "phone"},
			"email": {"email"}, "city": {"city"}, "subject": {"category"}, "message": {"area", "brancharea"},
		},
	},
	{
		Key: "tradeindia", Name: "TradeIndia", Category: "B2B marketplaces", Color: "#d32f2f",
		Description: "Receive TradeIndia buyer enquiries in your contacts.",
		Steps:       "In your TradeIndia seller account, open the CRM / API integration settings.\nAdd your lead URL from this page as the enquiry push URL.",
		Docs:        "https://www.tradeindia.com/",
		Map: map[string][]string{
			"external_id": {"rfi_id"}, "name": {"sender_name"}, "phone": {"sender_mobile", "sender_mobile_no"},
			"email": {"sender_email"}, "city": {"sender_city"}, "subject": {"subject", "product_name"}, "message": {"message"},
		},
	},
	{
		Key: "exportersindia", Name: "ExportersIndia", Category: "B2B marketplaces", Color: "#0d47a1",
		Description: "Get ExportersIndia enquiries without copying them by hand.",
		Steps:       "In ExportersIndia, open My Account → Lead Management → API settings.\nPaste your lead URL from this page.",
		Docs:        "https://www.exportersindia.com/",
		Map: map[string][]string{
			"external_id": {"inquiry_id", "enq_id"}, "name": {"name", "sender_name"}, "phone": {"mobile", "sender_mobile"},
			"email": {"email", "sender_email"}, "city": {"city"}, "subject": {"product", "subject"}, "message": {"detail_req", "message"},
		},
	},
	{
		Key: "sulekha", Name: "Sulekha", Category: "Local listings", Color: "#e91e63",
		Description: "Send Sulekha service leads to your contacts.",
		Steps:       "Ask your Sulekha account manager to push leads to a URL.\nShare your lead URL from this page with them.",
		Docs:        "https://www.sulekha.com/",
		Map:         map[string][]string{"external_id": {"lead_id"}, "name": {"name"}, "phone": {"mobile"}, "email": {"email"}, "city": {"city"}, "subject": {"service_name", "need"}, "message": {"comments"}},
	},
	{
		Key: "99acres", Name: "99acres", Category: "Real estate", Color: "#1565c0",
		Description: "Property enquiries from 99acres, straight into your contacts.",
		Steps:       "In 99acres, open Manage Responses → CRM integration.\nAdd your lead URL from this page.",
		Docs:        "https://www.99acres.com/",
		Map:         map[string][]string{"external_id": {"query_id"}, "name": {"name"}, "phone": {"mobile", "phone"}, "email": {"email"}, "city": {"city"}, "subject": {"project", "property"}, "message": {"message"}},
	},
	{
		Key: "magicbricks", Name: "MagicBricks", Category: "Real estate", Color: "#c62828",
		Description: "Get MagicBricks buyer and tenant enquiries in your contacts.",
		Steps:       "Ask your MagicBricks account manager to enable lead push.\nShare your lead URL from this page with them.",
		Docs:        "https://www.magicbricks.com/",
		Map:         map[string][]string{"name": {"name"}, "phone": {"mobile"}, "email": {"email"}, "city": {"city"}, "subject": {"project", "property"}, "message": {"message"}},
	},
	{
		Key: "housing", Name: "Housing.com", Category: "Real estate", Color: "#6a1b9a",
		Description: "Housing.com leads, saved as contacts automatically.",
		Steps:       "In Housing.com's partner dashboard, open lead integrations.\nAdd your lead URL from this page.",
		Docs:        "https://housing.com/",
		Map:         map[string][]string{"name": {"name"}, "phone": {"phone", "mobile"}, "email": {"email"}, "city": {"city"}, "subject": {"project"}, "message": {"message"}},
	},
	{
		Key: "website_form", Name: "Website form", Category: "Your website", Color: "#2e7d32",
		Description: "Send your website's contact or enquiry form to your contacts.",
		Steps:       "Set your form to send its data (POST) to your lead URL from this page.\nUse fields called name, phone, email, city, subject and message.",
		Map:         map[string][]string{},
	},
	{
		Key: "webhook", Name: "Custom / Zapier / Make", Category: "Automation tools", Color: "#455a64",
		Description: "Connect anything else: Zapier, Make, Pabbly, Google Forms or your own software.",
		Steps:       "In your tool, add a step that sends a webhook (POST, JSON) to your lead URL from this page.\nInclude name, phone, email, city, subject and message.",
		Map:         map[string][]string{},
	},
}

func fieldMapJSONB(m map[string][]string) models.JSONB {
	out := models.JSONB{}
	for k, v := range m {
		list := make([]any, 0, len(v))
		for _, s := range v {
			list = append(list, s)
		}
		out[k] = list
	}
	return out
}

// EnsureIntegrationDefinitions adds missing built-in integrations without
// touching ones the super admin already edited.
func EnsureIntegrationDefinitions(db *gorm.DB) error {
	for i, b := range builtinIntegrations {
		var n int64
		db.Unscoped().Model(&models.IntegrationDefinition{}).Where("key = ?", b.Key).Count(&n)
		if n > 0 {
			continue
		}
		def := models.IntegrationDefinition{
			Key: b.Key, Name: b.Name, Category: b.Category, Description: b.Description, SetupSteps: b.Steps,
			DocsURL: b.Docs, Color: b.Color, FieldMap: fieldMapJSONB(b.Map), IsEnabled: true, IsBuiltin: true, SortOrder: i,
		}
		if err := db.Create(&def).Error; err != nil {
			return err
		}
	}
	return nil
}

// --- Reading leads -------------------------------------------------------------

// lookupPath finds a value by dot path ("RESPONSE.SENDER_NAME"), case-insensitively.
func lookupPath(data map[string]any, path string) string {
	var cur any = data
	for _, part := range strings.Split(path, ".") {
		m, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		var next any
		found := false
		for k, v := range m {
			if strings.EqualFold(k, part) {
				next, found = v, true
				break
			}
		}
		if !found {
			return ""
		}
		cur = next
	}
	switch v := cur.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case nil:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

// lookupAnywhere looks for a key at the top level and one level down.
func lookupAnywhere(data map[string]any, key string) string {
	if v := lookupPath(data, key); v != "" {
		return v
	}
	for _, v := range data {
		if nested, ok := v.(map[string]any); ok {
			if s := lookupPath(nested, key); s != "" {
				return s
			}
		}
	}
	return ""
}

func definitionFieldMap(def *models.IntegrationDefinition) map[string][]string {
	out := map[string][]string{}
	for k, v := range def.FieldMap {
		if list, ok := v.([]any); ok {
			for _, s := range list {
				if str, ok := s.(string); ok && strings.TrimSpace(str) != "" {
					out[k] = append(out[k], strings.TrimSpace(str))
				}
			}
		}
	}
	return out
}

// extractLead reads the lead fields from one payload.
func extractLead(def *models.IntegrationDefinition, data map[string]any) map[string]string {
	fmap := definitionFieldMap(def)
	lead := map[string]string{}
	for _, f := range leadFields {
		for _, path := range fmap[f] {
			if v := lookupPath(data, path); v != "" {
				lead[f] = v
				break
			}
		}
		if lead[f] == "" {
			for _, key := range genericLeadKeys[f] {
				if v := lookupAnywhere(data, key); v != "" {
					lead[f] = v
					break
				}
			}
		}
	}
	return lead
}

var nonDigits = regexp.MustCompile(`\D`)

// normalizeLeadPhone keeps digits; a 10-digit number gets India's 91 code
// (the lead sources here are Indian), and a leading 0 is dropped.
func normalizeLeadPhone(p string) string {
	d := nonDigits.ReplaceAllString(p, "")
	d = strings.TrimLeft(d, "0")
	if len(d) == 10 {
		d = "91" + d
	}
	if len(d) < 8 || len(d) > 15 {
		return ""
	}
	return d
}

func newIntegrationToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// --- Public lead URL ---------------------------------------------------------------

// ReceiveIntegrationLead accepts leads at /api/public/integrations/{token}/lead
// (POST JSON, POST form or GET query). No login: the token is the secret.
func (a *App) ReceiveIntegrationLead(r *fastglue.Request) error {
	token, _ := r.RequestCtx.UserValue("token").(string)
	var conn models.IntegrationConnection
	if len(token) < 20 || a.DB.Where("token = ?", token).First(&conn).Error != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Unknown lead URL", nil, "")
	}
	if !conn.IsActive {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "This integration is paused", nil, "")
	}
	var def models.IntegrationDefinition
	if err := a.DB.Where("key = ?", conn.DefinitionKey).First(&def).Error; err != nil || !def.IsEnabled {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "This integration is turned off", nil, "")
	}

	// Collect the payload(s): query args and form fields, plus a JSON body.
	flat := map[string]any{}
	r.RequestCtx.QueryArgs().VisitAll(func(k, v []byte) { flat[string(k)] = string(v) })
	r.RequestCtx.PostArgs().VisitAll(func(k, v []byte) { flat[string(k)] = string(v) })
	payloads := []map[string]any{}
	body := r.RequestCtx.PostBody()
	if len(body) > 0 && (body[0] == '{' || body[0] == '[') {
		var one map[string]any
		var many []map[string]any
		if json.Unmarshal(body, &one) == nil {
			for k, v := range flat {
				if _, exists := one[k]; !exists {
					one[k] = v
				}
			}
			payloads = append(payloads, one)
		} else if json.Unmarshal(body, &many) == nil {
			payloads = append(payloads, many...)
		} else {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Could not read the JSON body", nil, "")
		}
	} else if len(flat) > 0 {
		payloads = append(payloads, flat)
	}
	if len(payloads) == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "No lead details were sent", nil, "")
	}
	if len(payloads) > 100 {
		payloads = payloads[:100]
	}

	saved, skipped := 0, 0
	for _, p := range payloads {
		ok, err := a.saveIntegrationLead(&conn, &def, p)
		if err != nil {
			a.Log.Error("Failed to save integration lead", "error", err, "integration", def.Key)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save the lead", nil, "")
		}
		if ok {
			saved++
		} else {
			skipped++
		}
	}
	if saved == 0 && skipped > 0 {
		return r.SendEnvelope(map[string]any{"code": 200, "received": 0, "skipped": skipped, "message": "Lead already received or has no phone or email"})
	}
	return r.SendEnvelope(map[string]any{"code": 200, "received": saved, "skipped": skipped})
}

// saveIntegrationLead stores one lead and adds it to contacts. It returns
// false for a repeat or a lead without phone and email.
func (a *App) saveIntegrationLead(conn *models.IntegrationConnection, def *models.IntegrationDefinition, data map[string]any) (bool, error) {
	f := extractLead(def, data)
	phone := normalizeLeadPhone(f["phone"])
	if phone == "" && f["email"] == "" {
		return false, nil
	}
	if f["external_id"] != "" {
		var n int64
		a.DB.Model(&models.IntegrationLead{}).Where("connection_id = ? AND external_id = ?", conn.ID, f["external_id"]).Count(&n)
		if n > 0 {
			return false, nil
		}
	}
	trunc := func(s string, n int) string {
		if len(s) > n {
			return s[:n]
		}
		return s
	}
	lead := models.IntegrationLead{
		OrganizationID: conn.OrganizationID, ConnectionID: conn.ID, DefinitionKey: def.Key,
		ExternalID: trunc(f["external_id"], 150), Name: trunc(f["name"], 255), Phone: phone, Email: trunc(f["email"], 255),
		City: trunc(f["city"], 150), Subject: trunc(f["subject"], 500), Message: f["message"], Raw: models.JSONB(data),
	}

	err := a.DB.Transaction(func(tx *gorm.DB) error {
		if phone != "" {
			contact, _, err := contactutil.GetOrCreateContact(tx, conn.OrganizationID, phone, lead.Name)
			if err != nil {
				return err
			}
			lead.ContactID = &contact.ID
			if err := a.tagLeadContact(tx, contact, conn, def, &lead); err != nil {
				return err
			}
		}
		if err := tx.Create(&lead).Error; err != nil {
			return err
		}
		now := time.Now()
		return tx.Model(&models.IntegrationConnection{}).Where("id = ?", conn.ID).
			Updates(map[string]any{"lead_count": gorm.Expr("lead_count + 1"), "last_lead_at": now}).Error
	})
	return err == nil, err
}

// tagLeadContact adds the connection's tag and the lead details to the contact.
func (a *App) tagLeadContact(tx *gorm.DB, contact *models.Contact, conn *models.IntegrationConnection, def *models.IntegrationDefinition, lead *models.IntegrationLead) error {
	tag := strings.TrimSpace(conn.Tag)
	if tag == "" {
		tag = def.Name
	}
	if len(tag) > 50 {
		tag = tag[:50]
	}
	var existing models.Tag
	if tx.Where("organization_id = ? AND name = ?", conn.OrganizationID, tag).First(&existing).Error != nil {
		if err := tx.Create(&models.Tag{OrganizationID: conn.OrganizationID, Name: tag, Color: "green"}).Error; err != nil {
			return err
		}
	}
	tags := contact.Tags
	has := false
	for _, t := range tags {
		if s, ok := t.(string); ok && s == tag {
			has = true
		}
	}
	if !has {
		tags = append(tags, tag)
	}
	meta := contact.Metadata
	if meta == nil {
		meta = models.JSONB{}
	}
	meta["lead_source"] = def.Name
	for k, v := range map[string]string{"email": lead.Email, "city": lead.City, "lead_subject": lead.Subject} {
		if v != "" {
			meta[k] = v
		}
	}
	return tx.Model(&models.Contact{}).Where("id = ?", contact.ID).Updates(map[string]any{"tags": tags, "metadata": meta}).Error
}

// --- Client: connections and leads -----------------------------------------------

func (a *App) integrationLeadURL(r *fastglue.Request, token string) string {
	base := a.Config.Server.PublicURL
	if base == "" {
		scheme := "https"
		if !r.RequestCtx.IsTLS() && a.Config.App.Environment == "development" {
			scheme = "http"
		}
		base = fmt.Sprintf("%s://%s%s", scheme, string(r.RequestCtx.Host()), sanitizeRedirectPath(a.Config.Server.BasePath))
	}
	return strings.TrimRight(base, "/") + "/api/public/integrations/" + token + "/lead"
}

// ConnectionResponse is a client's connection with its lead URL.
type ConnectionResponse struct {
	models.IntegrationConnection
	LeadURL string `json:"lead_url"`
}

// ListIntegrations returns the integrations clients can use and this client's
// connections (GET /api/integrations).
func (a *App) ListIntegrations(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	defs := []models.IntegrationDefinition{}
	a.DB.Where("is_enabled = ?", true).Order("sort_order ASC, name ASC").Find(&defs)
	var conns []models.IntegrationConnection
	a.DB.Where("organization_id = ?", orgID).Order("created_at ASC").Find(&conns)
	out := make([]ConnectionResponse, 0, len(conns))
	for _, c := range conns {
		out = append(out, ConnectionResponse{IntegrationConnection: c, LeadURL: a.integrationLeadURL(r, c.Token)})
	}
	return r.SendEnvelope(map[string]any{"integrations": defs, "connections": out})
}

// CreateIntegrationConnection connects an integration (POST /api/integrations/connections).
func (a *App) CreateIntegrationConnection(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		DefinitionKey string `json:"definition_key"`
		Name          string `json:"name"`
		Tag           string `json:"tag"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	var def models.IntegrationDefinition
	if err := a.DB.Where("key = ? AND is_enabled = ?", req.DefinitionKey, true).First(&def).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Integration not available", nil, "")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = def.Name
	}
	tag := strings.TrimSpace(req.Tag)
	if tag == "" {
		tag = def.Name
	}
	if len(name) > 100 || len(tag) > 50 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Name must be 100 characters or fewer and tag 50 or fewer", nil, "")
	}
	conn := models.IntegrationConnection{
		OrganizationID: orgID, DefinitionKey: def.Key, Name: name, Tag: tag, Token: newIntegrationToken(),
		IsActive: true, CreatedByID: &userID,
	}
	if err := a.DB.Create(&conn).Error; err != nil {
		a.Log.Error("Failed to create integration connection", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to connect", nil, "")
	}
	return r.SendEnvelope(ConnectionResponse{IntegrationConnection: conn, LeadURL: a.integrationLeadURL(r, conn.Token)})
}

func (a *App) findOrgConnection(r *fastglue.Request, orgID uuid.UUID) (*models.IntegrationConnection, error) {
	id, err := parsePathUUID(r, "id", "connection")
	if err != nil {
		return nil, err
	}
	var conn models.IntegrationConnection
	if err := a.DB.Where("id = ? AND organization_id = ?", id, orgID).First(&conn).Error; err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "Connection not found", nil, "")
		return nil, err
	}
	return &conn, nil
}

// UpdateIntegrationConnection renames, pauses/resumes, retags or gives a new
// lead URL (PUT /api/integrations/connections/{id}).
func (a *App) UpdateIntegrationConnection(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	conn, err := a.findOrgConnection(r, orgID)
	if err != nil {
		return nil
	}
	var req struct {
		Name       *string `json:"name"`
		Tag        *string `json:"tag"`
		IsActive   *bool   `json:"is_active"`
		RotateLink bool    `json:"rotate_link"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if req.Name != nil && strings.TrimSpace(*req.Name) != "" {
		conn.Name = strings.TrimSpace(*req.Name)
	}
	if req.Tag != nil {
		conn.Tag = strings.TrimSpace(*req.Tag)
	}
	if req.IsActive != nil {
		conn.IsActive = *req.IsActive
	}
	if req.RotateLink {
		conn.Token = newIntegrationToken()
	}
	if len(conn.Name) > 100 || len(conn.Tag) > 50 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Name must be 100 characters or fewer and tag 50 or fewer", nil, "")
	}
	if err := a.DB.Save(conn).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save", nil, "")
	}
	return r.SendEnvelope(ConnectionResponse{IntegrationConnection: *conn, LeadURL: a.integrationLeadURL(r, conn.Token)})
}

// DeleteIntegrationConnection disconnects (DELETE /api/integrations/connections/{id}).
// Leads already received and their contacts stay.
func (a *App) DeleteIntegrationConnection(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	conn, err := a.findOrgConnection(r, orgID)
	if err != nil {
		return nil
	}
	if err := a.DB.Delete(conn).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to disconnect", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}

// ListIntegrationLeads returns the latest leads (GET /api/integrations/leads,
// optional ?connection_id=).
func (a *App) ListIntegrationLeads(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	q := a.DB.Where("organization_id = ?", orgID)
	if id, err := uuid.Parse(string(r.RequestCtx.QueryArgs().Peek("connection_id"))); err == nil {
		q = q.Where("connection_id = ?", id)
	}
	leads := []models.IntegrationLead{}
	if err := q.Order("created_at DESC").Limit(500).Find(&leads).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load leads", nil, "")
	}
	for i := range leads {
		leads[i].Raw = nil // not needed in the list
	}
	return r.SendEnvelope(map[string]any{"leads": leads})
}

// --- Super admin: the catalog ---------------------------------------------------

// IntegrationDefinitionResponse is a catalog entry with how much it's used.
type IntegrationDefinitionResponse struct {
	models.IntegrationDefinition
	Connections int64 `json:"connections"`
	Leads       int64 `json:"leads"`
}

// SuperAdminListIntegrations returns the whole catalog with usage.
func (a *App) SuperAdminListIntegrations(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	defs := []models.IntegrationDefinition{}
	a.DB.Order("sort_order ASC, name ASC").Find(&defs)
	type count struct {
		DefinitionKey string
		N             int64
	}
	var conns, leads []count
	a.DB.Model(&models.IntegrationConnection{}).Select("definition_key, COUNT(*) AS n").Group("definition_key").Scan(&conns)
	a.DB.Model(&models.IntegrationLead{}).Select("definition_key, COUNT(*) AS n").Group("definition_key").Scan(&leads)
	cMap, lMap := map[string]int64{}, map[string]int64{}
	for _, c := range conns {
		cMap[c.DefinitionKey] = c.N
	}
	for _, l := range leads {
		lMap[l.DefinitionKey] = l.N
	}
	out := make([]IntegrationDefinitionResponse, 0, len(defs))
	for _, d := range defs {
		out = append(out, IntegrationDefinitionResponse{IntegrationDefinition: d, Connections: cMap[d.Key], Leads: lMap[d.Key]})
	}
	return r.SendEnvelope(map[string]any{"integrations": out, "lead_fields": leadFields})
}

type integrationDefinitionRequest struct {
	Name        *string              `json:"name"`
	Category    *string              `json:"category"`
	Description *string              `json:"description"`
	SetupSteps  *string              `json:"setup_steps"`
	DocsURL     *string              `json:"docs_url"`
	Color       *string              `json:"color"`
	FieldMap    *map[string][]string `json:"field_map"`
	IsEnabled   *bool                `json:"is_enabled"`
	SortOrder   *int                 `json:"sort_order"`
}

func (req *integrationDefinitionRequest) apply(d *models.IntegrationDefinition) string {
	set := func(dst *string, v *string, max int) bool {
		if v == nil {
			return true
		}
		*dst = strings.TrimSpace(*v)
		return len(*dst) <= max
	}
	if !set(&d.Name, req.Name, 100) || !set(&d.Category, req.Category, 60) || !set(&d.Color, req.Color, 20) ||
		!set(&d.Description, req.Description, 2000) || !set(&d.SetupSteps, req.SetupSteps, 4000) || !set(&d.DocsURL, req.DocsURL, 500) {
		return "One of the fields is too long"
	}
	if d.Name == "" {
		return "Name is required"
	}
	if d.Category == "" {
		d.Category = "Other"
	}
	if d.DocsURL != "" && !validWebURL(d.DocsURL) {
		return "Docs link must start with http:// or https://"
	}
	if req.FieldMap != nil {
		clean := map[string][]string{}
		for _, f := range leadFields {
			for _, p := range (*req.FieldMap)[f] {
				if p = strings.TrimSpace(p); p != "" && len(clean[f]) < 10 && len(p) <= 120 {
					clean[f] = append(clean[f], p)
				}
			}
		}
		d.FieldMap = fieldMapJSONB(clean)
	}
	if d.FieldMap == nil {
		d.FieldMap = models.JSONB{}
	}
	if req.IsEnabled != nil {
		d.IsEnabled = *req.IsEnabled
	}
	if req.SortOrder != nil {
		d.SortOrder = *req.SortOrder
	}
	return ""
}

var keyCleaner = regexp.MustCompile(`[^a-z0-9]+`)

// SuperAdminCreateIntegration adds a new integration to the catalog.
func (a *App) SuperAdminCreateIntegration(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	var req integrationDefinitionRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	def := models.IntegrationDefinition{IsEnabled: true, SortOrder: 100}
	if msg := req.apply(&def); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	base := strings.Trim(keyCleaner.ReplaceAllString(strings.ToLower(def.Name), "_"), "_")
	if base == "" {
		base = "integration"
	}
	def.Key = base
	for i := 2; ; i++ {
		var n int64
		a.DB.Unscoped().Model(&models.IntegrationDefinition{}).Where("key = ?", def.Key).Count(&n)
		if n == 0 {
			break
		}
		def.Key = fmt.Sprintf("%s_%d", base, i)
	}
	if err := a.DB.Create(&def).Error; err != nil {
		a.Log.Error("Failed to create integration", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to add the integration", nil, "")
	}
	return r.SendEnvelope(def)
}

func (a *App) findDefinition(r *fastglue.Request) (*models.IntegrationDefinition, bool) {
	key, _ := r.RequestCtx.UserValue("key").(string)
	var def models.IntegrationDefinition
	if err := a.DB.Where("key = ?", key).First(&def).Error; err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "Integration not found", nil, "")
		return nil, false
	}
	return &def, true
}

// SuperAdminUpdateIntegration edits a catalog entry (PUT /api/super-admin/integrations/{key}).
func (a *App) SuperAdminUpdateIntegration(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	def, ok := a.findDefinition(r)
	if !ok {
		return nil
	}
	var req integrationDefinitionRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if msg := req.apply(def); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if err := a.DB.Save(def).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save the integration", nil, "")
	}
	return r.SendEnvelope(def)
}

// SuperAdminDeleteIntegration removes an integration nobody uses. Built-in
// ones can only be turned off.
func (a *App) SuperAdminDeleteIntegration(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	def, ok := a.findDefinition(r)
	if !ok {
		return nil
	}
	if def.IsBuiltin {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Built-in integrations can be turned off but not deleted", nil, "")
	}
	var n int64
	a.DB.Model(&models.IntegrationConnection{}).Where("definition_key = ?", def.Key).Count(&n)
	if n > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, fmt.Sprintf("%d client(s) still use this integration. Turn it off instead.", n), nil, "")
	}
	if err := a.DB.Delete(def).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete the integration", nil, "")
	}
	return r.SendEnvelope(map[string]any{"success": true})
}
