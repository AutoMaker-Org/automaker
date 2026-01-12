import { createContext, useContext } from 'react';
import { NodeActionCallbacks } from '../hooks/use-graph-nodes';

export const GraphActionsContext = createContext<NodeActionCallbacks>({});

export function useGraphActions() {
  return useContext(GraphActionsContext);
}
