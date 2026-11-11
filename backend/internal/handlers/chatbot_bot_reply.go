package handlers

import (
	"context"
	"fmt"
	"io"
	"mime"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/shridarpatil/whatomate/pkg/whatsapp"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// Chatbot flow types. A flow's type decides which steps the builder offers
// and what the backend accepts on save:
//   - simple:   text replies with reply buttons or a list (question → answer).
//   - media:    simple + media (image, video, audio, document); no links.
//   - advanced: everything, including links, CTA URL buttons, API calls,
//     webhooks and agent transfer.
const (
	ChatFlowTypeSimple   = "simple"
	ChatFlowTypeMedia    = "media"
	ChatFlowTypeAdvanced = "advanced"
)

// ChatNodeReply is the "bot reply" step the builder creates: text with an
// optional header (text or media) and an optional interactive part (reply
// buttons, list or CTA URL button).
const ChatNodeReply ChatNodeType = "reply"

// normalizeChatFlowType returns the stored form of a requested flow type.
// Empty means advanced, which is also what every flow created before flow
// types existed is.
func normalizeChatFlowType(t string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "", ChatFlowTypeAdvanced:
		return ChatFlowTypeAdvanced, nil
	case ChatFlowTypeSimple:
		return ChatFlowTypeSimple, nil
	case ChatFlowTypeMedia:
		return ChatFlowTypeMedia, nil
	}
	return "", fmt.Errorf("flow_type must be simple, media or advanced")
}

func chatFlowTypeName(t string) string {
	switch t {
	case ChatFlowTypeSimple:
		return "Simple bots"
	case ChatFlowTypeMedia:
		return "Media bots"
	}
	return "Advanced bots"
}

// linkPattern matches what counts as a link in simple and media bots:
// http(s):// URLs, www. hosts and domain-looking tokens (example.com, wa.me/x).
var linkPattern = regexp.MustCompile(`(?i)(https?://\S+|\bwww\.\S+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|in|io|co|info|biz|me|app|dev|xyz|online|site|store|shop|ly|gl|link|ai|us|uk|tech|club|live|pro|page|to|cc|tv|ws|gov|edu|ru|de|fr|au|ca|eu|ae|sg|pk|bd|lk|np)\b(?:/\S*)?)`)

// findLink returns the first link-looking token in s, or "".
func findLink(s string) string {
	return linkPattern.FindString(s)
}

// botReplyConfig is the parsed config of a reply node.
type botReplyConfig struct {
	Body        string
	Footer      string
	HeaderType  string // none, text, image, video, audio, document
	HeaderText  string
	MediaPath   string
	MediaName   string
	MediaMime   string
	Interactive string // none, buttons, list, cta_url
	Buttons     []whatsapp.Button
	ListButton  string
	Sections    []whatsapp.ListSection
	CTAText     string
	CTAURL      string
	// A second link button (Advanced bots). WhatsApp allows one link button
	// per message, so it is sent as its own message right after.
	CTA2Text string
	CTA2URL  string
	StoreAs  string
}

func mapFromConfig(cfg map[string]any, key string) map[string]any {
	m, _ := cfg[key].(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}

func mapsFromConfig(cfg map[string]any, key string) []map[string]any {
	raw, _ := cfg[key].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func parseBotReplyConfig(cfg map[string]any) botReplyConfig {
	header := mapFromConfig(cfg, "header")
	out := botReplyConfig{
		Body:        stringFromConfig(cfg, "body", "message", "text"),
		Footer:      stringFromConfig(cfg, "footer"),
		HeaderType:  strings.ToLower(stringFromConfig(header, "type")),
		HeaderText:  stringFromConfig(header, "text"),
		MediaPath:   stringFromConfig(header, "media_path"),
		MediaName:   stringFromConfig(header, "filename"),
		MediaMime:   stringFromConfig(header, "mime_type"),
		Interactive: strings.ToLower(stringFromConfig(cfg, "interactive")),
		StoreAs:     stringFromConfig(cfg, "store_as"),
	}
	if out.HeaderType == "" {
		out.HeaderType = "none"
	}
	if out.Interactive == "" {
		out.Interactive = "none"
	}
	for _, b := range mapsFromConfig(cfg, "buttons") {
		out.Buttons = append(out.Buttons, whatsapp.Button{ID: stringFromConfig(b, "id"), Title: stringFromConfig(b, "title")})
	}
	list := mapFromConfig(cfg, "list")
	out.ListButton = stringFromConfig(list, "button_text")
	for _, s := range mapsFromConfig(list, "sections") {
		section := whatsapp.ListSection{Title: stringFromConfig(s, "title")}
		for _, r := range mapsFromConfig(s, "rows") {
			section.Rows = append(section.Rows, whatsapp.ListRow{
				ID:          stringFromConfig(r, "id"),
				Title:       stringFromConfig(r, "title"),
				Description: stringFromConfig(r, "description"),
			})
		}
		out.Sections = append(out.Sections, section)
	}
	cta := mapFromConfig(cfg, "cta")
	out.CTAText = stringFromConfig(cta, "display_text")
	out.CTAURL = stringFromConfig(cta, "url")
	cta2 := mapFromConfig(cfg, "cta2")
	out.CTA2Text = stringFromConfig(cta2, "display_text")
	out.CTA2URL = stringFromConfig(cta2, "url")
	return out
}

// options returns the selectable (id, title) pairs of a buttons/list reply.
func (c botReplyConfig) options() []whatsapp.Button {
	switch c.Interactive {
	case "buttons":
		return c.Buttons
	case "list":
		var out []whatsapp.Button
		for _, s := range c.Sections {
			for _, r := range s.Rows {
				out = append(out, whatsapp.Button{ID: r.ID, Title: r.Title})
			}
		}
		return out
	}
	return nil
}

func isMediaHeader(t string) bool {
	return t == "image" || t == "video" || t == "audio" || t == "document"
}

// ─── Validation ──────────────────────────────────────────────────────────────

// chatFlowNodeTypesFor lists the node types a simple or media bot may hold.
// Advanced bots may hold any type.
var basicChatFlowNodeTypes = map[string]bool{
	string(ChatNodeStart):   true,
	string(ChatNodeReply):   true,
	string(ChatNodeMessage): true,
	string(ChatNodeButtons): true,
	string(ChatNodeEnd):     true,
}

func runeLen(s string) int { return utf8.RuneCountInString(s) }

// validateChatbotFlowGraph checks a flow's graph against its type and the
// WhatsApp limits of reply steps. It returns a user-facing error.
func validateChatbotFlowGraph(flowType string, graph map[string]any) error {
	if graph == nil {
		return nil
	}
	restricted := flowType == ChatFlowTypeSimple || flowType == ChatFlowTypeMedia
	kind := chatFlowTypeName(flowType)

	for _, n := range mapsFromConfig(graph, "nodes") {
		nodeType := stringFromConfig(n, "type")
		cfg := mapFromConfig(n, "config")
		name := stringFromConfig(n, "label")
		if name == "" {
			name = "step " + stringFromConfig(n, "id")
		}
		name = fmt.Sprintf("%q", name)

		if restricted && !basicChatFlowNodeTypes[nodeType] {
			return fmt.Errorf("%s can't use %s steps (%s). Use an Advanced bot for API calls, webhooks and agent transfer", kind, nodeType, name)
		}

		// checkLinks rejects links in the user-visible texts of simple/media bots.
		checkLinks := func(field, value string) error {
			if !restricted {
				return nil
			}
			if link := findLink(value); link != "" {
				return fmt.Errorf("%s can't contain links: remove %q from the %s of %s", kind, link, field, name)
			}
			return nil
		}

		switch ChatNodeType(nodeType) {
		case ChatNodeReply:
			if err := validateBotReply(parseBotReplyConfig(cfg), flowType, kind, name, checkLinks); err != nil {
				return err
			}
		case ChatNodeMessage, ChatNodeEnd:
			if err := checkLinks("message", stringFromConfig(cfg, "message", "text")); err != nil {
				return err
			}
		case ChatNodeButtons:
			if err := checkLinks("message", stringFromConfig(cfg, "body", "message", "text")); err != nil {
				return err
			}
			for _, b := range buttonsFromConfig(cfg) {
				t, _ := b["type"].(string)
				if restricted && t != "" && t != "reply" {
					return fmt.Errorf("%s only support reply buttons: %s has a %s button", kind, name, t)
				}
				title, _ := b["title"].(string)
				if err := checkLinks("button "+fmt.Sprintf("%q", title), title); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func validateBotReply(c botReplyConfig, flowType, kind, name string, checkLinks func(field, value string) error) error {
	switch c.HeaderType {
	case "none", "text", "image", "video", "audio", "document":
	default:
		return fmt.Errorf("%s has an unknown header type %q", name, c.HeaderType)
	}
	switch c.Interactive {
	case "none", "buttons", "list", "cta_url":
	default:
		return fmt.Errorf("%s has an unknown reply type %q", name, c.Interactive)
	}

	if flowType == ChatFlowTypeSimple && isMediaHeader(c.HeaderType) {
		return fmt.Errorf("Simple bots can't send media (%s). Use a Media or Advanced bot", name)
	}
	if flowType != ChatFlowTypeAdvanced && c.Interactive == "cta_url" {
		return fmt.Errorf("%s can't have a CTA URL button (%s). Use an Advanced bot for links", kind, name)
	}

	interactive := c.Interactive != "none"
	if interactive && strings.TrimSpace(c.Body) == "" {
		return fmt.Errorf("%s needs reply text", name)
	}
	if !interactive && !isMediaHeader(c.HeaderType) && strings.TrimSpace(c.Body) == "" {
		return fmt.Errorf("%s needs reply text", name)
	}
	maxBody := whatsapp.MaxTextMessageLength
	if interactive || isMediaHeader(c.HeaderType) {
		maxBody = whatsapp.MaxInteractiveBody
	}
	if runeLen(c.Body) > maxBody {
		return fmt.Errorf("the reply text of %s is %d characters; WhatsApp allows %d", name, runeLen(c.Body), maxBody)
	}
	if err := checkLinks("reply text", c.Body); err != nil {
		return err
	}
	if runeLen(c.Footer) > whatsapp.MaxInteractiveFooter {
		return fmt.Errorf("the footer of %s is longer than %d characters", name, whatsapp.MaxInteractiveFooter)
	}
	if err := checkLinks("footer", c.Footer); err != nil {
		return err
	}

	switch c.HeaderType {
	case "text":
		if strings.TrimSpace(c.HeaderText) == "" {
			return fmt.Errorf("the text header of %s is empty", name)
		}
		if runeLen(c.HeaderText) > whatsapp.MaxInteractiveHeader {
			return fmt.Errorf("the header of %s is longer than %d characters", name, whatsapp.MaxInteractiveHeader)
		}
		if err := checkLinks("header", c.HeaderText); err != nil {
			return err
		}
	case "image", "video", "audio", "document":
		if c.MediaPath == "" {
			return fmt.Errorf("%s has a %s header but no file was uploaded", name, c.HeaderType)
		}
		if c.Interactive == "list" {
			return fmt.Errorf("list messages can only have a text header (%s)", name)
		}
	}

	switch c.Interactive {
	case "buttons":
		if len(c.Buttons) == 0 || len(c.Buttons) > whatsapp.MaxReplyButtons {
			return fmt.Errorf("%s needs 1 to %d reply buttons", name, whatsapp.MaxReplyButtons)
		}
		seen := map[string]bool{}
		titles := map[string]bool{}
		for i, b := range c.Buttons {
			if strings.TrimSpace(b.Title) == "" {
				return fmt.Errorf("button %d of %s has no label", i+1, name)
			}
			if runeLen(b.Title) > whatsapp.MaxReplyButtonTitle {
				return fmt.Errorf("button %q of %s is longer than %d characters", b.Title, name, whatsapp.MaxReplyButtonTitle)
			}
			if b.ID == "" || seen[b.ID] {
				return fmt.Errorf("button %d of %s needs a unique id", i+1, name)
			}
			if titles[strings.ToLower(b.Title)] {
				return fmt.Errorf("%s has two buttons labelled %q", name, b.Title)
			}
			seen[b.ID] = true
			titles[strings.ToLower(b.Title)] = true
			if err := checkLinks(fmt.Sprintf("button %q", b.Title), b.Title); err != nil {
				return err
			}
		}
	case "list":
		if strings.TrimSpace(c.ListButton) == "" {
			return fmt.Errorf("the list of %s needs button text", name)
		}
		if runeLen(c.ListButton) > whatsapp.MaxListButtonText {
			return fmt.Errorf("the list button text of %s is longer than %d characters", name, whatsapp.MaxListButtonText)
		}
		if err := checkLinks("list button", c.ListButton); err != nil {
			return err
		}
		rows := 0
		seen := map[string]bool{}
		for _, s := range c.Sections {
			if runeLen(s.Title) > whatsapp.MaxListSectionTitle {
				return fmt.Errorf("section %q of %s is longer than %d characters", s.Title, name, whatsapp.MaxListSectionTitle)
			}
			if err := checkLinks("section title", s.Title); err != nil {
				return err
			}
			for _, r := range s.Rows {
				rows++
				if strings.TrimSpace(r.Title) == "" {
					return fmt.Errorf("row %d of %s has no title", rows, name)
				}
				if runeLen(r.Title) > whatsapp.MaxListRowTitle {
					return fmt.Errorf("row %q of %s is longer than %d characters", r.Title, name, whatsapp.MaxListRowTitle)
				}
				if runeLen(r.Description) > whatsapp.MaxListRowDescription {
					return fmt.Errorf("the description of row %q in %s is longer than %d characters", r.Title, name, whatsapp.MaxListRowDescription)
				}
				if r.ID == "" || seen[r.ID] {
					return fmt.Errorf("row %d of %s needs a unique row id", rows, name)
				}
				seen[r.ID] = true
				if err := checkLinks(fmt.Sprintf("row %q", r.Title), r.Title+" "+r.Description); err != nil {
					return err
				}
			}
		}
		if rows == 0 || rows > whatsapp.MaxListRows {
			return fmt.Errorf("the list of %s needs 1 to %d rows, it has %d", name, whatsapp.MaxListRows, rows)
		}
	case "cta_url":
		if strings.TrimSpace(c.CTAText) == "" {
			return fmt.Errorf("the CTA button of %s needs a label", name)
		}
		if runeLen(c.CTAText) > whatsapp.MaxCTADisplayText {
			return fmt.Errorf("the CTA button label of %s is longer than %d characters", name, whatsapp.MaxCTADisplayText)
		}
		lower := strings.ToLower(c.CTAURL)
		if !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "http://") {
			return fmt.Errorf("the CTA button of %s needs a URL starting with https://", name)
		}
		if strings.TrimSpace(c.CTA2Text) != "" || strings.TrimSpace(c.CTA2URL) != "" {
			if strings.TrimSpace(c.CTA2Text) == "" {
				return fmt.Errorf("the second link button of %s needs a label", name)
			}
			if runeLen(c.CTA2Text) > whatsapp.MaxCTADisplayText {
				return fmt.Errorf("the second link button label of %s is longer than %d characters", name, whatsapp.MaxCTADisplayText)
			}
			lower2 := strings.ToLower(c.CTA2URL)
			if !strings.HasPrefix(lower2, "https://") && !strings.HasPrefix(lower2, "http://") {
				return fmt.Errorf("the second link button of %s needs a URL starting with https://", name)
			}
		}
	}
	return nil
}

// ─── Contact variables ───────────────────────────────────────────────────────

// countryByDialCode maps common calling codes to a country name, used for
// {country} when the contact has none stored. Longest prefix wins.
var countryByDialCode = map[string]string{
	"1": "United States", "44": "United Kingdom", "91": "India", "92": "Pakistan",
	"880": "Bangladesh", "977": "Nepal", "94": "Sri Lanka", "971": "United Arab Emirates",
	"966": "Saudi Arabia", "974": "Qatar", "965": "Kuwait", "968": "Oman", "973": "Bahrain",
	"61": "Australia", "64": "New Zealand", "65": "Singapore", "60": "Malaysia", "62": "Indonesia",
	"63": "Philippines", "66": "Thailand", "84": "Vietnam", "49": "Germany", "33": "France",
	"39": "Italy", "34": "Spain", "31": "Netherlands", "27": "South Africa", "234": "Nigeria",
	"254": "Kenya", "20": "Egypt", "55": "Brazil", "52": "Mexico", "7": "Russia", "81": "Japan",
	"82": "South Korea", "86": "China",
}

func countryFromPhone(phone string) string {
	digits := strings.TrimLeft(phone, "+")
	for l := 3; l >= 1; l-- {
		if len(digits) > l {
			if c, ok := countryByDialCode[digits[:l]]; ok {
				return c
			}
		}
	}
	return ""
}

// contactVariables returns the reply-editor variables ({first_name},
// {last_name}, {full_name}, {phone_number}, {email}, {country},
// {language_code}) of a contact.
func contactVariables(contact *models.Contact, phone string) models.JSONB {
	data := models.JSONB{}
	meta := models.JSONB{}
	fullName := ""
	if contact != nil {
		fullName = strings.TrimSpace(contact.ProfileName)
		if contact.Metadata != nil {
			meta = contact.Metadata
		}
		if phone == "" {
			phone = contact.PhoneNumber
		}
	}
	first, last := fullName, ""
	if i := strings.IndexByte(fullName, ' '); i > 0 {
		first, last = fullName[:i], strings.TrimSpace(fullName[i+1:])
	}
	metaStr := func(keys ...string) string { return stringFromConfig(meta, keys...) }
	country := metaStr("country")
	if country == "" {
		country = countryFromPhone(phone)
	}
	data["first_name"] = first
	data["last_name"] = last
	data["full_name"] = fullName
	data["phone_number"] = phone
	data["email"] = metaStr("email")
	data["country"] = country
	data["language_code"] = metaStr("language_code", "language")
	return data
}

// botTextData is what reply texts render against: the contact variables,
// overridden by any non-empty session variable of the same name.
func botTextData(ctx *chatNodeCtx) models.JSONB {
	data := contactVariables(ctx.contact, ctx.session.PhoneNumber)
	for k, v := range ctx.session.SessionData {
		if s, ok := v.(string); ok && s == "" {
			if _, isContactVar := data[k]; isContactVar {
				continue
			}
		}
		data[k] = v
	}
	return data
}

var singleBraceVarPattern = regexp.MustCompile(`\{(first_name|last_name|full_name|phone_number|email|country|language_code)\}`)

// renderBotText fills {{var}} templates and the single-brace contact
// variables of the reply editor.
func renderBotText(text string, data models.JSONB) string {
	if text == "" {
		return ""
	}
	out := processTemplate(text, data)
	return singleBraceVarPattern.ReplaceAllStringFunc(out, func(m string) string {
		v, _ := data[m[1:len(m)-1]].(string)
		return v
	})
}

// ─── Runner ──────────────────────────────────────────────────────────────────

// execChatReply runs a bot reply step.
//   - Text / media replies and CTA URL replies send and fall through ("default").
//   - Reply-button and list replies send, then wait. The next inbound picks
//     an option (tap, or typing an option's title) and routes "button:<id>";
//     anything else re-sends the menu.
func (a *App) execChatReply(node *ChatNode, ctx *chatNodeCtx) (nodeOutcome, error) {
	c := parseBotReplyConfig(node.Config)
	if ctx.session.SessionData == nil {
		ctx.session.SessionData = models.JSONB{}
	}
	if options := c.options(); len(options) > 0 && !ctx.consumed && (ctx.buttonID != "" || ctx.userInput != "") {
		picked := ""
		for _, o := range options {
			if ctx.buttonID != "" && o.ID == ctx.buttonID {
				picked = o.ID
				break
			}
		}
		if picked == "" && ctx.userInput != "" {
			typed := strings.TrimSpace(ctx.userInput)
			for _, o := range options {
				if strings.EqualFold(typed, strings.TrimSpace(o.Title)) {
					picked = o.ID
					break
				}
			}
		}
		if picked != "" {
			ctx.consumed = true
			if c.StoreAs != "" {
				value := ctx.userInput
				if value == "" {
					value = picked
				}
				ctx.session.SessionData[c.StoreAs] = value
			}
			return nodeOutcome{outcome: "button:" + picked}, nil
		}
		// Not one of this step's options: send the menu again below.
		ctx.consumed = true
	}

	data := botTextData(ctx)
	body := renderBotText(c.Body, data)
	if err := a.sendBotReply(ctx, c, body, data); err != nil {
		return nodeOutcome{}, fmt.Errorf("send reply %q: %w", node.ID, err)
	}
	a.logSessionMessage(ctx.session.ID, models.DirectionOutgoing, body, node.ID)

	if c.Interactive == "buttons" || c.Interactive == "list" {
		return nodeOutcome{yield: true}, nil
	}
	return nodeOutcome{outcome: "default"}, nil
}

// sendBotReply sends one reply step as WhatsApp messages.
func (a *App) sendBotReply(ctx *chatNodeCtx, c botReplyConfig, body string, data models.JSONB) error {
	headerText := renderBotText(c.HeaderText, data)

	if c.Interactive == "none" {
		switch c.HeaderType {
		case "image", "video", "document":
			return a.sendBotMedia(ctx, c, body)
		case "audio":
			// Audio messages have no caption: the text goes after it.
			if err := a.sendBotMedia(ctx, c, ""); err != nil {
				return err
			}
		case "text":
			if headerText != "" {
				body = "*" + headerText + "*\n" + body
			}
		}
		if strings.TrimSpace(body) == "" {
			return nil
		}
		return a.sendAndSaveTextMessage(ctx.account, ctx.contact, body)
	}

	msg := whatsapp.InteractiveMessage{Body: body, Footer: renderBotText(c.Footer, data)}
	req := OutgoingMessageRequest{
		Account:     ctx.account,
		Contact:     ctx.contact,
		Type:        models.MessageTypeInteractive,
		BodyText:    body,
		Interactive: &msg,
	}
	switch c.Interactive {
	case "buttons":
		msg.Type = "button"
		for _, b := range c.Buttons {
			msg.Buttons = append(msg.Buttons, whatsapp.Button{ID: b.ID, Title: renderBotText(b.Title, data)})
		}
		req.InteractiveType = "button"
	case "list":
		msg.Type = "list"
		msg.ListButtonText = renderBotText(c.ListButton, data)
		msg.Sections = c.Sections
		req.InteractiveType = "list"
	case "cta_url":
		msg.Type = "cta_url"
		msg.CTADisplayText = renderBotText(c.CTAText, data)
		msg.CTAURL = renderBotText(c.CTAURL, data)
		req.InteractiveType = "cta_url"
	}

	switch c.HeaderType {
	case "text":
		if headerText != "" {
			msg.Header = &whatsapp.InteractiveHeader{Type: "text", Text: headerText}
		}
	case "audio":
		// WhatsApp has no audio header: send the audio just before the menu.
		if err := a.sendBotMedia(ctx, c, ""); err != nil {
			return err
		}
	case "image", "video", "document":
		file, err := a.loadBotMedia(ctx.account.OrganizationID, c)
		if err != nil {
			return err
		}
		mediaID, err := a.WhatsApp.UploadMedia(context.Background(), a.toWhatsAppAccount(ctx.account), file.data, file.mime, file.name)
		if err != nil {
			return fmt.Errorf("upload header media: %w", err)
		}
		msg.Header = &whatsapp.InteractiveHeader{Type: c.HeaderType, MediaID: mediaID, Filename: file.name}
		req.MediaURL = c.MediaPath
		req.MediaMimeType = file.mime
		req.MediaFilename = file.name
	}

	if _, err := a.SendOutgoingMessage(context.Background(), req, ChatbotSendOptions()); err != nil {
		return err
	}
	// Second link button: its own message, with its label as the text.
	if c.Interactive == "cta_url" && strings.TrimSpace(c.CTA2Text) != "" && strings.TrimSpace(c.CTA2URL) != "" {
		label := renderBotText(c.CTA2Text, data)
		second := whatsapp.InteractiveMessage{Type: "cta_url", Body: label, CTADisplayText: label, CTAURL: renderBotText(c.CTA2URL, data)}
		_, err := a.SendOutgoingMessage(context.Background(), OutgoingMessageRequest{
			Account: ctx.account, Contact: ctx.contact, Type: models.MessageTypeInteractive,
			BodyText: label, Interactive: &second, InteractiveType: "cta_url",
		}, ChatbotSendOptions())
		return err
	}
	return nil
}

// sendBotMedia sends the reply's media file as a media message.
func (a *App) sendBotMedia(ctx *chatNodeCtx, c botReplyConfig, caption string) error {
	file, err := a.loadBotMedia(ctx.account.OrganizationID, c)
	if err != nil {
		return err
	}
	types := map[string]models.MessageType{
		"image":    models.MessageTypeImage,
		"video":    models.MessageTypeVideo,
		"audio":    models.MessageTypeAudio,
		"document": models.MessageTypeDocument,
	}
	_, err = a.SendOutgoingMessage(context.Background(), OutgoingMessageRequest{
		Account:       ctx.account,
		Contact:       ctx.contact,
		Type:          types[c.HeaderType],
		MediaData:     file.data,
		MediaURL:      c.MediaPath,
		MediaMimeType: file.mime,
		MediaFilename: file.name,
		Caption:       caption,
	}, ChatbotSendOptions())
	return err
}

type botMediaFile struct {
	data []byte
	mime string
	name string
}

// chatbotMediaDir is where uploaded bot media lives, per organization,
// relative to the media storage root.
func chatbotMediaDir(orgID uuid.UUID) string {
	return path.Join("chatbot", orgID.String())
}

// loadBotMedia reads a reply's uploaded file. The path must be inside the
// organization's chatbot media folder.
func (a *App) loadBotMedia(orgID uuid.UUID, c botReplyConfig) (*botMediaFile, error) {
	full, err := a.chatbotMediaFullPath(orgID, path.Base(c.MediaPath))
	if err != nil || path.Clean(c.MediaPath) != path.Join(chatbotMediaDir(orgID), path.Base(c.MediaPath)) {
		return nil, fmt.Errorf("media %q is not a file of this organization", c.MediaPath)
	}
	data, err := os.ReadFile(full)
	if err != nil {
		return nil, fmt.Errorf("read media: %w", err)
	}
	mimeType := c.MediaMime
	if mimeType == "" {
		mimeType = getMimeTypeFromExtension(strings.ToLower(filepath.Ext(full)))
	}
	name := c.MediaName
	if name == "" {
		name = path.Base(c.MediaPath)
	}
	return &botMediaFile{data: data, mime: mimeType, name: name}, nil
}

// chatbotMediaFullPath resolves a file name in the org's chatbot media folder,
// rejecting anything that is not a plain file name.
func (a *App) chatbotMediaFullPath(orgID uuid.UUID, name string) (string, error) {
	if name == "" || name != filepath.Base(name) || strings.HasPrefix(name, ".") {
		return "", fmt.Errorf("invalid file name")
	}
	base, err := filepath.Abs(a.getMediaStoragePath())
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "chatbot", orgID.String(), name), nil
}

// ─── Media upload / preview ──────────────────────────────────────────────────

// botMediaKind returns image/video/audio/document for an allowed WhatsApp
// media MIME type, with its size limit in bytes.
func botMediaKind(mimeType string) (string, int64, bool) {
	mt := strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	switch mt {
	case "image/jpeg", "image/png":
		return "image", 5 << 20, true
	case "video/mp4", "video/3gpp":
		return "video", 16 << 20, true
	case "audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg":
		return "audio", 16 << 20, true
	case "application/pdf", "text/plain", "application/msword", "application/vnd.ms-excel",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return "document", 100 << 20, true
	}
	return "", 0, false
}

// UploadChatbotFlowMedia stores a file for a bot reply (header or media
// message) and returns the reference the reply's config keeps.
// POST /api/chatbot/flows/media (multipart "file")
func (a *App) UploadChatbotFlowMedia(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	if !a.HasPermission(userID, models.ResourceFlowsChatbot, models.ActionWrite, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Permission denied", nil, "")
	}

	fileHeader, err := r.RequestCtx.FormFile("file")
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "No file provided", nil, "")
	}
	mimeType := fileHeader.Header.Get("Content-Type")
	if _, _, ok := botMediaKind(mimeType); !ok {
		if byExt := mime.TypeByExtension(strings.ToLower(filepath.Ext(fileHeader.Filename))); byExt != "" {
			mimeType = byExt
		}
	}
	kind, maxSize, ok := botMediaKind(mimeType)
	if !ok {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			"Unsupported file type. Use JPG/PNG images, MP4/3GP video, AAC/MP3/M4A/AMR/OGG audio, or PDF/Office/TXT documents", nil, "")
	}
	if fileHeader.Size > maxSize {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			fmt.Sprintf("WhatsApp allows %s files up to %d MB", kind, maxSize>>20), nil, "")
	}

	file, err := fileHeader.Open()
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to open uploaded file", nil, "")
	}
	defer func() { _ = file.Close() }()
	data, err := io.ReadAll(io.LimitReader(file, maxSize+1))
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to read uploaded file", nil, "")
	}

	ext := getExtensionFromMimeType(strings.Split(mimeType, ";")[0])
	if ext == "" {
		ext = strings.ToLower(filepath.Ext(fileHeader.Filename))
	}
	name := uuid.New().String() + ext
	if err := a.ensureMediaDir(chatbotMediaDir(orgID)); err != nil {
		a.Log.Error("Failed to create chatbot media dir", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to store file", nil, "")
	}
	full, err := a.chatbotMediaFullPath(orgID, name)
	if err == nil {
		err = os.WriteFile(full, data, 0o644)
	}
	if err != nil {
		a.Log.Error("Failed to save chatbot media", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to store file", nil, "")
	}

	return r.SendEnvelope(map[string]any{
		"media_path": path.Join(chatbotMediaDir(orgID), name),
		"file":       name,
		"filename":   fileHeader.Filename,
		"mime_type":  strings.Split(mimeType, ";")[0],
		"media_type": kind,
		"size":       len(data),
	})
}

// ServeChatbotFlowMedia returns an uploaded bot media file for the builder's
// preview. GET /api/chatbot/flows/media/{file}
func (a *App) ServeChatbotFlowMedia(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	if !a.HasPermission(userID, models.ResourceFlowsChatbot, models.ActionRead, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Permission denied", nil, "")
	}
	name, _ := r.RequestCtx.UserValue("file").(string)
	full, err := a.chatbotMediaFullPath(orgID, name)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid file name", nil, "")
	}
	info, err := os.Lstat(full)
	if err != nil || !info.Mode().IsRegular() {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "File not found", nil, "")
	}
	data, err := os.ReadFile(full)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to read file", nil, "")
	}
	r.RequestCtx.Response.Header.Set("Content-Type", getMimeTypeFromExtension(strings.ToLower(filepath.Ext(name))))
	r.RequestCtx.Response.Header.Set("Cache-Control", "private, max-age=3600")
	r.RequestCtx.SetBody(data)
	return nil
}

// interactiveMessageData is what the chat history stores for a bot reply's
// interactive message, in the shapes the chat bubble already renders.
func interactiveMessageData(m *whatsapp.InteractiveMessage) models.JSONB {
	out := models.JSONB{"type": m.Type, "body": m.Body}
	if m.Footer != "" {
		out["footer"] = m.Footer
	}
	if m.Header != nil && m.Header.Type == "text" {
		out["header"] = m.Header.Text
	}
	switch m.Type {
	case "button":
		buttons := make([]any, len(m.Buttons))
		for i, b := range m.Buttons {
			buttons[i] = map[string]string{"id": b.ID, "title": b.Title}
		}
		out["buttons"] = buttons
	case "list":
		rows := []any{}
		for _, s := range m.Sections {
			for _, r := range s.Rows {
				rows = append(rows, map[string]string{"id": r.ID, "title": r.Title, "description": r.Description})
			}
		}
		out["rows"] = rows
		out["button_text"] = m.ListButtonText
	case "cta_url":
		out["button_text"] = m.CTADisplayText
		out["url"] = m.CTAURL
	}
	return out
}
