import React from 'react';
import { ArrowRight, Phone } from 'lucide-react';
import type { IVRPathStep } from './callingApi';

interface TreeNode {
  step: IVRPathStep;
  children: TreeNode[];
}

// flow_start and goto_flow open a nested level: the steps after them happened inside that flow.
const isFlowStep = (step: IVRPathStep) => step.action === 'flow_start' || step.type === 'goto_flow';

function buildTree(steps: IVRPathStep[]): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: TreeNode[][] = [root];
  for (const step of steps) {
    const node: TreeNode = { step, children: [] };
    stack[stack.length - 1].push(node);
    if (isFlowStep(step)) stack.push(node.children);
  }
  return root;
}

const chip = 'flex items-center justify-center h-6 min-w-6 px-1.5 rounded border border-white/[0.1] bg-white/[0.05] text-[11px] font-medium text-white/70 shrink-0 light:border-gray-200 light:bg-gray-50 light:text-gray-600';

const StepRow: React.FC<{ step: IVRPathStep }> = ({ step }) => {
  if (isFlowStep(step)) {
    return (
      <div className="flex items-center gap-2 py-1">
        {step.digit && (
          <>
            <span className={`${chip} font-mono font-bold`}>{step.digit}</span>
            <ArrowRight className="h-3.5 w-3.5 text-white/40 shrink-0 light:text-gray-400" />
          </>
        )}
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 shrink-0">
          <Phone className="h-3 w-3 text-white light:text-gray-900" />
        </span>
        <span className="text-xs font-semibold text-white light:text-gray-900">{step.flow || step.label || '?'}</span>
      </div>
    );
  }
  if (step.type === 'menu' && step.digit) {
    const label = step.option_label
      ? step.label
        ? `${step.option_label} (${step.label})`
        : step.option_label
      : step.label || '-';
    return (
      <div className="flex items-center gap-2 py-1">
        <span className={`${chip} font-mono font-bold`}>{step.digit}</span>
        <span className="text-xs text-white/80 light:text-gray-800">{label}</span>
      </div>
    );
  }
  if (step.type === 'transfer' || step.type === 'hangup') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span
          className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 text-white text-[11px] ${
            step.type === 'transfer' ? 'bg-amber-600' : 'bg-red-600'
          }`}
        >
          {step.type === 'transfer' ? <ArrowRight className="h-3 w-3" /> : 'x'}
        </span>
        <span className="text-xs text-white/80 light:text-gray-800">{step.label || (step.type === 'transfer' ? 'Transfer' : 'Hangup')}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`${chip} capitalize`}>{step.type ? step.type.replace(/_/g, ' ') : step.digit || '?'}</span>
      <span className="text-xs text-white/80 light:text-gray-800">{step.label || '-'}</span>
      {step.outcome && <span className="text-[11px] text-white/40 light:text-gray-400">({step.outcome})</span>}
    </div>
  );
};

const TreeNodes: React.FC<{ nodes: TreeNode[] }> = ({ nodes }) => (
  <div className="flex flex-col gap-0.5">
    {nodes.map((node, idx) => (
      <div key={idx}>
        <StepRow step={node.step} />
        {node.children.length > 0 && (
          <div className="ml-3 pl-4 border-l-2 border-white/[0.12] light:border-gray-200">
            <TreeNodes nodes={node.children} />
          </div>
        )}
      </div>
    ))}
  </div>
);

/** The path a caller took through IVR menus, nested by flow. */
export const IVRPathTree: React.FC<{ steps: IVRPathStep[] }> = ({ steps }) => <TreeNodes nodes={buildTree(steps)} />;

export default IVRPathTree;
