package handlers_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/handlers"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/shridarpatil/whatomate/test/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
)

// fakeCommerceMeta is a fake Graph API that routes on "METHOD /path" (API
// version stripped) and records every call.
type fakeCommerceMeta struct {
	server *httptest.Server
	mu     sync.Mutex
	routes map[string]func(r *http.Request, body map[string]any) (int, any)
	calls  []fakeMetaCall
}

type fakeMetaCall struct {
	Method string
	Path   string
	Query  map[string]string
	Body   map[string]any
}

func newFakeCommerceMeta(t *testing.T) *fakeCommerceMeta {
	t.Helper()
	f := &fakeCommerceMeta{routes: map[string]func(*http.Request, map[string]any) (int, any){}}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if parts := strings.SplitN(strings.TrimPrefix(path, "/"), "/", 2); len(parts) == 2 && strings.HasPrefix(parts[0], "v") {
			path = "/" + parts[1]
		}
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		q := map[string]string{}
		for k, v := range r.URL.Query() {
			q[k] = v[0]
		}
		f.mu.Lock()
		f.calls = append(f.calls, fakeMetaCall{Method: r.Method, Path: path, Query: q, Body: body})
		h := f.routes[r.Method+" "+path]
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if h == nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "Unsupported request " + r.Method + " " + path, "code": 100}})
			return
		}
		status, resp := h(r, body)
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeCommerceMeta) on(method, path string, status int, resp any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.routes[method+" "+path] = func(*http.Request, map[string]any) (int, any) { return status, resp }
}

func (f *fakeCommerceMeta) find(method, path string) []fakeMetaCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []fakeMetaCall
	for _, c := range f.calls {
		if c.Method == method && c.Path == path {
			out = append(out, c)
		}
	}
	return out
}

func metaErr(msg string) map[string]any {
	return map[string]any{"error": map[string]any{"message": msg, "code": 100}}
}

type commerceFixture struct {
	app     *handlers.App
	meta    *fakeCommerceMeta
	org     *models.Organization
	user    *models.User
	account *models.WhatsAppAccount
}

func newCommerceFixture(t *testing.T) *commerceFixture {
	t.Helper()
	meta := newFakeCommerceMeta(t)
	app := newTestApp(t, withWhatsApp(whatsapp.NewWithBaseURL(testutil.NopLogger(), meta.server.URL)))
	org := testutil.CreateTestOrganization(t, app.DB)
	user := testutil.CreateTestUser(t, app.DB, org.ID)
	account := createCatalogTestAccount(t, app, org.ID)
	return &commerceFixture{app: app, meta: meta, org: org, user: user, account: account}
}

// uniqueMetaID returns a numeric Graph-style ID.
func uniqueMetaID() string {
	id := uuid.New()
	n := uint64(0)
	for _, b := range id[:7] {
		n = n<<8 | uint64(b)
	}
	return "9" + strconv.FormatUint(n, 10)
}

func decodeData[T any](t *testing.T, raw []byte) T {
	t.Helper()
	var env struct {
		Data T `json:"data"`
	}
	require.NoError(t, json.Unmarshal(raw, &env), string(raw))
	return env.Data
}

/* ------------------------------------------------------------- connect */

func TestApp_CatalogConnect_ConnectsAndDisconnects(t *testing.T) {
	f := newCommerceFixture(t)
	c1 := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Main")
	c2 := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Old")
	require.NoError(t, f.app.DB.Model(c2).Update("is_connected", true).Error)

	f.meta.on("POST", "/"+f.account.BusinessID+"/product_catalogs", 200, map[string]any{"success": true})
	f.meta.on("DELETE", "/"+f.account.BusinessID+"/product_catalogs", 200, map[string]any{"success": true})

	req := testutil.NewJSONRequest(t, map[string]any{})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c1.ID.String())
	require.NoError(t, f.app.ConnectCatalog(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	resp := decodeData[handlers.CatalogResponse](t, testutil.GetResponseBody(req))
	assert.True(t, resp.IsConnected)

	calls := f.meta.find("POST", "/"+f.account.BusinessID+"/product_catalogs")
	require.Len(t, calls, 1)
	assert.Equal(t, c1.MetaCatalogID, calls[0].Query["catalog_id"])

	var reloaded models.Catalog
	require.NoError(t, f.app.DB.First(&reloaded, "id = ?", c2.ID).Error)
	assert.False(t, reloaded.IsConnected, "a WABA has one connected catalogue")

	req = testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c1.ID.String())
	require.NoError(t, f.app.DisconnectCatalog(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.False(t, decodeData[handlers.CatalogResponse](t, testutil.GetResponseBody(req)).IsConnected)
	require.Len(t, f.meta.find("DELETE", "/"+f.account.BusinessID+"/product_catalogs"), 1)
}

func TestApp_CatalogConnect_MetaErrorIs502(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Main")
	f.meta.on("POST", "/"+f.account.BusinessID+"/product_catalogs", 400, metaErr("Catalog not owned by business"))

	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.ConnectCatalog(req))
	assert.Equal(t, fasthttp.StatusBadGateway, testutil.GetResponseStatusCode(req))
	assert.Contains(t, string(testutil.GetResponseBody(req)), "Catalog not owned by business")
}

func TestApp_CatalogLink_ByMetaID(t *testing.T) {
	f := newCommerceFixture(t)
	metaID := uniqueMetaID()
	f.meta.on("GET", "/"+metaID, 200, map[string]any{"id": metaID, "name": "Commerce Manager shop"})
	f.meta.on("POST", "/"+f.account.BusinessID+"/product_catalogs", 200, map[string]any{"success": true})

	req := testutil.NewJSONRequest(t, map[string]any{"whatsapp_account": f.account.Name, "meta_catalog_id": metaID})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	require.NoError(t, f.app.LinkCatalog(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	resp := decodeData[handlers.CatalogResponse](t, testutil.GetResponseBody(req))
	assert.Equal(t, "Commerce Manager shop", resp.Name)
	assert.Equal(t, metaID, resp.MetaCatalogID)
	assert.True(t, resp.IsConnected)

	// Bad IDs are refused before calling Meta.
	for _, bad := range []string{"", "abc", "12"} {
		req = testutil.NewJSONRequest(t, map[string]any{"whatsapp_account": f.account.Name, "meta_catalog_id": bad})
		testutil.SetAuthContext(req, f.org.ID, f.user.ID)
		require.NoError(t, f.app.LinkCatalog(req))
		assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req), bad)
	}
}

func TestApp_CatalogSync_UsesOwnerBusinessAndMarksConnected(t *testing.T) {
	f := newCommerceFixture(t)
	owned, connected := uniqueMetaID(), uniqueMetaID()
	f.meta.on("GET", "/"+f.account.BusinessID, 200, map[string]any{"owner_business_info": map[string]any{"id": "77001", "name": "Biz"}})
	f.meta.on("GET", "/77001/owned_product_catalogs", 200, map[string]any{"data": []map[string]any{
		{"id": owned, "name": "Owned"}, {"id": connected, "name": "Shop"},
	}})
	f.meta.on("GET", "/"+f.account.BusinessID+"/product_catalogs", 200, map[string]any{"data": []map[string]any{{"id": connected, "name": "Shop"}}})

	req := testutil.NewJSONRequest(t, map[string]any{"whatsapp_account": f.account.Name})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	require.NoError(t, f.app.SyncCatalogs(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	var cats []models.Catalog
	require.NoError(t, f.app.DB.Where("organization_id = ?", f.org.ID).Order("name").Find(&cats).Error)
	require.Len(t, cats, 2)
	assert.Equal(t, "Owned", cats[0].Name)
	assert.False(t, cats[0].IsConnected)
	assert.Equal(t, "Shop", cats[1].Name)
	assert.True(t, cats[1].IsConnected)
}

func TestApp_CatalogAvailable_ListsWithLocalIDs(t *testing.T) {
	f := newCommerceFixture(t)
	local := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Here")
	other := uniqueMetaID()
	f.meta.on("GET", "/"+f.account.BusinessID, 200, map[string]any{"owner_business_info": map[string]any{"id": "77002"}})
	f.meta.on("GET", "/77002/owned_product_catalogs", 200, map[string]any{"data": []map[string]any{
		{"id": local.MetaCatalogID, "name": "Here"}, {"id": other, "name": "Elsewhere"},
	}})
	f.meta.on("GET", "/"+f.account.BusinessID+"/product_catalogs", 200, map[string]any{"data": []any{}})

	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetQueryParam(req, "whatsapp_account", f.account.Name)
	require.NoError(t, f.app.ListAvailableCatalogs(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	data := decodeData[struct {
		Catalogs []handlers.AvailableCatalogResponse `json:"catalogs"`
	}](t, testutil.GetResponseBody(req))
	require.Len(t, data.Catalogs, 2)
	require.NotNil(t, data.Catalogs[0].LocalID)
	assert.Equal(t, local.ID, *data.Catalogs[0].LocalID)
	assert.Nil(t, data.Catalogs[1].LocalID)
}

/* --------------------------------------------------- commerce settings */

func TestApp_CommerceSettings_GetAndPartialUpdate(t *testing.T) {
	f := newCommerceFixture(t)
	path := "/" + f.account.PhoneID + "/whatsapp_commerce_settings"
	f.meta.on("GET", path, 200, map[string]any{"data": []map[string]any{{"id": "1", "is_catalog_visible": true, "is_cart_enabled": false}}})
	f.meta.on("POST", path, 200, map[string]any{"success": true})

	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetQueryParam(req, "whatsapp_account", f.account.Name)
	require.NoError(t, f.app.GetCommerceSettings(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	got := decodeData[handlers.CommerceSettingsResponse](t, testutil.GetResponseBody(req))
	assert.True(t, got.IsCatalogVisible)
	assert.False(t, got.IsCartEnabled)

	// Only the cart flag is sent: the visible flag keeps Meta's current value.
	req = testutil.NewJSONRequest(t, map[string]any{"whatsapp_account": f.account.Name, "is_cart_enabled": true})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	require.NoError(t, f.app.UpdateCommerceSettings(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	got = decodeData[handlers.CommerceSettingsResponse](t, testutil.GetResponseBody(req))
	assert.True(t, got.IsCatalogVisible)
	assert.True(t, got.IsCartEnabled)

	posts := f.meta.find("POST", path)
	require.Len(t, posts, 1)
	assert.Equal(t, "true", posts[0].Query["is_catalog_visible"])
	assert.Equal(t, "true", posts[0].Query["is_cart_enabled"])

	// Nothing to change.
	req = testutil.NewJSONRequest(t, map[string]any{"whatsapp_account": f.account.Name})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	require.NoError(t, f.app.UpdateCommerceSettings(req))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

/* ------------------------------------------------------------- products */

func TestApp_ProductCreate_FullFieldsSentToMeta(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	f.meta.on("POST", "/"+c.MetaCatalogID+"/products", 200, map[string]any{"id": uniqueMetaID()})

	req := testutil.NewJSONRequest(t, map[string]any{
		"name": "Kurta", "price": 199900, "sale_price": 149900, "retailer_id": "KURTA-1",
		"availability": "In Stock", "condition": "new", "brand": "Acme", "category": "Apparel",
		"image_url": "https://img.example.com/k.jpg", "url": "https://shop.example.com/k",
	})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.CreateCatalogProduct(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	p := decodeData[handlers.CatalogProductResponse](t, testutil.GetResponseBody(req))
	assert.Equal(t, "INR", p.Currency)
	assert.Equal(t, "in stock", p.Availability)
	assert.Equal(t, models.ProductSyncSynced, p.SyncStatus)
	assert.NotEmpty(t, p.MetaProductID)

	calls := f.meta.find("POST", "/"+c.MetaCatalogID+"/products")
	require.Len(t, calls, 1)
	b := calls[0].Body
	assert.Equal(t, "KURTA-1", b["retailer_id"])
	assert.EqualValues(t, 199900, b["price"])
	assert.EqualValues(t, 149900, b["sale_price"])
	assert.Equal(t, "INR", b["currency"])
	assert.Equal(t, "Acme", b["brand"])
	assert.Equal(t, "in stock", b["availability"])
}

func TestApp_ProductCreate_MetaFailureKeepsLocalCopyWithError(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	f.meta.on("POST", "/"+c.MetaCatalogID+"/products", 400, metaErr("Invalid image URL"))

	req := testutil.NewJSONRequest(t, map[string]any{"name": "Mug", "price": 50000, "retailer_id": "MUG-1"})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.CreateCatalogProduct(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	p := decodeData[handlers.CatalogProductResponse](t, testutil.GetResponseBody(req))
	assert.Equal(t, models.ProductSyncError, p.SyncStatus)
	assert.Contains(t, p.SyncError, "Invalid image URL")
	assert.Empty(t, p.MetaProductID)

	// A second unsynced product (empty Meta ID) is fine too.
	req = testutil.NewJSONRequest(t, map[string]any{"name": "Cup", "price": 40000, "retailer_id": "CUP-1"})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.CreateCatalogProduct(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))

	// Retry once Meta accepts it.
	f.meta.on("POST", "/"+c.MetaCatalogID+"/products", 200, map[string]any{"id": uniqueMetaID()})
	req = testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	testutil.SetPathParam(req, "productId", p.ID.String())
	require.NoError(t, f.app.PushCatalogProduct(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	pushed := decodeData[handlers.CatalogProductResponse](t, testutil.GetResponseBody(req))
	assert.Equal(t, models.ProductSyncSynced, pushed.SyncStatus)
	assert.Empty(t, pushed.SyncError)
	assert.NotEmpty(t, pushed.MetaProductID)
}

func TestApp_ProductCreate_ValidationAndDuplicateSKU(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	f.meta.on("POST", "/"+c.MetaCatalogID+"/products", 200, map[string]any{"id": uniqueMetaID()})

	bad := []map[string]any{
		{"name": "X", "price": 100, "availability": "sometimes"},
		{"name": "X", "price": 100, "condition": "broken"},
		{"name": "X", "price": 100, "sale_price": 100},
		{"name": "X", "price": 100, "currency": "RUPEES"},
		{"name": "X", "price": 100, "image_url": "not a url"},
		{"name": "X", "price": 100, "url": "ftp://example.com"},
		{"name": strings.Repeat("a", 151), "price": 100},
	}
	for i, body := range bad {
		req := testutil.NewJSONRequest(t, body)
		testutil.SetAuthContext(req, f.org.ID, f.user.ID)
		testutil.SetPathParam(req, "id", c.ID.String())
		require.NoError(t, f.app.CreateCatalogProduct(req))
		assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req), "case %d", i)
	}
	assert.Empty(t, f.meta.find("POST", "/"+c.MetaCatalogID+"/products"), "invalid products never reach Meta")

	for i, want := range []int{fasthttp.StatusOK, fasthttp.StatusConflict} {
		req := testutil.NewJSONRequest(t, map[string]any{"name": "Same", "price": 100, "retailer_id": "DUP"})
		testutil.SetAuthContext(req, f.org.ID, f.user.ID)
		testutil.SetPathParam(req, "id", c.ID.String())
		require.NoError(t, f.app.CreateCatalogProduct(req))
		assert.Equal(t, want, testutil.GetResponseStatusCode(req), "attempt %d", i)
	}
}

func TestApp_ProductUpdate_ClearsFieldAndPushes(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	p := createTestCatalogProduct(t, f.app, f.org.ID, c.ID, "Lamp", 1000)
	f.meta.on("POST", "/"+p.MetaProductID, 200, map[string]any{"success": true})

	req := testutil.NewJSONRequest(t, map[string]any{"description": "", "availability": "out of stock"})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", p.ID.String())
	require.NoError(t, f.app.UpdateCatalogProduct(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	got := decodeData[handlers.CatalogProductResponse](t, testutil.GetResponseBody(req))
	assert.Empty(t, got.Description)
	assert.Equal(t, "out of stock", got.Availability)
	assert.Equal(t, "Lamp", got.Name)
	calls := f.meta.find("POST", "/"+p.MetaProductID)
	require.Len(t, calls, 1)
	assert.Equal(t, "out of stock", calls[0].Body["availability"])
}

func TestApp_CatalogProductsSync_FromMeta(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	gone := createTestCatalogProduct(t, f.app, f.org.ID, c.ID, "Gone", 1000)
	keep := createTestCatalogProduct(t, f.app, f.org.ID, c.ID, "Old name", 1000)
	newID := uniqueMetaID()
	f.meta.on("GET", "/"+c.MetaCatalogID+"/products", 200, map[string]any{"data": []map[string]any{
		{"id": keep.MetaProductID, "retailer_id": keep.RetailerID, "name": "New name", "price": "₹1,999.00", "currency": "INR", "availability": "in stock"},
		{"id": newID, "retailer_id": "FRESH", "name": "Fresh", "price": "$19.99", "sale_price": "$9.50", "currency": "USD", "availability": "out of stock", "condition": "new"},
	}})

	req := testutil.NewJSONRequest(t, map[string]any{})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.SyncCatalogProducts(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	res := decodeData[map[string]any](t, testutil.GetResponseBody(req))
	assert.EqualValues(t, 1, res["created"])
	assert.EqualValues(t, 1, res["updated"])
	assert.EqualValues(t, 1, res["missing"])

	var k, fresh, g models.CatalogProduct
	require.NoError(t, f.app.DB.First(&k, "id = ?", keep.ID).Error)
	assert.Equal(t, "New name", k.Name)
	assert.EqualValues(t, 199900, k.Price)
	require.NoError(t, f.app.DB.First(&fresh, "meta_product_id = ?", newID).Error)
	assert.EqualValues(t, 1999, fresh.Price)
	assert.EqualValues(t, 950, fresh.SalePrice)
	assert.Equal(t, "out of stock", fresh.Availability)
	require.NoError(t, f.app.DB.First(&g, "id = ?", gone.ID).Error)
	assert.Equal(t, models.ProductSyncError, g.SyncStatus)
}

func TestApp_ProductImport_DryRunThenCommit(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	existing := createTestCatalogProduct(t, f.app, f.org.ID, c.ID, "Existing", 1000)
	f.meta.on("POST", "/"+c.MetaCatalogID+"/products", 200, map[string]any{"id": uniqueMetaID()})
	f.meta.on("POST", "/"+existing.MetaProductID, 200, map[string]any{"success": true})

	csvText := "sku,name,description,price,currency,image_url,url,availability\n" +
		"NEW-1,Tea,Green tea,\"1,299.50\",,https://img.example.com/t.jpg,https://shop.example.com/t,in stock\n" +
		existing.RetailerID + ",Existing renamed,,25,INR,,,out of stock\n" +
		",No SKU,,10,,,,\n" +
		"BAD-PRICE,Bad,,abc,,,,\n" +
		"NEW-1,Dup,,10,,,,\n" +
		"\n"

	run := func(dry bool) map[string]any {
		req := testutil.NewJSONRequest(t, map[string]any{"csv": csvText, "dry_run": dry})
		testutil.SetAuthContext(req, f.org.ID, f.user.ID)
		testutil.SetPathParam(req, "id", c.ID.String())
		require.NoError(t, f.app.ImportCatalogProducts(req))
		require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
		return decodeData[map[string]any](t, testutil.GetResponseBody(req))
	}

	preview := run(true)
	assert.EqualValues(t, 5, preview["total"])
	assert.EqualValues(t, 2, preview["valid"])
	assert.EqualValues(t, 3, preview["invalid"])
	rows := preview["rows"].([]any)
	first := rows[0].(map[string]any)
	assert.Equal(t, "create", first["action"])
	assert.EqualValues(t, 129950, first["price"])
	assert.Equal(t, "INR", first["currency"])
	assert.Equal(t, "update", rows[1].(map[string]any)["action"])
	assert.Contains(t, rows[4].(map[string]any)["error"], "Duplicate")
	assert.Empty(t, f.meta.calls, "a dry run never calls Meta")

	var count int64
	f.app.DB.Model(&models.CatalogProduct{}).Where("catalog_id = ?", c.ID).Count(&count)
	assert.EqualValues(t, 1, count)

	done := run(false)
	assert.EqualValues(t, 1, done["created"])
	assert.EqualValues(t, 1, done["updated"])
	f.app.DB.Model(&models.CatalogProduct{}).Where("catalog_id = ?", c.ID).Count(&count)
	assert.EqualValues(t, 2, count)
	var ex models.CatalogProduct
	require.NoError(t, f.app.DB.First(&ex, "id = ?", existing.ID).Error)
	assert.Equal(t, "Existing renamed", ex.Name)
	assert.EqualValues(t, 2500, ex.Price)
	assert.Equal(t, "out of stock", ex.Availability)

	// Missing required columns.
	req := testutil.NewJSONRequest(t, map[string]any{"csv": "name,price\nA,1\n", "dry_run": true})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.ImportCatalogProducts(req))
	assert.Equal(t, fasthttp.StatusBadRequest, testutil.GetResponseStatusCode(req))
}

func TestApp_ProductPicker_OnlyConnectedSyncedProducts(t *testing.T) {
	f := newCommerceFixture(t)
	connected := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	require.NoError(t, f.app.DB.Model(connected).Update("is_connected", true).Error)
	notConnected := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Draft")

	p1 := createTestCatalogProduct(t, f.app, f.org.ID, connected.ID, "Blue shirt", 129900)
	createTestCatalogProduct(t, f.app, f.org.ID, connected.ID, "Red shirt", 99900)
	unsynced := createTestCatalogProduct(t, f.app, f.org.ID, connected.ID, "Blue cap", 500)
	require.NoError(t, f.app.DB.Model(unsynced).Update("meta_product_id", "").Error)
	createTestCatalogProduct(t, f.app, f.org.ID, notConnected.ID, "Blue draft", 500)

	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetQueryParam(req, "search", "blue")
	require.NoError(t, f.app.ProductPicker(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	data := decodeData[struct {
		Products []handlers.ProductPickerItem `json:"products"`
	}](t, testutil.GetResponseBody(req))
	require.Len(t, data.Products, 1)
	got := data.Products[0]
	assert.Equal(t, connected.MetaCatalogID, got.CatalogID)
	assert.Equal(t, p1.RetailerID, got.ProductRetailerID)
	assert.Equal(t, "Blue shirt", got.Name)
	assert.EqualValues(t, 129900, got.Price)
	assert.Equal(t, "USD 1,299.00", got.PriceText)
	assert.Equal(t, p1.ImageURL, got.ImageURL)
}

func TestApp_CatalogDelete_KeepsMetaUnlessAsked(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	createTestCatalogProduct(t, f.app, f.org.ID, c.ID, "P", 100)

	req := testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.DeleteCatalog(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Empty(t, f.meta.find("DELETE", "/"+c.MetaCatalogID))

	// Removed for good, so a later sync/link can add it again.
	var n int64
	f.app.DB.Unscoped().Model(&models.Catalog{}).Where("id = ?", c.ID).Count(&n)
	assert.Zero(t, n)

	c2 := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop 2")
	f.meta.on("DELETE", "/"+c2.MetaCatalogID, 200, map[string]any{"success": true})
	req = testutil.NewGETRequest(t)
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c2.ID.String())
	testutil.SetQueryParam(req, "delete_in_meta", "true")
	require.NoError(t, f.app.DeleteCatalog(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req))
	assert.Len(t, f.meta.find("DELETE", "/"+c2.MetaCatalogID), 1)
}

func TestApp_CatalogProductSets_CreateWithSKUFilter(t *testing.T) {
	f := newCommerceFixture(t)
	c := createTestCatalog(t, f.app, f.org.ID, f.account.Name, "Shop")
	f.meta.on("POST", "/"+c.MetaCatalogID+"/product_sets", 200, map[string]any{"id": "55501"})

	req := testutil.NewJSONRequest(t, map[string]any{"name": "Summer", "retailer_ids": []string{"A", " ", "B"}})
	testutil.SetAuthContext(req, f.org.ID, f.user.ID)
	testutil.SetPathParam(req, "id", c.ID.String())
	require.NoError(t, f.app.CreateProductSet(req))
	require.Equal(t, fasthttp.StatusOK, testutil.GetResponseStatusCode(req), string(testutil.GetResponseBody(req)))
	calls := f.meta.find("POST", "/"+c.MetaCatalogID+"/product_sets")
	require.Len(t, calls, 1)
	assert.Equal(t, "Summer", calls[0].Body["name"])
	assert.JSONEq(t, `{"retailer_id":{"is_any":["A","B"]}}`, calls[0].Body["filter"].(string))
}
