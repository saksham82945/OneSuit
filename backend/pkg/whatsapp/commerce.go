package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Commerce / catalogue calls used by the catalogue screens:
//
//   - which catalogues the WABA's owner business has, and which one is
//     connected to the WABA (GET/POST/DELETE /{waba-id}/product_catalogs)
//   - per phone number commerce settings (shop button on the business profile
//     and the cart), GET/POST /{phone-number-id}/whatsapp_commerce_settings
//   - product items with all the fields the product form edits
//   - product sets (collections)
//
// Account.BusinessID holds the WhatsApp Business Account (WABA) ID.

// CommerceSettings are a phone number's WhatsApp commerce settings.
type CommerceSettings struct {
	ID               string `json:"id,omitempty"`
	IsCatalogVisible bool   `json:"is_catalog_visible"`
	IsCartEnabled    bool   `json:"is_cart_enabled"`
}

// ProductItemInput is a catalogue product item as sent to Meta. Prices are in
// the currency's smallest unit (cents / paise).
type ProductItemInput struct {
	RetailerID   string
	Name         string
	Description  string
	Price        int64
	SalePrice    int64 // 0 = no sale price
	Currency     string
	Availability string
	Condition    string
	ImageURL     string
	URL          string
	Brand        string
	Category     string
}

// ProductItem is a product item read from Meta. Meta returns prices as
// formatted strings ("₹1,999.00"); ParseMetaPrice turns them into cents.
type ProductItem struct {
	ID           string `json:"id"`
	RetailerID   string `json:"retailer_id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Price        string `json:"price"`
	SalePrice    string `json:"sale_price"`
	Currency     string `json:"currency"`
	Availability string `json:"availability"`
	Condition    string `json:"condition"`
	ImageURL     string `json:"image_url"`
	URL          string `json:"url"`
	Brand        string `json:"brand"`
	Category     string `json:"category"`
}

// ProductSet is a collection of products inside a catalogue.
type ProductSet struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ProductCount int    `json:"product_count"`
}

type graphPaging struct {
	Cursors struct {
		After string `json:"after"`
	} `json:"cursors"`
	Next string `json:"next"`
}

func (c *Client) graphURL(account *Account, path string) string {
	return fmt.Sprintf("%s/%s/%s", c.getBaseURL(), account.APIVersion, strings.TrimPrefix(path, "/"))
}

// GetOwnerBusinessID returns the Meta business that owns the WABA (the one
// whose catalogues can be connected to it).
func (c *Client) GetOwnerBusinessID(ctx context.Context, account *Account) (string, error) {
	apiURL := c.graphURL(account, account.BusinessID) + "?fields=owner_business_info"
	resp, err := doJSON[struct {
		OwnerBusinessInfo struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"owner_business_info"`
	}](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
	if err != nil {
		return "", err
	}
	return resp.OwnerBusinessInfo.ID, nil
}

// ListBusinessCatalogs lists the catalogues a business owns.
func (c *Client) ListBusinessCatalogs(ctx context.Context, account *Account, businessID string) ([]CatalogInfo, error) {
	apiURL := c.graphURL(account, businessID+"/owned_product_catalogs") + "?fields=id,name&limit=100"
	resp, err := doJSON[CatalogListResponse](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
	if err != nil {
		return nil, err
	}
	return resp.Data, nil
}

// ListConnectedCatalogs lists the catalogues connected to the WABA.
func (c *Client) ListConnectedCatalogs(ctx context.Context, account *Account) ([]CatalogInfo, error) {
	apiURL := c.graphURL(account, account.BusinessID+"/product_catalogs") + "?fields=id,name"
	resp, err := doJSON[CatalogListResponse](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
	if err != nil {
		return nil, err
	}
	return resp.Data, nil
}

// GetCatalogInfo reads one catalogue's id and name (checks the token can see it).
func (c *Client) GetCatalogInfo(ctx context.Context, account *Account, catalogID string) (*CatalogInfo, error) {
	apiURL := c.graphURL(account, url.PathEscape(catalogID)) + "?fields=id,name"
	resp, err := doJSON[CatalogInfo](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
	if err != nil {
		return nil, err
	}
	if resp.ID == "" {
		resp.ID = catalogID
	}
	return &resp, nil
}

// ConnectCatalog connects a catalogue to the WABA.
func (c *Client) ConnectCatalog(ctx context.Context, account *Account, catalogID string) error {
	apiURL := c.graphURL(account, account.BusinessID+"/product_catalogs") + "?catalog_id=" + url.QueryEscape(catalogID)
	_, err := c.doRequest(ctx, http.MethodPost, apiURL, map[string]string{"catalog_id": catalogID}, account.AccessToken)
	return err
}

// DisconnectCatalog disconnects a catalogue from the WABA.
func (c *Client) DisconnectCatalog(ctx context.Context, account *Account, catalogID string) error {
	apiURL := c.graphURL(account, account.BusinessID+"/product_catalogs") + "?catalog_id=" + url.QueryEscape(catalogID)
	_, err := c.doRequest(ctx, http.MethodDelete, apiURL, nil, account.AccessToken)
	return err
}

// GetCommerceSettings reads the phone number's commerce settings. A number
// that never had them set returns both flags false.
func (c *Client) GetCommerceSettings(ctx context.Context, account *Account) (*CommerceSettings, error) {
	apiURL := c.graphURL(account, account.PhoneID+"/whatsapp_commerce_settings")
	resp, err := doJSON[struct {
		Data []CommerceSettings `json:"data"`
	}](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
	if err != nil {
		return nil, err
	}
	if len(resp.Data) == 0 {
		return &CommerceSettings{}, nil
	}
	return &resp.Data[0], nil
}

// UpdateCommerceSettings sets whether the catalogue (shop button) shows on
// the business profile and whether customers can use the cart.
func (c *Client) UpdateCommerceSettings(ctx context.Context, account *Account, s CommerceSettings) error {
	q := url.Values{}
	q.Set("is_catalog_visible", strconv.FormatBool(s.IsCatalogVisible))
	q.Set("is_cart_enabled", strconv.FormatBool(s.IsCartEnabled))
	apiURL := c.graphURL(account, account.PhoneID+"/whatsapp_commerce_settings") + "?" + q.Encode()
	_, err := c.doRequest(ctx, http.MethodPost, apiURL, nil, account.AccessToken)
	return err
}

func productItemBody(p *ProductItemInput, create bool) map[string]any {
	body := map[string]any{}
	set := func(k, v string) {
		if v != "" || !create {
			body[k] = v
		}
	}
	if p.RetailerID != "" {
		body["retailer_id"] = p.RetailerID
	}
	body["name"] = p.Name
	set("description", p.Description)
	body["price"] = p.Price
	body["currency"] = p.Currency
	set("availability", p.Availability)
	set("condition", p.Condition)
	set("image_url", p.ImageURL)
	set("url", p.URL)
	set("brand", p.Brand)
	set("category", p.Category)
	if p.SalePrice > 0 {
		body["sale_price"] = p.SalePrice
	}
	// Optional fields cleared on edit: Meta rejects empty URLs, so leave them out.
	for _, k := range []string{"image_url", "url", "availability", "condition"} {
		if v, ok := body[k]; ok && v == "" {
			delete(body, k)
		}
	}
	return body
}

// CreateProductItem adds a product to a catalogue and returns its Meta ID.
func (c *Client) CreateProductItem(ctx context.Context, account *Account, catalogID string, p *ProductItemInput) (string, error) {
	apiURL := c.graphURL(account, url.PathEscape(catalogID)+"/products")
	resp, err := doJSON[ProductCreateResponse](ctx, c, http.MethodPost, apiURL, productItemBody(p, true), account.AccessToken)
	if err != nil {
		return "", err
	}
	if resp.ID == "" {
		return "", fmt.Errorf("meta returned no product id")
	}
	return resp.ID, nil
}

// UpdateProductItem replaces a product's editable fields.
func (c *Client) UpdateProductItem(ctx context.Context, account *Account, productID string, p *ProductItemInput) error {
	apiURL := c.graphURL(account, url.PathEscape(productID))
	_, err := c.doRequest(ctx, http.MethodPost, apiURL, productItemBody(p, false), account.AccessToken)
	return err
}

// ProductItemFields are the fields read when listing a catalogue's products.
const ProductItemFields = "id,retailer_id,name,description,price,sale_price,currency,availability,condition,image_url,url,brand,category"

// ListProductItems lists a catalogue's products, following pages up to maxItems.
func (c *Client) ListProductItems(ctx context.Context, account *Account, catalogID string, maxItems int) ([]ProductItem, error) {
	if maxItems <= 0 {
		maxItems = 2000
	}
	var all []ProductItem
	after := ""
	for len(all) < maxItems {
		q := url.Values{}
		q.Set("fields", ProductItemFields)
		q.Set("limit", "100")
		if after != "" {
			q.Set("after", after)
		}
		apiURL := c.graphURL(account, url.PathEscape(catalogID)+"/products") + "?" + q.Encode()
		resp, err := doJSON[struct {
			Data   []ProductItem `json:"data"`
			Paging graphPaging   `json:"paging"`
		}](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
		if err != nil {
			return nil, err
		}
		all = append(all, resp.Data...)
		if resp.Paging.Next == "" || resp.Paging.Cursors.After == "" || len(resp.Data) == 0 {
			break
		}
		after = resp.Paging.Cursors.After
	}
	if len(all) > maxItems {
		all = all[:maxItems]
	}
	return all, nil
}

// ListProductSets lists a catalogue's product sets.
func (c *Client) ListProductSets(ctx context.Context, account *Account, catalogID string) ([]ProductSet, error) {
	apiURL := c.graphURL(account, url.PathEscape(catalogID)+"/product_sets") + "?fields=id,name,product_count&limit=100"
	resp, err := doJSON[struct {
		Data []ProductSet `json:"data"`
	}](ctx, c, http.MethodGet, apiURL, nil, account.AccessToken)
	if err != nil {
		return nil, err
	}
	return resp.Data, nil
}

// CreateProductSet creates a set holding the products with the given retailer IDs.
func (c *Client) CreateProductSet(ctx context.Context, account *Account, catalogID, name string, retailerIDs []string) (string, error) {
	filter, err := json.Marshal(map[string]any{"retailer_id": map[string]any{"is_any": retailerIDs}})
	if err != nil {
		return "", err
	}
	apiURL := c.graphURL(account, url.PathEscape(catalogID)+"/product_sets")
	resp, err := doJSON[ProductCreateResponse](ctx, c, http.MethodPost, apiURL,
		map[string]string{"name": name, "filter": string(filter)}, account.AccessToken)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// DeleteProductSet deletes a product set.
func (c *Client) DeleteProductSet(ctx context.Context, account *Account, setID string) error {
	_, err := c.doRequest(ctx, http.MethodDelete, c.graphURL(account, url.PathEscape(setID)), nil, account.AccessToken)
	return err
}

// ParseMetaPrice turns Meta's formatted price ("₹1,999.00", "$19.99",
// "1.234,50 €", "1999") into the smallest currency unit. It returns 0 when no
// number can be read.
func ParseMetaPrice(s string) int64 {
	var b strings.Builder
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == '.' || r == ',' {
			b.WriteRune(r)
		}
	}
	num := strings.Trim(b.String(), ".,")
	if num == "" {
		return 0
	}
	lastDot := strings.LastIndex(num, ".")
	lastComma := strings.LastIndex(num, ",")
	decSep := -1
	switch {
	case lastDot >= 0 && lastComma >= 0:
		decSep = max(lastDot, lastComma)
	case lastDot >= 0:
		// "1.234.567" is thousands; "19.99" / "19.9" is decimal.
		if strings.Count(num, ".") == 1 && len(num)-lastDot-1 <= 2 {
			decSep = lastDot
		}
	case lastComma >= 0:
		if strings.Count(num, ",") == 1 && len(num)-lastComma-1 <= 2 {
			decSep = lastComma
		}
	}
	intPart, fracPart := num, ""
	if decSep >= 0 {
		intPart, fracPart = num[:decSep], num[decSep+1:]
	}
	intPart = strings.NewReplacer(".", "", ",", "").Replace(intPart)
	for len(fracPart) < 2 {
		fracPart += "0"
	}
	fracPart = fracPart[:2]
	whole, err := strconv.ParseInt(intPart+fracPart, 10, 64)
	if err != nil {
		return 0
	}
	return whole
}
