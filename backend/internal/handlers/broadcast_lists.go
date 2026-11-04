package handlers

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// BroadcastListRequest is the create/update body for a broadcast list.
type BroadcastListRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

// BroadcastListResponse is a broadcast list in API responses.
type BroadcastListResponse struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	MemberCount int64     `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// AddListMembersRequest adds contacts to a list from one or more sources.
type AddListMembersRequest struct {
	ContactIDs  []string `json:"contact_ids"`
	GroupID     string   `json:"group_id"`     // add every contact of this group
	Tag         string   `json:"tag"`          // add every contact with this tag
	AllContacts bool     `json:"all_contacts"` // add every contact in the org
}

func listResponse(l *models.BroadcastList, count int64) BroadcastListResponse {
	return BroadcastListResponse{
		ID: l.ID, Name: l.Name, Description: l.Description,
		MemberCount: count, CreatedAt: l.CreatedAt, UpdatedAt: l.UpdatedAt,
	}
}

func (a *App) listNameTaken(orgID uuid.UUID, name string, exclude uuid.UUID) bool {
	var n int64
	q := a.DB.Model(&models.BroadcastList{}).Where("organization_id = ? AND LOWER(name) = LOWER(?)", orgID, name)
	if exclude != uuid.Nil {
		q = q.Where("id <> ?", exclude)
	}
	q.Count(&n)
	return n > 0
}

// ListBroadcastLists returns all broadcast lists with member counts.
func (a *App) ListBroadcastLists(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	q := a.DB.Where("organization_id = ?", orgID)
	if raw := string(r.RequestCtx.QueryArgs().Peek("contact_id")); raw != "" {
		cid, ok := parseOptionalUUID(raw)
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid contact ID", nil, "")
		}
		ids := a.ownersContaining(listMembership, orgID, cid)
		if len(ids) == 0 {
			return r.SendEnvelope(map[string]any{"lists": []BroadcastListResponse{}, "total": 0})
		}
		q = q.Where("id IN ?", ids)
	}
	if s := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek("search"))); s != "" {
		q = q.Where("name ILIKE ?", "%"+s+"%")
	}
	var lists []models.BroadcastList
	if err := q.Order("LOWER(name)").Find(&lists).Error; err != nil {
		a.Log.Error("Failed to list broadcast lists", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list broadcast lists", nil, "")
	}
	ids := make([]uuid.UUID, len(lists))
	for i := range lists {
		ids[i] = lists[i].ID
	}
	counts := a.memberCounts(listMembership, orgID, ids)
	out := make([]BroadcastListResponse, len(lists))
	for i := range lists {
		out[i] = listResponse(&lists[i], counts[lists[i].ID])
	}
	return r.SendEnvelope(map[string]any{"lists": out, "total": len(out)})
}

// CreateBroadcastList creates a list. Optional contact_ids seed its members.
func (a *App) CreateBroadcastList(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req struct {
		BroadcastListRequest
		ContactIDs []string `json:"contact_ids"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	if name == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "List name is required", nil, "")
	}
	if len(name) > 100 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "List name must be 100 characters or fewer", nil, "")
	}
	if a.listNameTaken(orgID, name, uuid.Nil) {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "A list with this name already exists", nil, "")
	}
	var seed []uuid.UUID
	if len(req.ContactIDs) > 0 {
		ids, msg := parseContactIDs(req.ContactIDs)
		if msg != "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
		}
		ok, err := a.verifyOrgContacts(orgID, ids)
		if err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to verify contacts", nil, "")
		}
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "One or more contacts were not found", nil, "")
		}
		seed = ids
	}

	l := models.BroadcastList{OrganizationID: orgID, Name: name, CreatedByID: &userID}
	if req.Description != nil {
		l.Description = strings.TrimSpace(*req.Description)
	}
	err = a.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&l).Error; err != nil {
			return err
		}
		if len(seed) > 0 {
			if _, err := a.addMembers(tx, listMembership, l.ID, orgID, seed); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		a.Log.Error("Failed to create broadcast list", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create list", nil, "")
	}
	a.logAudit(orgID, userID, "broadcast_list", l.ID, models.AuditActionCreated, nil, &l)
	return r.SendEnvelope(listResponse(&l, int64(len(seed))))
}

// GetBroadcastList returns one list.
func (a *App) GetBroadcastList(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "list")
	if err != nil {
		return nil
	}
	l, err := findByIDAndOrg[models.BroadcastList](a.DB, r, id, orgID, "List")
	if err != nil {
		return nil
	}
	return r.SendEnvelope(listResponse(l, a.memberCounts(listMembership, orgID, []uuid.UUID{id})[id]))
}

// UpdateBroadcastList renames / re-describes a list.
func (a *App) UpdateBroadcastList(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "list")
	if err != nil {
		return nil
	}
	l, err := findByIDAndOrg[models.BroadcastList](a.DB, r, id, orgID, "List")
	if err != nil {
		return nil
	}
	var req BroadcastListRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	old := *l
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "List name is required", nil, "")
		}
		if len(name) > 100 {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "List name must be 100 characters or fewer", nil, "")
		}
		if a.listNameTaken(orgID, name, id) {
			return r.SendErrorEnvelope(fasthttp.StatusConflict, "A list with this name already exists", nil, "")
		}
		l.Name = name
	}
	if req.Description != nil {
		l.Description = strings.TrimSpace(*req.Description)
	}
	if err := a.DB.Model(l).Updates(map[string]any{"name": l.Name, "description": l.Description}).Error; err != nil {
		a.Log.Error("Failed to update broadcast list", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update list", nil, "")
	}
	a.logAudit(orgID, userID, "broadcast_list", l.ID, models.AuditActionUpdated, &old, l)
	return r.SendEnvelope(listResponse(l, a.memberCounts(listMembership, orgID, []uuid.UUID{id})[id]))
}

// DeleteBroadcastList removes a list and its memberships (contacts untouched).
func (a *App) DeleteBroadcastList(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "list")
	if err != nil {
		return nil
	}
	l, err := findByIDAndOrg[models.BroadcastList](a.DB, r, id, orgID, "List")
	if err != nil {
		return nil
	}
	if err := a.DB.Where("list_id = ? AND organization_id = ?", id, orgID).Delete(&models.BroadcastListMember{}).Error; err != nil {
		a.Log.Error("Failed to delete list members", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete list", nil, "")
	}
	if err := a.DB.Delete(l).Error; err != nil {
		a.Log.Error("Failed to delete broadcast list", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete list", nil, "")
	}
	a.logAudit(orgID, userID, "broadcast_list", id, models.AuditActionDeleted, l, nil)
	return r.SendEnvelope(map[string]any{"message": "List deleted"})
}

// ListBroadcastListMembers returns a page of the list's contacts.
func (a *App) ListBroadcastListMembers(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "list")
	if err != nil {
		return nil
	}
	if _, err := findByIDAndOrg[models.BroadcastList](a.DB, r, id, orgID, "List"); err != nil {
		return nil
	}
	members, total, pg, err := a.listMembers(r, listMembership, id, orgID)
	if err != nil {
		a.Log.Error("Failed to list broadcast list members", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list members", nil, "")
	}
	return r.SendEnvelope(listEnvelope("contacts", members, total, pg))
}

// AddBroadcastListMembers adds contacts by id, by group, by tag, or all (idempotent).
func (a *App) AddBroadcastListMembers(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "list")
	if err != nil {
		return nil
	}
	if _, err := findByIDAndOrg[models.BroadcastList](a.DB, r, id, orgID, "List"); err != nil {
		return nil
	}
	var req AddListMembersRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	var ids []uuid.UUID
	switch {
	case len(req.ContactIDs) > 0:
		parsed, msg := parseContactIDs(req.ContactIDs)
		if msg != "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
		}
		ok, err := a.verifyOrgContacts(orgID, parsed)
		if err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to verify contacts", nil, "")
		}
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "One or more contacts were not found", nil, "")
		}
		ids = parsed
	case strings.TrimSpace(req.GroupID) != "":
		gid, ok := parseOptionalUUID(req.GroupID)
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid group ID", nil, "")
		}
		if _, err := findByIDAndOrg[models.ContactGroup](a.DB, r, gid, orgID, "Group"); err != nil {
			return nil
		}
		if err := a.memberContactsQuery(groupMembership, gid, orgID).Pluck("contacts.id", &ids).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load group contacts", nil, "")
		}
	case strings.TrimSpace(req.Tag) != "":
		ids, err = a.contactIDsWithTag(orgID, strings.TrimSpace(req.Tag))
		if err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load tagged contacts", nil, "")
		}
	case req.AllContacts:
		if err := a.DB.Model(&models.Contact{}).Where("organization_id = ?", orgID).Pluck("id", &ids).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load contacts", nil, "")
		}
	default:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Provide contact_ids, group_id, tag or all_contacts", nil, "")
	}

	var added int64
	if len(ids) > 0 {
		added, err = a.addMembers(a.DB, listMembership, id, orgID, ids)
		if err != nil {
			a.Log.Error("Failed to add list members", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to add contacts", nil, "")
		}
	}
	count := a.memberCounts(listMembership, orgID, []uuid.UUID{id})[id]
	return r.SendEnvelope(map[string]any{"added": added, "matched": len(ids), "member_count": count})
}

// RemoveBroadcastListMembers removes contacts from a list (idempotent).
func (a *App) RemoveBroadcastListMembers(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "list")
	if err != nil {
		return nil
	}
	if _, err := findByIDAndOrg[models.BroadcastList](a.DB, r, id, orgID, "List"); err != nil {
		return nil
	}
	var req MembershipRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	ids, msg := parseContactIDs(req.ContactIDs)
	if msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	removed, err := a.removeMembers(listMembership, id, orgID, ids)
	if err != nil {
		a.Log.Error("Failed to remove list members", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to remove contacts", nil, "")
	}
	count := a.memberCounts(listMembership, orgID, []uuid.UUID{id})[id]
	return r.SendEnvelope(map[string]any{"removed": removed, "member_count": count})
}

// errListNotFound is returned when a list_id does not belong to the org.
var errListNotFound = errors.New("broadcast list not found")

// findOrgBroadcastList loads a live list scoped to the org.
func (a *App) findOrgBroadcastList(orgID uuid.UUID, rawID string) (*models.BroadcastList, error) {
	id, ok := parseOptionalUUID(rawID)
	if !ok {
		return nil, errListNotFound
	}
	var l models.BroadcastList
	if err := a.DB.Where("id = ? AND organization_id = ?", id, orgID).First(&l).Error; err != nil {
		return nil, errListNotFound
	}
	return &l, nil
}

// addListRecipientsToCampaign copies the list's live contacts into the
// campaign as pending recipients (deduplicated by phone number, skipping
// numbers already on the campaign) and refreshes total_recipients.
// Returns how many recipients were added.
func (a *App) addListRecipientsToCampaign(tx *gorm.DB, campaignID, listID, orgID uuid.UUID) (int, error) {
	var contacts []models.Contact
	if err := tx.Model(&models.Contact{}).
		Joins("JOIN broadcast_list_members m ON m.contact_id = contacts.id AND m.list_id = ?", listID).
		Where("contacts.organization_id = ?", orgID).
		Order("m.created_at, contacts.id").
		Find(&contacts).Error; err != nil {
		return 0, err
	}

	var existing []string
	if err := tx.Model(&models.BulkMessageRecipient{}).Where("campaign_id = ?", campaignID).
		Pluck("phone_number", &existing).Error; err != nil {
		return 0, err
	}
	seen := make(map[string]struct{}, len(existing)+len(contacts))
	for _, p := range existing {
		seen[p] = struct{}{}
	}

	recipients := make([]models.BulkMessageRecipient, 0, len(contacts))
	for _, c := range contacts {
		phone := strings.TrimSpace(c.PhoneNumber)
		if phone == "" {
			continue
		}
		if _, dup := seen[phone]; dup {
			continue
		}
		seen[phone] = struct{}{}
		recipients = append(recipients, models.BulkMessageRecipient{
			CampaignID:    campaignID,
			PhoneNumber:   phone,
			RecipientName: c.ProfileName,
			Status:        models.MessageStatusPending,
		})
	}
	if len(recipients) > 0 {
		if err := tx.CreateInBatches(&recipients, 500).Error; err != nil {
			return 0, err
		}
	}
	var total int64
	if err := tx.Model(&models.BulkMessageRecipient{}).Where("campaign_id = ?", campaignID).Count(&total).Error; err != nil {
		return 0, err
	}
	if err := tx.Model(&models.BulkMessageCampaign{}).Where("id = ?", campaignID).
		Update("total_recipients", total).Error; err != nil {
		return 0, err
	}
	return len(recipients), nil
}

// AddCampaignRecipientsFromList adds a broadcast list's contacts to a draft campaign.
// POST /api/campaigns/{id}/recipients/from-list  {"list_id": "..."}
func (a *App) AddCampaignRecipientsFromList(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	id, err := parsePathUUID(r, "id", "campaign")
	if err != nil {
		return nil
	}
	campaign, err := findByIDAndOrg[models.BulkMessageCampaign](a.DB, r, id, orgID, "Campaign")
	if err != nil {
		return nil
	}
	if campaign.Status != models.CampaignStatusDraft {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Can only add recipients to draft campaigns", nil, "")
	}
	var req struct {
		ListID string `json:"list_id"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	list, err := a.findOrgBroadcastList(orgID, req.ListID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Broadcast list not found", nil, "")
	}
	var added int
	if err := a.DB.Transaction(func(tx *gorm.DB) error {
		var e error
		added, e = a.addListRecipientsToCampaign(tx, id, list.ID, orgID)
		return e
	}); err != nil {
		a.Log.Error("Failed to add list recipients", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to add recipients", nil, "")
	}
	var total int64
	a.DB.Model(&models.BulkMessageRecipient{}).Where("campaign_id = ?", id).Count(&total)
	a.logAudit(orgID, userID, "campaign", id, models.AuditActionUpdated, nil, nil, map[string]any{
		"field": "recipients_added", "old_value": nil,
		"new_value": fmt.Sprintf("%d recipients added from list %q", added, list.Name),
	})
	return r.SendEnvelope(map[string]any{
		"message": "Recipients added successfully", "added_count": added, "total_recipients": total,
	})
}
