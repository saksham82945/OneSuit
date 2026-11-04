import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { ChatFlowGraph } from '@/services/api';
import { canvasToGraph, edgesAfterButtonRemoved, graphToCanvas, startNode, type BuilderNode } from './chatbotFlowGraph';

const buttonsNode: BuilderNode = {
  id: 'menu',
  type: 'buttonsNode',
  position: { x: 0, y: 100 },
  data: {
    question: 'Choose an option:',
    flowButtons: [
      { id: 'btn_a', type: 'quick_reply', title: 'Sales' },
      { id: 'btn_b', type: 'link', title: 'Website', url: 'https://example.com' },
      { id: 'btn_c', type: 'call_number', title: 'Call us', phone: '+911234567890' },
    ],
  },
};
const target: BuilderNode = { id: 'thanks', type: 'textNode', position: { x: 0, y: 300 }, data: { message: 'Thanks' } };

describe('canvasToGraph', () => {
  it('saves the buttons a new buttons step was given in the builder', () => {
    const edges: Edge[] = [
      { id: 'e1', source: '__start__', target: 'menu' },
      { id: 'e2', source: 'menu', sourceHandle: 'btn-0', target: 'thanks' },
    ];
    const graph = canvasToGraph([startNode(), buttonsNode, target], edges, '__start__');
    const menu = graph.nodes.find((n) => n.id === 'menu');
    expect(menu?.config.body).toBe('Choose an option:');
    expect(menu?.config.buttons).toEqual([
      { id: 'btn_a', title: 'Sales', type: 'reply', builder_type: 'quick_reply' },
      { id: 'btn_b', title: 'Website', type: 'url', url: 'https://example.com', builder_type: 'link' },
      { id: 'btn_c', title: 'Call us', type: 'phone', phone_number: '+911234567890', builder_type: 'call_number' },
    ]);
    expect(graph.edges).toContainEqual({ from: 'menu', to: 'thanks', condition: 'button:btn_a' });
    expect(graph.entry_node).toBe('__start__');
  });

  it('round-trips buttons and their edges through a reload', () => {
    const edges: Edge[] = [{ id: 'e2', source: 'menu', sourceHandle: 'btn-1', target: 'thanks' }];
    const saved = canvasToGraph([startNode(), buttonsNode, target], edges, '__start__');
    const loaded = graphToCanvas(saved);
    const menu = loaded.nodes.find((n) => n.id === 'menu');
    expect(menu?.data.flowButtons).toEqual(buttonsNode.data.flowButtons);
    expect(loaded.edges.find((e) => e.source === 'menu')?.sourceHandle).toBe('btn-1');
    expect(canvasToGraph(loaded.nodes, loaded.edges, loaded.entry)).toEqual(saved);
  });

  it('loads buttons stored without a builder type', () => {
    const graph: ChatFlowGraph = {
      version: 2,
      entry_node: 'menu',
      edges: [],
      nodes: [
        {
          id: 'menu',
          type: 'buttons',
          label: '',
          position: { x: 0, y: 0 },
          config: { body: 'Hi', buttons: [{ id: 'x', title: 'Yes' }, { type: 'url', title: 'Site', url: 'https://a.b' }] },
        },
      ],
    };
    expect(graphToCanvas(graph).nodes[0].data.flowButtons).toEqual([
      { id: 'x', type: 'quick_reply', title: 'Yes' },
      { id: 'btn_menu_2', type: 'link', title: 'Site', url: 'https://a.b' },
    ]);
  });
});

describe('edgesAfterButtonRemoved', () => {
  it('drops the removed button edge and shifts later ones', () => {
    const edges: Edge[] = [
      { id: 'a', source: 'menu', sourceHandle: 'btn-0', target: 't0' },
      { id: 'b', source: 'menu', sourceHandle: 'btn-1', target: 't1' },
      { id: 'c', source: 'menu', sourceHandle: 'btn-2', target: 't2' },
      { id: 'd', source: 'other', sourceHandle: 'btn-2', target: 't3' },
    ];
    expect(edgesAfterButtonRemoved(edges, 'menu', 1).map((e) => [e.id, e.sourceHandle])).toEqual([
      ['a', 'btn-0'],
      ['c', 'btn-1'],
      ['d', 'btn-2'],
    ]);
  });
});
