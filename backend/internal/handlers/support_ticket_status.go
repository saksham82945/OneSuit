package handlers

import (
	"time"

	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// UpdateMySupportTicket lets a workspace mark its own ticket solved or open
// it again (PUT /api/support-tickets/{id}, body {"status": "open"|"solved"}).
// Priority stays with the super admin.
func (a *App) UpdateMySupportTicket(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	id, err := parsePathUUID(r, "id", "ticket")
	if err != nil {
		return nil
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	var ticket models.SupportTicket
	q := a.DB.Where("id = ?", id)
	if !a.IsSuperAdmin(userID) {
		q = q.Where("organization_id = ?", orgID)
	}
	if err := q.First(&ticket).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Ticket not found", nil, "")
	}
	switch req.Status {
	case models.TicketStatusSolved:
		if ticket.Status != models.TicketStatusSolved {
			now := time.Now()
			ticket.SolvedAt = &now
			ticket.SolvedByID = &userID
		}
	case models.TicketStatusOpen:
		ticket.SolvedAt = nil
		ticket.SolvedByID = nil
	default:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Status must be open or solved", nil, "")
	}
	ticket.Status = req.Status
	if err := a.DB.Save(&ticket).Error; err != nil {
		a.Log.Error("Failed to update ticket", "error", err, "ticket_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to update ticket", nil, "")
	}
	return r.SendEnvelope(ticket)
}
