package handlers

import (
	"sort"

	"github.com/google/uuid"

	"github.com/shridarpatil/whatomate/internal/models"
)

// Team access: a team lists the parts of the app its members can use. Every
// member gets that access on top of their own role.

// TeamAccessAreas maps each area a team can be given to the permission
// resources it opens.
var TeamAccessAreas = map[string][]string{
	"chat":       {models.ResourceChat, models.ResourceChatAssign, models.ResourceTransfers},
	"contacts":   {models.ResourceContacts, models.ResourceTags},
	"campaigns":  {models.ResourceCampaigns},
	"templates":  {models.ResourceTemplates},
	"automation": {models.ResourceFlowsWhatsApp, models.ResourceFlowsChatbot, models.ResourceChatbotKeywords, models.ResourceChatbotAI},
	"analytics":  {models.ResourceAnalytics, models.ResourceAnalyticsAgents},
	"canned":     {models.ResourceCannedResponses},
	"calls":      {models.ResourceCallLogs, models.ResourceOutgoingCalls, models.ResourceCallTransfers, models.ResourceIVRFlows},
}

// cleanTeamAccess keeps known areas once, in a stable order. ok is false if
// an unknown area was given.
func cleanTeamAccess(in []string) (models.StringArray, bool) {
	seen := map[string]bool{}
	out := models.StringArray{}
	for _, a := range in {
		if _, known := TeamAccessAreas[a]; !known {
			return nil, false
		}
		if !seen[a] {
			seen[a] = true
			out = append(out, a)
		}
	}
	sort.Strings(out)
	return out, true
}

// teamAccessPermissions turns areas into "resource:action" permissions.
func teamAccessPermissions(areas []string) []string {
	resources := map[string]bool{}
	for _, area := range areas {
		for _, res := range TeamAccessAreas[area] {
			resources[res] = true
		}
	}
	var out []string
	for _, p := range models.DefaultPermissions() {
		if resources[p.Resource] {
			out = append(out, p.Resource+":"+p.Action)
		}
	}
	return out
}

// teamGrantedPermissions returns what the user's active teams in orgID give them.
func (a *App) teamGrantedPermissions(userID, orgID uuid.UUID) []string {
	if orgID == uuid.Nil {
		return nil
	}
	var teams []models.Team
	if err := a.DB.Model(&models.Team{}).
		Joins("JOIN team_members m ON m.team_id = teams.id AND m.deleted_at IS NULL").
		Where("m.user_id = ? AND teams.organization_id = ? AND teams.is_active = ?", userID, orgID, true).
		Select("teams.access").Find(&teams).Error; err != nil {
		return nil
	}
	var areas []string
	for _, t := range teams {
		areas = append(areas, t.Access...)
	}
	return teamAccessPermissions(areas)
}

// mergePermissions adds extra permissions to a list without duplicates.
func mergePermissions(base, extra []string) []string {
	have := make(map[string]bool, len(base))
	for _, p := range base {
		have[p] = true
	}
	for _, p := range extra {
		if !have[p] {
			have[p] = true
			base = append(base, p)
		}
	}
	return base
}

// clearTeamMemberPermissionCaches makes members pick up a team's new access.
func (a *App) clearTeamMemberPermissionCaches(teamID uuid.UUID) {
	var userIDs []uuid.UUID
	a.DB.Model(&models.TeamMember{}).Where("team_id = ?", teamID).Pluck("user_id", &userIDs)
	for _, id := range userIDs {
		a.clearUserPermissionKeys(id)
	}
}
