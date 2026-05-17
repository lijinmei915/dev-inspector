import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DevInspector from './DevInspector';
import { DevInspectorProvider } from './DevInspectorProvider';
import { mergeDevInspectorConfig, type DevInspectorConfigOverrides } from './config';

export function mountDevInspector(
  config?: DevInspectorConfigOverrides,
) {
  const resolved = mergeDevInspectorConfig(config);
  const existingRoot = document.getElementById(resolved.rootId);
  if (existingRoot) return existingRoot;

  const devRoot = document.createElement('div');
  devRoot.id = resolved.rootId;
  document.body.appendChild(devRoot);

  createRoot(devRoot).render(
    <StrictMode>
      <DevInspectorProvider config={resolved}>
        <DevInspector />
      </DevInspectorProvider>
    </StrictMode>,
  );

  return devRoot;
}
