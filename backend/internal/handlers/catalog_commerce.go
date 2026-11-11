package handlers

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Catalogue ↔ WhatsApp number: connecting a catalogue to the WABA, the
// phone number's commerce settings (catalogue on the business profile, cart),
// linking an existing Commerce Manager catalogue by ID, product sync from
// Meta, CSV import, product sets, and the product picker used by the chat
// composer. All routes live under /api/catalogs so the "catalogue" plan
// module gate applies.

var errNoCatalogAccount = errors.New("catalogue has no WhatsApp account")

var (
	metaIDRe     = regexp.MustCompile(`^[0-9]{5,30}$`)
	majorPriceRe = regexp.MustCompile(`^\d+(\.\d{1,2})?$`)
)

// metaCatalog is a catalogue Meta reports for an account.
type metaCatalog struct {
	ID        string
	Name      string
	Connected bool
}

// AvailableCatalogResponse is one catalogue the account's token can use.
type AvailableCatalogResponse struct {
	MetaCatalogID string     `json:"meta_catalog_id"`
	Name          string     `json:"name"`
	IsConnected   bool       `json:"is_connected"`
	LocalID       *uuid.UUID `json:"local_id"` // set when already listed in this app
}

// CommerceSettingsResponse are a WhatsApp number's commerce settings.
type CommerceSettingsResponse struct {
	WhatsAppAccount  string `json:"whatsapp_account"`
	IsCatalogVisible bool   `json:"is_catalog_visible"`
	IsCartEnabled    bool   `json:"is_cart_enabled"`
}

// CommerceSettingsRequest updates commerce settings; omitted flags keep their value.
type CommerceSettingsRequest struct {
	WhatsAppAccount  string `json:"whatsapp_account"`
	IsCatalogVisible *bool  `json:"is_catalog_visible"`
	IsCartEnabled    *bool  `json:"is_cart_enabled"`
}

// LinkCatalogRequest links an existing Meta catalogue by its ID.
type LinkCatalogRequest struct {
	WhatsAppAccount string `json:"whatsapp_account"`
	MetaCatalogID   string `json:"meta_catalog_id"`
	Connect         *bool  `json:"connect"` // default true
}

// ConnectCatalogRequest optionally moves the catalogue to another account before connecting.
type ConnectCatalogRequest struct {
	WhatsAppAccount string `json:"whatsapp_account"`
}

// ProductPickerItem is one product the chat composer can send.
type ProductPickerItem struct {
	CatalogID         string    `json:"catalog_id"` // Meta catalogue ID (what product messages need)
	CatalogLocalID    uuid.UUID `json:"catalog_local_id"`
	CatalogName       string    `json:"catalog_name"`
	WhatsAppAccount   string    `json:"whatsapp_account"`
	ProductRetailerID string    `json:"product_retailer_id"`
	ProductID         uuid.UUID `json:"product_id"`
	Name              string    `json:"name"`
	Price             int64     `json:"price"`      // smallest currency unit
	SalePrice         int64     `json:"sale_price"` // 0 = none
	Currency          string    `json:"currency"`
	PriceText         string    `json:"price_text"` // e.g. "INR 1,999.00"
	ImageURL          string    `json:"image_url"`
	Availability      string    `json:"availability"`
}

// ProductImportRequest is a CSV bulk import. With dry_run nothing is saved:
// the response previews what would happen to each row.
type ProductImportRequest struct {
	CSV    string `json:"csv"`
	DryRun bool   `json:"dry_run"`
}

// ProductImportRow is the outcome for one CSV row.
type ProductImportRow struct {
	Line         int    `json:"line"`
	RetailerID   string `json:"retailer_id"`
	Name         string `json:"name"`
	Price        int64  `json:"price"`
	Currency     string `json:"currency"`
	Availability string `json:"availability"`
	ImageURL     string `json:"image_url"`
	Action       string `json:"action"` // create | update | skip
	Error        string `json:"error,omitempty"`
	SyncStatus   string `json:"sync_status,omitempty"`
	SyncError    string `json:"sync_error,omitempty"`
}

// ProductSetRequest creates a product set from SKUs.
type ProductSetRequest struct {
	Name        string   `json:"name"`
	RetailerIDs []string `json:"retailer_ids"`
}

const (
	maxImportRows  = 500
	maxImportBytes = 2 << 20
)

/* ---------------------------------------------------------------- helpers */

// metaCatalogsForAccount lists the catalogues of the business owning the WABA
// plus the ones connected to the WABA, marking the connected ones.
func (a *App) metaCatalogsForAccount(ctx context.Context, wa *whatsapp.Account) ([]metaCatalog, error) {
	connected, connErr := a.WhatsApp.ListConnectedCatalogs(ctx, wa)
	var owned []whatsapp.CatalogInfo
	var ownErr error
	if owner, err := a.WhatsApp.GetOwnerBusinessID(ctx, wa); err == nil && owner != "" {
		owned, ownErr = a.WhatsApp.ListBusinessCatalogs(ctx, wa, owner)
	} else {
		// Older setups stored the business ID here; the original behaviour.
		owned, ownErr = a.WhatsApp.ListCatalogs(ctx, wa)
	}
	if connErr != nil && ownErr != nil {
		return nil, connErr
	}

	isConnected := map[string]bool{}
	for _, c := range connected {
		isConnected[c.ID] = true
	}
	seen := map[string]bool{}
	var out []metaCatalog
	add := func(c whatsapp.CatalogInfo) {
		if c.ID == "" || seen[c.ID] {
			return
		}
		seen[c.ID] = true
		out = append(out, metaCatalog{ID: c.ID, Name: c.Name, Connected: isConnected[c.ID]})
	}
	for _, c := range connected {
		add(c)
	}
	for _, c := range owned {
		add(c)
	}
	return out, nil
}

// markOnlyConnected records that keepID is the account's connected catalogue
// (a WABA has one connected catalogue at a time).
func (a *App) markOnlyConnected(orgID uuid.UUID, accountName string, keepID uuid.UUID) {
	a.DB.Model(&models.Catalog{}).
		Where("organization_id = ? AND whats_app_account = ? AND id <> ?", orgID, accountName, keepID).
		Update("is_connected", false)
}

// loadCatalogForMeta loads the catalogue from the {id} path param and its
// account. It sends the error response itself (returns ok=false).
func (a *App) loadCatalogForMeta(r *fastglue.Request) (orgID uuid.UUID, catalog *models.Catalog, wa *whatsapp.Account, ok bool) {
	orgID, err := a.getOrgID(r)
	if err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
		return
	}
	id, err := parsePathUUID(r, "id", "catalog")
	if err != nil {
		return
	}
	catalog, err = findByIDAndOrg[models.Catalog](a.DB, r, id, orgID, "Catalog")
	if err != nil {
		return
	}
	_, wa, err = a.catalogWAAccount(orgID, catalog.WhatsAppAccount)
	if err != nil {
		_ = r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
		return
	}
	return orgID, catalog, wa, true
}

func formatMinorUnits(amount int64, currency string) string {
	neg := amount < 0
	if neg {
		amount = -amount
	}
	whole := strconv.FormatInt(amount/100, 10)
	var b strings.Builder
	for i, c := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	s := fmt.Sprintf("%s %s.%02d", currency, b.String(), amount%100)
	if neg {
		s = "-" + s
	}
	return s
}

// parseMajorPrice reads a CSV price in major units ("1999", "1,999.50") into
// minor units. ok=false for anything that isn't a plain non-negative amount.
func parseMajorPrice(s string) (int64, bool) {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", ""))
	if s == "" {
		return 0, false
	}
	if !majorPriceRe.MatchString(s) {
		return 0, false
	}
	intPart, frac, _ := strings.Cut(s, ".")
	for len(frac) < 2 {
		frac += "0"
	}
	v, err := strconv.ParseInt(intPart+frac, 10, 64)
	return v, err == nil
}

/* ---------------------------------------------------- connect / available */

// ListAvailableCatalogs lists the catalogues an account's token can use in
// Meta (GET /api/catalogs/available?whatsapp_account=), marking the one
// connected to the WABA and the ones already listed here.
func (a *App) ListAvailableCatalogs(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	name := string(r.RequestCtx.QueryArgs().Peek("whatsapp_account"))
	if name == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "whatsapp_account is required", nil, "")
	}
	_, wa, err := a.catalogWAAccount(orgID, name)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}
	list, err := a.metaCatalogsForAccount(context.Background(), wa)
	if err != nil {
		return sendMetaError(r, "Failed to fetch catalogs", err)
	}

	ids := make([]string, len(list))
	for i, c := range list {
		ids[i] = c.ID
	}
	var local []models.Catalog
	if len(ids) > 0 {
		a.DB.Where("organization_id = ? AND meta_catalog_id IN ?", orgID, ids).Find(&local)
	}
	localByMeta := map[string]uuid.UUID{}
	for _, c := range local {
		localByMeta[c.MetaCatalogID] = c.ID
	}

	out := make([]AvailableCatalogResponse, len(list))
	for i, c := range list {
		out[i] = AvailableCatalogResponse{MetaCatalogID: c.ID, Name: c.Name, IsConnected: c.Connected}
		if id, ok := localByMeta[c.ID]; ok {
			id := id
			out[i].LocalID = &id
		}
	}
	return r.SendEnvelope(map[string]any{"catalogs": out})
}

// LinkCatalog adds an existing Commerce Manager catalogue by its ID
// (POST /api/catalogs/link) and, unless connect=false, connects it to the
// account's WABA.
func (a *App) LinkCatalog(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	var req LinkCatalogRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.MetaCatalogID = strings.TrimSpace(req.MetaCatalogID)
	if req.WhatsAppAccount == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "whatsapp_account is required", nil, "")
	}
	if !metaIDRe.MatchString(req.MetaCatalogID) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "meta_catalog_id must be the numeric catalogue ID from Commerce Manager", nil, "")
	}
	connect := req.Connect == nil || *req.Connect

	_, wa, err := a.catalogWAAccount(orgID, req.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}

	var existing models.Catalog
	found := a.DB.Unscoped().Where("meta_catalog_id = ?", req.MetaCatalogID).First(&existing).Error == nil
	if found && existing.OrganizationID != orgID {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "This catalogue is already linked to another workspace", nil, "")
	}

	ctx := context.Background()
	info, err := a.WhatsApp.GetCatalogInfo(ctx, wa, req.MetaCatalogID)
	if err != nil {
		return sendMetaError(r, "Couldn't open that catalogue with this account's access token", err)
	}
	if connect {
		if err := a.WhatsApp.ConnectCatalog(ctx, wa, req.MetaCatalogID); err != nil {
			return sendMetaError(r, "Failed to connect catalog", err)
		}
	}

	name := info.Name
	if name == "" {
		name = "Catalogue " + req.MetaCatalogID
	}
	now := time.Now()
	catalog := existing
	if found {
		a.DB.Unscoped().Model(&catalog).Updates(map[string]any{
			"name": name, "whats_app_account": req.WhatsAppAccount, "is_connected": connect || existing.IsConnected,
			"is_active": true, "deleted_at": nil, "last_synced_at": now,
		})
	} else {
		catalog = models.Catalog{
			OrganizationID: orgID, WhatsAppAccount: req.WhatsAppAccount, MetaCatalogID: req.MetaCatalogID,
			Name: name, IsActive: true, IsConnected: connect, LastSyncedAt: &now,
		}
		if err := a.DB.Create(&catalog).Error; err != nil {
			a.Log.Error("Failed to save linked catalog", "error", err)
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save catalog", nil, "")
		}
	}
	if connect {
		a.markOnlyConnected(orgID, req.WhatsAppAccount, catalog.ID)
	}
	a.DB.First(&catalog, "id = ?", catalog.ID)
	totals, _ := a.productCounts([]uuid.UUID{catalog.ID})
	return r.SendEnvelope(catalogToResponse(catalog, totals[catalog.ID]))
}

// ConnectCatalog connects the catalogue to its account's WABA
// (POST /api/catalogs/{id}/connect, optional {whatsapp_account} to move it).
func (a *App) ConnectCatalog(r *fastglue.Request) error {
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
	var req ConnectCatalogRequest
	if len(r.RequestCtx.PostBody()) > 0 {
		if err := a.decodeRequest(r, &req); err != nil {
			return nil
		}
	}
	accountName := catalog.WhatsAppAccount
	if req.WhatsAppAccount != "" {
		accountName = req.WhatsAppAccount
	}
	_, wa, err := a.catalogWAAccount(orgID, accountName)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}
	if err := a.WhatsApp.ConnectCatalog(context.Background(), wa, catalog.MetaCatalogID); err != nil {
		return sendMetaError(r, "Failed to connect catalog", err)
	}
	catalog.WhatsAppAccount = accountName
	catalog.IsConnected = true
	if err := a.DB.Save(catalog).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save catalog", nil, "")
	}
	a.markOnlyConnected(orgID, accountName, catalog.ID)
	totals, errs := a.productCounts([]uuid.UUID{catalog.ID})
	resp := catalogToResponse(*catalog, totals[catalog.ID])
	resp.SyncErrorCount = errs[catalog.ID]
	return r.SendEnvelope(resp)
}

// DisconnectCatalog disconnects the catalogue from its account's WABA
// (DELETE /api/catalogs/{id}/connect). Products stay in Meta and here.
func (a *App) DisconnectCatalog(r *fastglue.Request) error {
	_, catalog, wa, ok := a.loadCatalogForMeta(r)
	if !ok {
		return nil
	}
	if err := a.WhatsApp.DisconnectCatalog(context.Background(), wa, catalog.MetaCatalogID); err != nil {
		return sendMetaError(r, "Failed to disconnect catalog", err)
	}
	catalog.IsConnected = false
	if err := a.DB.Save(catalog).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save catalog", nil, "")
	}
	totals, errs := a.productCounts([]uuid.UUID{catalog.ID})
	resp := catalogToResponse(*catalog, totals[catalog.ID])
	resp.SyncErrorCount = errs[catalog.ID]
	return r.SendEnvelope(resp)
}

/* ------------------------------------------------------- commerce settings */

// GetCommerceSettings reads a number's commerce settings
// (GET /api/catalogs/commerce-settings?whatsapp_account=).
func (a *App) GetCommerceSettings(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	name := string(r.RequestCtx.QueryArgs().Peek("whatsapp_account"))
	if name == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "whatsapp_account is required", nil, "")
	}
	_, wa, err := a.catalogWAAccount(orgID, name)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}
	s, err := a.WhatsApp.GetCommerceSettings(context.Background(), wa)
	if err != nil {
		return sendMetaError(r, "Failed to read commerce settings", err)
	}
	return r.SendEnvelope(CommerceSettingsResponse{WhatsAppAccount: name, IsCatalogVisible: s.IsCatalogVisible, IsCartEnabled: s.IsCartEnabled})
}

// UpdateCommerceSettings sets "show catalogue on WhatsApp profile" and
// "allow cart" (POST /api/catalogs/commerce-settings).
func (a *App) UpdateCommerceSettings(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	var req CommerceSettingsRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	if req.WhatsAppAccount == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "whatsapp_account is required", nil, "")
	}
	if req.IsCatalogVisible == nil && req.IsCartEnabled == nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Send is_catalog_visible and/or is_cart_enabled", nil, "")
	}
	_, wa, err := a.catalogWAAccount(orgID, req.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}
	ctx := context.Background()
	settings := whatsapp.CommerceSettings{}
	if req.IsCatalogVisible == nil || req.IsCartEnabled == nil {
		cur, err := a.WhatsApp.GetCommerceSettings(ctx, wa)
		if err != nil {
			return sendMetaError(r, "Failed to read commerce settings", err)
		}
		settings = *cur
	}
	if req.IsCatalogVisible != nil {
		settings.IsCatalogVisible = *req.IsCatalogVisible
	}
	if req.IsCartEnabled != nil {
		settings.IsCartEnabled = *req.IsCartEnabled
	}
	if err := a.WhatsApp.UpdateCommerceSettings(ctx, wa, settings); err != nil {
		return sendMetaError(r, "Failed to update commerce settings", err)
	}
	return r.SendEnvelope(CommerceSettingsResponse{
		WhatsAppAccount: req.WhatsAppAccount, IsCatalogVisible: settings.IsCatalogVisible, IsCartEnabled: settings.IsCartEnabled,
	})
}

/* ------------------------------------------------------------ product sync */

// SyncCatalogProducts pulls the catalogue's products from Meta
// (POST /api/catalogs/{id}/products/sync): matched by Meta ID, then SKU;
// products Meta no longer has are flagged with a sync error.
func (a *App) SyncCatalogProducts(r *fastglue.Request) error {
	orgID, catalog, wa, ok := a.loadCatalogForMeta(r)
	if !ok {
		return nil
	}
	items, err := a.WhatsApp.ListProductItems(context.Background(), wa, catalog.MetaCatalogID, 5000)
	if err != nil {
		return sendMetaError(r, "Failed to fetch products", err)
	}

	var local []models.CatalogProduct
	a.DB.Where("catalog_id = ?", catalog.ID).Find(&local)
	byMeta := map[string]*models.CatalogProduct{}
	bySKU := map[string]*models.CatalogProduct{}
	for i := range local {
		if local[i].MetaProductID != "" {
			byMeta[local[i].MetaProductID] = &local[i]
		}
		if local[i].RetailerID != "" {
			bySKU[local[i].RetailerID] = &local[i]
		}
	}

	now := time.Now()
	created, updated := 0, 0
	seen := map[string]bool{}
	for _, it := range items {
		seen[it.ID] = true
		p := byMeta[it.ID]
		if p == nil && it.RetailerID != "" {
			p = bySKU[it.RetailerID]
		}
		isNew := p == nil
		if isNew {
			p = &models.CatalogProduct{OrganizationID: orgID, CatalogID: catalog.ID, IsActive: true}
		}
		p.MetaProductID = it.ID
		p.RetailerID = it.RetailerID
		p.Name = it.Name
		p.Description = it.Description
		if v := whatsapp.ParseMetaPrice(it.Price); v > 0 {
			p.Price = v
		}
		p.SalePrice = whatsapp.ParseMetaPrice(it.SalePrice)
		if it.Currency != "" {
			p.Currency = it.Currency
		}
		p.Availability = it.Availability
		p.Condition = it.Condition
		p.Brand, p.Category, p.URL, p.ImageURL = it.Brand, it.Category, it.URL, it.ImageURL
		if len(p.URL) > 500 {
			p.URL = p.URL[:500]
		}
		if len(p.ImageURL) > 500 {
			p.ImageURL = p.ImageURL[:500]
		}
		if p.Name == "" {
			p.Name = it.RetailerID
		}
		if p.Currency == "" {
			p.Currency = defaultProductCurrency
		}
		if p.Availability == "" {
			p.Availability = "in stock"
		}
		if p.Condition == "" {
			p.Condition = "new"
		}
		p.SyncStatus, p.SyncError, p.LastSyncedAt = models.ProductSyncSynced, "", &now
		if err := a.DB.Save(p).Error; err != nil {
			a.Log.Error("Failed to save synced product", "error", err, "meta_id", it.ID)
			continue
		}
		if isNew {
			created++
		} else {
			updated++
		}
	}

	missing := 0
	for i := range local {
		p := &local[i]
		if p.MetaProductID != "" && !seen[p.MetaProductID] {
			missing++
			a.DB.Model(p).Updates(map[string]any{
				"sync_status":     models.ProductSyncError,
				"sync_error":      "Not found in the Meta catalogue any more. Save it to add it again, or delete it.",
				"meta_product_id": "",
			})
		}
	}
	a.DB.Model(catalog).Update("last_synced_at", now)

	return r.SendEnvelope(map[string]any{
		"message": "Products synced", "total": len(items), "created": created, "updated": updated, "missing": missing,
	})
}

// PushCatalogProduct retries sending one product to Meta
// (POST /api/catalogs/{id}/products/{productId}/push).
func (a *App) PushCatalogProduct(r *fastglue.Request) error {
	orgID, catalog, wa, ok := a.loadCatalogForMeta(r)
	if !ok {
		return nil
	}
	pid, err := parsePathUUID(r, "productId", "product")
	if err != nil {
		return nil
	}
	var p models.CatalogProduct
	if err := a.DB.Where("id = ? AND catalog_id = ? AND organization_id = ?", pid, catalog.ID, orgID).First(&p).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Product not found", nil, "")
	}
	_ = a.pushProductToMeta(context.Background(), wa, catalog, &p)
	if err := a.DB.Save(&p).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save product", nil, "")
	}
	return r.SendEnvelope(productToResponse(p))
}

/* -------------------------------------------------------------- CSV import */

var importColumns = map[string]string{
	"sku": "sku", "retailer_id": "sku", "id": "sku",
	"name": "name", "title": "name",
	"description": "description",
	"price":       "price", "sale_price": "sale_price",
	"currency":  "currency",
	"image_url": "image_url", "image": "image_url", "image_link": "image_url",
	"url": "url", "link": "url",
	"availability": "availability", "condition": "condition", "brand": "brand", "category": "category",
}

// ImportCatalogProducts imports products from CSV
// (POST /api/catalogs/{id}/products/import {csv, dry_run}). Columns:
// sku,name,description,price,currency,image_url,url,availability (plus
// optional sale_price,brand,category,condition). Prices are in major units
// ("1999.00"). Rows are matched to existing products by SKU.
func (a *App) ImportCatalogProducts(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	id, err := parsePathUUID(r, "id", "catalog")
	if err != nil {
		return nil
	}
	var req ProductImportRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	catalog, err := findByIDAndOrg[models.Catalog](a.DB, r, id, orgID, "Catalog")
	if err != nil {
		return nil
	}
	if strings.TrimSpace(req.CSV) == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "csv is empty", nil, "")
	}
	if len(req.CSV) > maxImportBytes {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "CSV is too large (max 2 MB)", nil, "")
	}

	rd := csv.NewReader(strings.NewReader(strings.TrimPrefix(req.CSV, "\ufeff")))
	rd.FieldsPerRecord = -1
	rd.TrimLeadingSpace = true
	header, err := rd.Read()
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Couldn't read the CSV header row", nil, "")
	}
	col := map[string]int{}
	for i, h := range header {
		if key, ok := importColumns[strings.ToLower(strings.TrimSpace(h))]; ok {
			if _, dup := col[key]; !dup {
				col[key] = i
			}
		}
	}
	for _, need := range []string{"sku", "name", "price"} {
		if _, ok := col[need]; !ok {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
				"CSV needs a header row with at least sku, name and price columns (also: description, currency, image_url, url, availability)", nil, "")
		}
	}

	var existing []models.CatalogProduct
	a.DB.Where("catalog_id = ?", catalog.ID).Find(&existing)
	bySKU := map[string]*models.CatalogProduct{}
	for i := range existing {
		bySKU[existing[i].RetailerID] = &existing[i]
	}

	type pending struct {
		row     int
		product models.CatalogProduct
	}
	var rows []ProductImportRow
	var toSave []pending
	seenSKU := map[string]int{}
	line := 1
	for {
		rec, err := rd.Read()
		line++
		if err == io.EOF {
			break
		}
		if err != nil {
			rows = append(rows, ProductImportRow{Line: line, Action: "skip", Error: "Malformed CSV row"})
			continue
		}
		get := func(k string) string {
			if i, ok := col[k]; ok && i < len(rec) {
				return strings.TrimSpace(rec[i])
			}
			return ""
		}
		blank := true
		for _, v := range rec {
			if strings.TrimSpace(v) != "" {
				blank = false
				break
			}
		}
		if blank {
			continue
		}
		if len(rows) >= maxImportRows {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, fmt.Sprintf("Import up to %d products at a time", maxImportRows), nil, "")
		}

		row := ProductImportRow{Line: line, RetailerID: get("sku"), Name: get("name")}
		var p models.CatalogProduct
		if ex := bySKU[row.RetailerID]; ex != nil && row.RetailerID != "" {
			p = *ex
			row.Action = "update"
		} else {
			p = models.CatalogProduct{OrganizationID: orgID, CatalogID: catalog.ID, IsActive: true}
			row.Action = "create"
		}
		p.RetailerID, p.Name = row.RetailerID, row.Name
		// Optional columns only overwrite when present in the file.
		for k, dst := range map[string]*string{
			"description": &p.Description, "currency": &p.Currency, "image_url": &p.ImageURL, "url": &p.URL,
			"availability": &p.Availability, "condition": &p.Condition, "brand": &p.Brand, "category": &p.Category,
		} {
			if _, ok := col[k]; ok {
				*dst = get(k)
			}
		}
		price, okPrice := parseMajorPrice(get("price"))
		p.Price = price
		p.SalePrice = 0
		if v := get("sale_price"); v != "" {
			sp, ok := parseMajorPrice(v)
			if !ok {
				row.Error = "sale_price must be a number like 1499.00"
			}
			p.SalePrice = sp
		}
		switch {
		case row.Error != "":
		case row.RetailerID == "":
			row.Error = "sku is required"
		case seenSKU[row.RetailerID] > 0:
			row.Error = fmt.Sprintf("Duplicate sku (also on line %d)", seenSKU[row.RetailerID])
		case !okPrice:
			row.Error = "price must be a number like 1999.00"
		default:
			row.Error = normalizeProduct(&p)
		}
		if row.RetailerID != "" && seenSKU[row.RetailerID] == 0 {
			seenSKU[row.RetailerID] = line
		}
		row.Price, row.Currency, row.Availability, row.ImageURL = p.Price, p.Currency, p.Availability, p.ImageURL
		if row.Error != "" {
			row.Action = "skip"
		} else {
			toSave = append(toSave, pending{row: len(rows), product: p})
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "The CSV has no product rows", nil, "")
	}

	summary := map[string]any{
		"dry_run": req.DryRun, "rows": rows, "total": len(rows), "valid": len(toSave), "invalid": len(rows) - len(toSave),
	}
	if req.DryRun {
		return r.SendEnvelope(summary)
	}

	_, wa, err := a.catalogWAAccount(orgID, catalog.WhatsAppAccount)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "WhatsApp account not found", nil, "")
	}
	ctx := context.Background()
	created, updated, failed := 0, 0, 0
	for _, pd := range toSave {
		p := pd.product
		row := &rows[pd.row]
		if p.ID == uuid.Nil {
			p.SyncStatus = models.ProductSyncPending
			if err := a.DB.Create(&p).Error; err != nil {
				row.Action, row.Error = "skip", "Couldn't save this product"
				continue
			}
		}
		if err := a.pushProductToMeta(ctx, wa, catalog, &p); err != nil {
			failed++
		}
		if err := a.DB.Save(&p).Error; err != nil {
			row.Error = "Couldn't save this product"
			continue
		}
		row.SyncStatus, row.SyncError = p.SyncStatus, p.SyncError
		if row.Action == "create" {
			created++
		} else {
			updated++
		}
	}
	summary["rows"] = rows
	summary["created"], summary["updated"], summary["sync_failed"] = created, updated, failed
	return r.SendEnvelope(summary)
}

/* ------------------------------------------------------------ product sets */

// ListProductSets lists the catalogue's product sets in Meta (GET /api/catalogs/{id}/sets).
func (a *App) ListProductSets(r *fastglue.Request) error {
	_, catalog, wa, ok := a.loadCatalogForMeta(r)
	if !ok {
		return nil
	}
	sets, err := a.WhatsApp.ListProductSets(context.Background(), wa, catalog.MetaCatalogID)
	if err != nil {
		return sendMetaError(r, "Failed to fetch product sets", err)
	}
	if sets == nil {
		sets = []whatsapp.ProductSet{}
	}
	return r.SendEnvelope(map[string]any{"sets": sets})
}

// CreateProductSet creates a product set from SKUs (POST /api/catalogs/{id}/sets).
func (a *App) CreateProductSet(r *fastglue.Request) error {
	_, catalog, wa, ok := a.loadCatalogForMeta(r)
	if !ok {
		return nil
	}
	var req ProductSetRequest
	if err := a.decodeRequest(r, &req); err != nil {
		return nil
	}
	req.Name = strings.TrimSpace(req.Name)
	var skus []string
	for _, s := range req.RetailerIDs {
		if s = strings.TrimSpace(s); s != "" {
			skus = append(skus, s)
		}
	}
	if req.Name == "" || len([]rune(req.Name)) > 100 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "name is required (100 characters max)", nil, "")
	}
	if len(skus) == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Choose at least one product", nil, "")
	}
	id, err := a.WhatsApp.CreateProductSet(context.Background(), wa, catalog.MetaCatalogID, req.Name, skus)
	if err != nil {
		return sendMetaError(r, "Failed to create product set", err)
	}
	return r.SendEnvelope(whatsapp.ProductSet{ID: id, Name: req.Name, ProductCount: len(skus)})
}

// DeleteProductSet deletes a product set (DELETE /api/catalogs/{id}/sets/{setId}).
func (a *App) DeleteProductSet(r *fastglue.Request) error {
	_, _, wa, ok := a.loadCatalogForMeta(r)
	if !ok {
		return nil
	}
	setID, _ := r.RequestCtx.UserValue("setId").(string)
	if !metaIDRe.MatchString(setID) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid product set ID", nil, "")
	}
	if err := a.WhatsApp.DeleteProductSet(context.Background(), wa, setID); err != nil {
		return sendMetaError(r, "Failed to delete product set", err)
	}
	return r.SendEnvelope(map[string]string{"message": "Product set deleted"})
}

/* ------------------------------------------------------------------ picker */

// ProductPicker lists products the chat composer can send
// (GET /api/catalogs/products/picker?search=&limit=&whatsapp_account=):
// active products that exist in Meta, from catalogues connected to a
// WhatsApp number.
func (a *App) ProductPicker(r *fastglue.Request) error {
	orgID, err := a.getOrgID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	args := r.RequestCtx.QueryArgs()
	limit, _ := strconv.Atoi(string(args.Peek("limit")))
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	q := a.DB.Table("catalog_products AS p").
		Select(`p.id, p.retailer_id, p.name, p.price, p.sale_price, p.currency, p.image_url, p.availability,
			c.id AS catalog_local_id, c.meta_catalog_id, c.name AS catalog_name, c.whats_app_account`).
		Joins("JOIN catalogs c ON c.id = p.catalog_id AND c.deleted_at IS NULL").
		Where("p.organization_id = ? AND c.organization_id = ? AND p.deleted_at IS NULL", orgID, orgID).
		Where("c.is_connected = ? AND c.is_active = ? AND p.is_active = ?", true, true, true).
		Where("p.meta_product_id <> '' AND p.retailer_id <> ''")
	if acc := string(args.Peek("whatsapp_account")); acc != "" {
		q = q.Where("c.whats_app_account = ?", acc)
	}
	if s := strings.TrimSpace(string(args.Peek("search"))); s != "" {
		like := "%" + escapeLike(s) + "%"
		q = q.Where("(p.name ILIKE ? OR p.retailer_id ILIKE ?)", like, like)
	}
	var rows []struct {
		ID              uuid.UUID
		RetailerID      string
		Name            string
		Price           int64
		SalePrice       int64
		Currency        string
		ImageURL        string
		Availability    string
		CatalogLocalID  uuid.UUID
		MetaCatalogID   string
		CatalogName     string
		WhatsAppAccount string `gorm:"column:whats_app_account"`
	}
	if err := q.Order("p.name ASC").Limit(limit).Scan(&rows).Error; err != nil {
		a.Log.Error("Failed to list picker products", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list products", nil, "")
	}
	out := make([]ProductPickerItem, len(rows))
	for i, p := range rows {
		price := p.Price
		if p.SalePrice > 0 {
			price = p.SalePrice
		}
		out[i] = ProductPickerItem{
			CatalogID: p.MetaCatalogID, CatalogLocalID: p.CatalogLocalID, CatalogName: p.CatalogName,
			WhatsAppAccount: p.WhatsAppAccount, ProductRetailerID: p.RetailerID, ProductID: p.ID,
			Name: p.Name, Price: p.Price, SalePrice: p.SalePrice, Currency: p.Currency,
			PriceText: formatMinorUnits(price, p.Currency), ImageURL: p.ImageURL, Availability: p.Availability,
		}
	}
	return r.SendEnvelope(map[string]any{"products": out})
}
