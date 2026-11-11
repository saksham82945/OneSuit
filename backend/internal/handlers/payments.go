package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/crypto"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Subscription payments: Razorpay Checkout (card, UPI, net banking) and
// direct UPI transfers to the platform's UPI ID. A paid payment activates the
// workspace's plan for one billing cycle and issues a paid invoice.

const (
	paymentSettingsKey         = "payment_settings"
	razorpaySecretKey          = "payment_razorpay_secret"
	razorpayWebhookSecretKey   = "payment_razorpay_webhook_secret"
	razorpayWebhookPath        = "/razorpay/order-payment-razorpay-webhook"
	defaultRazorpayAPIBase     = "https://api.razorpay.com"
	defaultUPIID               = "8999305629@kotak811"
	defaultUPIPayeeName        = "OneSuit"
	upiReferenceMaxLen         = 64
	razorpayOrderReceiptPrefix = "onesuit_"
)

// RazorpayAPIBase is Razorpay's API address (tests point it at a fake server).
var RazorpayAPIBase = defaultRazorpayAPIBase

// PaymentSettings are the super admin's payment settings. The Razorpay key
// secret and webhook secret are stored encrypted on their own and never sent back.
type PaymentSettings struct {
	RazorpayEnabled bool   `json:"razorpay_enabled"`
	RazorpayKeyID   string `json:"razorpay_key_id"`
	UPIEnabled      bool   `json:"upi_enabled"`
	UPIID           string `json:"upi_id"`
	UPIPayeeName    string `json:"upi_payee_name"`
	// Read-only in responses
	HasRazorpaySecret        bool   `json:"has_razorpay_secret"`
	HasRazorpayWebhookSecret bool   `json:"has_razorpay_webhook_secret"`
	WebhookURL               string `json:"webhook_url,omitempty"`
}

// --- settings storage ---

func (a *App) platformSecret(key string) string {
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", key).First(&row).Error; err != nil {
		return ""
	}
	enc, _ := row.Value["encrypted"].(string)
	if enc == "" {
		return ""
	}
	secret, err := crypto.Decrypt(enc, a.Config.App.EncryptionKey)
	if err != nil {
		a.Log.Error("Failed to decrypt platform secret", "key", key, "error", err)
		return ""
	}
	return secret
}

func (a *App) savePlatformSecret(key, secret string) error {
	if secret == "" {
		return a.DB.Where("key = ?", key).Delete(&models.PlatformSetting{}).Error
	}
	enc, err := crypto.Encrypt(secret, a.Config.App.EncryptionKey)
	if err != nil {
		return err
	}
	return a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&models.PlatformSetting{Key: key, Value: models.JSONB{"encrypted": enc}}).Error
}

func (a *App) loadPaymentSettings() PaymentSettings {
	s := PaymentSettings{UPIEnabled: true, UPIID: defaultUPIID, UPIPayeeName: defaultUPIPayeeName}
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", paymentSettingsKey).First(&row).Error; err == nil {
		b, _ := json.Marshal(row.Value)
		_ = json.Unmarshal(b, &s)
	}
	s.HasRazorpaySecret = a.platformSecret(razorpaySecretKey) != ""
	s.HasRazorpayWebhookSecret = a.platformSecret(razorpayWebhookSecretKey) != ""
	return s
}

func (a *App) savePaymentSettings(s PaymentSettings) error {
	b, _ := json.Marshal(map[string]any{
		"razorpay_enabled": s.RazorpayEnabled, "razorpay_key_id": s.RazorpayKeyID,
		"upi_enabled": s.UPIEnabled, "upi_id": s.UPIID, "upi_payee_name": s.UPIPayeeName,
	})
	var v models.JSONB
	_ = json.Unmarshal(b, &v)
	return a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&models.PlatformSetting{Key: paymentSettingsKey, Value: v}).Error
}

// razorpayReady reports whether Razorpay checkout can be offered.
func (a *App) razorpayReady(s PaymentSettings) bool {
	return s.RazorpayEnabled && s.RazorpayKeyID != "" && s.HasRazorpaySecret
}

func (a *App) razorpayWebhookURL(r *fastglue.Request) string {
	if a.Config.Server.PublicURL != "" {
		return strings.TrimRight(a.Config.Server.PublicURL, "/") + razorpayWebhookPath
	}
	return fmt.Sprintf("%s://%s%s", requestScheme(r), string(r.RequestCtx.Host()), razorpayWebhookPath)
}

// --- public / client endpoints ---

// GetPaymentOptions tells checkout pages which payment methods are on
// (GET /api/public/payment-options). No secrets.
func (a *App) GetPaymentOptions(r *fastglue.Request) error {
	s := a.loadPaymentSettings()
	upi := s.UPIEnabled && s.UPIID != ""
	return r.SendEnvelope(map[string]any{
		"razorpay_enabled": a.razorpayReady(s),
		"razorpay_key_id":  map[bool]string{true: s.RazorpayKeyID}[a.razorpayReady(s)],
		"upi_enabled":      upi,
		"upi_id":           map[bool]string{true: s.UPIID}[upi],
		"upi_payee_name":   s.UPIPayeeName,
	})
}

type checkoutRequest struct {
	PlanID       string `json:"plan_id"`
	BillingCycle string `json:"billing_cycle"`
	Method       string `json:"method"`
}

// CreatePaymentCheckout starts paying for a plan (POST /api/payments/checkout).
// Razorpay: creates an order for Razorpay Checkout. UPI: returns the UPI link.
func (a *App) CreatePaymentCheckout(r *fastglue.Request) error {
	orgID, userID, err := a.requireAuth(r, models.ResourceSettingsGeneral, models.ActionWrite)
	if err != nil {
		return nil
	}
	var req checkoutRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	plan, err := a.findPlan(strings.TrimSpace(req.PlanID))
	if err != nil || !plan.IsActive {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "That plan is not available", nil, "")
	}
	cycle := req.BillingCycle
	if cycle == "" {
		cycle = models.BillingIntervalMonthly
	}
	if models.BillingCycleMonths(cycle) == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Billing cycle must be monthly, quarterly, half_yearly or yearly", nil, "")
	}
	amount := plan.PriceFor(cycle)
	if amount <= 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "This plan is free, so there's nothing to pay", nil, "")
	}
	settings := a.loadPaymentSettings()

	var user models.User
	a.DB.Where("id = ?", userID).First(&user)
	var org models.Organization
	a.DB.Where("id = ?", orgID).First(&org)

	p := models.Payment{
		OrganizationID: orgID, PlanID: plan.ID, PlanName: plan.Name, BillingCycle: cycle,
		Amount: amount, Currency: models.PlatformCurrency, Method: req.Method, Status: models.PaymentStatusCreated,
		CreatedByID: &userID, PayerName: user.FullName, PayerEmail: user.Email,
	}

	switch req.Method {
	case models.PaymentMethodRazorpay:
		if !a.razorpayReady(settings) {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Online payment isn't available right now. Please pay by UPI.", nil, "")
		}
		if err := a.DB.Create(&p).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not start the payment", nil, "")
		}
		orderID, err := a.createRazorpayOrder(settings.RazorpayKeyID, a.platformSecret(razorpaySecretKey), &p, org.Name)
		if err != nil {
			a.Log.Error("Razorpay order failed", "error", err, "payment_id", p.ID)
			a.DB.Model(&p).Updates(map[string]any{"status": models.PaymentStatusFailed, "failure_reason": err.Error()})
			return r.SendErrorEnvelope(fasthttp.StatusBadGateway, "Razorpay couldn't start the payment. Please try again or pay by UPI.", nil, "")
		}
		a.DB.Model(&p).Update("razorpay_order_id", orderID)
		return r.SendEnvelope(map[string]any{
			"payment_id": p.ID, "method": p.Method, "amount": p.Amount, "currency": p.Currency,
			"razorpay": map[string]any{
				"key_id": settings.RazorpayKeyID, "order_id": orderID, "amount": toPaise(amount), "currency": p.Currency,
				"name": a.loadPlatformConfig().PlatformName, "description": fmt.Sprintf("%s plan (%s)", plan.Name, cycle),
				"prefill": map[string]string{"name": user.FullName, "email": user.Email},
			},
		})
	case models.PaymentMethodUPI:
		if !settings.UPIEnabled || settings.UPIID == "" {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "UPI payment isn't available right now", nil, "")
		}
		if err := a.DB.Create(&p).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not start the payment", nil, "")
		}
		note := fmt.Sprintf("OneSuit %s %s", plan.Name, strings.ToUpper(p.ID.String()[:8]))
		return r.SendEnvelope(map[string]any{
			"payment_id": p.ID, "method": p.Method, "amount": p.Amount, "currency": p.Currency,
			"upi": map[string]any{
				"upi_id": settings.UPIID, "payee_name": settings.UPIPayeeName, "note": note,
				"uri": upiURI(settings.UPIID, settings.UPIPayeeName, amount, note),
			},
		})
	default:
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Choose Razorpay or UPI", nil, "")
	}
}

func toPaise(amount float64) int64 { return int64(math.Round(amount * 100)) }

// upiURI builds a upi://pay link that opens any UPI app with the amount filled in.
func upiURI(vpa, name string, amount float64, note string) string {
	// UPI apps read pa first and expect the @ unescaped.
	return fmt.Sprintf("upi://pay?pa=%s&pn=%s&am=%.2f&cu=INR&tn=%s", vpa, url.PathEscape(name), amount, url.PathEscape(note))
}

// createRazorpayOrder creates a Razorpay order for the payment and returns its ID.
func (a *App) createRazorpayOrder(keyID, keySecret string, p *models.Payment, orgName string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"amount": toPaise(p.Amount), "currency": p.Currency,
		"receipt": razorpayOrderReceiptPrefix + p.ID.String()[:32],
		"notes":   map[string]string{"payment_id": p.ID.String(), "organization_id": p.OrganizationID.String(), "workspace": orgName, "plan": p.PlanName},
	})
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(RazorpayAPIBase, "/")+"/v1/orders", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(keyID, keySecret)
	req.Header.Set("Content-Type", "application/json")
	client := a.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close() //nolint:errcheck
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out struct {
		ID    string `json:"id"`
		Error struct {
			Description string `json:"description"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &out)
	if resp.StatusCode != http.StatusOK || out.ID == "" {
		msg := out.Error.Description
		if msg == "" {
			msg = fmt.Sprintf("status %d", resp.StatusCode)
		}
		return "", errors.New("razorpay: " + msg)
	}
	return out.ID, nil
}

func hmacHex(secret, msg []byte) string {
	m := hmac.New(sha256.New, secret)
	m.Write(msg)
	return hex.EncodeToString(m.Sum(nil))
}

func (a *App) orgPayment(r *fastglue.Request, orgID uuid.UUID) (*models.Payment, bool) {
	id, err := parsePathUUID(r, "id", "payment")
	if err != nil {
		return nil, false
	}
	var p models.Payment
	if err := a.DB.Where("id = ? AND organization_id = ?", id, orgID).First(&p).Error; err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "Payment not found", nil, "")
		return nil, false
	}
	return &p, true
}

// VerifyRazorpayPayment checks Razorpay Checkout's signature and activates the
// plan (POST /api/payments/{id}/razorpay/verify).
func (a *App) VerifyRazorpayPayment(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceSettingsGeneral, models.ActionWrite)
	if err != nil {
		return nil
	}
	p, ok := a.orgPayment(r, orgID)
	if !ok {
		return nil
	}
	var req struct {
		OrderID   string `json:"razorpay_order_id"`
		PaymentID string `json:"razorpay_payment_id"`
		Signature string `json:"razorpay_signature"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if p.Method != models.PaymentMethodRazorpay || p.RazorpayOrderID == "" || req.OrderID != p.RazorpayOrderID {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "This payment doesn't match the order", nil, "")
	}
	secret := a.platformSecret(razorpaySecretKey)
	want := hmacHex([]byte(secret), []byte(req.OrderID+"|"+req.PaymentID))
	if secret == "" || !hmac.Equal([]byte(want), []byte(strings.ToLower(req.Signature))) {
		a.DB.Model(p).Updates(map[string]any{"failure_reason": "signature check failed"})
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "We couldn't confirm this payment. If money was taken, it will be confirmed automatically shortly.", nil, "")
	}
	if err := a.markPaymentPaid(p.ID, map[string]any{"razorpay_payment_id": req.PaymentID}, nil); err != nil {
		a.Log.Error("Failed to activate paid plan", "error", err, "payment_id", p.ID)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Payment received, but activating the plan failed. Our team will fix it.", nil, "")
	}
	return a.sendPayment(r, p.ID)
}

// SubmitUPIPayment records the UPI transaction reference the customer paid
// with (POST /api/payments/{id}/upi/submit). The super admin then approves it.
func (a *App) SubmitUPIPayment(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceSettingsGeneral, models.ActionWrite)
	if err != nil {
		return nil
	}
	p, ok := a.orgPayment(r, orgID)
	if !ok {
		return nil
	}
	var req struct {
		Reference string `json:"reference"`
		Phone     string `json:"phone"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	ref := strings.ToUpper(strings.TrimSpace(req.Reference))
	if p.Method != models.PaymentMethodUPI {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "This isn't a UPI payment", nil, "")
	}
	if p.Status != models.PaymentStatusCreated && p.Status != models.PaymentStatusRejected {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This payment was already submitted", nil, "")
	}
	if len(ref) < 6 || len(ref) > upiReferenceMaxLen {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Enter the UPI transaction ID / UTR from your UPI app (usually 12 digits)", nil, "")
	}
	var dup int64
	a.DB.Model(&models.Payment{}).Where("upi_reference = ? AND id <> ? AND status IN ?", ref, p.ID,
		[]string{models.PaymentStatusPendingVerification, models.PaymentStatusPaid}).Count(&dup)
	if dup > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This transaction ID was already used for another payment", nil, "")
	}
	now := time.Now()
	if err := a.DB.Model(p).Updates(map[string]any{
		"upi_reference": ref, "status": models.PaymentStatusPendingVerification, "submitted_at": now,
		"payer_phone": strings.TrimSpace(req.Phone), "failure_reason": "",
	}).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not save the reference", nil, "")
	}
	return a.sendPayment(r, p.ID)
}

// ListMyPayments lists the workspace's payments (GET /api/payments).
func (a *App) ListMyPayments(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceSettingsGeneral, models.ActionRead)
	if err != nil {
		return nil
	}
	list := []models.Payment{}
	a.DB.Where("organization_id = ?", orgID).Order("created_at DESC").Limit(100).Find(&list)
	return r.SendEnvelope(map[string]any{"payments": list})
}

// GetMyPayment returns one of the workspace's payments (GET /api/payments/{id}).
func (a *App) GetMyPayment(r *fastglue.Request) error {
	orgID, _, err := a.requireAuth(r, models.ResourceSettingsGeneral, models.ActionRead)
	if err != nil {
		return nil
	}
	p, ok := a.orgPayment(r, orgID)
	if !ok {
		return nil
	}
	return a.sendPayment(r, p.ID)
}

func (a *App) sendPayment(r *fastglue.Request, id uuid.UUID) error {
	var p models.Payment
	if err := a.DB.Where("id = ?", id).First(&p).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Payment not found", nil, "")
	}
	return r.SendEnvelope(p)
}

// --- activation ---

var errPaymentNotPayable = errors.New("payment can't be marked paid in its current state")

// errPaymentOrgDeleted: the client this payment belongs to has been deleted.
var errPaymentOrgDeleted = errors.New("the client for this payment has been deleted")

// markPaymentPaid marks a payment paid (once), extends the workspace's plan by
// one billing cycle and issues the invoice. extra holds columns to set too.
func (a *App) markPaymentPaid(id uuid.UUID, extra map[string]any, verifiedBy *uuid.UUID) error {
	err := a.DB.Transaction(func(tx *gorm.DB) error {
		var p models.Payment
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&p).Error; err != nil {
			return err
		}
		if p.Status == models.PaymentStatusPaid {
			return nil // already done (Checkout and the webhook can both arrive)
		}
		if p.Status != models.PaymentStatusCreated && p.Status != models.PaymentStatusPendingVerification && p.Status != models.PaymentStatusFailed {
			return errPaymentNotPayable
		}
		var plan models.SubscriptionPlan
		if err := tx.Unscoped().Where("id = ?", p.PlanID).First(&plan).Error; err != nil {
			return err
		}
		now := time.Now()
		months := models.BillingCycleMonths(p.BillingCycle)
		if months == 0 {
			months = 1
		}

		// A deleted client can't be given a paid plan.
		var orgCount int64
		if err := tx.Model(&models.Organization{}).Where("id = ?", p.OrganizationID).Count(&orgCount).Error; err != nil {
			return err
		}
		if orgCount == 0 {
			return errPaymentOrgDeleted
		}

		// Extend from the current paid period if it's still running on the same plan.
		// Look at deleted rows too: the workspace can hold only one subscription
		// row, so an old deleted one is brought back instead of adding another.
		var sub models.OrganizationSubscription
		found := tx.Unscoped().Where("organization_id = ?", p.OrganizationID).First(&sub).Error == nil
		if found && sub.DeletedAt.Valid {
			if err := tx.Unscoped().Model(&sub).Update("deleted_at", nil).Error; err != nil {
				return err
			}
			sub.Status = ""
		}
		start := now
		if found && sub.Status == models.VendorStatusActive && sub.PlanID != nil && *sub.PlanID == p.PlanID &&
			sub.RenewalDate != nil && sub.RenewalDate.After(now) {
			start = *sub.RenewalDate
		}
		end := start.AddDate(0, months, 0)
		planID := p.PlanID
		if found {
			if err := tx.Model(&sub).Updates(map[string]any{
				"plan_id": planID, "status": models.VendorStatusActive, "renewal_date": end, "billing_cycle": p.BillingCycle,
			}).Error; err != nil {
				return err
			}
		} else {
			sub = models.OrganizationSubscription{OrganizationID: p.OrganizationID, PlanID: &planID, Status: models.VendorStatusActive,
				RenewalDate: &end, BillingCycle: p.BillingCycle, OwnerName: p.PayerName, OwnerEmail: p.PayerEmail}
			if err := tx.Create(&sub).Error; err != nil {
				return err
			}
		}

		method := "Razorpay"
		if p.Method == models.PaymentMethodUPI {
			method = "UPI"
		}
		pid := p.ID
		inv := models.BillingInvoice{
			OrganizationID: p.OrganizationID, Number: newInvoiceNumber(now), Kind: models.InvoiceKindSubscription,
			Description: fmt.Sprintf("%s plan (%s) · paid by %s", plan.Name, strings.ReplaceAll(p.BillingCycle, "_", "-"), method),
			Amount:      p.Amount, Currency: p.Currency, Status: models.InvoiceStatusPaid,
			PeriodStart: &start, PeriodEnd: &end, IssuedAt: now, PaidAt: &now, SourceID: &pid,
		}
		if err := tx.Create(&inv).Error; err != nil {
			return err
		}
		updates := map[string]any{"status": models.PaymentStatusPaid, "paid_at": now, "invoice_id": inv.ID, "period_end": end, "failure_reason": ""}
		for k, v := range extra {
			updates[k] = v
		}
		if verifiedBy != nil {
			updates["verified_by_id"] = *verifiedBy
		}
		return tx.Model(&models.Payment{}).Where("id = ?", p.ID).Updates(updates).Error
	})
	if err == nil {
		clearOrgModulesCache()
	}
	return err
}

// --- Razorpay webhook ---

// RazorpayWebhook receives Razorpay's payment events
// (POST /razorpay/order-payment-razorpay-webhook). It's signed with the
// webhook secret set in the Razorpay dashboard.
func (a *App) RazorpayWebhook(r *fastglue.Request) error {
	body := r.RequestCtx.PostBody()
	secret := a.platformSecret(razorpayWebhookSecretKey)
	sig := strings.ToLower(strings.TrimSpace(string(r.RequestCtx.Request.Header.Peek("X-Razorpay-Signature"))))
	if secret == "" || !hmac.Equal([]byte(hmacHex([]byte(secret), body)), []byte(sig)) {
		a.Log.Warn("Razorpay webhook rejected: bad or missing signature")
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Invalid signature", nil, "")
	}
	var evt struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID               string `json:"id"`
					OrderID          string `json:"order_id"`
					Status           string `json:"status"`
					ErrorDescription string `json:"error_description"`
				} `json:"entity"`
			} `json:"payment"`
			Order struct {
				Entity struct {
					ID string `json:"id"`
				} `json:"entity"`
			} `json:"order"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(body, &evt); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid payload", nil, "")
	}
	pay := evt.Payload.Payment.Entity
	orderID := pay.OrderID
	if orderID == "" {
		orderID = evt.Payload.Order.Entity.ID
	}
	if orderID == "" {
		return r.SendEnvelope(map[string]any{"ok": true, "ignored": "no order"})
	}
	var p models.Payment
	if err := a.DB.Where("razorpay_order_id = ?", orderID).First(&p).Error; err != nil {
		// Not one of ours (another app on the same Razorpay account). Acknowledge it.
		return r.SendEnvelope(map[string]any{"ok": true, "ignored": "unknown order"})
	}
	switch evt.Event {
	case "payment.captured", "order.paid":
		if err := a.markPaymentPaid(p.ID, map[string]any{"razorpay_payment_id": pay.ID}, nil); err != nil && !errors.Is(err, errPaymentNotPayable) && !errors.Is(err, errPaymentOrgDeleted) {
			a.Log.Error("Webhook: failed to activate plan", "error", err, "payment_id", p.ID)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed", nil, "")
		}
	case "payment.failed":
		if p.Status == models.PaymentStatusCreated {
			a.DB.Model(&p).Updates(map[string]any{"status": models.PaymentStatusFailed, "razorpay_payment_id": pay.ID, "failure_reason": pay.ErrorDescription})
		}
	}
	return r.SendEnvelope(map[string]any{"ok": true})
}

// --- super admin ---

// SuperAdminGetPaymentSettings returns the payment settings (GET /api/super-admin/payment-settings).
func (a *App) SuperAdminGetPaymentSettings(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	s := a.loadPaymentSettings()
	s.WebhookURL = a.razorpayWebhookURL(r)
	return r.SendEnvelope(s)
}

// SuperAdminUpdatePaymentSettings saves the payment settings
// (PUT /api/super-admin/payment-settings). Secrets: send a value to replace,
// "" to clear, or leave out to keep.
func (a *App) SuperAdminUpdatePaymentSettings(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	var req struct {
		RazorpayEnabled       *bool   `json:"razorpay_enabled"`
		RazorpayKeyID         *string `json:"razorpay_key_id"`
		RazorpayKeySecret     *string `json:"razorpay_key_secret"`
		RazorpayWebhookSecret *string `json:"razorpay_webhook_secret"`
		UPIEnabled            *bool   `json:"upi_enabled"`
		UPIID                 *string `json:"upi_id"`
		UPIPayeeName          *string `json:"upi_payee_name"`
	}
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	s := a.loadPaymentSettings()
	if req.RazorpayEnabled != nil {
		s.RazorpayEnabled = *req.RazorpayEnabled
	}
	if req.RazorpayKeyID != nil {
		s.RazorpayKeyID = strings.TrimSpace(*req.RazorpayKeyID)
		if s.RazorpayKeyID != "" && !strings.HasPrefix(s.RazorpayKeyID, "rzp_") {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The Razorpay Key ID starts with rzp_live_ or rzp_test_", nil, "")
		}
	}
	if req.UPIEnabled != nil {
		s.UPIEnabled = *req.UPIEnabled
	}
	if req.UPIID != nil {
		s.UPIID = strings.TrimSpace(*req.UPIID)
		if s.UPIID != "" && (!strings.Contains(s.UPIID, "@") || strings.ContainsAny(s.UPIID, " &?=")) {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Enter a UPI ID like name@bank", nil, "")
		}
	}
	if req.UPIPayeeName != nil {
		s.UPIPayeeName = strings.TrimSpace(*req.UPIPayeeName)
	}
	for key, val := range map[string]*string{razorpaySecretKey: req.RazorpayKeySecret, razorpayWebhookSecretKey: req.RazorpayWebhookSecret} {
		if val != nil {
			if err := a.savePlatformSecret(key, strings.TrimSpace(*val)); err != nil {
				return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not save the secret", nil, "")
			}
		}
	}
	if err := a.savePaymentSettings(s); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not save the settings", nil, "")
	}
	out := a.loadPaymentSettings()
	out.WebhookURL = a.razorpayWebhookURL(r)
	return r.SendEnvelope(out)
}

// SuperAdminPaymentRow is a payment with its workspace name.
type SuperAdminPaymentRow struct {
	models.Payment
	OrganizationName string `json:"organization_name"`
}

// SuperAdminListPayments lists every payment with filters and totals
// (GET /api/super-admin/payments?status=&method=&search=&page=&limit=).
func (a *App) SuperAdminListPayments(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	q := r.RequestCtx.QueryArgs()
	base := a.DB.Table("payments AS p").Joins("LEFT JOIN organizations o ON o.id = p.organization_id").Where("p.deleted_at IS NULL")
	if v := string(q.Peek("status")); v != "" {
		base = base.Where("p.status = ?", v)
	}
	if v := string(q.Peek("method")); v != "" {
		base = base.Where("p.method = ?", v)
	}
	if v := strings.TrimSpace(string(q.Peek("search"))); v != "" {
		like := "%" + v + "%"
		base = base.Where("o.name ILIKE ? OR p.payer_email ILIKE ? OR p.upi_reference ILIKE ? OR p.razorpay_payment_id ILIKE ? OR p.razorpay_order_id ILIKE ? OR p.plan_name ILIKE ?",
			like, like, like, like, like, like)
	}
	page, limit := q.GetUintOrZero("page"), q.GetUintOrZero("limit")
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	var total int64
	base.Session(&gorm.Session{}).Count(&total)
	rows := []SuperAdminPaymentRow{}
	base.Session(&gorm.Session{}).Select("p.*, o.name AS organization_name").Order("p.created_at DESC").
		Offset((page - 1) * limit).Limit(limit).Scan(&rows)

	var sum struct {
		Collected float64
		PaidCount int64
		Pending   int64
	}
	a.DB.Raw(`SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS collected,
		COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
		COUNT(*) FILTER (WHERE status = 'pending_verification') AS pending
		FROM payments WHERE deleted_at IS NULL`).Scan(&sum)
	var month float64
	a.DB.Raw(`SELECT COALESCE(SUM(amount), 0) FROM payments WHERE deleted_at IS NULL AND status = 'paid' AND paid_at >= ?`,
		time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Local)).Scan(&month)
	return r.SendEnvelope(map[string]any{
		"payments": rows, "total": total, "page": page, "limit": limit,
		"summary": map[string]any{"collected": sum.Collected, "paid_count": sum.PaidCount, "pending_verification": sum.Pending, "collected_this_month": month},
	})
}

// SuperAdminApprovePayment confirms a UPI payment after checking the bank
// statement, activating the plan (POST /api/super-admin/payments/{id}/approve).
func (a *App) SuperAdminApprovePayment(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "payment")
	if err != nil {
		return nil
	}
	switch err := a.markPaymentPaid(id, nil, &adminID); {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Payment not found", nil, "")
	case errors.Is(err, errPaymentNotPayable):
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This payment can't be approved in its current state", nil, "")
	case errors.Is(err, errPaymentOrgDeleted):
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This client has been deleted, so the payment can't be approved. Reject it instead.", nil, "")
	case err != nil:
		a.Log.Error("Failed to approve payment", "error", err, "payment_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not approve the payment: "+err.Error(), nil, "")
	}
	return a.sendPayment(r, id)
}

// SuperAdminRejectPayment refuses a UPI reference that wasn't received
// (POST /api/super-admin/payments/{id}/reject, body {"reason": "..."}).
func (a *App) SuperAdminRejectPayment(r *fastglue.Request) error {
	adminID, err := a.requireSuperAdmin(r)
	if err != nil {
		return nil
	}
	id, err := parsePathUUID(r, "id", "payment")
	if err != nil {
		return nil
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if len(r.RequestCtx.PostBody()) > 0 {
		if err := a.decodeRequest(r, &req); err != nil {
			return nil
		}
	}
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "Payment not received"
	}
	res := a.DB.Model(&models.Payment{}).Where("id = ? AND status = ?", id, models.PaymentStatusPendingVerification).
		Updates(map[string]any{"status": models.PaymentStatusRejected, "failure_reason": reason, "verified_by_id": adminID})
	if res.Error != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Could not reject the payment", nil, "")
	}
	if res.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Only payments waiting for approval can be rejected", nil, "")
	}
	return a.sendPayment(r, id)
}
