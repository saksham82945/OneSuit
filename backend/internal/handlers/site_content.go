package handlers

import (
	"encoding/json"
	"strings"

	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/shridarpatil/whatomate/internal/models"
)

// Website content: everything the public landing page shows (hero text,
// features, FAQs, contact details, social links, logo display, animations).
// Only the super admin can change it. Legal pages (privacy, terms, ...) are
// CMS pages; the landing page links every published one.

const (
	siteContentKey        = "site_content"
	defaultPagesSeededKey = "default_pages_seeded"
)

// SiteCard is a titled card such as a feature or a "why choose us" reason.
type SiteCard struct {
	Title string `json:"title"`
	Text  string `json:"text"`
	Icon  string `json:"icon"`
}

// SiteFAQ is one question on the landing page.
type SiteFAQ struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// SiteContent is the editable content of the public website.
type SiteContent struct {
	// Logo in the header and footer: "logo" (image only), "logo_name"
	// (image and platform name) or "name" (name only).
	LogoDisplay string `json:"logo_display"`
	LogoHeight  int    `json:"logo_height"`

	// Animations: style is fade-up, zoom, slide-left or none; speed is slow, normal or fast.
	AnimationsEnabled bool   `json:"animations_enabled"`
	AnimationStyle    string `json:"animation_style"`
	AnimationSpeed    string `json:"animation_speed"`
	HeroBackground    string `json:"hero_background"` // glow, gradient (animated) or plain

	HeroBadge     string   `json:"hero_badge"`
	HeroTitle     string   `json:"hero_title"`
	HeroHighlight string   `json:"hero_highlight"`
	HeroSubtitle  string   `json:"hero_subtitle"`
	PrimaryCTA    string   `json:"primary_cta"`
	SecondaryCTA  string   `json:"secondary_cta"`
	HeroImageURL  string   `json:"hero_image_url"`
	TrustBadges   []string `json:"trust_badges"`

	ShowWhy       bool `json:"show_why"`
	ShowFeatures  bool `json:"show_features"`
	ShowSolutions bool `json:"show_solutions"`
	ShowPricing   bool `json:"show_pricing"`
	ShowFAQ       bool `json:"show_faq"`

	WhyTitle         string     `json:"why_title"`
	WhySubtitle      string     `json:"why_subtitle"`
	WhyCards         []SiteCard `json:"why_cards"`
	FeaturesTitle    string     `json:"features_title"`
	FeaturesSubtitle string     `json:"features_subtitle"`
	Features         []SiteCard `json:"features"`
	PricingTitle     string     `json:"pricing_title"`
	PricingSubtitle  string     `json:"pricing_subtitle"`
	FAQTitle         string     `json:"faq_title"`
	FAQSubtitle      string     `json:"faq_subtitle"`
	FAQs             []SiteFAQ  `json:"faqs"`

	FooterTagline  string `json:"footer_tagline"`
	CopyrightText  string `json:"copyright_text"`
	Address        string `json:"address"`
	Phone          string `json:"phone"`
	Email          string `json:"email"`
	WhatsAppNumber string `json:"whatsapp_number"`
	BusinessHours  string `json:"business_hours"`
	MapURL         string `json:"map_url"`

	FacebookURL  string `json:"facebook_url"`
	InstagramURL string `json:"instagram_url"`
	TwitterURL   string `json:"twitter_url"`
	LinkedInURL  string `json:"linkedin_url"`
	YouTubeURL   string `json:"youtube_url"`
}

var siteIcons = map[string]bool{
	"award": true, "trending-up": true, "headphones": true, "log-in": true, "file-text": true,
	"phone": true, "message-square": true, "bot": true, "sliders": true, "users": true,
	"zap": true, "workflow": true, "shield": true, "sparkles": true, "megaphone": true,
	"qr-code": true, "globe": true, "bar-chart": true, "clock": true, "heart": true,
}

func defaultSiteContent() SiteContent {
	return SiteContent{
		LogoDisplay:       "logo",
		LogoHeight:        40,
		AnimationsEnabled: true,
		AnimationStyle:    "fade-up",
		AnimationSpeed:    "normal",
		HeroBackground:    "gradient",

		HeroBadge:     "Official WhatsApp Cloud API Platform",
		HeroTitle:     "Engage your customers on WhatsApp like never before with",
		HeroHighlight: "One Suit",
		HeroSubtitle:  "Connect in real time, automate replies 24/7, schedule broadcasts and turn conversations into revenue, all from one platform.",
		PrimaryCTA:    "Get Started",
		SecondaryCTA:  "Log in",
		TrustBadges:   []string{"Meta Verified", "98% Open Rate", "24/7 Bot Replies", "Zero Server Setup"},

		ShowWhy: true, ShowFeatures: true, ShowSolutions: true, ShowPricing: true, ShowFAQ: true,

		WhyTitle:    "Why choose One Suit?",
		WhySubtitle: "Built to give businesses the highest return from WhatsApp marketing.",
		WhyCards: []SiteCard{
			{Title: "Increased Engagement", Text: "Talk to customers in real time on the app they open every day, and build relationships that last.", Icon: "award"},
			{Title: "Higher Conversions", Text: "Targeted, personal campaigns turn casual chats into sales.", Icon: "trending-up"},
			{Title: "24/7 Support", Text: "Automatic replies answer customers any time, so you never miss a lead.", Icon: "headphones"},
		},
		FeaturesTitle:    "Everything you need for WhatsApp marketing",
		FeaturesSubtitle: "Features that make WhatsApp marketing simple.",
		Features: []SiteCard{
			{Title: "Embedded Signup", Text: "Connect your WhatsApp number in minutes with Meta's official signup.", Icon: "log-in"},
			{Title: "Template Management", Text: "Create and submit message templates without leaving the app.", Icon: "file-text"},
			{Title: "Multiple Numbers", Text: "Manage several phone numbers from one account.", Icon: "phone"},
			{Title: "Team Inbox", Text: "A familiar WhatsApp-style live chat shared by your whole team.", Icon: "message-square"},
			{Title: "Chatbots", Text: "Answer customers 24/7 with keyword replies and AI.", Icon: "bot"},
			{Title: "APIs & Webhooks", Text: "Connect your CRM, store and other tools.", Icon: "sliders"},
			{Title: "Contacts", Text: "Import and export contacts with tags and custom fields.", Icon: "users"},
			{Title: "Realtime Updates", Text: "Delivery and read receipts as they happen.", Icon: "zap"},
			{Title: "Interactive Messages", Text: "Buttons, lists, media and catalog messages.", Icon: "workflow"},
		},
		PricingTitle:    "Simple and clear pricing",
		PricingSubtitle: "Start small and grow. Save more with longer billing cycles.",
		FAQTitle:        "Frequently asked questions",
		FAQSubtitle:     "Answers to the questions we hear most.",
		FAQs: []SiteFAQ{
			{Question: "How do I sign up?", Answer: "Open the sign-up page, enter your details and connect your WhatsApp Business number with Meta's Embedded Signup."},
			{Question: "Can I import my existing contacts?", Answer: "Yes. Upload an XLSX or CSV file, map your fields and start sending campaigns."},
			{Question: "Do I need my own servers?", Answer: "No. Everything runs in the cloud on the official WhatsApp Cloud API."},
			{Question: "Can several agents use the same number?", Answer: "Yes. The shared team inbox lets you assign and transfer chats and leave internal notes."},
		},

		FooterTagline: "One Suit for all your business needs. The modern WhatsApp marketing platform built on the WhatsApp Business Cloud API.",
		BusinessHours: "Monday – Saturday, 9:00 AM – 7:00 PM IST",
	}
}

// loadSiteContent reads the stored content over the defaults. Contact details
// fall back to the platform configuration.
func (a *App) loadSiteContent() SiteContent {
	c := defaultSiteContent()
	var row models.PlatformSetting
	if err := a.DB.Where("key = ?", siteContentKey).First(&row).Error; err == nil {
		if raw, err := json.Marshal(row.Value); err == nil {
			_ = json.Unmarshal(raw, &c)
		}
	}
	cfg := a.loadPlatformConfig()
	if c.Address == "" {
		c.Address = cfg.ContactAddress
	}
	if c.Phone == "" {
		c.Phone = cfg.SupportPhone
	}
	if c.Email == "" {
		c.Email = cfg.SupportEmail
	}
	return c
}

func trimAll(list []string, max int) []string {
	out := make([]string, 0, len(list))
	for _, s := range list {
		if s = strings.TrimSpace(s); s != "" && len(out) < max {
			out = append(out, s)
		}
	}
	return out
}

func cleanCards(cards []SiteCard, max int) []SiteCard {
	out := make([]SiteCard, 0, len(cards))
	for _, c := range cards {
		c.Title, c.Text = strings.TrimSpace(c.Title), strings.TrimSpace(c.Text)
		if c.Title == "" || len(out) >= max {
			continue
		}
		if !siteIcons[c.Icon] {
			c.Icon = "sparkles"
		}
		out = append(out, c)
	}
	return out
}

// validate cleans the content and returns a user-facing error, or "".
func (c *SiteContent) validate() string {
	switch c.LogoDisplay {
	case "logo", "logo_name", "name":
	default:
		c.LogoDisplay = "logo"
	}
	if c.LogoHeight < 24 || c.LogoHeight > 80 {
		c.LogoHeight = 40
	}
	switch c.AnimationStyle {
	case "fade-up", "zoom", "slide-left", "none":
	default:
		c.AnimationStyle = "fade-up"
	}
	switch c.AnimationSpeed {
	case "slow", "normal", "fast":
	default:
		c.AnimationSpeed = "normal"
	}
	switch c.HeroBackground {
	case "glow", "gradient", "plain":
	default:
		c.HeroBackground = "gradient"
	}

	c.TrustBadges = trimAll(c.TrustBadges, 6)
	c.WhyCards = cleanCards(c.WhyCards, 6)
	c.Features = cleanCards(c.Features, 12)
	faqs := make([]SiteFAQ, 0, len(c.FAQs))
	for _, f := range c.FAQs {
		f.Question, f.Answer = strings.TrimSpace(f.Question), strings.TrimSpace(f.Answer)
		if f.Question != "" && len(faqs) < 20 {
			faqs = append(faqs, f)
		}
	}
	c.FAQs = faqs

	for _, p := range []*string{&c.HeroBadge, &c.HeroTitle, &c.HeroHighlight, &c.HeroSubtitle, &c.PrimaryCTA,
		&c.SecondaryCTA, &c.WhyTitle, &c.WhySubtitle, &c.FeaturesTitle, &c.FeaturesSubtitle, &c.PricingTitle,
		&c.PricingSubtitle, &c.FAQTitle, &c.FAQSubtitle, &c.FooterTagline, &c.CopyrightText, &c.Address,
		&c.Phone, &c.Email, &c.WhatsAppNumber, &c.BusinessHours, &c.HeroImageURL, &c.MapURL,
		&c.FacebookURL, &c.InstagramURL, &c.TwitterURL, &c.LinkedInURL, &c.YouTubeURL} {
		*p = strings.TrimSpace(*p)
		if len(*p) > 2000 {
			return "Each text field must be 2000 characters or fewer"
		}
	}
	if c.HeroTitle == "" {
		return "The main headline is required"
	}
	if c.Email != "" && !validEmail(c.Email) {
		return "Email is not a valid email address"
	}
	for _, u := range []string{c.HeroImageURL, c.MapURL, c.FacebookURL, c.InstagramURL, c.TwitterURL, c.LinkedInURL, c.YouTubeURL} {
		if u != "" && !validWebURL(u) {
			return "Links must start with http:// or https:// (" + u + ")"
		}
	}
	return ""
}

// PublicPageLink is a published CMS page linked from the website.
type PublicPageLink struct {
	Title string `json:"title"`
	Slug  string `json:"slug"`
}

// GetPublicSiteContent returns the website content and the published pages
// (GET /api/public/site-content). No login required.
func (a *App) GetPublicSiteContent(r *fastglue.Request) error {
	pages := []PublicPageLink{}
	a.DB.Model(&models.CMSPage{}).Select("title", "slug").Where("is_published = ?", true).Order("title ASC").Scan(&pages)
	return r.SendEnvelope(map[string]any{"content": a.loadSiteContent(), "pages": pages})
}

// SuperAdminGetSiteContent returns the editable website content.
func (a *App) SuperAdminGetSiteContent(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	return r.SendEnvelope(a.loadSiteContent())
}

// SuperAdminUpdateSiteContent replaces the website content. Fields left out
// keep their current value.
func (a *App) SuperAdminUpdateSiteContent(r *fastglue.Request) error {
	if _, err := a.requireSuperAdmin(r); err != nil {
		return nil
	}
	c := a.loadSiteContent()
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &c); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}
	if msg := c.validate(); msg != "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, msg, nil, "")
	}
	raw, _ := json.Marshal(c)
	value := models.JSONB{}
	_ = json.Unmarshal(raw, &value)
	if err := a.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&models.PlatformSetting{Key: siteContentKey, Value: value}).Error; err != nil {
		a.Log.Error("Failed to save site content", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to save website content", nil, "")
	}
	return r.SendEnvelope(c)
}

// defaultPages are created once so the super admin has the usual legal pages to edit.
var defaultPages = []models.CMSPage{
	{Title: "About Us", Slug: "about-us", IsPublished: true, Content: `## Who we are
One Suit is a WhatsApp marketing and customer engagement platform for growing businesses and brands.

## What we do
We help businesses talk to customers on WhatsApp: broadcast campaigns, a shared team inbox, chatbots and AI agents, all in one place.

## Our mission
To help companies turn conversations into customers and give great support around the clock.`},
	{Title: "Privacy Policy", Slug: "privacy-policy", IsPublished: true, Content: `## Information we collect
Your account details (name, business email, phone), your WhatsApp Business account connection and the contacts you store in your workspace.

## How we use it
Only to run the service: sending and receiving WhatsApp messages, routing chats to your team, running chatbots and showing reports. We never sell your data.

## Security
Secrets are stored encrypted and all connections use HTTPS.

## Contact
Questions about privacy? Write to us using the details on our Contact section.`},
	{Title: "Terms & Conditions", Slug: "terms-and-conditions", IsPublished: true, Content: `## Using the service
By using One Suit you agree to follow WhatsApp's Business and Commerce policies. Spam and unwanted bulk messages are not allowed.

## Your account
Keep your login details safe. You are responsible for activity in your account.

## Billing
Plans are paid in advance for the billing cycle you choose. Meta's WhatsApp message charges are separate.

## Liability
We are not liable for losses caused by WhatsApp outages or by Meta restricting an account for policy violations.`},
	{Title: "Refund & Cancellation Policy", Slug: "refund-policy", IsPublished: true, Content: `## Cancellation
You can cancel any time. Your plan stays active until the end of the period you paid for.

## Refunds
Plans are generally not refundable once active. If you were charged by mistake, contact us within 48 hours and we will review it.`},
	{Title: "Shipping & Delivery Policy", Slug: "shipping-policy", IsPublished: true, Content: `## Digital service
One Suit is an online service; nothing is shipped.

## Activation
Your workspace is ready as soon as you sign up and your payment is confirmed.`},
}

// EnsureDefaultPages creates the default website pages once. Pages the super
// admin later deletes are not created again.
func EnsureDefaultPages(db *gorm.DB) error {
	var flag int64
	db.Model(&models.PlatformSetting{}).Where("key = ?", defaultPagesSeededKey).Count(&flag)
	if flag > 0 {
		return nil
	}
	for _, p := range defaultPages {
		var n int64
		db.Model(&models.CMSPage{}).Where("slug = ?", p.Slug).Count(&n)
		if n > 0 {
			continue
		}
		page := p
		if err := db.Create(&page).Error; err != nil {
			return err
		}
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&models.PlatformSetting{Key: defaultPagesSeededKey, Value: models.JSONB{"done": true}}).Error
}
