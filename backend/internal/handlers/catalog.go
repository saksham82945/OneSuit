package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Catalogues are Meta Commerce catalogues. We keep a local copy of each
// catalogue and its products; every product change is saved here first and
// then pushed to Meta, with the outcome kept per product (sync_status /
// sync_error) so the UI can show what didn't reach Meta and retry it.
//
// Account.BusinessID is the WABA ID. Catalogues belong to the business that
// owns the WABA (owner_business_info), and one catalogue at a time can be
// connected to the WABA (shown on the WhatsApp profile, used in product
// messages). See catalog_commerce.go for connect / commerce settings /
// import / picker endpoints.

// CatalogRequest represents the request body for creating a catalog
type CatalogRequest struct {
	WhatsAppAccount string `json:"whatsapp_account"`
	Name            string `json:"name"`
	// Connect the new catalogue to the account's WABA straight away.
	Connect bool `json:"connect"`
}

// CatalogResponse represents the API response for a catalog
type CatalogResponse struct {
	ID              uuid.UUID                `json:"id"`
	MetaCatalogID   string                   `json:"meta_catalog_id"`
	WhatsAppAccount string                   `json:"whatsapp_account"`
	Name            string                   `json:"name"`
	IsActive        bool                     `json:"is_active"`
	IsConnected     bool                     `json:"is_connected"`
	ProductCount    int                      `json:"product_count"`
	SyncErrorCount  int                      `json:"sync_error_count"`
	LastSyncedAt    *string                  `json:"last_synced_at"`
	Products        []CatalogProductResponse `json:"products,omitempty"`
	CreatedAt       string                   `json:"created_at"`
	UpdatedAt       string                   `json:"updated_at"`
}

// CatalogProductRequest represents the request body for creating a product.
// Prices are in the currency's smallest unit (cents / paise).
type CatalogProductRequest struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Price        int64  `json:"price"`
	SalePrice    int64  `json:"sale_price"`
	Currency     string `json:"currency"`
	Availability string `json:"availability"`
	Condition    string `json:"condition"`
	Brand        string `json:"brand"`
	Category     string `json:"category"`
	URL          string `json:"url"`
	ImageURL     string `json:"image_url"`
	RetailerID   string `json:"retailer_id"` // SKU
}

// CatalogProductUpdateRequest updates a product; omitted fields are kept,
// fields sent as "" (or 0 for sale_price) are cleared.
type CatalogProductUpdateRequest struct {
	Name         *string `json:"name"`
	Description  *string `json:"description"`
	Price        *int64  `json:"price"`
	SalePrice    *int64  `json:"sale_price"`
	Currency     *string `json:"currency"`
	Availability *string `json:"availability"`
	Condition    *string `json:"condition"`
	Brand        *string `json:"brand"`
	Category     *string `json:"category"`
	URL          *string `json:"url"`
	ImageURL     *string `json:"image_url"`
	RetailerID   *string `json:"retailer_id"`
	IsActive     *bool   `json:"is_active"`
}

// CatalogProductResponse represents the API response for a product
type CatalogProductResponse struct {
	ID            uuid.UUID `json:"id"`
	CatalogID     uuid.UUID `json:"catalog_id"`
	MetaProductID string    `json:"meta_product_id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Price         int64     `json:"price"`
	SalePrice     int64     `json:"sale_price"`
	Currency      string    `json:"currency"`
	Availability  string    `json:"availability"`
	Condition     string    `json:"condition"`
	Brand         string    `json:"brand"`
	Category      string    `json:"category"`
	URL           string    `json:"url"`
	ImageURL      string    `json:"image_url"`
	RetailerID    string    `json:"retailer_id"`
	IsActive      bool      `json:"is_active"`
	SyncStatus    string    `json:"sync_status"`
	SyncError     string    `json:"sync_error"`
	LastSyncedAt  *string   `json:"last_synced_at"`
	CreatedAt     string    `json:"created_at"`
	UpdatedAt     string    `json:"updated_at"`
}

// SyncCatalogsRequest represents the request body for syncing catalogs
type SyncCatalogsRequest struct {
	WhatsAppAccount string `json:"whatsapp_account"`
}

// Allowed values (Meta catalog item fields).
var (
	productAvailabilities = []string{"in stock", "out of stock", "preorder", "available for order", "discontinued"}
	productConditions     = []string{"new", "refurbished", "used"}
	currencyRe            = regexp.MustCompile(`^[A-Z]{3}$`)
)

const (
	defaultProductCurrency = "INR"
	maxProductPrice        = int64(100_000_000_000) // 1 billion in major units
)

/* ------------------------------------------------------------------ helpers */

func formatAPITime(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05Z") }

func formatAPITimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := formatAPITime(*t)
	return &s
}

// metaErrText turns a Meta client error into a short message for users.
func metaErrText(err error) string {
	msg := err.Error()
	if len(msg) > 400 {
		msg = msg[:400] + "…"
	}
	return msg
}

// sendMetaError reports a failed Meta call (502: Meta, not this server, refused).
func sendMetaError(r *fastglue.Request, prefix string, err error) error {
	return r.SendErrorEnvelope(fasthttp.StatusBadGateway, prefix+": "+metaErrText(err), nil, "")
}

func isHTTPURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func newRetailerID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "SKU-" + strings.ToUpper(hex.EncodeToString(b))
}

func containsStr(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// normalizeProduct trims and defaults a product's fields and returns a
// validation message, or "" when the product is valid.
func normalizeProduct(p *models.CatalogProduct) string {
	p.Name = strings.TrimSpace(p.Name)
	p.Description = strings.TrimSpace(p.Description)
	p.Currency = strings.ToUpper(strings.TrimSpace(p.Currency))
	p.Availability = strings.ToLower(strings.TrimSpace(p.Availability))
	p.Condition = strings.ToLower(strings.TrimSpace(p.Condition))
	p.Brand = strings.TrimSpace(p.Brand)
	p.Category = strings.TrimSpace(p.Category)
	p.URL = strings.TrimSpace(p.URL)
	p.ImageURL = strings.TrimSpace(p.ImageURL)
	p.RetailerID = strings.TrimSpace(p.RetailerID)
	if p.Currency == "" {
		p.Currency = defaultProductCurrency
	}
	if p.Availability == "" {
		p.Availability = "in stock"
	}
	if p.Condition == "" {
		p.Condition = "new"
	}

	switch {
	case p.Name == "":
		return "name is required"
	case len([]rune(p.Name)) > 150:
		return "name must be 150 characters or fewer"
	case p.Price <= 0:
		return "price is required and must be more than 0"
	case p.Price > maxProductPrice:
		return "price is too large"
	case p.SalePrice < 0:
		return "sale_price can't be negative"
	case p.SalePrice > 0 && p.SalePrice >= p.Price:
		return "sale_price must be lower than price"
	case !currencyRe.MatchString(p.Currency):
		return "currency must be a 3-letter ISO code like INR"
	case !containsStr(productAvailabilities, p.Availability):
		return "availability must be one of: " + strings.Join(productAvailabilities, ", ")
	case !containsStr(productConditions, p.Condition):
		return "condition must be one of: " + strings.Join(productConditions, ", ")
	case len([]rune(p.Description)) > 9999:
		return "description must be 9999 characters or fewer"
	case len(p.RetailerID) > 100:
		return "retailer_id (SKU) must be 100 characters or fewer"
	case strings.ContainsAny(p.RetailerID, "\r\n\t"):
		return "retailer_id (SKU) can't contain line breaks or tabs"
	case len(p.Brand) > 100:
		return "brand must be 100 characters or fewer"
	case len(p.Category) > 250:
		return "category must be 250 characters or fewer"
	case len(p.URL) > 500 || len(p.ImageURL) > 500:
		return "links must be 500 characters or fewer"
	case p.URL != "" && !isHTTPURL(p.URL):
		return "url must be a full link starting with https://"
	case p.ImageURL != "" && !isHTTPURL(p.ImageURL):
		return "image_url must be a full link starting with https://"
	}
	return ""
}

func toProductItemInput(p *models.CatalogProduct) *whatsapp.ProductItemInput {
	return &whatsapp.ProductItemInput{
		RetailerID:   p.RetailerID,
		Name:         p.Name,
		Description:  p.Description,
		Price:        p.Price,
		SalePrice:    p.SalePrice,
		Currency:     p.Currency,
		Availability: p.Availability,
		Condition:    p.Condition,
		ImageURL:     p.ImageURL,
		URL:          p.URL,
		Brand:        p.Brand,
		Category:     p.Category,
	}
}

// pushProductToMeta creates or updates the product in the Meta catalogue and
// records the outcome on the product (the caller saves it).
func (a *App) pushProductToMeta(ctx context.Context, wa *whatsapp.Account, catalog *models.Catalog, p *models.CatalogProduct) error {
	in := toProductItemInput(p)
	var err error
	if p.MetaProductID == "" {
		var id string
		id, err = a.WhatsApp.CreateProductItem(ctx, wa, catalog.MetaCatalogID, in)
		if err == nil {
			p.MetaProductID = id
		}
	} else {
		err = a.WhatsApp.UpdateProductItem(ctx, wa, p.MetaProductID, in)
	}
	if err != nil {
		p.SyncStatus = models.ProductSyncError
		p.SyncError = metaErrText(err)
		return err
	}
	now := time.Now()
	p.SyncStatus = models.ProductSyncSynced
	p.SyncError = ""
	p.LastSyncedAt = &now
	return nil
}

// catalogWAAccount resolves the catalogue's WhatsApp account for Meta calls.
func (a *App) catalogWAAccount(orgID uuid.UUID, accountName string) (*models.WhatsAppAccount, *whatsapp.Account, error) {
	if accountName == "" {
		return nil, nil, errNoCatalogAccount
	}
	account, err := a.resolveWhatsAppAccount(orgID, accountName)
	if err != nil {
		return nil, nil, err
	}
	return account, a.toWhatsAppAccount(account), nil
}

// ownerBusinessAccount returns a copy of the account whose BusinessID is the
// business that owns the WABA (falls back to the WABA ID when Meta doesn't
// say, e.g. older tokens without business_management).
func (a *App) ownerBusinessAccount(ctx context.Context, wa *whatsapp.Account) *whatsapp.Account {
	cp := *wa
	if owner, err := a.WhatsApp.GetOwnerBusinessID(ctx, wa); err == nil && owner != "" {
		cp.BusinessID = owner
	}
	return &cp
}

func (a *App) productCounts(catalogIDs []uuid.UUID) (total, errs map[uuid.UUID]int) {
	total, errs = map[uuid.UUID]int{}, map[uuid.UUID]int{}
	if len(catalogIDs) == 0 {
		return
	}
	var rows []struct {
		CatalogID uuid.UUID
		Total     int
		Errs      int
	}
	a.DB.Model(&models.CatalogProduct{}).
		Select("catalog_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE sync_status = ?) AS errs", models.ProductSyncError).
		Where("catalog_id IN ?", catalogIDs).Group("catalog_id").Scan(&rows)
	for _, r := range rows {
		total[r.CatalogID] = r.Total
		errs[r.CatalogID] = r.Errs
	}
	return
}

/* ---------------------------------------------------------------- catalogs */

// ListCatalogs returns all catalogs for the organization
func (a *App) ListCatalogs(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	whatsAppAccount := string(r.RequestCtx.QueryArgs().Peek("whatsapp_account"))

	query := a.DB.Where("organization_id = ?", orgID)
	if whatsAppAccount != "" {
		query = query.Where("whats_app_account = ?", whatsAppAccount)
	}

	var catalogs []models.Catalog
	if err := query.Order("name ASC").Find(&catalogs).Error; err != nil {
		a.Log.Error("Failed to list catalogs", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list catalogs", nil, "")
	}

	ids := make([]uuid.UUID, len(catalogs))
	for i, c := range catalogs {
		ids[i] = c.ID
	}
	totals, errs := a.productCounts(ids)

	result := make([]CatalogResponse, len(catalogs))
	for i, c := range catalogs {
		result[i] = catalogToResponse(c, totals[c.ID])
		result[i].SyncErrorCount = errs[c.ID]
	}

	return r.SendEnvelope(map[string]any{
		"catalogs": result,
	})
}

// CreateCatalog creates a new catalog in Meta and stores it locally
func (a *App) CreateCatalog(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var req CatalogRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.Name = strings.TrimSpace(req.Name)

	if req.Name == "" || req.WhatsAppAccount == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "name and whatsapp_account are required", nil, "")
	}
	if len([]rune(req.Name)) > 255 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "name must be 255 characters or fewer", nil, "")
	}

	_, waAccount, err := a.catalogWAAccount(orgID, req.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}

	ctx := context.Background()
	metaCatalogID, err := a.WhatsApp.CreateCatalog(ctx, a.ownerBusinessAccount(ctx, waAccount), req.Name)
	if err != nil {
		a.Log.Error("Failed to create catalog in Meta", "error", err)
		return sendMetaError(r, "Failed to create catalog", err)
	}

	catalog := models.Catalog{
		OrganizationID:  orgID,
		WhatsAppAccount: req.WhatsAppAccount,
		MetaCatalogID:   metaCatalogID,
		Name:            req.Name,
		IsActive:        true,
	}
	if req.Connect {
		if err := a.WhatsApp.ConnectCatalog(ctx, waAccount, metaCatalogID); err != nil {
			a.Log.Warn("Created catalog but could not connect it", "error", err)
		} else {
			catalog.IsConnected = true
		}
	}

	if err := a.DB.Create(&catalog).Error; err != nil {
		a.Log.Error("Failed to save catalog", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save catalog", nil, "")
	}
	if catalog.IsConnected {
		a.markOnlyConnected(orgID, catalog.WhatsAppAccount, catalog.ID)
	}

	return r.SendEnvelope(catalogToResponse(catalog, 0))
}

// GetCatalog returns a single catalog with its products
func (a *App) GetCatalog(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "catalog")
	if err != nil {
		return nil
	}

	var catalog models.Catalog
	if err := a.DB.Where("id = ? AND organization_id = ?", id, orgID).
		Preload("Products").First(&catalog).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Catalog not found", nil, "")
	}

	resp := catalogToResponse(catalog, len(catalog.Products))
	resp.Products = make([]CatalogProductResponse, len(catalog.Products))
	for i, p := range catalog.Products {
		resp.Products[i] = productToResponse(p)
		if p.SyncStatus == models.ProductSyncError {
			resp.SyncErrorCount++
		}
	}

	return r.SendEnvelope(resp)
}

// DeleteCatalog removes a catalogue from this app. With ?delete_in_meta=true
// it is also deleted in Meta Commerce Manager (otherwise Meta is untouched).
func (a *App) DeleteCatalog(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "catalog")
	if err != nil {
		return nil
	}

	catalog, err := findByIDAndOrg[models.Catalog](a.DB, r, id, orgID, "Catalog")
	if err != nil {
		return nil
	}

	if string(r.RequestCtx.QueryArgs().Peek("delete_in_meta")) == "true" {
		_, waAccount, err := a.catalogWAAccount(orgID, catalog.WhatsAppAccount)
		if err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
		}
		if err := a.WhatsApp.DeleteCatalog(context.Background(), waAccount, catalog.MetaCatalogID); err != nil {
			a.Log.Error("Failed to delete catalog from Meta", "error", err)
			return sendMetaError(r, "Failed to delete catalog in Meta", err)
		}
	}

	a.DB.Unscoped().Where("catalog_id = ?", id).Delete(&models.CatalogProduct{})
	if err := a.DB.Unscoped().Delete(catalog).Error; err != nil {
		a.Log.Error("Failed to delete catalog", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete catalog", nil, "")
	}

	return r.SendEnvelope(map[string]string{"message": "Catalog deleted"})
}

// SyncCatalogs pulls the catalogues the account can use from Meta (those of
// the business owning the WABA, plus the one connected to the WABA) and
// records which one is connected.
func (a *App) SyncCatalogs(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var req SyncCatalogsRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	if req.WhatsAppAccount == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "whatsapp_account is required", nil, "")
	}

	_, waAccount, err := a.catalogWAAccount(orgID, req.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}

	ctx := context.Background()
	available, err := a.metaCatalogsForAccount(ctx, waAccount)
	if err != nil {
		a.Log.Error("Failed to fetch catalogs from Meta", "error", err)
		return sendMetaError(r, "Failed to fetch catalogs", err)
	}

	now := time.Now()
	synced := 0
	for _, mc := range available {
		var existing models.Catalog
		err := a.DB.Unscoped().Where("meta_catalog_id = ?", mc.ID).First(&existing).Error
		switch {
		case err != nil:
			catalog := models.Catalog{
				OrganizationID:  orgID,
				WhatsAppAccount: req.WhatsAppAccount,
				MetaCatalogID:   mc.ID,
				Name:            mc.Name,
				IsActive:        true,
				IsConnected:     mc.Connected,
				LastSyncedAt:    &now,
			}
			if err := a.DB.Create(&catalog).Error; err != nil {
				a.Log.Error("Failed to create synced catalog", "error", err, "meta_id", mc.ID)
				continue
			}
		case existing.OrganizationID != orgID:
			// Linked by another workspace; leave it alone.
			continue
		default:
			updates := map[string]any{
				"name": mc.Name, "is_connected": mc.Connected, "last_synced_at": now, "deleted_at": nil,
				"whats_app_account": req.WhatsAppAccount,
			}
			if mc.Name == "" {
				delete(updates, "name")
			}
			a.DB.Unscoped().Model(&existing).Updates(updates)
		}
		synced++
	}
	// Catalogues of this account Meta no longer lists as connected.
	connectedIDs := []string{""}
	for _, mc := range available {
		if mc.Connected {
			connectedIDs = append(connectedIDs, mc.ID)
		}
	}
	a.DB.Model(&models.Catalog{}).
		Where("organization_id = ? AND whats_app_account = ? AND meta_catalog_id NOT IN ?", orgID, req.WhatsAppAccount, connectedIDs).
		Update("is_connected", false)

	return r.SendEnvelope(map[string]any{
		"message": "Catalogs synced",
		"synced":  synced,
		"total":   len(available),
	})
}

/* ---------------------------------------------------------------- products */

// ListCatalogProducts returns a catalogue's products.
// Optional filters: ?search= (name / SKU), ?availability=, ?sync_status=.
func (a *App) ListCatalogProducts(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	catalogID, err := parsePathUUID(r, "id", "catalog")
	if err != nil {
		return nil
	}

	if _, err := findByIDAndOrg[models.Catalog](a.DB, r, catalogID, orgID, "Catalog"); err != nil {
		return nil
	}

	q := a.DB.Where("catalog_id = ? AND organization_id = ?", catalogID, orgID)
	args := r.RequestCtx.QueryArgs()
	if s := strings.TrimSpace(string(args.Peek("search"))); s != "" {
		like := "%" + escapeLike(s) + "%"
		q = q.Where("(name ILIKE ? OR retailer_id ILIKE ?)", like, like)
	}
	if v := string(args.Peek("availability")); v != "" {
		q = q.Where("availability = ?", v)
	}
	if v := string(args.Peek("sync_status")); v != "" {
		q = q.Where("sync_status = ?", v)
	}

	var products []models.CatalogProduct
	if err := q.Order("name ASC").Find(&products).Error; err != nil {
		a.Log.Error("Failed to list products", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list products", nil, "")
	}

	result := make([]CatalogProductResponse, len(products))
	for i, p := range products {
		result[i] = productToResponse(p)
	}

	return r.SendEnvelope(map[string]any{
		"products": result,
	})
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// skuTaken reports whether another product in the catalogue uses the SKU.
func (a *App) skuTaken(catalogID uuid.UUID, sku string, except uuid.UUID) bool {
	var n int64
	a.DB.Model(&models.CatalogProduct{}).
		Where("catalog_id = ? AND retailer_id = ? AND id <> ?", catalogID, sku, except).Count(&n)
	return n > 0
}

// CreateCatalogProduct creates a product: saved here, then pushed to Meta.
// A Meta failure keeps the product (sync_status "error", sync_error says why).
func (a *App) CreateCatalogProduct(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	catalogID, err := parsePathUUID(r, "id", "catalog")
	if err != nil {
		return nil
	}

	var req CatalogProductRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	product := models.CatalogProduct{
		OrganizationID: orgID,
		CatalogID:      catalogID,
		Name:           req.Name,
		Description:    req.Description,
		Price:          req.Price,
		SalePrice:      req.SalePrice,
		Currency:       req.Currency,
		Availability:   req.Availability,
		Condition:      req.Condition,
		Brand:          req.Brand,
		Category:       req.Category,
		URL:            req.URL,
		ImageURL:       req.ImageURL,
		RetailerID:     req.RetailerID,
		IsActive:       true,
		SyncStatus:     models.ProductSyncPending,
	}
	if msg := normalizeProduct(&product); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}

	catalog, err := findByIDAndOrg[models.Catalog](a.DB, r, catalogID, orgID, "Catalog")
	if err != nil {
		return nil
	}

	if product.RetailerID == "" {
		product.RetailerID = newRetailerID()
	}
	if a.skuTaken(catalogID, product.RetailerID, uuid.Nil) {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "A product with SKU "+product.RetailerID+" already exists in this catalogue", nil, "")
	}

	_, waAccount, err := a.catalogWAAccount(orgID, catalog.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}

	if err := a.DB.Create(&product).Error; err != nil {
		a.Log.Error("Failed to save product", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save product", nil, "")
	}

	if err := a.pushProductToMeta(context.Background(), waAccount, catalog, &product); err != nil {
		a.Log.Warn("Product saved but not pushed to Meta", "error", err, "product_id", product.ID)
	}
	if err := a.DB.Save(&product).Error; err != nil {
		a.Log.Error("Failed to save product sync state", "error", err)
	}

	return r.SendEnvelope(productToResponse(product))
}

// GetCatalogProduct returns a single product
func (a *App) GetCatalogProduct(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "product")
	if err != nil {
		return nil
	}

	product, err := findByIDAndOrg[models.CatalogProduct](a.DB, r, id, orgID, "Product")
	if err != nil {
		return nil
	}

	return r.SendEnvelope(productToResponse(*product))
}

// UpdateCatalogProduct updates a product here, then in Meta. Omitted fields
// keep their value. A Meta failure keeps the change (sync_status "error").
func (a *App) UpdateCatalogProduct(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "product")
	if err != nil {
		return nil
	}

	product, err := findByIDAndOrg[models.CatalogProduct](a.DB, r, id, orgID, "Product")
	if err != nil {
		return nil
	}

	var req CatalogProductUpdateRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}

	str := func(dst *string, v *string) {
		if v != nil {
			*dst = *v
		}
	}
	str(&product.Name, req.Name)
	str(&product.Description, req.Description)
	str(&product.Currency, req.Currency)
	str(&product.Availability, req.Availability)
	str(&product.Condition, req.Condition)
	str(&product.Brand, req.Brand)
	str(&product.Category, req.Category)
	str(&product.URL, req.URL)
	str(&product.ImageURL, req.ImageURL)
	if req.RetailerID != nil && strings.TrimSpace(*req.RetailerID) != "" {
		product.RetailerID = *req.RetailerID
	}
	if req.Price != nil {
		product.Price = *req.Price
	}
	if req.SalePrice != nil {
		product.SalePrice = *req.SalePrice
	}
	if req.IsActive != nil {
		product.IsActive = *req.IsActive
	}
	if msg := normalizeProduct(product); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	if a.skuTaken(product.CatalogID, product.RetailerID, product.ID) {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "A product with SKU "+product.RetailerID+" already exists in this catalogue", nil, "")
	}

	var catalog models.Catalog
	if err := a.DB.Where("id = ? AND organization_id = ?", product.CatalogID, orgID).First(&catalog).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Catalog not found", nil, "")
	}

	_, waAccount, err := a.catalogWAAccount(orgID, catalog.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}

	if err := a.pushProductToMeta(context.Background(), waAccount, &catalog, product); err != nil {
		a.Log.Warn("Product updated here but not in Meta", "error", err, "product_id", product.ID)
	}

	if err := a.DB.Save(product).Error; err != nil {
		a.Log.Error("Failed to save product", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save product", nil, "")
	}

	return r.SendEnvelope(productToResponse(*product))
}

// DeleteCatalogProduct deletes a product in Meta (when it is there) and here.
func (a *App) DeleteCatalogProduct(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	id, err := parsePathUUID(r, "id", "product")
	if err != nil {
		return nil
	}

	product, err := findByIDAndOrg[models.CatalogProduct](a.DB, r, id, orgID, "Product")
	if err != nil {
		return nil
	}

	if product.MetaProductID != "" {
		var catalog models.Catalog
		if err := a.DB.Where("id = ?", product.CatalogID).First(&catalog).Error; err == nil {
			if _, waAccount, err := a.catalogWAAccount(orgID, catalog.WhatsAppAccount); err == nil {
				if err := a.WhatsApp.DeleteProduct(context.Background(), waAccount, product.MetaProductID); err != nil {
					// Already gone in Meta, or a token problem: the local copy is removed anyway.
					a.Log.Error("Failed to delete product from Meta", "error", err)
				}
			}
		}
	}

	if err := a.DB.Unscoped().Delete(product).Error; err != nil {
		a.Log.Error("Failed to delete product", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete product", nil, "")
	}

	return r.SendEnvelope(map[string]string{"message": "Product deleted"})
}

// Helper functions

func catalogToResponse(c models.Catalog, productCount int) CatalogResponse {
	return CatalogResponse{
		ID:              c.ID,
		MetaCatalogID:   c.MetaCatalogID,
		WhatsAppAccount: c.WhatsAppAccount,
		Name:            c.Name,
		IsActive:        c.IsActive,
		IsConnected:     c.IsConnected,
		ProductCount:    productCount,
		LastSyncedAt:    formatAPITimePtr(c.LastSyncedAt),
		CreatedAt:       formatAPITime(c.CreatedAt),
		UpdatedAt:       formatAPITime(c.UpdatedAt),
	}
}

func productToResponse(p models.CatalogProduct) CatalogProductResponse {
	status := p.SyncStatus
	if status == "" {
		status = models.ProductSyncSynced
	}
	return CatalogProductResponse{
		ID:            p.ID,
		CatalogID:     p.CatalogID,
		MetaProductID: p.MetaProductID,
		Name:          p.Name,
		Description:   p.Description,
		Price:         p.Price,
		SalePrice:     p.SalePrice,
		Currency:      p.Currency,
		Availability:  p.Availability,
		Condition:     p.Condition,
		Brand:         p.Brand,
		Category:      p.Category,
		URL:           p.URL,
		ImageURL:      p.ImageURL,
		RetailerID:    p.RetailerID,
		IsActive:      p.IsActive,
		SyncStatus:    status,
		SyncError:     p.SyncError,
		LastSyncedAt:  formatAPITimePtr(p.LastSyncedAt),
		CreatedAt:     formatAPITime(p.CreatedAt),
		UpdatedAt:     formatAPITime(p.UpdatedAt),
	}
}
