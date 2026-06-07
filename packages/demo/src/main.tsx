import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { mountDevInspector } from '@lijinmei-810/dev-inspector';
import '@lijinmei-810/dev-inspector/style.css';
import './demo.css';
import { DemoButton, DemoForm, DemoTaskCard, demoComponentPreviews } from './demo-components';

function DemoApp() {
  useEffect(() => {
    mountDevInspector({
      componentPreviews: demoComponentPreviews,
      tokens: {
        colorPalette: [
          {
            group: 'color',
            colors: [
              { label: 'surface', val: '#ffffff', token: '--color-surface' },
            ],
          },
          {
            group: 'text',
            colors: [
              { label: 'strong', val: '#0f172a', token: '--color-text-strong' },
              { label: 'default', val: '#334155', token: '--color-text-default' },
              { label: 'muted', val: '#64748b', token: '--color-text-muted' },
            ],
          },
          {
            group: 'brand',
            colors: [
              { label: 'primary', val: '#6d5dfc', token: '--color-brand-primary' },
              { label: 'soft', val: '#ede9fe', token: '--color-brand-soft' },
              { label: 'success', val: '#b7f7d2', token: '--color-success-soft' },
            ],
          },
          {
            group: 'border',
            colors: [
              { label: 'default', val: '#eef2f7', token: '--color-border-default' },
              { label: 'control', val: '#dbe3ef', token: '--color-border-control' },
              { label: 'focus', val: '#6d5dfc', token: '--color-brand-primary' },
            ],
          },
        ],
        tokenLabels: {
          '--color-text-strong': 'color-text-strong',
          '--color-text-default': 'color-text-default',
          '--color-text-muted': 'color-text-muted',
          '--color-brand-primary': 'color-brand-primary',
          '--color-brand-soft': 'color-brand-soft',
          '--color-success-soft': 'color-success-soft',
          '--color-surface': 'color-surface',
          '--color-border-default': 'color-border-default',
          '--color-border-control': 'color-border-control',
        },
        containerStyles: [
          {
            key: 'card-container',
            label: '卡片容器',
            backgroundColor: '#ffffff',
            backgroundVar: '--color-surface',
            borderColor: '#eef2f7',
            colorVar: '--color-border-default',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '8px',
            usage: '任务卡片、表单容器',
          },
          {
            key: 'control-container',
            label: '控件容器',
            backgroundColor: '#ffffff',
            backgroundVar: '--color-surface',
            borderColor: '#dbe3ef',
            colorVar: '--color-border-control',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '8px',
            usage: '输入框、次级按钮',
          },
          {
            key: 'primary-action',
            label: '主操作容器',
            backgroundColor: '#6d5dfc',
            backgroundVar: '--color-brand-primary',
            borderColor: 'transparent',
            colorVar: 'transparent',
            borderWidth: '0px',
            borderStyle: 'none',
            borderRadius: '8px',
            usage: '主按钮、文字按钮',
          },
        ],
        typographyStyles: [
          {
            key: 'task-title',
            label: '任务标题',
            value: '17px',
            fontWeight: '700',
            color: '#0f172a',
            colorVar: '--color-text-strong',
            usage: '任务卡片标题',
          },
          {
            key: 'card-title',
            label: '卡片标题',
            value: '15px',
            fontWeight: '600',
            color: '#0f172a',
            colorVar: '--color-text-strong',
            usage: '卡片、模块标题',
          },
          {
            key: 'card-desc',
            label: '卡片正文',
            value: '13px',
            fontWeight: '400',
            color: '#64748b',
            colorVar: '--color-text-muted',
            usage: '卡片描述、正文说明',
          },
          {
            key: 'button-text',
            label: '按钮文字',
            value: '14px',
            fontWeight: '600',
            color: '#ffffff',
            colorVar: '--color-white',
            usage: '主操作按钮文字',
          },
        ],
        shadowTokens: [
          {
            cssVar: '--shadow-card',
            value: '0 14px 42px rgba(15, 23, 42, 0.08)',
            label: '柔和',
            usage: '任务卡片、表单容器',
          },
          {
            cssVar: '--shadow-floating',
            value: '0 26px 58px rgba(15, 23, 42, 0.15)',
            label: '浮起',
            usage: '浮层、悬浮卡片',
          },
          {
            cssVar: '--shadow-emphasis',
            value: '0 18px 48px rgba(109, 93, 252, 0.16)',
            label: '强调',
            usage: '选中态、品牌强调',
          },
        ],
      },
    });
  }, []);

  return (
    <main className="demo-shell">
      <section className="demo-hero">
        <div>
          <p className="demo-eyebrow">Local demo</p>
          <h1>Dev Inspector</h1>
          <p className="demo-subtitle">点击右下角「编辑」，或用 Mac Option+I / Windows Alt+I，再点任意元素查看样式。</p>
        </div>
        <DemoButton variant="primary">主按钮</DemoButton>
      </section>

      <section className="demo-actions">
        <DemoButton variant="text">文字按钮</DemoButton>
        <DemoButton variant="ghost">次按钮</DemoButton>
      </section>

      <section className="demo-block demo-block--components">
        <div className="demo-block-head">
          <p className="demo-block-kicker">组件区块</p>
          <h2>已封装组件示例</h2>
          <p>这里用于测试已识别组件、真实变体、子组件和外部布局。</p>
        </div>
        <div className="task-grid">
          <DemoTaskCard selected status="progress" title="任务标题 1" />
          <DemoTaskCard status="default" title="任务标题 2" />
          <DemoTaskCard status="success" title="任务标题 3" />
        </div>
      </section>

      <section className="demo-block demo-block--plain plain-test-zone">
        <div className="plain-zone-head">
          <p className="plain-kicker">普通元素测试区</p>
          <h2 className="plain-section-title">非组件 DOM 示例</h2>
          <p className="plain-section-desc">这里都是普通 HTML 元素，用来测试创建组件时的容器、用途、名称和使用场景推断。</p>
        </div>

        <div className="plain-layout">
          <article className="plain-card">
            <span className="plain-tag">页面提示</span>
            <h3 className="plain-card-title">新品铺货节奏</h3>
            <p className="plain-card-copy">建议先补齐主推款，再根据门店库存补充安全货量。</p>
            <a className="plain-link" href="#plain-detail">查看明细</a>
          </article>

          <aside className="plain-menu">
            <p className="plain-menu-label">菜单</p>
            <ul>
              <li className="plain-menu-item is-active">策略生成</li>
              <li className="plain-menu-item">培训提纲</li>
              <li className="plain-menu-item">异常诊断</li>
            </ul>
          </aside>
        </div>

        <div className="plain-list">
          <div className="plain-list-row">
            <span className="plain-index">01</span>
            <div>
              <strong className="plain-row-title">快速定位物料</strong>
              <p className="plain-row-desc">把场景归类后，自动找到所需作战物料。</p>
            </div>
            <span className="plain-row-status">可用</span>
          </div>
          <div className="plain-list-row">
            <span className="plain-index">02</span>
            <div>
              <strong className="plain-row-title">AI 智能问答</strong>
              <p className="plain-row-desc">即时回答经营问题，并沉淀到知识库。</p>
            </div>
            <span className="plain-row-status plain-row-status--muted">待接入</span>
          </div>
        </div>

        <div className="plain-form-panel">
          <label className="plain-field">
            <span>门店名称</span>
            <input placeholder="例如：西湖旗舰店" />
          </label>
          <label className="plain-field">
            <span>补充说明</span>
            <textarea placeholder="填写需要 AI 特别关注的信息" />
          </label>
          <div className="plain-inline-actions">
            <button type="button">保存草稿</button>
            <button type="button">生成建议</button>
          </div>
        </div>
      </section>

      <DemoForm />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
