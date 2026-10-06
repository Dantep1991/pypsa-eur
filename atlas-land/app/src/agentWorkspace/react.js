import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { createWorkspaceRegistry } from './registry';

const WorkspaceAgentContext = createContext(null);
export const WorkspaceAgentProvider = WorkspaceAgentContext.Provider;
export const useWorkspaceAgentRegistry = () => useContext(WorkspaceAgentContext);
export function useWorkspaceAgent() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createWorkspaceRegistry();
  return ref.current;
}
export function useWorkspaceAgentController(id, descriptor, execute, suppliedRegistry) {
  const context = useWorkspaceAgentRegistry(), registry = suppliedRegistry || context;
  useLayoutEffect(() => {
    if (!registry) return undefined;
    return registry.register(id, { ...descriptor, execute });
  });
}
