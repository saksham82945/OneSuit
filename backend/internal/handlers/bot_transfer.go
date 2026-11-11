package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shridarpatil/whatomate/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// ─── OneSuit bot file format ─────────────────────────────────────────────────
//
// A bot file is one JSON document holding any number of bots of any type:
//
//	{
//	  "onesuit_bot_format": 1,
//	  "exported_at": "2026-11-11T10:00:00Z",
//	  "flows": [
//	    {"name": "...", "description": "...", "flow_type": "simple|media|advanced",
//	     "trigger_keywords": ["hi"], "enabled": true,
//	     "graph": {"version": 2, "entry_node": "__start__", "nodes": [...], "edges": [...]}}
//	  ],
//	  "keyword_bots": [
//	    {"name": "...", "keywords": ["price"], "match_type": "contains|exact|starts_with|regex",
//	     "case_sensitive": false, "priority": 10, "enabled": true,
//	     "response_type": "text|transfer|flow", "response_content": {"body": "..."},
//	     "active_from": "RFC3339 (optional)", "active_until": "RFC3339 (optional)",
//	     "flow_ref": "name of the flow it starts (response_type flow)"}
//	  ]
//	}
//
// Flows are referenced by NAME (flow_ref) — keyword bots that start a flow and
// "goto_flow" steps — so a file moves between workspaces. On import a flow_ref
// resolves to a flow in the same file first, then to an existing flow of that
// name. Uploaded media (reply headers) is exported as its media_path; when the
// file isn't in the importing workspace the step is kept and the report asks
// for a re-upload.
//
// The older single-flow export ({name, description, trigger_keywords,
// flow_type, graph, ...} at the root) is accepted too.

// BotFileFormatVersion is the current "onesuit_bot_format".
const BotFileFormatVersion = 1

const (
	botFileMaxBytes       = 10 << 20
	botFileMaxFlows       = 200
	botFileMaxKeywordBots = 1000
)

// BotFile is a OneSuit bot file.
type BotFile struct {
	Format      int              `json:"onesuit_bot_format"`
	ExportedAt  string           `json:"exported_at,omitempty"`
	Flows       []BotFileFlow    `json:"flows"`
	KeywordBots []BotFileKeyword `json:"keyword_bots"`
}

// BotFileFlow is one flow bot in a bot file.
type BotFileFlow struct {
	Name            string         `json:"name"`
	Description     string         `json:"description"`
	FlowType        string         `json:"flow_type"`
	TriggerKeywords []string       `json:"trigger_keywords"`
	Enabled         *bool          `json:"enabled,omitempty"`
	Graph           map[string]any `json:"graph"`
}

// BotFileKeyword is one keyword ("list") bot in a bot file.
type BotFileKeyword struct {
	Name            string         `json:"name"`
	Keywords        []string       `json:"keywords"`
	MatchType       string         `json:"match_type"`
	CaseSensitive   bool           `json:"case_sensitive"`
	Priority        *int           `json:"priority,omitempty"`
	Enabled         *bool          `json:"enabled,omitempty"`
	ResponseType    string         `json:"response_type"`
	ResponseContent map[string]any `json:"response_content"`
	ActiveFrom      *string        `json:"active_from,omitempty"`
	ActiveUntil     *string        `json:"active_until,omitempty"`
	FlowRef         string         `json:"flow_ref,omitempty"`
}

// BotImportItem is the import report line of one bot.
type BotImportItem struct {
	Index        int      `json:"index"`
	Name         string   `json:"name"`
	FinalName    string   `json:"final_name"`
	Action       string   `json:"action"` // create, rename, error
	Kind         string   `json:"kind"`   // flow_type for flows, response_type for keyword bots
	Steps        int      `json:"steps,omitempty"`
	Keywords     []string `json:"keywords,omitempty"`
	FlowRef      string   `json:"flow_ref,omitempty"`
	FlowResolved string   `json:"flow_resolved,omitempty"` // "file" or "existing"
	ID           string   `json:"id,omitempty"`
	Errors       []string `json:"errors"`
	Warnings     []string `json:"warnings"`
}

// BotImportReport is what preview and import answer.
type BotImportReport struct {
	Preview     bool            `json:"preview"`
	Imported    bool            `json:"imported"`
	Valid       bool            `json:"valid"`
	LegacyFile  bool            `json:"legacy_file,omitempty"`
	Errors      []string        `json:"errors"`
	Warnings    []string        `json:"warnings"`
	Flows       []BotImportItem `json:"flows"`
	KeywordBots []BotImportItem `json:"keyword_bots"`
	Created     map[string]int  `json:"created"`
}

func (rep *BotImportReport) problemCount() int {
	n := len(rep.Errors)
	for _, f := range rep.Flows {
		n += len(f.Errors)
	}
	for _, k := range rep.KeywordBots {
		n += len(k.Errors)
	}
	return n
}

// chatbotModuleBlocked mirrors PlanModuleGuard for the bot file endpoints,
// whose paths sit outside the chatbot module's prefixes.
func (a *App) chatbotModuleBlocked(r *fastglue.Request, orgID uuid.UUID) bool {
	if a.callerIsSuperAdmin(r) {
		return false
	}
	return !a.orgModules(orgID)["chatbot"] || !a.loadPlatformConfig().AutomationEnabledAdmin
}

// ─── Export ──────────────────────────────────────────────────────────────────

func parseIDList(raw string) ([]uuid.UUID, error) {
	var out []uuid.UUID
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := uuid.Parse(part)
		if err != nil {
			return nil, fmt.Errorf("%q is not a valid id", part)
		}
		out = append(out, id)
	}
	return out, nil
}

// ExportBots answers GET /api/chatbot/export?flows=id,id&keywords=id,id with a
// OneSuit bot file. No parameters exports every bot the caller can read; a
// parameter that is present but empty exports every bot of that kind. Flows
// started by exported keyword bots are included so the file stands alone.
func (a *App) ExportBots(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	if a.chatbotModuleBlocked(r, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Chatbot & flows isn't included in your plan. Contact support to upgrade.", nil, "")
	}

	args := r.RequestCtx.QueryArgs()
	hasFlows, hasKeywords := args.Has("flows"), args.Has("keywords")
	everything := !hasFlows && !hasKeywords
	canFlows := a.HasPermission(userID, models.ResourceFlowsChatbot, models.ActionRead, orgID)
	canKeywords := a.HasPermission(userID, models.ResourceChatbotKeywords, models.ActionRead, orgID)

	if (hasFlows && !canFlows) || (hasKeywords && !canKeywords) || (everything && !canFlows && !canKeywords) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Insufficient permissions", nil, "")
	}

	flowIDs, err := parseIDList(string(args.Peek("flows")))
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "flows: "+err.Error(), nil, "")
	}
	keywordIDs, err := parseIDList(string(args.Peek("keywords")))
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "keywords: "+err.Error(), nil, "")
	}

	var flows []models.ChatbotFlow
	if (everything && canFlows) || hasFlows {
		q := a.DB.Where("organization_id = ?", orgID)
		if len(flowIDs) > 0 {
			q = q.Where("id IN ?", flowIDs)
		}
		if err := q.Order("created_at ASC").Find(&flows).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load flows", nil, "")
		}
	}
	var rules []models.KeywordRule
	if (everything && canKeywords) || hasKeywords {
		q := a.DB.Where("organization_id = ?", orgID)
		if len(keywordIDs) > 0 {
			q = q.Where("id IN ?", keywordIDs)
		}
		if err := q.Order("priority DESC, created_at ASC").Find(&rules).Error; err != nil {
			return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load keyword bots", nil, "")
		}
	}

	// Every flow of the org by id, to name flow references.
	var allFlows []models.ChatbotFlow
	a.DB.Select("id", "name").Where("organization_id = ?", orgID).Find(&allFlows)
	flowNames := make(map[string]string, len(allFlows))
	for _, f := range allFlows {
		flowNames[f.ID.String()] = f.Name
	}

	// Add the flows the exported keyword bots start, if the caller may read them.
	if canFlows {
		included := map[string]bool{}
		for _, f := range flows {
			included[f.ID.String()] = true
		}
		var extra []uuid.UUID
		for _, rule := range rules {
			if rule.ResponseType != models.ResponseTypeFlow {
				continue
			}
			fid, _ := rule.ResponseContent["flow_id"].(string)
			if _, known := flowNames[fid]; known && !included[fid] {
				included[fid] = true
				extra = append(extra, uuid.MustParse(fid))
			}
		}
		if len(extra) > 0 {
			var more []models.ChatbotFlow
			a.DB.Where("organization_id = ? AND id IN ?", orgID, extra).Order("created_at ASC").Find(&more)
			flows = append(flows, more...)
		}
	}

	file := buildBotFile(flows, rules, flowNames)
	body, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to build bot file", nil, "")
	}
	r.RequestCtx.Response.Header.Set("Content-Type", "application/json; charset=utf-8")
	r.RequestCtx.Response.Header.Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="onesuit-bots-%s.json"`, time.Now().Format("2006-01-02")))
	r.RequestCtx.SetStatusCode(fasthttp.StatusOK)
	r.RequestCtx.SetBody(body)
	return nil
}

// buildBotFile turns stored bots into a portable bot file. flowNames maps
// every flow id of the workspace to its name.
func buildBotFile(flows []models.ChatbotFlow, rules []models.KeywordRule, flowNames map[string]string) BotFile {
	file := BotFile{
		Format:      BotFileFormatVersion,
		ExportedAt:  time.Now().UTC().Format(time.RFC3339),
		Flows:       make([]BotFileFlow, 0, len(flows)),
		KeywordBots: make([]BotFileKeyword, 0, len(rules)),
	}
	for _, f := range flows {
		flowType := f.FlowType
		if flowType == "" {
			flowType = ChatFlowTypeAdvanced
		}
		keywords := []string(f.TriggerKeywords)
		if keywords == nil {
			keywords = []string{}
		}
		enabled := f.IsEnabled
		graph := deepCopyMap(map[string]any(f.Graph))
		// goto_flow steps name their target so the link survives a move.
		for _, n := range mapsFromConfig(graph, "nodes") {
			if ChatNodeType(stringFromConfig(n, "type")) != ChatNodeGotoFlow {
				continue
			}
			cfg := mapFromConfig(n, "config")
			if name, ok := flowNames[stringFromConfig(cfg, "flow_id")]; ok {
				cfg["flow_ref"] = name
				n["config"] = cfg
			}
		}
		file.Flows = append(file.Flows, BotFileFlow{
			Name:            f.Name,
			Description:     f.Description,
			FlowType:        flowType,
			TriggerKeywords: keywords,
			Enabled:         &enabled,
			Graph:           graph,
		})
	}
	for _, rule := range rules {
		content := deepCopyMap(map[string]any(rule.ResponseContent))
		if content == nil {
			content = map[string]any{}
		}
		kb := BotFileKeyword{
			Name:            rule.Name,
			Keywords:        []string(rule.Keywords),
			MatchType:       string(rule.MatchType),
			CaseSensitive:   rule.CaseSensitive,
			ResponseType:    string(rule.ResponseType),
			ResponseContent: content,
		}
		priority, enabled := rule.Priority, rule.IsEnabled
		kb.Priority, kb.Enabled = &priority, &enabled
		if kb.Keywords == nil {
			kb.Keywords = []string{}
		}
		if rule.ActiveFrom != nil {
			s := rule.ActiveFrom.UTC().Format(time.RFC3339)
			kb.ActiveFrom = &s
		}
		if rule.ActiveUntil != nil {
			s := rule.ActiveUntil.UTC().Format(time.RFC3339)
			kb.ActiveUntil = &s
		}
		if rule.ResponseType == models.ResponseTypeFlow {
			fid, _ := content["flow_id"].(string)
			if name, ok := flowNames[fid]; ok {
				kb.FlowRef = name
			} else if n, _ := content["flow_name"].(string); n != "" {
				kb.FlowRef = n
			}
			delete(content, "flow_id")
			delete(content, "flow_name")
		}
		file.KeywordBots = append(file.KeywordBots, kb)
	}
	return file
}

func deepCopyMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	var out map[string]any
	if json.Unmarshal(b, &out) != nil {
		return nil
	}
	return out
}

// ─── Import ──────────────────────────────────────────────────────────────────

// parsedBotFile is a decoded bot file with each item's raw JSON kept, so a
// broken item gets its own error instead of failing the whole file.
type parsedBotFile struct {
	legacy      bool
	flows       []json.RawMessage
	keywordBots []json.RawMessage
}

// parseBotFile decodes the top level of a bot file (or an old single-flow
// export). Errors are about the file as a whole.
func parseBotFile(body []byte) (*parsedBotFile, []string, error) {
	var warnings []string
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil, nil, errors.New("the file is empty")
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(body, &root); err != nil {
		var syn *json.SyntaxError
		if errors.As(err, &syn) {
			return nil, nil, fmt.Errorf("this isn't valid JSON (error near character %d: %s)", syn.Offset, syn.Error())
		}
		return nil, nil, errors.New("this isn't a OneSuit bot file: the file must be a JSON object")
	}

	out := &parsedBotFile{}
	rawFormat, hasFormat := root["onesuit_bot_format"]
	_, hasFlows := root["flows"]
	_, hasKeywords := root["keyword_bots"]
	switch {
	case hasFormat:
		var v int
		if err := json.Unmarshal(rawFormat, &v); err != nil {
			return nil, nil, errors.New(`"onesuit_bot_format" must be the number 1`)
		}
		if v > BotFileFormatVersion {
			return nil, nil, fmt.Errorf("this file uses bot format %d, which is newer than this OneSuit understands (%d)", v, BotFileFormatVersion)
		}
		if v < 1 {
			return nil, nil, errors.New(`"onesuit_bot_format" must be the number 1`)
		}
	case hasFlows || hasKeywords:
		warnings = append(warnings, `The file has no "onesuit_bot_format"; it was read as format 1.`)
	case root["graph"] != nil || root["name"] != nil:
		// Old single-flow export from the Bot Flows page.
		out.legacy = true
		out.flows = []json.RawMessage{json.RawMessage(body)}
		return out, warnings, nil
	default:
		return nil, nil, errors.New(`this isn't a OneSuit bot file: expected "onesuit_bot_format", "flows" or "keyword_bots"`)
	}

	if raw, ok := root["flows"]; ok && string(raw) != "null" {
		if err := json.Unmarshal(raw, &out.flows); err != nil {
			return nil, nil, errors.New(`"flows" must be a list of flow bots`)
		}
	}
	if raw, ok := root["keyword_bots"]; ok && string(raw) != "null" {
		if err := json.Unmarshal(raw, &out.keywordBots); err != nil {
			return nil, nil, errors.New(`"keyword_bots" must be a list of keyword bots`)
		}
	}
	if len(out.flows) == 0 && len(out.keywordBots) == 0 {
		return nil, nil, errors.New("the file has no bots in it")
	}
	if len(out.flows) > botFileMaxFlows {
		return nil, nil, fmt.Errorf("a file can hold at most %d flow bots (this one has %d)", botFileMaxFlows, len(out.flows))
	}
	if len(out.keywordBots) > botFileMaxKeywordBots {
		return nil, nil, fmt.Errorf("a file can hold at most %d keyword bots (this one has %d)", botFileMaxKeywordBots, len(out.keywordBots))
	}
	return out, warnings, nil
}

// decodeItem unmarshals one item, turning Go's type errors into plain words.
func decodeItem(raw json.RawMessage, v any) error {
	if err := json.Unmarshal(raw, v); err != nil {
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) && typeErr.Field != "" {
			return fmt.Errorf("%q has the wrong type (expected %s)", typeErr.Field, typeErr.Type.String())
		}
		return errors.New("must be a JSON object")
	}
	return nil
}

// nameTaken tracks the names in use (case-insensitive) and hands out free ones.
type nameTaken map[string]bool

func (t nameTaken) claim(name string) string {
	final := name
	for i := 2; t[strings.ToLower(final)]; i++ {
		final = fmt.Sprintf("%s (%d)", name, i)
	}
	t[strings.ToLower(final)] = true
	return final
}

var validChatNodeTypes = map[ChatNodeType]bool{
	ChatNodeStart: true, ChatNodeMessage: true, ChatNodeButtons: true, ChatNodePrompt: true,
	ChatNodeAPICall: true, ChatNodeCondition: true, ChatNodeTiming: true, ChatNodeSetVariable: true,
	ChatNodeAIResponse: true, ChatNodeTransfer: true, ChatNodeWebhook: true, ChatNodeGotoFlow: true,
	ChatNodeWhatsAppFlow: true, ChatNodeEnd: true, ChatNodeReply: true,
}

// checkGraphShape checks what the runner needs of a graph: version 2, an
// entry node that exists, known step types, unique ids and edges between
// existing steps.
func checkGraphShape(graph map[string]any) error {
	g, err := parseChatGraph(models.JSONB(graph))
	if err != nil {
		return fmt.Errorf("graph: %s", err.Error())
	}
	seen := map[string]bool{}
	for i, n := range g.Nodes {
		if n.ID == "" {
			return fmt.Errorf("graph: step %d has no id", i+1)
		}
		if seen[n.ID] {
			return fmt.Errorf("graph: two steps have the id %q", n.ID)
		}
		seen[n.ID] = true
		if !validChatNodeTypes[n.Type] {
			return fmt.Errorf("graph: step %q has an unknown type %q", n.ID, n.Type)
		}
	}
	for _, e := range g.Edges {
		if !seen[e.From] || !seen[e.To] {
			return fmt.Errorf("graph: a connection goes from %q to %q, but that step doesn't exist", e.From, e.To)
		}
	}
	return nil
}

func nodeDisplayName(n map[string]any) string {
	if l := stringFromConfig(n, "label"); l != "" {
		return l
	}
	return stringFromConfig(n, "id")
}

// fixImportedMedia points reply media at this workspace's copy of the file
// when it exists; otherwise it keeps the step and returns a warning.
func (a *App) fixImportedMedia(orgID uuid.UUID, graph map[string]any) []string {
	var warnings []string
	for _, n := range mapsFromConfig(graph, "nodes") {
		if ChatNodeType(stringFromConfig(n, "type")) != ChatNodeReply {
			continue
		}
		cfg := mapFromConfig(n, "config")
		header := mapFromConfig(cfg, "header")
		mediaPath := stringFromConfig(header, "media_path")
		if !isMediaHeader(strings.ToLower(stringFromConfig(header, "type"))) || mediaPath == "" {
			continue
		}
		base := path.Base(mediaPath)
		if full, err := a.chatbotMediaFullPath(orgID, base); err == nil {
			if info, statErr := os.Lstat(full); statErr == nil && info.Mode().IsRegular() {
				header["media_path"] = path.Join(chatbotMediaDir(orgID), base)
				continue
			}
		}
		warnings = append(warnings, fmt.Sprintf("Re-upload media for step %q: the file %q isn't in this workspace.", nodeDisplayName(n), base))
	}
	return warnings
}

var validMatchTypes = map[models.MatchType]bool{
	models.MatchTypeExact: true, models.MatchTypeContains: true,
	models.MatchTypeStartsWith: true, models.MatchTypeRegex: true,
}

// validateKeywordBot applies the keyword rule rules (as the create handler
// and the matcher use them) to one keyword bot, normalizing it in place.
func validateKeywordBot(kb *BotFileKeyword) []string {
	var errs []string
	keywords := make([]string, 0, len(kb.Keywords))
	for _, k := range kb.Keywords {
		if k = strings.TrimSpace(k); k != "" {
			keywords = append(keywords, k)
		}
	}
	kb.Keywords = keywords
	if len(keywords) == 0 {
		errs = append(errs, "At least one keyword is required")
	}
	kb.Name = strings.TrimSpace(kb.Name)
	if kb.Name == "" && len(keywords) > 0 {
		kb.Name = keywords[0]
	}
	if len(kb.Name) > 255 {
		errs = append(errs, "name is longer than 255 characters")
	}

	kb.MatchType = strings.ToLower(strings.TrimSpace(kb.MatchType))
	if kb.MatchType == "" {
		kb.MatchType = string(models.MatchTypeContains)
	}
	if !validMatchTypes[models.MatchType(kb.MatchType)] {
		errs = append(errs, fmt.Sprintf("match_type %q must be contains, exact, starts_with or regex", kb.MatchType))
	} else if kb.MatchType == string(models.MatchTypeRegex) {
		for _, k := range keywords {
			if _, err := regexp.Compile(k); err != nil {
				errs = append(errs, fmt.Sprintf("keyword %q isn't a valid regex pattern", k))
			}
		}
	}

	kb.ResponseType = strings.ToLower(strings.TrimSpace(kb.ResponseType))
	if kb.ResponseType == "" {
		kb.ResponseType = string(models.ResponseTypeText)
	}
	if kb.ResponseContent == nil {
		kb.ResponseContent = map[string]any{}
	}
	// "text" / "message" are common spellings of the reply body.
	if body, _ := kb.ResponseContent["body"].(string); strings.TrimSpace(body) == "" {
		for _, alt := range []string{"text", "message"} {
			if v, _ := kb.ResponseContent[alt].(string); strings.TrimSpace(v) != "" {
				kb.ResponseContent["body"] = v
				break
			}
		}
	}
	switch models.ResponseType(kb.ResponseType) {
	case models.ResponseTypeText:
		if body, _ := kb.ResponseContent["body"].(string); strings.TrimSpace(body) == "" {
			errs = append(errs, `a text reply needs response_content.body (the message to send)`)
		}
	case models.ResponseTypeTransfer:
	case models.ResponseTypeFlow:
		if strings.TrimSpace(kb.FlowRef) == "" {
			if id, _ := kb.ResponseContent["flow_id"].(string); id == "" {
				errs = append(errs, `a keyword bot that starts a flow needs flow_ref (the flow's name)`)
			}
		}
	default:
		errs = append(errs, fmt.Sprintf("response_type %q must be text, transfer or flow", kb.ResponseType))
	}
	return errs
}

func parseOptionalTime(field string, v *string) (*time.Time, error) {
	if v == nil || strings.TrimSpace(*v) == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(*v))
	if err != nil {
		return nil, fmt.Errorf("%s %q must be a date-time like 2026-01-31T09:00:00Z", field, *v)
	}
	return &t, nil
}

// botImportPlan is everything an import would create.
type botImportPlan struct {
	report BotImportReport
	flows  []models.ChatbotFlow
	rules  []models.KeywordRule
	flowOK []bool
	ruleOK []bool
}

// planBotImport validates a bot file and works out what importing it would
// create, without saving anything.
func (a *App) planBotImport(r *fastglue.Request, orgID, userID uuid.UUID, file *parsedBotFile) *botImportPlan {
	p := &botImportPlan{}
	rep := &p.report
	rep.LegacyFile = file.legacy
	rep.Flows = []BotImportItem{}
	rep.KeywordBots = []BotImportItem{}

	// Names in use and existing flows by name.
	var existingFlows []models.ChatbotFlow
	a.DB.Select("id", "name", "created_at").Where("organization_id = ?", orgID).Order("created_at ASC").Find(&existingFlows)
	flowNames := nameTaken{}
	existingFlowByName := map[string]models.ChatbotFlow{}
	existingFlowIDs := map[string]bool{}
	for _, f := range existingFlows {
		flowNames[strings.ToLower(f.Name)] = true
		existingFlowByName[strings.ToLower(strings.TrimSpace(f.Name))] = f // newest wins
		existingFlowIDs[f.ID.String()] = true
	}
	var existingRuleNames []string
	a.DB.Model(&models.KeywordRule{}).Where("organization_id = ?", orgID).Pluck("name", &existingRuleNames)
	ruleNames := nameTaken{}
	for _, n := range existingRuleNames {
		ruleNames[strings.ToLower(n)] = true
	}

	// File flows by their name in the file (first one wins).
	type fileFlow struct {
		idx int
		id  uuid.UUID
	}
	fileFlowByName := map[string]fileFlow{}

	// Pass 1: flows.
	for i, raw := range file.flows {
		item := BotImportItem{Index: i, Errors: []string{}, Warnings: []string{}}
		var bf BotFileFlow
		if err := decodeItem(raw, &bf); err != nil {
			item.Errors = append(item.Errors, err.Error())
		}
		bf.Name = strings.TrimSpace(bf.Name)
		item.Name = bf.Name
		if bf.Name == "" {
			item.Errors = append(item.Errors, "name is required")
		} else if len(bf.Name) > 255 {
			item.Errors = append(item.Errors, "name is longer than 255 characters")
		}
		flowType, err := normalizeChatFlowType(bf.FlowType)
		if err != nil {
			item.Errors = append(item.Errors, err.Error())
			flowType = strings.TrimSpace(bf.FlowType)
		}
		item.Kind = flowType
		if bf.Graph == nil {
			item.Warnings = append(item.Warnings, "This flow has no steps yet; open it in the builder to add some.")
		} else if len(item.Errors) == 0 {
			if err := checkGraphShape(bf.Graph); err != nil {
				item.Errors = append(item.Errors, err.Error())
			} else if err := validateChatbotFlowGraph(flowType, bf.Graph); err != nil {
				item.Errors = append(item.Errors, err.Error())
			} else if err := a.checkBotAPIWebhookAllowed(r, bf.Graph); err != nil {
				item.Errors = append(item.Errors, err.Error())
			}
			item.Steps = len(mapsFromConfig(bf.Graph, "nodes"))
		}
		keywords := []string{}
		for _, k := range bf.TriggerKeywords {
			if k = strings.TrimSpace(k); k != "" {
				keywords = append(keywords, k)
			}
		}
		item.Keywords = keywords

		id := uuid.New()
		ok := len(item.Errors) == 0
		if ok {
			item.Warnings = append(item.Warnings, a.fixImportedMedia(orgID, bf.Graph)...)
			item.FinalName = flowNames.claim(bf.Name)
			item.Action = "create"
			if item.FinalName != bf.Name {
				item.Action = "rename"
				item.Warnings = append(item.Warnings, fmt.Sprintf("A bot named %q already exists, so this one will be called %q.", bf.Name, item.FinalName))
			}
		} else {
			item.Action = "error"
		}
		if key := strings.ToLower(bf.Name); bf.Name != "" {
			if _, dup := fileFlowByName[key]; !dup {
				fileFlowByName[key] = fileFlow{idx: i, id: id}
			}
		}
		enabled := true
		if bf.Enabled != nil {
			enabled = *bf.Enabled
		}
		p.flows = append(p.flows, models.ChatbotFlow{
			BaseModel:       models.BaseModel{ID: id},
			OrganizationID:  orgID,
			Name:            item.FinalName,
			Description:     bf.Description,
			TriggerKeywords: keywords,
			Graph:           models.JSONB(bf.Graph),
			FlowType:        flowType,
			IsEnabled:       enabled,
			PanelConfig:     models.JSONB{},
			CreatedByID:     &userID,
			UpdatedByID:     &userID,
		})
		p.flowOK = append(p.flowOK, ok)
		rep.Flows = append(rep.Flows, item)
	}

	// resolveFlowRef finds the flow a name points at: one in this file first,
	// then an existing one. It returns the id, where it was found, and an error.
	resolveFlowRef := func(ref string) (uuid.UUID, string, string, error) {
		key := strings.ToLower(strings.TrimSpace(ref))
		if ff, ok := fileFlowByName[key]; ok {
			if !p.flowOK[ff.idx] {
				return uuid.Nil, "", "", fmt.Errorf("the flow %q it starts has errors in this file", ref)
			}
			return ff.id, "file", p.flows[ff.idx].Name, nil
		}
		if f, ok := existingFlowByName[key]; ok {
			return f.ID, "existing", f.Name, nil
		}
		return uuid.Nil, "", "", fmt.Errorf("it starts the flow %q, which isn't in this file or this workspace", ref)
	}

	// Pass 2: goto_flow steps of the flows.
	for i := range p.flows {
		if !p.flowOK[i] || p.flows[i].Graph == nil {
			continue
		}
		for _, n := range mapsFromConfig(map[string]any(p.flows[i].Graph), "nodes") {
			if ChatNodeType(stringFromConfig(n, "type")) != ChatNodeGotoFlow {
				continue
			}
			cfg := mapFromConfig(n, "config")
			ref := stringFromConfig(cfg, "flow_ref")
			if ref != "" {
				if id, _, _, err := resolveFlowRef(ref); err == nil {
					cfg["flow_id"] = id.String()
					n["config"] = cfg
					continue
				}
			} else if existingFlowIDs[stringFromConfig(cfg, "flow_id")] {
				continue
			}
			target := ref
			if target == "" {
				target = stringFromConfig(cfg, "flow_id")
			}
			cfg["flow_id"] = ""
			n["config"] = cfg
			rep.Flows[i].Warnings = append(rep.Flows[i].Warnings,
				fmt.Sprintf("Step %q jumps to the flow %q, which wasn't found; pick the flow again in the builder.", nodeDisplayName(n), target))
		}
	}

	// Pass 3: keyword bots.
	for i, raw := range file.keywordBots {
		item := BotImportItem{Index: i, Errors: []string{}, Warnings: []string{}}
		var kb BotFileKeyword
		if err := decodeItem(raw, &kb); err != nil {
			item.Errors = append(item.Errors, err.Error())
		} else {
			item.Errors = append(item.Errors, validateKeywordBot(&kb)...)
		}
		item.Name = kb.Name
		item.Kind = kb.ResponseType
		item.Keywords = kb.Keywords
		item.FlowRef = kb.FlowRef

		activeFrom, err := parseOptionalTime("active_from", kb.ActiveFrom)
		if err != nil {
			item.Errors = append(item.Errors, err.Error())
		}
		activeUntil, err := parseOptionalTime("active_until", kb.ActiveUntil)
		if err != nil {
			item.Errors = append(item.Errors, err.Error())
		}

		content := kb.ResponseContent
		if len(item.Errors) == 0 && kb.ResponseType == string(models.ResponseTypeFlow) {
			if strings.TrimSpace(kb.FlowRef) != "" {
				id, where, name, err := resolveFlowRef(kb.FlowRef)
				if err != nil {
					item.Errors = append(item.Errors, err.Error())
				} else {
					content["flow_id"], content["flow_name"] = id.String(), name
					item.FlowResolved = where
				}
			} else if fid, _ := content["flow_id"].(string); existingFlowIDs[fid] {
				item.FlowResolved = "existing"
			} else {
				item.Errors = append(item.Errors, "it starts a flow that isn't in this workspace; set flow_ref to the flow's name")
			}
		}

		ok := len(item.Errors) == 0
		if ok {
			item.FinalName = ruleNames.claim(kb.Name)
			item.Action = "create"
			if item.FinalName != kb.Name {
				item.Action = "rename"
				item.Warnings = append(item.Warnings, fmt.Sprintf("A keyword bot named %q already exists, so this one will be called %q.", kb.Name, item.FinalName))
			}
		} else {
			item.Action = "error"
		}
		priority := 10
		if kb.Priority != nil {
			priority = *kb.Priority
		}
		enabled := true
		if kb.Enabled != nil {
			enabled = *kb.Enabled
		}
		p.rules = append(p.rules, models.KeywordRule{
			BaseModel:       models.BaseModel{ID: uuid.New()},
			OrganizationID:  orgID,
			Name:            item.FinalName,
			Keywords:        kb.Keywords,
			MatchType:       models.MatchType(kb.MatchType),
			CaseSensitive:   kb.CaseSensitive,
			ResponseType:    models.ResponseType(kb.ResponseType),
			ResponseContent: models.JSONB(content),
			Priority:        priority,
			IsEnabled:       enabled,
			ActiveFrom:      activeFrom,
			ActiveUntil:     activeUntil,
			CreatedByID:     &userID,
			UpdatedByID:     &userID,
		})
		p.ruleOK = append(p.ruleOK, ok)
		rep.KeywordBots = append(rep.KeywordBots, item)
	}
	return p
}

// ImportBots answers POST /api/chatbot/import with a OneSuit bot file as the
// body. ?mode=preview reports what would happen without saving; otherwise
// every bot is created in one transaction, or nothing is when any has errors.
// Existing bots are never changed: a clashing name gets " (2)", " (3)", ...
func (a *App) ImportBots(r *fastglue.Request) error {
	orgID, userID, err := a.getOrgAndUserID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	if a.chatbotModuleBlocked(r, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Chatbot & flows isn't included in your plan. Contact support to upgrade.", nil, "")
	}
	preview := string(r.RequestCtx.QueryArgs().Peek("mode")) == "preview"

	body := r.RequestCtx.PostBody()
	if len(body) > botFileMaxBytes {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, fmt.Sprintf("The file is too big (limit %d MB)", botFileMaxBytes>>20), nil, "")
	}
	file, warnings, err := parseBotFile(body)
	if err != nil {
		rep := BotImportReport{Preview: preview, Errors: []string{err.Error()}, Warnings: []string{},
			Flows: []BotImportItem{}, KeywordBots: []BotImportItem{}, Created: map[string]int{"flows": 0, "keyword_bots": 0}}
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid bot file: "+err.Error(), rep, "")
	}

	if len(file.flows) > 0 && !a.HasPermission(userID, models.ResourceFlowsChatbot, models.ActionWrite, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "You don't have permission to create flow bots", nil, "")
	}
	if len(file.keywordBots) > 0 && !a.HasPermission(userID, models.ResourceChatbotKeywords, models.ActionWrite, orgID) {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "You don't have permission to create keyword bots", nil, "")
	}

	plan := a.planBotImport(r, orgID, userID, file)
	rep := &plan.report
	rep.Preview = preview
	rep.Warnings = append([]string{}, warnings...)
	rep.Errors = []string{}
	rep.Created = map[string]int{"flows": 0, "keyword_bots": 0}
	problems := rep.problemCount()
	rep.Valid = problems == 0

	if preview {
		return r.SendEnvelope(rep)
	}
	if problems > 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest,
			fmt.Sprintf("Nothing was imported: fix the %d problem(s) in the file and try again", problems), rep, "")
	}

	err = a.DB.Transaction(func(tx *gorm.DB) error {
		for i := range plan.flows {
			if err := tx.Create(&plan.flows[i]).Error; err != nil {
				return fmt.Errorf("flow %q: %w", plan.flows[i].Name, err)
			}
		}
		for i := range plan.rules {
			if err := tx.Create(&plan.rules[i]).Error; err != nil {
				return fmt.Errorf("keyword bot %q: %w", plan.rules[i].Name, err)
			}
		}
		return nil
	})
	if err != nil {
		a.Log.Error("Failed to import bots", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to import bots; nothing was saved", nil, "")
	}

	for i := range plan.flows {
		rep.Flows[i].ID = plan.flows[i].ID.String()
		a.logAudit(orgID, userID, "chatbot_flow", plan.flows[i].ID, models.AuditActionCreated, nil, &plan.flows[i])
	}
	for i := range plan.rules {
		rep.KeywordBots[i].ID = plan.rules[i].ID.String()
		a.logAudit(orgID, userID, "keyword_rule", plan.rules[i].ID, models.AuditActionCreated, nil, &plan.rules[i])
	}
	if len(plan.flows) > 0 {
		a.InvalidateChatbotFlowsCache(orgID)
	}
	if len(plan.rules) > 0 {
		a.InvalidateKeywordRulesCache(orgID)
	}
	rep.Imported = true
	rep.Created = map[string]int{"flows": len(plan.flows), "keyword_bots": len(plan.rules)}
	return r.SendEnvelope(rep)
}
