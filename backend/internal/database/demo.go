package database

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"gorm.io/gorm"
)

// The demo workspace is a shared organization full of sample data that
// "explorer" accounts can look around (read-only) before they subscribe.

const (
	// DemoWorkspaceSettingKey is the platform_settings row that records the demo org.
	DemoWorkspaceSettingKey = "demo_workspace"
	// ExplorerRoleName is the read-only role explorers get in the demo workspace.
	ExplorerRoleName = "explorer"
	demoAccountName  = "Demo Business"
)

// explorerPermissions are the read-only areas an explorer can see. Account
// credentials, users, roles, API keys, webhooks, SSO and audit logs stay hidden.
var explorerPermissions = []string{
	models.ResourceAnalytics, models.ResourceAnalyticsAgents, models.ResourceChat, models.ResourceContacts,
	models.ResourceTemplates, models.ResourceFlowsWhatsApp, models.ResourceFlowsChatbot, models.ResourceCampaigns,
	models.ResourceChatbotKeywords, models.ResourceChatbotAI, models.ResourceSettingsChatbot, models.ResourceTags,
	models.ResourceCannedResponses, models.ResourceTransfers, models.ResourceCallLogs, models.ResourceIVRFlows,
	models.ResourceCallTransfers, models.ResourceTeams,
}

// DemoWorkspaceID returns the demo organization's ID, or uuid.Nil if there is none.
func DemoWorkspaceID(db *gorm.DB) uuid.UUID {
	var row models.PlatformSetting
	if err := db.Where("key = ?", DemoWorkspaceSettingKey).First(&row).Error; err != nil {
		return uuid.Nil
	}
	id, _ := uuid.Parse(fmt.Sprint(row.Value["organization_id"]))
	return id
}

// EnsureDemoWorkspace creates the demo workspace with sample data the first
// time it runs, and makes sure the explorer role exists. It is idempotent.
func EnsureDemoWorkspace(db *gorm.DB) (uuid.UUID, error) {
	if id := DemoWorkspaceID(db); id != uuid.Nil {
		var count int64
		db.Model(&models.Organization{}).Where("id = ?", id).Count(&count)
		if count > 0 {
			return id, ensureExplorerRole(db, id)
		}
	}

	var orgID uuid.UUID
	err := db.Transaction(func(tx *gorm.DB) error {
		org := models.Organization{
			Name:     "Demo Workspace",
			Slug:     "demo-workspace-" + uuid.NewString()[:8],
			Settings: models.JSONB{"is_demo": true, "timezone": "UTC"},
		}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		orgID = org.ID
		if err := SeedSystemRolesForOrg(tx, org.ID); err != nil {
			return err
		}
		if err := ensureExplorerRole(tx, org.ID); err != nil {
			return err
		}
		if err := tx.Create(&models.ChatbotSettings{OrganizationID: org.ID, IsEnabled: true, SessionTimeoutMins: 30}).Error; err != nil {
			return err
		}

		// Widgets and campaigns need an owner; use the earliest super admin if any.
		var owner models.User
		hasOwner := tx.Where("is_super_admin = ?", true).Order("created_at ASC").First(&owner).Error == nil
		if hasOwner {
			if err := SeedDefaultWidgetsForOrg(tx, org.ID, owner.ID); err != nil {
				return err
			}
		}
		if err := seedDemoData(tx, org.ID, owner.ID); err != nil {
			return err
		}

		value := models.JSONB{"organization_id": org.ID.String()}
		return tx.Save(&models.PlatformSetting{Key: DemoWorkspaceSettingKey, Value: value}).Error
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to create demo workspace: %w", err)
	}
	return orgID, nil
}

// ensureExplorerRole creates the read-only explorer role in orgID if missing.
func ensureExplorerRole(db *gorm.DB, orgID uuid.UUID) error {
	var role models.CustomRole
	err := db.Where("organization_id = ? AND name = ?", orgID, ExplorerRoleName).First(&role).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	var perms []models.Permission
	if err := db.Where("action = ? AND resource IN ?", models.ActionRead, explorerPermissions).Find(&perms).Error; err != nil {
		return err
	}
	role = models.CustomRole{
		OrganizationID: orgID,
		Name:           ExplorerRoleName,
		Description:    "Read-only access to the demo workspace for people exploring before they subscribe",
		Permissions:    perms,
	}
	return db.Create(&role).Error
}

func seedDemoData(tx *gorm.DB, orgID, ownerID uuid.UUID) error {
	now := time.Now()
	ago := func(d time.Duration) time.Time { return now.Add(-d) }

	account := models.WhatsAppAccount{
		OrganizationID: orgID, Name: demoAccountName, PhoneID: "100000000000001", BusinessID: "200000000000001",
		AccessToken: "demo-not-connected", Status: "active", IsDefaultIncoming: true, IsDefaultOutgoing: true,
	}
	if err := tx.Create(&account).Error; err != nil {
		return err
	}

	for _, t := range []models.Tag{
		{OrganizationID: orgID, Name: "VIP", Color: "purple"},
		{OrganizationID: orgID, Name: "Lead", Color: "blue"},
		{OrganizationID: orgID, Name: "Support", Color: "green"},
		{OrganizationID: orgID, Name: "Returning", Color: "yellow"},
	} {
		if err := tx.Create(&t).Error; err != nil {
			return err
		}
	}

	type demoMsg struct {
		in   bool
		text string
		age  time.Duration
	}
	contacts := []struct {
		name, phone string
		tags        []any
		unread      bool
		msgs        []demoMsg
	}{
		{"Priya Sharma", "919820011223", []any{"VIP", "Returning"}, true, []demoMsg{
			{true, "Hi! Is the blue kurta available in size M?", 50 * time.Minute},
			{false, "Hi Priya, yes it is. Shall I reserve one for you?", 45 * time.Minute},
			{true, "Yes please, and can you deliver by Friday?", 12 * time.Minute},
		}},
		{"Marco Rossi", "393331234567", []any{"Lead"}, false, []demoMsg{
			{true, "Do you ship to Italy?", 5 * time.Hour},
			{false, "We do! Delivery takes 5-7 working days.", 4 * time.Hour},
			{true, "Great, thanks", 4 * time.Hour},
		}},
		{"Aisha Khan", "971501234567", []any{"Support"}, true, []demoMsg{
			{true, "My order #10482 hasn't arrived yet", 26 * time.Hour},
			{false, "Sorry about that, Aisha. Let me check with the courier.", 25 * time.Hour},
			{true, "Any update?", 2 * time.Hour},
		}},
		{"Laura Chen", "14155550177", []any{"VIP"}, false, []demoMsg{
			{false, "Your order #10477 has been delivered. Enjoy!", 3 * 24 * time.Hour},
			{true, "Received, thank you so much!", 3 * 24 * time.Hour},
		}},
		{"Carlos Mendez", "5215555044110", []any{"Lead"}, false, []demoMsg{
			{true, "What are your store hours?", 6 * 24 * time.Hour},
			{false, "We're open 10am-8pm, Monday to Saturday.", 6 * 24 * time.Hour},
		}},
		{"Rahul Verma", "918055501290", []any{}, false, []demoMsg{
			{true, "price", 9 * 24 * time.Hour},
			{false, "Here's our latest price list: whatomate.example/prices", 9 * 24 * time.Hour},
		}},
	}
	for _, c := range contacts {
		last := c.msgs[len(c.msgs)-1]
		lastAt := ago(last.age)
		contact := models.Contact{
			OrganizationID: orgID, PhoneNumber: c.phone, ProfileName: c.name, WhatsAppAccount: demoAccountName,
			LastMessageAt: &lastAt, LastMessagePreview: last.text, IsRead: !c.unread, Tags: models.JSONBArray(c.tags),
			Metadata: models.JSONB{"source": "demo"},
		}
		if err := tx.Create(&contact).Error; err != nil {
			return err
		}
		for _, m := range c.msgs {
			dir, status := models.DirectionOutgoing, models.MessageStatus("read")
			if m.in {
				dir, status = models.DirectionIncoming, models.MessageStatus("read")
				if c.unread && m == last {
					status = models.MessageStatus("delivered")
				}
			}
			msg := models.Message{
				BaseModel:      models.BaseModel{CreatedAt: ago(m.age), UpdatedAt: ago(m.age)},
				OrganizationID: orgID, WhatsAppAccount: demoAccountName, ContactID: contact.ID,
				Direction: dir, MessageType: models.MessageTypeText, Content: m.text, Status: status,
				Metadata: models.JSONB{},
			}
			if err := tx.Create(&msg).Error; err != nil {
				return err
			}
		}
	}

	buttons := func(titles ...string) models.JSONBArray {
		out := models.JSONBArray{}
		for _, t := range titles {
			out = append(out, map[string]any{"type": "QUICK_REPLY", "text": t})
		}
		return out
	}
	templates := []models.Template{
		{Name: "order_confirmation", DisplayName: "Order confirmation", Category: "UTILITY",
			BodyContent:  "Hi {{1}}, thanks for your order #{{2}}! We'll message you when it ships.",
			SampleValues: models.JSONBArray{"Priya", "10482"}, Buttons: models.JSONBArray{}},
		{Name: "festive_sale", DisplayName: "Festive sale", Category: "MARKETING", HeaderType: "TEXT",
			HeaderContent: "Festive Sale is live", BodyContent: "Hi {{1}}, enjoy 20% off everything this week with code FEST20.",
			FooterContent: "Reply STOP to unsubscribe", SampleValues: models.JSONBArray{"Laura"},
			Buttons: buttons("Shop now", "Not interested")},
		{Name: "delivery_update", DisplayName: "Delivery update", Category: "UTILITY",
			BodyContent:  "Good news {{1}}! Your order is out for delivery today.",
			SampleValues: models.JSONBArray{"Marco"}, Buttons: models.JSONBArray{}},
	}
	var saleTemplateID uuid.UUID
	for i := range templates {
		t := &templates[i]
		t.OrganizationID, t.WhatsAppAccount, t.Language, t.Status = orgID, demoAccountName, "en", "APPROVED"
		if err := tx.Create(t).Error; err != nil {
			return err
		}
		if t.Name == "festive_sale" {
			saleTemplateID = t.ID
		}
	}

	if ownerID != uuid.Nil {
		started, done := ago(5*24*time.Hour), ago(5*24*time.Hour-40*time.Minute)
		campaign := models.BulkMessageCampaign{
			OrganizationID: orgID, WhatsAppAccount: demoAccountName, Name: "Festive Sale announcement",
			TemplateID: saleTemplateID, Status: models.CampaignStatus("completed"),
			TotalRecipients: 1250, SentCount: 1250, DeliveredCount: 1214, ReadCount: 968, FailedCount: 36,
			StartedAt: &started, CompletedAt: &done, CreatedBy: ownerID,
		}
		if err := tx.Create(&campaign).Error; err != nil {
			return err
		}
	}

	for _, cr := range cannedResponses(ownerID) {
		cr.OrganizationID, cr.IsActive, cr.CreatedByID, cr.Buttons = orgID, true, ownerID, models.JSONBArray{}
		if err := tx.Create(&cr).Error; err != nil {
			return err
		}
	}

	for _, kr := range []struct {
		name     string
		keywords []string
		reply    string
	}{
		{"Price list", []string{"price", "prices", "cost"}, "Here's our latest price list: whatomate.example/prices"},
		{"Store hours", []string{"hours", "timing", "open"}, "We're open 10am-8pm, Monday to Saturday."},
	} {
		rule := models.KeywordRule{
			OrganizationID: orgID, WhatsAppAccount: demoAccountName, Name: kr.name, IsEnabled: true, Priority: 10,
			Keywords: models.StringArray(kr.keywords), MatchType: models.MatchType("contains"),
			ResponseType: models.ResponseType("text"), ResponseContent: models.JSONB{"body": kr.reply},
		}
		if err := tx.Create(&rule).Error; err != nil {
			return err
		}
	}
	return nil
}

// cannedResponses returns the sample replies; they need a real author, so
// there are none when no owner exists yet.
func cannedResponses(ownerID uuid.UUID) []models.CannedResponse {
	if ownerID == uuid.Nil {
		return nil
	}
	return []models.CannedResponse{
		{Name: "Greeting", Shortcut: "/hi", Content: "Hi! Thanks for reaching out. How can I help you today?", Category: "General"},
		{Name: "Store hours", Shortcut: "/hours", Content: "We're open 10am-8pm, Monday to Saturday.", Category: "General"},
		{Name: "Order delay", Shortcut: "/delay", Content: "Sorry for the delay! I'm checking with our courier and will update you shortly.", Category: "Support"},
	}
}
