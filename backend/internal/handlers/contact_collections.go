package handlers

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/internal/utils"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Shared membership plumbing for contact groups and broadcast lists. Both are
// "a named set of contacts in an org", stored in a join table keyed by
// (<owner>_id, contact_id).

// maxMembershipBatch caps how many contact ids one request may add/remove.
const maxMembershipBatch = 10000

// membershipTable describes one join table.
type membershipTable struct {
	table    string // e.g. "contact_group_members"
	ownerCol string // e.g. "group_id"
	// row builds a model row for batch insert.
	rows func(ownerID, orgID uuid.UUID, contactIDs []uuid.UUID) any
}

var groupMembership = membershipTable{
	table:    "contact_group_members",
	ownerCol: "group_id",
	rows: func(ownerID, orgID uuid.UUID, ids []uuid.UUID) any {
		out := make([]models.ContactGroupMember, len(ids))
		for i, id := range ids {
			out[i] = models.ContactGroupMember{GroupID: ownerID, ContactID: id, OrganizationID: orgID}
		}
		return &out
	},
}

var listMembership = membershipTable{
	table:    "broadcast_list_members",
	ownerCol: "list_id",
	rows: func(ownerID, orgID uuid.UUID, ids []uuid.UUID) any {
		out := make([]models.BroadcastListMember, len(ids))
		for i, id := range ids {
			out[i] = models.BroadcastListMember{ListID: ownerID, ContactID: id, OrganizationID: orgID}
		}
		return &out
	},
}

// MembershipRequest is the body for adding/removing members by contact id.
type MembershipRequest struct {
	ContactIDs []string `json:"contact_ids"`
}

// CollectionMember is a contact as shown inside a group or list.
type CollectionMember struct {
	ID              uuid.UUID `json:"id"`
	PhoneNumber     string    `json:"phone_number"`
	Name            string    `json:"name"`
	ProfileName     string    `json:"profile_name"`
	Tags            []string  `json:"tags"`
	WhatsAppAccount string    `json:"whatsapp_account,omitempty"`
	MarketingOptOut bool      `json:"marketing_opt_out"`
	AddedAt         time.Time `json:"added_at"`
}

// parseContactIDs turns strings into unique UUIDs. Returns a user-facing
// message when the input is unusable.
func parseContactIDs(raw []string) ([]uuid.UUID, string) {
	if len(raw) == 0 {
		return nil, "contact_ids is required"
	}
	if len(raw) > maxMembershipBatch {
		return nil, "Too many contacts in one request"
	}
	seen := make(map[uuid.UUID]struct{}, len(raw))
	out := make([]uuid.UUID, 0, len(raw))
	for _, s := range raw {
		id, err := uuid.Parse(strings.TrimSpace(s))
		if err != nil {
			return nil, "Invalid contact ID: " + s
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out, ""
}

// verifyOrgContacts checks that every id is a live (not soft-deleted) contact
// in the org. Returns false when any id is foreign, unknown or deleted.
func (a *App) verifyOrgContacts(orgID uuid.UUID, ids []uuid.UUID) (bool, error) {
	var count int64
	if err := a.DB.Model(&models.Contact{}).
		Where("organization_id = ? AND id IN ?", orgID, ids).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count == int64(len(ids)), nil
}

// addMembers inserts memberships, ignoring ones that already exist.
// Returns how many rows were newly added.
func (a *App) addMembers(db *gorm.DB, mt membershipTable, ownerID, orgID uuid.UUID, ids []uuid.UUID) (int64, error) {
	var added int64
	for start := 0; start < len(ids); start += 1000 {
		end := start + 1000
		if end > len(ids) {
			end = len(ids)
		}
		res := db.Clauses(clause.OnConflict{DoNothing: true}).Create(mt.rows(ownerID, orgID, ids[start:end]))
		if res.Error != nil {
			return added, res.Error
		}
		added += res.RowsAffected
	}
	return added, nil
}

// removeMembers deletes memberships. Removing a non-member is a no-op.
func (a *App) removeMembers(mt membershipTable, ownerID, orgID uuid.UUID, ids []uuid.UUID) (int64, error) {
	res := a.DB.Exec("DELETE FROM "+mt.table+" WHERE "+mt.ownerCol+" = ? AND organization_id = ? AND contact_id IN ?",
		ownerID, orgID, ids)
	return res.RowsAffected, res.Error
}

// memberCounts returns live-contact member counts per owner id.
func (a *App) memberCounts(mt membershipTable, orgID uuid.UUID, ownerIDs []uuid.UUID) map[uuid.UUID]int64 {
	out := make(map[uuid.UUID]int64, len(ownerIDs))
	if len(ownerIDs) == 0 {
		return out
	}
	type row struct {
		OwnerID uuid.UUID
		Count   int64
	}
	var rows []row
	a.DB.Table(mt.table+" m").
		Select("m."+mt.ownerCol+" AS owner_id, COUNT(*) AS count").
		Joins("JOIN contacts c ON c.id = m.contact_id AND c.deleted_at IS NULL").
		Where("m.organization_id = ? AND m."+mt.ownerCol+" IN ?", orgID, ownerIDs).
		Group("m." + mt.ownerCol).
		Scan(&rows)
	for _, r := range rows {
		out[r.OwnerID] = r.Count
	}
	return out
}

// memberContactsQuery selects live member contacts of one owner.
func (a *App) memberContactsQuery(mt membershipTable, ownerID, orgID uuid.UUID) *gorm.DB {
	return a.DB.Model(&models.Contact{}).
		Joins("JOIN "+mt.table+" m ON m.contact_id = contacts.id AND m."+mt.ownerCol+" = ?", ownerID).
		Where("contacts.organization_id = ?", orgID)
}

// listMembers returns a page of members, newest-added first, with optional search.
func (a *App) listMembers(r *fastglue.Request, mt membershipTable, ownerID, orgID uuid.UUID) ([]CollectionMember, int64, Pagination, error) {
	pg := parsePaginationWithDefaults(r, 50, 500)
	search := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek("search")))

	q := a.memberContactsQuery(mt, ownerID, orgID)
	if search != "" {
		if len(search) > 200 {
			search = search[:200]
		}
		p := "%" + search + "%"
		q = q.Where("contacts.phone_number LIKE ? OR contacts.profile_name ILIKE ?", p, p)
	}

	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, pg, err
	}

	type row struct {
		models.Contact
		AddedAt time.Time
	}
	var rows []row
	if err := pg.Apply(q.Select("contacts.*, m.created_at AS added_at").Order("m.created_at DESC, contacts.id")).
		Scan(&rows).Error; err != nil {
		return nil, 0, pg, err
	}

	mask := a.ShouldMaskPhoneNumbers(orgID)
	out := make([]CollectionMember, len(rows))
	for i, c := range rows {
		phone, name := c.PhoneNumber, c.ProfileName
		if mask {
			phone = utils.MaskPhoneNumber(phone)
			name = utils.MaskIfPhoneNumber(name)
		}
		out[i] = CollectionMember{
			ID:              c.ID,
			PhoneNumber:     phone,
			Name:            name,
			ProfileName:     name,
			Tags:            tagStrings(c.Tags),
			WhatsAppAccount: c.WhatsAppAccount,
			MarketingOptOut: c.MarketingOptOut,
			AddedAt:         c.AddedAt,
		}
	}
	return out, total, pg, nil
}

// ownersContaining returns the owner ids (groups or lists) a contact belongs to.
func (a *App) ownersContaining(mt membershipTable, orgID, contactID uuid.UUID) []uuid.UUID {
	var ids []uuid.UUID
	a.DB.Table(mt.table).Where("organization_id = ? AND contact_id = ?", orgID, contactID).
		Pluck(mt.ownerCol, &ids)
	return ids
}

// contactIDsWithTag returns live contact ids in the org carrying a tag.
func (a *App) contactIDsWithTag(orgID uuid.UUID, tag string) ([]uuid.UUID, error) {
	b, _ := json.Marshal([]string{tag})
	var ids []uuid.UUID
	err := a.DB.Model(&models.Contact{}).
		Where("organization_id = ? AND tags @> ?::jsonb", orgID, string(b)).
		Pluck("id", &ids).Error
	return ids, err
}

func tagStrings(arr models.JSONBArray) []string {
	out := []string{}
	for _, t := range arr {
		if s, ok := t.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func parseOptionalUUID(s string) (uuid.UUID, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}
