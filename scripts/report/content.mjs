const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const media = {
  certSoftware: { file: 'cert-software.png', title: 'CMMI 与质量管理体系认证信息' },
  certSecurity: { file: 'cert-security.png', title: '信息安全管理体系认证信息' },
  design: { file: 'bridge-design-workbench.jpg', title: '桥梁养护设计辅助系统 · 工作台', source: 'https://demo.dongquzhihui.com/ai-bridge-design/#/workbench' },
  designOverview: { file: 'bridge-design-overview.jpg', title: '桥梁养护设计辅助系统 · 设计流程概览', source: 'https://demo.dongquzhihui.com/ai-bridge-design/#/design-project/4' },
  bridge: { file: 'bridge-doctor.jpg', title: '桥检博士 · 桥梁检查详情', source: 'https://www.dongquzhihui.com/qbcpyv0_1_1' },
  liyang: { file: 'drone-liyang.png', title: '溧阳通用路桥无人机巡检系统', source: 'https://where.dongquzhihui.com/where/#/catalog' },
  ninghu: { file: 'drone-ninghu.jpg', title: '江苏宁沪高速无人机智能巡检系统', source: 'https://where.dongquzhihui.com/where/#/catalog' },
  sutong: { file: 'sutong-dashboard.jpg', title: '大桥 AI 养护决策系统 · 总览', source: 'https://demo.dongquzhihui.com/sutong-ai-bridge/#/dashboard' },
  knowledge: { file: 'sutong-knowledge.jpg', title: '大桥 AI 养护决策系统 · 文档知识库', source: 'https://demo.dongquzhihui.com/sutong-ai-bridge/#/knowledge/documents' },
  home: { file: 'vehicle-home.png', title: '浩宜智检 · 车辆工作台（模拟器画面）' },
  review: { file: 'vehicle-review.png', title: '浩宜智检 · AI 结果复核（模拟器画面）' },
  annotation: { file: 'vehicle-annotation.png', title: '浩宜智检 · 人工修订（模拟器画面）' },
  letter: { file: 'thank-you.jpg', title: '盐城客户感谢信 · 原件' },
  patentKnowledge: { file: 'patent-knowledge.jpg', title: '一种业务系统用知识图谱实体精准识别关系系统', source: 'https://patents.google.com/patent/CN121257690B/zh' },
  patentMultimodal: { file: 'patent-multimodal.jpg', title: '基于语音识别与多模态交互的智能图表动态生成方法', source: 'https://patents.google.com/patent/CN120670583B/zh' },
};

export function renderContent(assets, workspaceHref) {
  function shot(key, { caption = media[key].title, className = '', eager = false } = {}) {
    const item = media[key];
    return `<figure class="shot ${className}"><button class="shot-button" type="button" data-lightbox="${key}" aria-label="放大：${escapeHtml(item.title)}"><img src="${assets[key].src}" width="${assets[key].width}" height="${assets[key].height}" data-asset="${key}" data-title="${escapeHtml(item.title)}"${item.source ? ` data-source="${escapeHtml(item.source)}"` : ''} alt="${escapeHtml(item.title)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}><span class="expand" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></span></button>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
  }
  const external = (url, text) => `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}<span aria-hidden="true"> ↗</span></a>`;
  function gallery(id, label, items) {
    return `<div class="proof-gallery" data-gallery aria-label="${escapeHtml(label)}"><div class="gallery-controls" hidden>${items.map(item => `<button type="button" data-gallery-select="${item.key}" id="${id}-select-${item.key}" aria-controls="${id}-${item.key}" aria-pressed="false"><span>${escapeHtml(item.label)}</span></button>`).join('')}</div><div class="gallery-panels">${items.map(item => `<div class="gallery-panel" data-gallery-panel="${item.key}" id="${id}-${item.key}" aria-labelledby="${id}-select-${item.key}">${shot(item.key, { caption: item.caption || media[item.key].title })}${item.note ? `<p class="media-note">${escapeHtml(item.note)}</p>` : ''}${item.extra || ''}${media[item.key].source ? `<div class="gallery-source">${external(media[item.key].source, '查看来源')}</div>` : ''}</div>`).join('')}</div></div>`;
  }
  return `
<a class="skip-link" href="#main">跳到正文</a>
<header class="nav"><div class="wrap nav-inner"><a class="brand" href="#top">工作汇报</a><nav aria-label="汇报目录"><a href="#top">个人能力</a><a href="#vision">图像 AI</a><a href="#agents">智能体</a><a href="#hardware">软硬件</a><a href="#development">研发管理</a><a href="#government">项目交付</a><a href="#haoyi" class="nav-part">浩宜价值</a><a href="#direction">发展方向</a></nav><button id="presentation-start" class="primary-link" type="button" hidden>开始演示 <span aria-hidden="true">▷</span></button></div></header>
<main id="main" tabindex="-1">
  <section class="section scene hero" data-slide data-title="个人能力" id="top" aria-labelledby="report-title"><div class="wrap scene-inner hero-grid">
    <div class="hero-copy" data-build="1" data-motion="title"><h1 id="report-title">AI 产品研发<br><span>软硬件协同</span><br>研发管理与项目交付</h1><p class="hero-intro">目前担任数字交付中心副主任，分管开发。参与 AI 产品和嵌入式软件研发，也负责团队管理、客户沟通和项目交付。</p><a class="text-link" href="#vision">查看项目经历 <span aria-hidden="true">↓</span></a></div>
    <div class="hero-proof" data-build="2" data-motion="image">${shot('design', { eager: true, caption: '桥梁养护设计辅助系统 · 工作台' })}</div>
    <div class="capability-grid" data-build="3" data-motion="stagger"><article><h2>技术研发</h2><p>参与图像识别、智能体、知识工程和部分嵌入式软件开发。</p></article><article><h2>研发管理</h2><p>主导部门 AI 辅助开发流程建设，参与技术选型和项目评估。</p></article><article><h2>项目交付</h2><p>负责政府平台现场需求对接和项目组出差管理，参与业务培训和验收汇报。</p></article></div>
  </div></section>

  <section class="section scene white" data-slide data-title="桥梁与无人机图像 AI" id="vision" aria-labelledby="vision-title"><div class="wrap scene-inner">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="vision-title">图像 AI<br>桥梁检测与无人机巡检</h2><p>参与桥梁检测和无人机道路病害识别项目，工作涉及图像采集、结果复核和样本整理。</p></div>
    <div class="scene-grid" data-build="2" data-motion="image"><div class="copy-stack"><article><h3>桥检博士</h3><p>系统集中管理桥梁检查记录、病害资料和技术评定结果，方便检查人员核对。</p></article><article><h3>无人机道路病害识别</h3><p>将识别出的病害与巡检图像、位置对应，便于人工复核。展示画面来自公司的溧阳和江苏宁沪案例。</p></article></div>${gallery('vision-gallery', '图像应用项目画面', [{ key: 'bridge', label: '桥检博士' }, { key: 'liyang', label: '溧阳巡检', note: '公司道路巡检产品画面。' }, { key: 'ninghu', label: '江苏宁沪', note: '公司道路巡检产品画面。' }])}</div>
    <ol class="workflow experience-flow" data-build="3" data-motion="flow"><li><span class="step-number" aria-hidden="true">1</span><h3>图像采集</h3><p>采集现场检查和无人机巡检图像。</p></li><li><span class="step-number" aria-hidden="true">2</span><h3>识别结果呈现</h3><p>将识别出的病害与位置、检查记录对应。</p></li><li><span class="step-number" aria-hidden="true">3</span><h3>人工复核与样本整理</h3><p>根据人工复核意见整理结果和样本。</p></li></ol>
  </div></section>

  <section class="section scene" data-slide data-title="智能体与知识工程" id="agents" aria-labelledby="agents-title"><div class="wrap scene-inner">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="agents-title">智能体交付<br>与知识工程</h2><p>负责两个养护智能体系统的交付工作，并参与知识图谱和 AI 应用的技术选型。</p></div>
    <div class="scene-grid" data-build="2" data-motion="image"><div class="copy-stack"><article><h3>桥梁养护设计辅助系统</h3><p class="role">交付负责人</p><p>系统支持养护措施匹配、工程量计算和设计方案输出。</p><button class="text-link" type="button" data-lightbox="design">查看工作台 <span aria-hidden="true">↗</span></button></article><article><h3>大桥 AI 养护决策系统</h3><p class="role">交付负责人</p><p>系统汇总养护项目、巡查和风险信息，并提供文档知识库查询。</p>${external(media.sutong.source, '打开系统')}</article></div>${gallery('agents-gallery', '智能体系统画面', [{ key: 'designOverview', label: '设计流程' }, { key: 'sutong', label: '养护决策' }, { key: 'knowledge', label: '文档知识库' }])}</div>
    <div class="knowledge-evidence" data-build="3" data-motion="stagger"><div class="technical-choices"><article><h3>苏通大桥知识图谱</h3><p>主要负责 RAG 框架和向量数据库的选型。</p></article><article><h3>Dify 与 Agent 框架</h3><p>参与 Dify 工作流应用和 Agent 框架选型，综合考虑业务需求、开发投入和交付要求。</p></article></div><div class="patent-evidence"><article>${shot('patentKnowledge', { caption: '', className: 'patent-shot' })}<div><h3>知识图谱实体精准识别</h3><p>共同发明人 · CN121257690B</p>${external(media.patentKnowledge.source, '授权公告')}</div></article><article>${shot('patentMultimodal', { caption: '', className: 'patent-shot' })}<div><h3>语音与多模态智能图表</h3><p>共同发明人 · CN120670583B</p>${external(media.patentMultimodal.source, '授权公告')}</div></article></div></div>
  </div></section>

  <section class="section scene white" data-slide data-title="智盒与软硬件开发" id="hardware" aria-labelledby="hardware-title"><div class="wrap scene-inner">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="hardware-title">边缘计算智盒<br>从设备采集到平台接入</h2><p>参与智盒研发，工作包括需求方案、部分嵌入式开发、数据接入、联调和供应商协调。</p></div>
    <div class="hardware-layout" data-build="2" data-motion="flow"><ol class="responsibilities compact-list"><li><h3>需求与方案</h3><p>参与需求梳理和技术方案设计。</p></li><li><h3>嵌入式软件开发</h3><p>承担部分设备端嵌入式软件开发工作。</p></li><li><h3>数据采集与平台对接</h3><p>将设备采集的数据接入平台。</p></li><li><h3>软硬件联调</h3><p>检查设备、软件和平台之间的数据交互，配合完成联调。</p></li><li><h3>供应商协调</h3><p>协调设备和软件供应商，配合开发与联调。</p></li></ol><div class="device-diagram" role="img" aria-label="设备与平台协同示意：采集设备、嵌入式软件、业务平台相互衔接，需求方案和供应商协调贯穿其中。"><div class="diagram-heading">设备与平台协同示意</div><div class="device-node"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 12h28v24H10zM16 18h16M16 24h10M16 30h6M5 17h5M5 25h5M38 17h5M38 25h5"/></svg><strong>采集设备</strong><span>现场数据</span></div><div class="device-connector" aria-hidden="true"></div><div class="device-node"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="12" y="12" width="24" height="24" rx="3"/><path d="M19 19h10v10H19zM17 5v7M24 5v7M31 5v7M17 36v7M24 36v7M31 36v7M5 17h7M5 24h7M5 31h7M36 17h7M36 24h7M36 31h7"/></svg><strong>嵌入式软件</strong><span>采集与交互</span></div><div class="device-connector" aria-hidden="true"></div><div class="device-node"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="7" y="9" width="34" height="25" rx="3"/><path d="M17 41h14M24 34v7M13 27l7-8 6 4 9-8"/></svg><strong>业务平台</strong><span>数据接入与使用</span></div><p class="diagram-foot">需求与方案 · 软硬件联调 · 供应商协调</p></div></div>
    <div class="hardware-summary" data-build="3" data-motion="stagger"><p>参与设备端软件开发、平台对接和联调，并协调供应商配合。</p>${external('https://where.dongquzhihui.com/where/#/catalog', '东衢产品目录')}</div>
  </div></section>

  <section class="section scene" data-slide data-title="研发组织与经营参与" id="development" aria-labelledby="development-title"><div class="wrap scene-inner">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="development-title">研发管理<br>与 AI 辅助开发</h2><p>负责开发团队管理，主导部门 AI 辅助开发工作，并参与公司经营、产品方向和技术选型讨论。</p></div>
    <ol class="workflow" data-build="2" data-motion="flow"><li><span class="step-number" aria-hidden="true">1</span><h3>搭建项目框架</h3><p>搭建前后端基础框架，统一项目结构。</p></li><li><span class="step-number" aria-hidden="true">2</span><h3>编写 rules 与 skills</h3><p>根据项目框架编写 rules 和 skills，明确 AI 辅助开发的约定。</p></li><li><span class="step-number" aria-hidden="true">3</span><h3>整理前后端开发流程</h3><p>整理单人使用 AI 完成前后端开发的完整流程，供后续项目复用。</p></li></ol>
    <div class="management-details" data-build="3" data-motion="stagger"><div class="business-flow management-business"><article><h3>需求与报价</h3><p>与项目经理拆分需求，评估工作量和产值，参与项目前期报价。</p></article><article><h3>售前与验收</h3><p>在部分项目中开发售前 Demo、汇报方案，并参与验收、主导验收汇报。</p></article></div><div class="management-certifications"><p class="cert-role">公司体系认证 · 核心参与与资源协调</p><div class="cert-body"><div class="cert-list"><article><strong>CMMI</strong><h3>软件能力成熟度</h3></article><article><strong>ISO 9001</strong><h3>质量管理体系</h3></article><article><strong>ISO/IEC 27001</strong><h3>信息安全管理体系</h3></article></div><div class="cert-info-images">${shot('certSoftware', { caption: '' })}${shot('certSecurity', { caption: '' })}</div></div><div class="resource-rows"><article><h3>等保 · 软测 · 专利 · 软著</h3><p>可以对接等保测评、软件测试和知识产权相关服务。</p></article><article><h3>高校技术交流</h3><p>通过东衢与东南大学的项目合作，与交通学院、土木学院的多位教师建立了联系。</p></article></div></div></div>
  </div></section>

  <section class="section scene white" data-slide data-title="政府项目与客户沟通" id="government" aria-labelledby="government-title"><div class="wrap scene-inner">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="government-title">政府项目现场<br>需求对接与团队协调</h2><p>在金电联行担任项目经理期间，负责政府客户需求对接和项目组现场协调。</p></div>
    <div class="government-grid" data-build="2" data-motion="stagger"><article class="government-projects"><h3>现场需求对接与出差管理</h3><ul class="project-names"><li>信用七台河平台</li><li>信用银川</li><li>青海省信用报告平台</li></ul><p>独立承担这三个项目的现场需求对接和项目组出差管理。</p></article><article class="government-guidance"><h3>盐城各区县发改委信用工作指导</h3><p>作为技术专家，主要开展以下工作：</p><ul class="guidance-list"><li>业务培训</li><li>平台使用指导</li><li>数据质量与信用评价整改指导</li></ul></article></div>
    <div class="client-evidence" data-build="3" data-motion="stagger"><div class="project-qualification"><div class="pmp-proof"><strong>PMP</strong><span>项目管理专业资格</span></div><h3>福建电子信息集团海丝信用项目</h3><p>独立负责该项目。</p></div><article class="letter-evidence">${shot('letter', { caption: '', className: 'letter-shot' })}<div><h3>信用盐城项目</h3><p>参与项目观摩和汇报活动的保障工作，附客户感谢信。</p><button class="text-link" type="button" data-lightbox="letter">查看感谢信原件 <span aria-hidden="true">↗</span></button></div></article></div>
  </div></section>

  <section class="section scene haoyi" data-slide data-title="能为浩宜承担什么" id="haoyi" aria-labelledby="haoyi-title"><div class="wrap scene-inner">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="haoyi-title">这些能力<br>可以为浩宜做什么</h2><p>结合浩宜的语音应用，我可以参与图像识别、维修知识应用和汽车硬件开发。</p></div>
    <div class="contribution-grid" data-build="2" data-motion="stagger"><article><h3>AI 产品研发</h3><p>可以参与车辆图像检查、维修知识查询和案例整理，与现有语音应用结合。模型按车辆场景选择和验证。</p></article><article><h3>汽车硬件协同开发</h3><p>可以参与汽车检测终端的需求方案、部分嵌入式开发、数据接入和联调，协调供应商配合。</p></article><article><h3>研发与项目推进</h3><p>可以负责开发团队管理，建立 AI 辅助开发流程，并承担客户需求对接、方案汇报和项目交付工作。</p></article></div>
    <div class="haoyi-practice scene-grid" data-build="3" data-motion="image"><div class="copy-stack"><article><h3>浩宜智检原型</h3><p>原型展示了车辆建档、AI 结果复核和人工修订流程。</p><details class="verification"><summary>原型验证范围</summary><p>画面来自 Android 模拟器，展示的是历史分析结果。建档、采集、复核、人工修订、审核和样本导出均有实现及测试记录；实车拍摄、现场网络和维修效果仍需现场验证。未接入 OBD，不通过照片判断电池、电机、电控内部故障。界面数量和置信分数不代表业务规模或识别准确率。</p></details></article><article><h3>浩宜 CRM 与工作台</h3><p>工作台整合了客户跟进、行业资料、AI 辅助研究和内部待办。</p><a class="text-link" href="${escapeHtml(workspaceHref)}" data-workspace>打开工作台 <span aria-hidden="true">↗</span></a></article></div>${gallery('vehicle-gallery', '浩宜智检原型画面', [{ key: 'home', label: '车辆建档', note: 'Android 模拟器画面，展示历史分析结果。' }, { key: 'review', label: '结果复核', note: 'Android 模拟器画面，展示历史分析结果。' }, { key: 'annotation', label: '人工修订', note: 'Android 模拟器画面，展示历史分析结果。' }])}</div>
  </div></section>

  <section class="section scene direction" data-slide data-title="希望承担的工作与发展方向" id="direction" aria-labelledby="direction-title"><div class="wrap scene-inner direction-grid">
    <div class="section-heading" data-build="1" data-motion="title"><h2 id="direction-title">希望承担的工作<br>与发展方向</h2><p>希望主要承担 AI 软件研发管理工作，同时了解区域业务，逐步参与区域管理。</p></div>
    <article class="direction-card" data-build="2" data-motion="title"><h3>公司 AI 业务<br>与软件研发管理</h3><p>希望参与公司 AI 业务，负责软件研发和团队管理，参与产品规划与技术选型，组织开发和交付。</p></article>
    <article class="direction-card" data-build="3" data-motion="title"><h3>区域管理岗位</h3><p>希望参与区域管理，了解区域业务和合作伙伴的运营，运用客户沟通和项目协调经验，在实际工作中学习经营，逐步承担管理职责。</p></article>
  </div></section>
</main>
<footer class="footer"><div class="wrap"><p>系统画面与专利页面保留来源，演示数量与金额不作为个人业绩。</p><div class="footer-bottom"><details class="font-license"><summary>字体与许可</summary><pre>本文嵌入 Noto Sans SC 页面文字子集，保留字体版权与 SIL Open Font License 1.1。\n__FONT_COPYRIGHT__\n\n__FONT_LICENSE__</pre></details><a href="#top">回到开头 ↑</a></div></div></footer>
<div id="presentation-controls" class="presentation-controls" role="region" aria-label="演示控制" hidden><button id="presentation-prev" type="button" aria-label="返回上一步">← 上一步</button><span id="presentation-position"></span><button id="presentation-next" class="primary-link" type="button">下一步 →</button><button id="presentation-fullscreen" type="button">全屏</button><button id="presentation-exit" type="button">退出演示</button></div>
<div id="presentation-announcement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
<dialog id="lightbox" aria-labelledby="lightbox-title"><div class="lightbox-top"><h2 id="lightbox-title">查看原图</h2><div class="lightbox-actions"><a id="lightbox-source" target="_blank" rel="noopener noreferrer" hidden>查看来源 ↗</a><button id="lightbox-zoom" type="button" aria-pressed="false">原始尺寸</button><button id="lightbox-close" class="icon-button" type="button" aria-label="关闭大图"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div></div><div class="image-scroll" id="lightbox-scroll" tabindex="0" role="region" aria-label="图片查看区域"><img id="lightbox-image" alt=""></div></dialog>`;
}
