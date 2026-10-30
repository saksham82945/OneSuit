package handlers

import (
	"context"
	"time"

	"github.com/shridarpatil/whatomate/internal/models"
)

// Webhook diagnostics: remember the last event Meta sent for each number so the
// WhatsApp Setup page can show whether messages are reaching us at all.

const webhookLastKeyPrefix = "wa:webhook:last:"

// recordWebhookEvent stores when Meta last called us for a number and what happened.
func (a *App) recordWebhookEvent(phoneID, field, result string) {
	if a.Redis == nil || phoneID == "" {
		return
	}
	ctx := context.Background()
	key := webhookLastKeyPrefix + phoneID
	a.Redis.HSet(ctx, key, map[string]any{
		"at":     time.Now().UTC().Format(time.RFC3339),
		"field":  field,
		"result": result,
	})
	a.Redis.Expire(ctx, key, 30*24*time.Hour)
}

// lastWebhookEvent returns the last stored event for a number (empty when none).
func (a *App) lastWebhookEvent(phoneID string) map[string]string {
	if a.Redis == nil || phoneID == "" {
		return nil
	}
	v, err := a.Redis.HGetAll(context.Background(), webhookLastKeyPrefix+phoneID).Result()
	if err != nil || len(v) == 0 {
		return nil
	}
	return v
}

// webhookSecretsFor lists the app secrets Meta may sign a number's events with:
// the number's own app, the client's own Meta app and the platform's Meta app.
// Events are delivered by whichever app the WhatsApp Business Account is
// subscribed to, which isn't always the one saved on the number.
func (a *App) webhookSecretsFor(account *models.WhatsAppAccount) [][]byte {
	seen := map[string]bool{}
	var out [][]byte
	add := func(s string) {
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, []byte(s))
		}
	}
	add(account.AppSecret)
	if _, orgSecret, _, err := a.resolveMetaAppCreds(account.OrganizationID); err == nil {
		add(orgSecret)
	}
	_, platformSecret, _ := a.platformMetaCreds(a.loadPlatformConfig())
	add(platformSecret)
	return out
}

// signatureMatchesAny reports whether the body is signed with one of the secrets.
func signatureMatchesAny(body, signature []byte, secrets [][]byte) bool {
	for _, s := range secrets {
		if verifyWebhookSignature(body, signature, s) {
			return true
		}
	}
	return false
}
