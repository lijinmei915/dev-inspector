// ─── 类型 ────────────────────────────────────────────────────

export type PaletteColor = { label: string; val: string; token: string };
export type PaletteGroup = { group: string; colors: PaletteColor[] };

export type ShadowToken = {
  cssVar: string;
  value: string;
  label: string;
  usage: string;
};

export type TypographyToken = {
  key: string;
  label: string;
  fontSizeVar: string;
  fontWeightVar: string;
  colorVar: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  usage: string;
};

export type RadiusPreset = {
  label: string;
  sub: string;
  value: string;
  token: string;
};

export type SpaceStep = {
  label: string;
  size: string;
  val: string;
};

export type FontSizeOption = {
  key: string;
  label: string;
  value: string;
  fontWeight: string;
  color: string;
  colorVar: string;
  usage: string;
};

export type FontWeightOption = { label: string; value: string };

export type DevInspectorEndpoints = {
  applyCss: string;
  submitStyleIntent: string;
  styleIntents: string;
  deleteStyleIntent: string;
  handoff: string;
  reveal: string;
};

export type DevInspectorTokenConfig = {
  colorPalette: PaletteGroup[];
  tokenLabels: Record<string, string>;
  radiusPresets: RadiusPreset[];
  spaceSteps: SpaceStep[];
  borderWidthSteps: string[];
  fontSizeOptions: FontSizeOption[];
  fontWeightOptions: FontWeightOption[];
  shadowTokens: ShadowToken[];
  typographyTokens: TypographyToken[];
};

export type DevInspectorConfig = {
  rootId: string;
  endpoints: DevInspectorEndpoints;
  tokens: DevInspectorTokenConfig;
};

// ─── 内置最小默认值（项目侧可通过 Provider 覆盖） ───────────────

const FALLBACK_TOKENS: DevInspectorTokenConfig = {
  colorPalette: [],
  tokenLabels: {},
  radiusPresets: [
    { label: '无',  sub: '',     value: '0px',  token: '' },
    { label: 'S',   sub: '4px',  value: '4px',  token: '' },
    { label: 'M',   sub: '8px',  value: '8px',  token: '' },
    { label: 'L',   sub: '12px', value: '12px', token: '' },
    { label: 'XL',  sub: '16px', value: '16px', token: '' },
    { label: 'XXL', sub: '24px', value: '24px', token: '' },
  ],
  spaceSteps: [
    { label: '无',  size: '',     val: '0px'  },
    { label: 'S',   size: '4px',  val: '4px'  },
    { label: 'M',   size: '8px',  val: '8px'  },
    { label: 'L',   size: '12px', val: '12px' },
    { label: 'XL',  size: '16px', val: '16px' },
    { label: 'XXL', size: '24px', val: '24px' },
  ],
  borderWidthSteps: ['0px', '1px', '2px', '4px'],
  fontSizeOptions: [],
  fontWeightOptions: [
    { label: '常', value: '400' },
    { label: '中', value: '500' },
    { label: '粗', value: '600' },
    { label: '黑', value: '700' },
  ],
  shadowTokens: [],
  typographyTokens: [],
};

export const defaultDevInspectorConfig: DevInspectorConfig = {
  rootId: 'dev-inspector-root',
  endpoints: {
    applyCss: '/__dev/apply-css',
    submitStyleIntent: '/__dev/submit-style-intent',
    styleIntents: '/__dev/style-intents',
    deleteStyleIntent: '/__dev/style-intents/delete',
    handoff: '/__dev/handoff',
    reveal: '/__dev/reveal',
  },
  tokens: FALLBACK_TOKENS,
};

export function mergeDevInspectorConfig(
  overrides?: Partial<DevInspectorConfig> & {
    endpoints?: Partial<DevInspectorEndpoints>;
    tokens?: Partial<DevInspectorTokenConfig>;
  },
): DevInspectorConfig {
  return {
    ...defaultDevInspectorConfig,
    ...overrides,
    endpoints: {
      ...defaultDevInspectorConfig.endpoints,
      ...overrides?.endpoints,
    },
    tokens: {
      ...defaultDevInspectorConfig.tokens,
      ...overrides?.tokens,
    },
  };
}
