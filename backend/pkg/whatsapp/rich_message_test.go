package whatsapp_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeMeta records every message payload posted to it.
type fakeMeta struct {
	mu   sync.Mutex
	sent []map[string]any
	srv  *httptest.Server
}

func newFakeMeta(t *testing.T) *fakeMeta {
	t.Helper()
	f := &fakeMeta{}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.mu.Lock()
		f.sent = append(f.sent, body)
		f.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"messages": []map[string]string{{"id": "wamid.rich"}}})
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeMeta) last(t *testing.T) map[string]any {
	t.Helper()
	f.mu.Lock()
	defer f.mu.Unlock()
	require.NotEmpty(t, f.sent)
	return f.sent[len(f.sent)-1]
}

func richClient(f *fakeMeta) (*whatsapp.Client, *whatsapp.Account) {
	c := whatsapp.NewWithBaseURL(testutil.NopLogger(), f.srv.URL)
	return c, &whatsapp.Account{PhoneID: "p1", APIVersion: "v21.0", AccessToken: "tok"}
}

func TestSendLocation_Payload(t *testing.T) {
	f := newFakeMeta(t)
	c, acc := richClient(f)
	id, err := c.SendLocation(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, whatsapp.Location{
		Latitude: 12.9716, Longitude: 77.5946, Name: "OneSuit HQ", Address: "MG Road, Bengaluru",
	})
	require.NoError(t, err)
	assert.Equal(t, "wamid.rich", id)
	got := f.last(t)
	assert.Equal(t, "location", got["type"])
	assert.Equal(t, "911", got["to"])
	loc := got["location"].(map[string]any)
	assert.InDelta(t, 12.9716, loc["latitude"], 1e-9)
	assert.InDelta(t, 77.5946, loc["longitude"], 1e-9)
	assert.Equal(t, "OneSuit HQ", loc["name"])
	assert.Equal(t, "MG Road, Bengaluru", loc["address"])

	_, err = c.SendLocation(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, whatsapp.Location{Latitude: 91})
	require.Error(t, err, "latitude out of range is rejected before calling Meta")
}

func TestSendContacts_Payload(t *testing.T) {
	f := newFakeMeta(t)
	c, acc := richClient(f)
	_, err := c.SendContacts(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, []whatsapp.ContactCard{{
		Name:    "Asha Rao",
		Phones:  []whatsapp.ContactPhone{{Phone: "+919800000000", WaID: "919800000000"}},
		Emails:  []whatsapp.ContactEmail{{Email: "asha@example.com"}},
		Company: "OneSuit",
		Title:   "Support lead",
	}})
	require.NoError(t, err)
	got := f.last(t)
	assert.Equal(t, "contacts", got["type"])
	cards := got["contacts"].([]any)
	require.Len(t, cards, 1)
	card := cards[0].(map[string]any)
	assert.Equal(t, map[string]any{"formatted_name": "Asha Rao", "first_name": "Asha", "last_name": "Rao"}, card["name"])
	phone := card["phones"].([]any)[0].(map[string]any)
	assert.Equal(t, "+919800000000", phone["phone"])
	assert.Equal(t, "CELL", phone["type"])
	assert.Equal(t, "919800000000", phone["wa_id"])
	assert.Equal(t, "WORK", card["emails"].([]any)[0].(map[string]any)["type"])
	assert.Equal(t, map[string]any{"company": "OneSuit", "title": "Support lead"}, card["org"])

	_, err = c.SendContacts(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, []whatsapp.ContactCard{{Name: "No Phone"}})
	require.Error(t, err)
}

func TestSendLocationRequest_Payload(t *testing.T) {
	f := newFakeMeta(t)
	c, acc := richClient(f)
	_, err := c.SendLocationRequest(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, "Where should we deliver?")
	require.NoError(t, err)
	got := f.last(t)
	assert.Equal(t, "interactive", got["type"])
	in := got["interactive"].(map[string]any)
	assert.Equal(t, "location_request_message", in["type"])
	assert.Equal(t, map[string]any{"text": "Where should we deliver?"}, in["body"])
	assert.Equal(t, map[string]any{"name": "send_location"}, in["action"])
}

func TestSendProduct_Payload(t *testing.T) {
	f := newFakeMeta(t)
	c, acc := richClient(f)
	_, err := c.SendProduct(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, whatsapp.ProductMessage{
		CatalogID: "cat1", ProductRetailerID: "sku-1", Body: "Our bestseller", Footer: "Free delivery",
	})
	require.NoError(t, err)
	in := f.last(t)["interactive"].(map[string]any)
	assert.Equal(t, "product", in["type"])
	assert.Nil(t, in["header"], "single product messages take no header")
	assert.Equal(t, map[string]any{"text": "Our bestseller"}, in["body"])
	assert.Equal(t, map[string]any{"text": "Free delivery"}, in["footer"])
	assert.Equal(t, map[string]any{"catalog_id": "cat1", "product_retailer_id": "sku-1"}, in["action"])

	_, err = c.SendProduct(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, whatsapp.ProductMessage{CatalogID: "cat1"})
	require.Error(t, err, "product_retailer_id is required")
}

func TestSendProductList_Payload(t *testing.T) {
	f := newFakeMeta(t)
	c, acc := richClient(f)
	_, err := c.SendProductList(context.Background(), acc, whatsapp.Recipient{Phone: "911"}, whatsapp.ProductMessage{
		CatalogID: "cat1", Header: "New arrivals", Body: "Pick your favourite",
		Sections: []whatsapp.ProductSection{
			{Title: "Shirts", ProductRetailerIDs: []string{"s1", "s2"}},
			{ProductRetailerIDs: []string{"p1"}},
		},
	})
	require.NoError(t, err)
	in := f.last(t)["interactive"].(map[string]any)
	assert.Equal(t, "product_list", in["type"])
	assert.Equal(t, map[string]any{"type": "text", "text": "New arrivals"}, in["header"])
	action := in["action"].(map[string]any)
	assert.Equal(t, "cat1", action["catalog_id"])
	sections := action["sections"].([]any)
	require.Len(t, sections, 2)
	first := sections[0].(map[string]any)
	assert.Equal(t, "Shirts", first["title"])
	assert.Len(t, first["product_items"].([]any), 2)
	assert.Equal(t, "Products 2", sections[1].(map[string]any)["title"], "untitled sections get a title")

	// Header and body are required for product lists.
	_, err = whatsapp.BuildProductPayload(whatsapp.ProductMessage{CatalogID: "c", Body: "b",
		Sections: []whatsapp.ProductSection{{ProductRetailerIDs: []string{"x"}}}})
	require.Error(t, err)
	// At most 30 products.
	ids := make([]string, 31)
	for i := range ids {
		ids[i] = "id"
	}
	_, err = whatsapp.BuildProductPayload(whatsapp.ProductMessage{CatalogID: "c", Header: "h", Body: "b",
		Sections: []whatsapp.ProductSection{{ProductRetailerIDs: ids}}})
	require.Error(t, err)
}
