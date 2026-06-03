export type ComponentMakerVariantItem = {
  id?: string;
  dimension: string;
  name: string;
  label?: string;
  base: string;
  rules: string;
  description?: string;
};

export type ComponentMakerEditablePart = {
  id: string;
  label: string;
  value: string;
  fieldName: string;
  editable: boolean;
  readonlyReason?: string;
};

export type ComponentMakerSpecDraft = {
  sourceMode: string;
  action: string;
  classification?: string;
  componentName: string;
  usage?: string;
  editableParts?: ComponentMakerEditablePart[];
  variants: string;
  slots: string;
  styleRules: string;
};

export type ComponentMakerVariantDraft = {
  dimension: string;
  name: string;
  base: string;
  rules: string;
  items?: ComponentMakerVariantItem[];
};

export type ComponentMakerContext = {
  pageTitle: string;
  pageUrl: string;
  targetLabel: string;
  selector: string;
  scopeLabel: string;
  recognitionLines: string[];
  isRecognizedComponent: boolean;
  specDraft?: ComponentMakerSpecDraft;
  variantDraft?: ComponentMakerVariantDraft;
};

export function getComponentMakerPreview(context: ComponentMakerContext): string[] {
  if (context.recognitionLines.length) return context.recognitionLines;
  return ['当前是普通元素：请判断是否应沉淀为组件、primitive 或保持局部元素。'];
}

export function getComponentMakerSpecLines(draft: ComponentMakerSpecDraft): string[] {
  const editableParts = draft.editableParts ?? [];
  const editablePartLines = editableParts
    .filter(part => part.editable)
    .map(part => `${part.label}=${part.value || '空'}（字段名 ${part.fieldName || part.id}）`);
  const readonlyPartLines = editableParts
    .filter(part => !part.editable)
    .map(part => `${part.label}=${part.value || '空'}（只读${part.readonlyReason ? ` / ${part.readonlyReason}` : ''}）`);

  return [
    ['归属方式', draft.sourceMode],
    ['动作', draft.action],
    ['归类', draft.classification ?? ''],
    ['组件名', draft.componentName],
    ['使用场景', draft.usage ?? ''],
    ['变体 / 状态', draft.variants],
    ['可改内容', editablePartLines.length ? editablePartLines.join('；') : draft.slots],
    ['只读内容', readonlyPartLines.join('；')],
    ['样式规则', draft.styleRules],
  ].flatMap(([label, value]) => {
    const normalized = value.trim();
    return normalized ? [`${label}：${normalized}`] : [];
  });
}

export function formatComponentMakerSpecDraft(draft: ComponentMakerSpecDraft): string {
  const lines = getComponentMakerSpecLines(draft);
  return lines.length ? lines.join('；') : '未填写组件规格';
}

export function getComponentMakerVariantLines(draft: ComponentMakerVariantDraft): string[] {
  const items = (draft.items ?? []).filter(item => item.name.trim());
  if (items.length) {
    return [
      `变体组：${items.length} 个`,
      ...(draft.name.trim() ? [`代码名：${draft.name.trim()}`] : []),
      ...items.map(item => {
        const label = item.label?.trim() || item.name.trim();
        const desc = item.description?.trim();
        return [
          `${label}（${item.dimension.trim() || '自定义'} / ${item.name.trim()}）`,
          `基于：${item.base.trim() || draft.base.trim() || '当前样式'}`,
          `规则：${item.rules.trim()}`,
          ...(desc ? [`说明：${desc}`] : []),
        ].join('；');
      }),
    ];
  }

  return [
    ['维度', draft.dimension],
    ['新变体名', draft.name],
    ['基于', draft.base],
    ['变化规则', draft.rules],
  ].flatMap(([label, value]) => {
    const normalized = value.trim();
    return normalized ? [`${label}：${normalized}`] : [];
  });
}

export function formatComponentMakerVariantDraft(draft: ComponentMakerVariantDraft): string {
  const lines = getComponentMakerVariantLines(draft);
  return lines.length ? lines.join('；') : '未填写新变体规格';
}

export function buildComponentMakerPrompt(context: ComponentMakerContext): string {
  const recognition = getComponentMakerPreview(context).map(line => `- ${line}`).join('\n');
  const specLines = context.specDraft ? getComponentMakerSpecLines(context.specDraft) : [];
  const variantLines = context.variantDraft ? getComponentMakerVariantLines(context.variantDraft) : [];
  const target = context.isRecognizedComponent
    ? '请基于当前对象补齐组件定义、props、variant/status、可改内容规则和示例用法；只开放组件允许修改的参数。'
    : '请判断是否需要新增组件；如果需要，提炼组件名称、可配置参数、可改内容、variant 和默认样式。若不适合组件化，请说明原因。';

  return [
    'DevInspector 组件制作任务',
    `页面：${context.pageTitle}（${context.pageUrl}）`,
    `选中对象：${context.targetLabel}`,
    `定位选择器：${context.selector}`,
    `作用范围：${context.scopeLabel}`,
    '当前识别：',
    recognition,
    ...(specLines.length ? ['用户确认规格：', specLines.map(line => `- ${line}`).join('\n')] : []),
    ...(variantLines.length ? ['用户要创建的新变体：', variantLines.map(line => `- ${line}`).join('\n')] : []),
    '目标：',
    target,
    '组件规格原则：',
    '用户在 Inspector 中确认的变体、状态、可改内容、只读内容、token、自定义样式和本次修改内容是组件规格草稿；不要黑盒猜测，优先按这些结构化信息落代码。',
    '约束：',
    '不要手改 dist；优先定位源码组件、tokens 和样式文件；保留业务逻辑，只沉淀组件结构和样式契约。',
  ].join('\n');
}
