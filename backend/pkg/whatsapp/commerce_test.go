package whatsapp_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClient_CommerceSettings_GetAndUpdate(t *testing.T) {
	t.Parallel()
	var posted map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/123456789/whatsapp_commerce_settings")
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "x", "is_catalog_visible": true, "is_cart_enabled": true}}})
		case http.MethodPost:
			posted = map[string]string{
				"is_catalog_visible": r.URL.Query().Get("is_catalog_visible"),
				"is_cart_enabled":    r.URL.Query().Get("is_cart_enabled"),
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
		}
	}))
	defer server.Close()
	client := newTestClient(t, server)
	account := testAccount(server.URL)

	s, err := client.GetCommerceSettings(context.Background(), account)
	require.NoError(t, err)
	assert.True(t, s.IsCatalogVisible)
	assert.True(t, s.IsCartEnabled)

	require.NoError(t, client.UpdateCommerceSettings(context.Background(), account, whatsapp.CommerceSettings{IsCatalogVisible: true}))
	assert.Equal(t, map[string]string{"is_catalog_visible": "true", "is_cart_enabled": "false"}, posted)
}

func TestClient_CommerceSettings_EmptyMeansOff(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}})
	}))
	defer server.Close()
	s, err := newTestClient(t, server).GetCommerceSettings(context.Background(), testAccount(server.URL))
	require.NoError(t, err)
	assert.False(t, s.IsCatalogVisible)
	assert.False(t, s.IsCartEnabled)
}

func TestClient_CatalogConnectDisconnect(t *testing.T) {
	t.Parallel()
	var methods []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/987654321/product_catalogs")
		assert.Equal(t, "555", r.URL.Query().Get("catalog_id"))
		methods = append(methods, r.Method)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true})
	}))
	defer server.Close()
	client := newTestClient(t, server)
	account := testAccount(server.URL)
	require.NoError(t, client.ConnectCatalog(context.Background(), account, "555"))
	require.NoError(t, client.DisconnectCatalog(context.Background(), account, "555"))
	assert.Equal(t, []string{http.MethodPost, http.MethodDelete}, methods)
}

func TestClient_CatalogOwnerBusinessAndList(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v21.0/987654321":
			assert.Equal(t, "owner_business_info", r.URL.Query().Get("fields"))
			_ = json.NewEncoder(w).Encode(map[string]any{"owner_business_info": map[string]any{"id": "42", "name": "Biz"}})
		case r.URL.Path == "/v21.0/42/owned_product_catalogs":
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "1", "name": "A"}}})
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
		}
	}))
	defer server.Close()
	client := newTestClient(t, server)
	account := testAccount(server.URL)
	owner, err := client.GetOwnerBusinessID(context.Background(), account)
	require.NoError(t, err)
	assert.Equal(t, "42", owner)
	list, err := client.ListBusinessCatalogs(context.Background(), account, owner)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "A", list[0].Name)
}

func TestClient_ProductItems_PagingAndFields(t *testing.T) {
	t.Parallel()
	page := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, whatsapp.ProductItemFields, r.URL.Query().Get("fields"))
		page++
		if page == 1 {
			assert.Empty(t, r.URL.Query().Get("after"))
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data":   []map[string]any{{"id": "p1", "retailer_id": "A", "price": "₹10.00"}},
				"paging": map[string]any{"cursors": map[string]any{"after": "CUR"}, "next": "https://graph/next"},
			})
			return
		}
		assert.Equal(t, "CUR", r.URL.Query().Get("after"))
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "p2", "retailer_id": "B"}}})
	}))
	defer server.Close()
	items, err := newTestClient(t, server).ListProductItems(context.Background(), testAccount(server.URL), "cat1", 0)
	require.NoError(t, err)
	require.Len(t, items, 2)
	assert.Equal(t, "p2", items[1].ID)
}

func TestClient_ProductItem_CreateUpdateBodies(t *testing.T) {
	t.Parallel()
	var bodies []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var b map[string]any
		_ = json.NewDecoder(r.Body).Decode(&b)
		bodies = append(bodies, b)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "prod-1", "success": true})
	}))
	defer server.Close()
	client := newTestClient(t, server)
	account := testAccount(server.URL)
	in := &whatsapp.ProductItemInput{RetailerID: "SKU", Name: "N", Price: 1000, Currency: "INR", Availability: "in stock", Condition: "new"}
	id, err := client.CreateProductItem(context.Background(), account, "cat", in)
	require.NoError(t, err)
	assert.Equal(t, "prod-1", id)
	assert.Equal(t, "SKU", bodies[0]["retailer_id"])
	assert.EqualValues(t, 1000, bodies[0]["price"])
	assert.NotContains(t, bodies[0], "brand")
	assert.NotContains(t, bodies[0], "sale_price")

	in.Brand = ""
	in.SalePrice = 500
	require.NoError(t, client.UpdateProductItem(context.Background(), account, "prod-1", in))
	assert.Equal(t, "", bodies[1]["brand"], "edits clear optional text fields")
	assert.EqualValues(t, 500, bodies[1]["sale_price"])
	assert.NotContains(t, bodies[1], "image_url", "empty links are never sent")
}

func TestClient_ProductPriceParse(t *testing.T) {
	t.Parallel()
	cases := map[string]int64{
		"₹1,999.00":  199900,
		"$19.99":     1999,
		"19.9":       1990,
		"1.234,50 €": 123450,
		"1999":       199900,
		"1.234.567":  123456700,
		"€5":         500,
		"":           0,
		"free":       0,
	}
	for in, want := range cases {
		assert.Equal(t, want, whatsapp.ParseMetaPrice(in), in)
	}
}
