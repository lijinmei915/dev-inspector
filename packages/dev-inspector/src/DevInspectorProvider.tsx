import { createContext, useContext, type ReactNode } from 'react';
import { type DevInspectorConfig, defaultDevInspectorConfig, mergeDevInspectorConfig } from './config';

const DevInspectorConfigContext = createContext<DevInspectorConfig>(defaultDevInspectorConfig);

export function DevInspectorProvider({
  children,
  config,
}: {
  children: ReactNode;
  config?: Partial<DevInspectorConfig> & {
    endpoints?: Partial<DevInspectorConfig['endpoints']>;
    tokens?: Partial<DevInspectorConfig['tokens']>;
  };
}) {
  return (
    <DevInspectorConfigContext.Provider value={mergeDevInspectorConfig(config)}>
      {children}
    </DevInspectorConfigContext.Provider>
  );
}

export function useDevInspectorConfig() {
  return useContext(DevInspectorConfigContext);
}
