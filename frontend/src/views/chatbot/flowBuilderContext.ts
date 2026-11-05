import { createContext, useContext } from 'react';
import type { ChatFlowType } from './chatbotFlowTypes';

export interface FlowBuilderActions {
  flowType: ChatFlowType;
  keywords: string[];
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
}

export const FlowBuilderContext = createContext<FlowBuilderActions>({
  flowType: 'advanced',
  keywords: [],
  onEdit: () => {},
  onDelete: () => {},
  onDuplicate: () => {},
});

export const useFlowBuilder = () => useContext(FlowBuilderContext);
