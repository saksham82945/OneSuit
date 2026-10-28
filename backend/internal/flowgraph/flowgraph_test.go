package flowgraph_test

import (
	"encoding/json"
	"testing"

	"github.com/shridarpatil/whatomate/internal/flowgraph"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type TestNodeType string

const (
	TypePrompt  TestNodeType = "prompt"
	TypeBranch  TestNodeType = "branch"
	TypeMessage TestNodeType = "message"
	TypeHangup  TestNodeType = "hangup"
)

func TestFlowgraph_BuildMapsAndLookup(t *testing.T) {
	g := &flowgraph.Graph[TestNodeType]{
		Version:   2,
		EntryNode: "node_1",
		Nodes: []flowgraph.Node[TestNodeType]{
			{
				ID:       "node_1",
				Type:     TypePrompt,
				Label:    "Welcome",
				Position: flowgraph.Position{X: 100, Y: 200},
				Config:   map[string]any{"text": "Hello, welcome!"},
			},
			{
				ID:       "node_2",
				Type:     TypeBranch,
				Label:    "Decision",
				Position: flowgraph.Position{X: 300, Y: 200},
			},
			{
				ID:       "node_3",
				Type:     TypeMessage,
				Label:    "Sales",
				Position: flowgraph.Position{X: 500, Y: 100},
			},
			{
				ID:       "node_4",
				Type:     TypeHangup,
				Label:    "Goodbye",
				Position: flowgraph.Position{X: 500, Y: 300},
			},
		},
		Edges: []flowgraph.Edge{
			{From: "node_1", To: "node_2", Condition: "default"},
			{From: "node_2", To: "node_3", Condition: "digit:1"},
			{From: "node_2", To: "node_4", Condition: "default"},
		},
	}

	g.BuildMaps()

	// Test Node lookups
	n1 := g.Node("node_1")
	require.NotNil(t, n1)
	assert.Equal(t, "node_1", n1.ID)
	assert.Equal(t, TypePrompt, n1.Type)
	assert.Equal(t, "Welcome", n1.Label)
	assert.Equal(t, float64(100), n1.Position.X)
	assert.Equal(t, float64(200), n1.Position.Y)
	assert.Equal(t, "Hello, welcome!", n1.Config["text"])

	n2 := g.Node("node_2")
	require.NotNil(t, n2)
	assert.Equal(t, TypeBranch, n2.Type)

	// Non-existent node
	assert.Nil(t, g.Node("unknown_node"))

	// Test OutgoingEdges
	e1 := g.OutgoingEdges("node_1")
	require.Len(t, e1, 1)
	assert.Equal(t, "node_2", e1[0].To)
	assert.Equal(t, "default", e1[0].Condition)

	e2 := g.OutgoingEdges("node_2")
	require.Len(t, e2, 2)

	// Node with no outgoing edges
	e3 := g.OutgoingEdges("node_4")
	assert.Empty(t, e3)
}

func TestFlowgraph_ResolveEdge(t *testing.T) {
	g := &flowgraph.Graph[TestNodeType]{
		Version:   2,
		EntryNode: "start",
		Nodes: []flowgraph.Node[TestNodeType]{
			{ID: "start", Type: TypePrompt},
			{ID: "sales", Type: TypeMessage},
			{ID: "support", Type: TypeMessage},
			{ID: "fallback", Type: TypeMessage},
			{ID: "end", Type: TypeHangup},
		},
		Edges: []flowgraph.Edge{
			{From: "start", To: "sales", Condition: "button:sales"},
			{From: "start", To: "support", Condition: "button:support"},
			{From: "start", To: "fallback", Condition: "default"},
		},
	}

	g.BuildMaps()

	// Exact match wins
	assert.Equal(t, "sales", g.ResolveEdge("start", "button:sales"))
	assert.Equal(t, "support", g.ResolveEdge("start", "button:support"))

	// Unknown outcome falls back to "default"
	assert.Equal(t, "fallback", g.ResolveEdge("start", "button:unknown"))
	assert.Equal(t, "fallback", g.ResolveEdge("start", "anything_else"))

	// Terminal node with no edges returns empty string
	assert.Equal(t, "", g.ResolveEdge("end", "default"))
	assert.Equal(t, "", g.ResolveEdge("nonexistent", "default"))
}

func TestFlowgraph_ResolveEdge_NoDefaultFallback(t *testing.T) {
	g := &flowgraph.Graph[TestNodeType]{
		Nodes: []flowgraph.Node[TestNodeType]{
			{ID: "start", Type: TypeBranch},
			{ID: "opt_a", Type: TypeMessage},
		},
		Edges: []flowgraph.Edge{
			{From: "start", To: "opt_a", Condition: "exact_only"},
		},
	}
	g.BuildMaps()

	assert.Equal(t, "opt_a", g.ResolveEdge("start", "exact_only"))
	assert.Equal(t, "", g.ResolveEdge("start", "other_condition"))
}

func TestFlowgraph_JSONRoundtrip(t *testing.T) {
	rawJSON := `{
		"version": 2,
		"entry_node": "n1",
		"nodes": [
			{"id": "n1", "type": "prompt", "label": "Start", "position": {"x": 10, "y": 20}, "config": {"timeout": 5}},
			{"id": "n2", "type": "hangup", "label": "Stop", "position": {"x": 50, "y": 60}}
		],
		"edges": [
			{"from": "n1", "to": "n2", "condition": "default"}
		]
	}`

	var g flowgraph.Graph[TestNodeType]
	err := json.Unmarshal([]byte(rawJSON), &g)
	require.NoError(t, err)

	assert.Equal(t, 2, g.Version)
	assert.Equal(t, "n1", g.EntryNode)
	require.Len(t, g.Nodes, 2)
	require.Len(t, g.Edges, 1)

	g.BuildMaps()
	assert.Equal(t, "n2", g.ResolveEdge("n1", "default"))
	assert.NotNil(t, g.Node("n1"))
	assert.Equal(t, float64(10), g.Node("n1").Position.X)
}
