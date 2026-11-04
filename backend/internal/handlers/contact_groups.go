package handlers

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// ContactGroupRequest is the create/update body for a contact group.
type ContactGroupRequest struct {
	Name        *string `json:"name"`
	Color       *string `json:"color"`
	Description *string `json:"description"`
}

// ContactGroupResponse is a contact group in API responses.
type ContactGroupResponse struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Color       string    `json:"color"`
	Description string    `json:"description"`
	MemberCount int64     `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func groupResponse(g *models.ContactGroup, count int64) ContactGroupResponse {
	return ContactGroupResponse{
		ID: g.ID, Name: g.Name, Color: g.Color, Description: g.Description,
		MemberCount: count, CreatedAt: g.CreatedAt, UpdatedAt: g.UpdatedAt,
	}
}

// groupNameTaken reports whether another live group in the org uses name.
func (a *App) groupNameTaken(orgID uuid.UUID, name string, exclude uuid.UUID) bool {
	var n int64
	q := a.DB.Model(&models.ContactGroup{}).Where("organization_id = ? AND LOWER(name) = LOWER(?)", orgID, name)
	if exclude != uuid.Nil {
		q = q.Where("id <> ?", exclude)
	}
	q.Count(&n)
	return n > 0
}

// ListContactGroups returns all groups in the org with member counts.
// ?contact_id=<uuid> limits the result to groups that contain that contact.
func (a *App) ListContactGroups(r *fastglue.Request) error {
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
		ids := a.ownersContaining(groupMembership, orgID, cid)
		if len(ids) == 0 {
			return r.SendEnvelope(map[string]any{"groups": []ContactGroupResponse{}, "total": 0})
		}
		q = q.Where("id IN ?", ids)
	}
	if s := strings.TrimSpace(string(r.RequestCtx.QueryArgs().Peek("search"))); s != "" {
		q = q.Where("name ILIKE ?", "%"+s+"%")
	}

	var groups []models.ContactGroup
	if err := q.Order("LOWER(name)").Find(&groups).Error; err != nil {
		a.Log.Error("Failed to list contact groups", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list groups", nil, "")
	}
	ids := make([]uuid.UUID, len(groups))
	for i := range groups {
		ids[i] = groups[i].ID
	}
	counts := a.memberCounts(groupMembership, orgID, ids)
	out := make([]ContactGroupResponse, len(groups))
	for i := range groups {
		out[i] = groupResponse(&groups[i], counts[groups[i].ID])
	}
	return r.SendEnvelope(map[string]any{"groups": out, "total": len(out)})
}

// CreateContactGroup creates a group.
func (a *App) CreateContactGroup(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req ContactGroupRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	name := ""
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	if name == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Group name is required", nil, "")
	}
	if len(name) > 100 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Group name must be 100 characters or fewer", nil, "")
	}
	g := models.ContactGroup{OrganizationID: orgID, Name: name, CreatedByID: &userID}
	if req.Color != nil {
		g.Color = strings.TrimSpace(*req.Color)
	}
	if !models.IsValidGroupColor(g.Color) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid colour", nil, "")
	}
	if req.Description != nil {
		g.Description = strings.TrimSpace(*req.Description)
	}
	if a.groupNameTaken(orgID, name, uuid.Nil) {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "A group with this name already exists", nil, "")
	}
	if err := a.DB.Create(&g).Error; err != nil {
		a.Log.Error("Failed to create contact group", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create group", nil, "")
	}
	a.logAudit(orgID, userID, "contact_group", g.ID, models.AuditActionCreated, nil, &g)
	return r.SendEnvelope(groupResponse(&g, 0))
}

// GetContactGroup returns one group.
func (a *App) GetContactGroup(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "group")
	if err != nil {
		return nil
	}
	g, err := findByIDAndOrg[models.ContactGroup](a.DB, r, id, orgID, "Group")
	if err != nil {
		return nil
	}
	return r.SendEnvelope(groupResponse(g, a.memberCounts(groupMembership, orgID, []uuid.UUID{id})[id]))
}

// UpdateContactGroup renames / recolours / re-describes a group.
func (a *App) UpdateContactGroup(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "group")
	if err != nil {
		return nil
	}
	g, err := findByIDAndOrg[models.ContactGroup](a.DB, r, id, orgID, "Group")
	if err != nil {
		return nil
	}
	var req ContactGroupRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	old := *g
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Group name is required", nil, "")
		}
		if len(name) > 100 {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Group name must be 100 characters or fewer", nil, "")
		}
		if a.groupNameTaken(orgID, name, id) {
			return r.SendErrorEnvelope(fasthttp.StatusConflict, "A group with this name already exists", nil, "")
		}
		g.Name = name
	}
	if req.Color != nil {
		c := strings.TrimSpace(*req.Color)
		if !models.IsValidGroupColor(c) {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid colour", nil, "")
		}
		g.Color = c
	}
	if req.Description != nil {
		g.Description = strings.TrimSpace(*req.Description)
	}
	if err := a.DB.Model(g).Updates(map[string]any{"name": g.Name, "color": g.Color, "description": g.Description}).Error; err != nil {
		a.Log.Error("Failed to update contact group", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update group", nil, "")
	}
	a.logAudit(orgID, userID, "contact_group", g.ID, models.AuditActionUpdated, &old, g)
	return r.SendEnvelope(groupResponse(g, a.memberCounts(groupMembership, orgID, []uuid.UUID{id})[id]))
}

// DeleteContactGroup removes a group and its memberships (contacts are untouched).
func (a *App) DeleteContactGroup(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "group")
	if err != nil {
		return nil
	}
	g, err := findByIDAndOrg[models.ContactGroup](a.DB, r, id, orgID, "Group")
	if err != nil {
		return nil
	}
	if err := a.DB.Where("group_id = ? AND organization_id = ?", id, orgID).Delete(&models.ContactGroupMember{}).Error; err != nil {
		a.Log.Error("Failed to delete group members", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete group", nil, "")
	}
	if err := a.DB.Delete(g).Error; err != nil {
		a.Log.Error("Failed to delete contact group", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete group", nil, "")
	}
	a.logAudit(orgID, userID, "contact_group", id, models.AuditActionDeleted, g, nil)
	return r.SendEnvelope(map[string]any{"message": "Group deleted"})
}

// ListContactGroupMembers returns a page of the group's contacts.
// Also serves as "filter contacts by group".
func (a *App) ListContactGroupMembers(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionRead)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "group")
	if err != nil {
		return nil
	}
	if _, err := findByIDAndOrg[models.ContactGroup](a.DB, r, id, orgID, "Group"); err != nil {
		return nil
	}
	members, total, pg, err := a.listMembers(r, groupMembership, id, orgID)
	if err != nil {
		a.Log.Error("Failed to list group members", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list members", nil, "")
	}
	return r.SendEnvelope(listEnvelope("contacts", members, total, pg))
}

// AddContactGroupMembers adds contacts to a group (idempotent).
func (a *App) AddContactGroupMembers(r *fastglue.Request) error {
	return a.changeGroupMembers(r, true)
}

// RemoveContactGroupMembers removes contacts from a group (idempotent).
func (a *App) RemoveContactGroupMembers(r *fastglue.Request) error {
	return a.changeGroupMembers(r, false)
}

func (a *App) changeGroupMembers(r *fastglue.Request, add bool) error {
	orgID, _, err := a.requireAuth(r, models.ResourceContacts, models.ActionWrite)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "group")
	if err != nil {
		return nil
	}
	if _, err := findByIDAndOrg[models.ContactGroup](a.DB, r, id, orgID, "Group"); err != nil {
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

	var changed int64
	if add {
		ok, err := a.verifyOrgContacts(orgID, ids)
		if err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to verify contacts", nil, "")
		}
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "One or more contacts were not found", nil, "")
		}
		changed, err = a.addMembers(a.DB, groupMembership, id, orgID, ids)
		if err != nil {
			a.Log.Error("Failed to add group members", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to add contacts", nil, "")
		}
	} else {
		changed, err = a.removeMembers(groupMembership, id, orgID, ids)
		if err != nil {
			a.Log.Error("Failed to remove group members", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to remove contacts", nil, "")
		}
	}
	count := a.memberCounts(groupMembership, orgID, []uuid.UUID{id})[id]
	key := "removed"
	if add {
		key = "added"
	}
	return r.SendEnvelope(map[string]any{key: changed, "member_count": count})
}
