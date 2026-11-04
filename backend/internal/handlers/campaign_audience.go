package handlers

import (
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// Campaign audience: who a new campaign goes to. Any mix of tags, single
// contacts, contact groups and broadcast lists (or everyone), narrowed by
// filters. The server resolves it so the browser never pages through contacts.

// CampaignAudience is the "audience" part of a campaign request.
type CampaignAudience struct {
	AllContacts bool     `json:"all_contacts"`
	Tags        []string `json:"tags"`
	ContactIDs  []string `json:"contact_ids"`
	GroupIDs    []string `json:"group_ids"`
	ListIDs     []string `json:"list_ids"`
	// Filters
	ExcludeOptedOut bool     `json:"exclude_opted_out"` // skip contacts who opted out of marketing
	Language        string   `json:"language"`          // only contacts whose language matches (e.g. the template's)
	ExcludeTags     []string `json:"exclude_tags"`      // skip contacts with any of these tags
}

func (aud *CampaignAudience) empty() bool {
	return aud == nil || (!aud.AllContacts && len(aud.Tags) == 0 && len(aud.ContactIDs) == 0 &&
		len(aud.GroupIDs) == 0 && len(aud.ListIDs) == 0)
}

type audienceRecipient struct {
	PhoneNumber string
	ProfileName string
}

func parseUUIDs(ids []string) ([]uuid.UUID, bool) {
	out := make([]uuid.UUID, 0, len(ids))
	for _, s := range ids {
		if s = strings.TrimSpace(s); s == "" {
			continue
		}
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, false
		}
		out = append(out, id)
	}
	return out, true
}

func cleanTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, t := range tags {
		if t = strings.TrimSpace(t); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func jsonTag(t string) string {
	b, _ := json.Marshal([]string{t})
	return string(b)
}

// audienceQuery builds the contacts query for an audience (nil, "" if invalid).
func audienceQuery(db *gorm.DB, orgID uuid.UUID, aud *CampaignAudience) (*gorm.DB, string) {
	contactIDs, ok1 := parseUUIDs(aud.ContactIDs)
	groupIDs, ok2 := parseUUIDs(aud.GroupIDs)
	listIDs, ok3 := parseUUIDs(aud.ListIDs)
	if !ok1 || !ok2 || !ok3 {
		return nil, "Invalid contact, group or list ID"
	}
	q := db.Model(&models.Contact{}).Where("contacts.organization_id = ? AND contacts.deleted_at IS NULL", orgID)

	if !aud.AllContacts {
		var parts []string
		var args []any
		for _, t := range cleanTags(aud.Tags) {
			parts = append(parts, "contacts.tags @> ?::jsonb")
			args = append(args, jsonTag(t))
		}
		if len(contactIDs) > 0 {
			parts = append(parts, "contacts.id IN ?")
			args = append(args, contactIDs)
		}
		if len(groupIDs) > 0 {
			parts = append(parts, `contacts.id IN (SELECT m.contact_id FROM contact_group_members m
				JOIN contact_groups g ON g.id = m.group_id AND g.deleted_at IS NULL
				WHERE m.organization_id = ? AND m.group_id IN ?)`)
			args = append(args, orgID, groupIDs)
		}
		if len(listIDs) > 0 {
			parts = append(parts, `contacts.id IN (SELECT m.contact_id FROM broadcast_list_members m
				JOIN broadcast_lists l ON l.id = m.list_id AND l.deleted_at IS NULL
				WHERE m.organization_id = ? AND m.list_id IN ?)`)
			args = append(args, orgID, listIDs)
		}
		if len(parts) == 0 {
			return nil, "Choose who should get this campaign"
		}
		q = q.Where("("+strings.Join(parts, " OR ")+")", args...)
	}

	if aud.ExcludeOptedOut {
		q = q.Where("contacts.marketing_opt_out = ?", false)
	}
	for _, t := range cleanTags(aud.ExcludeTags) {
		q = q.Where("NOT (contacts.tags @> ?::jsonb)", jsonTag(t))
	}
	if lang := strings.TrimSpace(aud.Language); lang != "" {
		// "en" matches "en_US"; contacts store it in metadata.language.
		q = q.Where("LOWER(SPLIT_PART(COALESCE(contacts.metadata->>'language', ''), '_', 1)) = LOWER(SPLIT_PART(?, '_', 1))", lang)
	}
	return q, ""
}

// resolveAudience returns the audience's contacts, one per phone number.
func resolveAudience(db *gorm.DB, orgID uuid.UUID, aud *CampaignAudience) ([]audienceRecipient, string, error) {
	q, msg := audienceQuery(db, orgID, aud)
	if q == nil {
		return nil, msg, nil
	}
	var rows []audienceRecipient
	if err := q.Select("contacts.phone_number, contacts.profile_name").
		Where("COALESCE(TRIM(contacts.phone_number), '') <> ''").
		Order("contacts.created_at, contacts.id").Scan(&rows).Error; err != nil {
		return nil, "", err
	}
	seen := make(map[string]bool, len(rows))
	out := rows[:0]
	for _, r := range rows {
		r.PhoneNumber = strings.TrimSpace(r.PhoneNumber)
		if seen[r.PhoneNumber] {
			continue
		}
		seen[r.PhoneNumber] = true
		out = append(out, r)
	}
	return out, "", nil
}

// addAudienceToCampaign inserts the audience as pending recipients and
// returns how many were added.
func addAudienceToCampaign(tx *gorm.DB, campaignID uuid.UUID, recipients []audienceRecipient) (int, error) {
	rows := make([]models.BulkMessageRecipient, 0, len(recipients))
	for _, r := range recipients {
		rows = append(rows, models.BulkMessageRecipient{
			CampaignID: campaignID, PhoneNumber: r.PhoneNumber, RecipientName: r.ProfileName, Status: models.MessageStatusPending,
		})
	}
	if len(rows) > 0 {
		if err := tx.CreateInBatches(&rows, 500).Error; err != nil {
			return 0, err
		}
	}
	return len(rows), tx.Model(&models.BulkMessageCampaign{}).Where("id = ?", campaignID).
		Update("total_recipients", len(rows)).Error
}

// PreviewCampaignAudience counts who an audience reaches before the campaign
// is created (POST /api/campaigns/audience/preview).
func (a *App) PreviewCampaignAudience(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceCampaigns, models.ActionRead)
	if err != nil {
		return nil
	}
	var aud CampaignAudience
	if err := a.decodeRequest(r, &aud); err != nil {
		return nil
	}
	if aud.empty() {
		return r.SendEnvelope(map[string]any{"count": 0, "sample": []string{}})
	}
	recipients, msg, err := resolveAudience(a.DB, orgID, &aud)
	if err != nil {
		a.Log.Error("Failed to preview audience", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to count the audience", nil, "")
	}
	if msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	var optedOut int64
	if !aud.ExcludeOptedOut {
		if q, _ := audienceQuery(a.DB, orgID, &aud); q != nil {
			q.Where("contacts.marketing_opt_out = ?", true).Count(&optedOut)
		}
	}
	sample := make([]string, 0, 5)
	for i, rc := range recipients {
		if i == 5 {
			break
		}
		name := rc.ProfileName
		if name == "" {
			name = rc.PhoneNumber
		}
		sample = append(sample, name)
	}
	return r.SendEnvelope(map[string]any{"count": len(recipients), "opted_out": optedOut, "sample": sample})
}
