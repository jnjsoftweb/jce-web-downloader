/**
 * Popup UI — App 컴포넌트
 *
 * 탭 구조:
 * - "추출 규칙" 탭: 통합 규칙 목록 편집, 선택 모드, 추출 실행, 결과 표시
 * - "설정" 탭: Backend URL, 출력 포맷
 *
 * 통신 흐름:
 * Popup → chrome.runtime.sendMessage → Background → chrome.tabs.sendMessage → Content
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  ExtractRule,
  ObjectRule,
  ArrayRule,
  ExtractConfig,
  OutputFormat,
  ExtractOutput,
  MessageResponse,
  RuleEntry,
  Template,
  TemplateCategory,
} from '../types'

// ============================================================
// 유틸리티
// ============================================================

function generateId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'json', label: 'JSON (통합)' },
  { value: 'json-array', label: 'JSON Array' },
  { value: 'csv', label: 'CSV' },
  { value: 'markdown', label: 'Markdown 테이블' },
  { value: 'raw', label: 'Raw (key: value)' },
]

// ============================================================
// RuleListItem 컴포넌트
// ============================================================

interface RuleListItemProps {
  entry: RuleEntry
  index: number
  total: number
  onMove: (index: number, direction: 'up' | 'down') => void
  onEdit: () => void
  onDelete: () => void
}

function RuleListItem({ entry, index, total, onMove, onEdit, onDelete }: RuleListItemProps) {
  const { kind, data } = entry

  const badgeClass = `rule-kind-badge rule-kind-badge--${kind}`
  const badgeLabel = kind === 'field' ? 'F' : kind === 'object' ? 'O' : 'A'

  let title = ''
  let subtitle = ''

  if (kind === 'field') {
    const r = data as ExtractRule
    title = r.name
    subtitle = r.xpath
  } else if (kind === 'object') {
    const r = data as ObjectRule
    title = r.name
    subtitle = r.children.map((c) => c.name).join(', ')
  } else {
    const r = data as ArrayRule
    title = r.name
    subtitle = r.containerXPath
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px', background: '#fff',
      border: '1px solid #e2e8f0', borderRadius: 6,
    }}>
      <span className={badgeClass}>{badgeLabel}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button className="btn btn--ghost btn--icon" onClick={() => onMove(index, 'up')} disabled={index === 0} title="위로">↑</button>
        <button className="btn btn--ghost btn--icon" onClick={() => onMove(index, 'down')} disabled={index === total - 1} title="아래로">↓</button>
        <button className="btn btn--ghost btn--icon" onClick={onEdit} title="편집">✏</button>
        <button className="btn btn--ghost btn--icon btn--danger" onClick={onDelete} title="삭제">✕</button>
      </div>
    </div>
  )
}

// ============================================================
// RuleForm
// ============================================================

interface RuleFormProps {
  initialRule?: ExtractRule
  onSave: (rule: ExtractRule) => void
  onCancel: () => void
}

function RuleForm({ initialRule, onSave, onCancel }: RuleFormProps) {
  const [name, setName] = useState(initialRule?.name ?? '')
  const [xpath, setXpath] = useState(initialRule?.xpath ?? '')
  const [attr, setAttr] = useState(initialRule?.attr ?? 'innerText')

  const handleSave = () => {
    if (!name.trim() || !xpath.trim()) return
    onSave({
      id: initialRule?.id ?? generateId(),
      name: name.trim(),
      xpath: xpath.trim(),
      attr: attr.trim() || 'innerText',
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="form-group">
        <label className="form-label">규칙 이름</label>
        <input
          className="form-input"
          type="text"
          placeholder="예: 제목, 가격, 날짜"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">XPath</label>
        <input
          className="form-input monospace"
          type="text"
          placeholder='예: //h1[@class="title"]'
          value={xpath}
          onChange={(e) => setXpath(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">추출 속성</label>
        <select
          className="form-select"
          value={attr}
          onChange={(e) => setAttr(e.target.value)}
        >
          <option value="innerText">innerText (텍스트)</option>
          <option value="innerHTML">innerHTML (HTML)</option>
          <option value="href">href</option>
          <option value="src">src</option>
          <option value="alt">alt</option>
          <option value="data-value">data-value</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn--ghost" onClick={onCancel}>취소</button>
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={!name.trim() || !xpath.trim()}
        >
          저장
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ObjectRuleForm
// ============================================================

interface ObjectRuleFormProps {
  initialRule?: ObjectRule
  onSave: (rule: ObjectRule) => void
  onCancel: () => void
}

function ObjectRuleForm({ initialRule, onSave, onCancel }: ObjectRuleFormProps) {
  const [name, setName] = useState(initialRule?.name ?? '')
  const [children, setChildren] = useState<ExtractRule[]>(initialRule?.children ?? [])

  const addChild = () => {
    setChildren((prev) => [
      ...prev,
      { id: generateId(), name: '', xpath: '', attr: 'innerText' },
    ])
  }

  const updateChild = (index: number, field: keyof ExtractRule, value: string) => {
    setChildren((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    )
  }

  const removeChild = (index: number) => {
    setChildren((prev) => prev.filter((_, i) => i !== index))
  }

  const isValid =
    name.trim() &&
    children.length > 0 &&
    children.every((c) => c.name.trim() && c.xpath.trim())

  const handleSave = () => {
    if (!isValid) return
    onSave({
      id: initialRule?.id ?? generateId(),
      name: name.trim(),
      children,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="form-group">
        <label className="form-label">그룹 이름</label>
        <input
          className="form-input"
          type="text"
          placeholder="예: meta, header, info"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="form-hint">결과에서 {`{ "${name || 'name'}": { ... } }`} 형태로 출력됩니다.</span>
      </div>

      <div className="array-rule-children">
        <div className="array-rule-children__header">
          <span>필드 {children.length > 0 && `(${children.length})`}</span>
          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={addChild}>
            + 필드 추가
          </button>
        </div>
        {children.length === 0 && (
          <span className="form-hint">이 그룹에 포함할 필드를 추가하세요.</span>
        )}
        {children.map((child, index) => (
          <div key={child.id} className="child-rule-row">
            <input
              className="form-input"
              type="text"
              placeholder="필드명"
              value={child.name}
              onChange={(e) => updateChild(index, 'name', e.target.value)}
            />
            <input
              className="form-input monospace"
              type="text"
              placeholder="//h1"
              value={child.xpath}
              onChange={(e) => updateChild(index, 'xpath', e.target.value)}
            />
            <select
              className="form-select"
              value={child.attr ?? 'innerText'}
              onChange={(e) => updateChild(index, 'attr', e.target.value)}
            >
              <option value="innerText">text</option>
              <option value="innerHTML">html</option>
              <option value="href">href</option>
              <option value="src">src</option>
            </select>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => removeChild(index)}
              title="삭제"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn--ghost" onClick={onCancel}>취소</button>
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={!isValid}
        >
          저장
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ArrayRuleForm
// ============================================================

interface ArrayRuleFormProps {
  initialRule?: ArrayRule
  onSave: (rule: ArrayRule) => void
  onCancel: () => void
}

function ArrayRuleForm({ initialRule, onSave, onCancel }: ArrayRuleFormProps) {
  const [name, setName] = useState(initialRule?.name ?? '')
  const [containerXPath, setContainerXPath] = useState(initialRule?.containerXPath ?? '')
  const [children, setChildren] = useState<ExtractRule[]>(initialRule?.children ?? [])

  const addChild = () => {
    setChildren((prev) => [
      ...prev,
      { id: generateId(), name: '', xpath: '', attr: 'innerText' },
    ])
  }

  const updateChild = (index: number, field: keyof ExtractRule, value: string) => {
    setChildren((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    )
  }

  const removeChild = (index: number) => {
    setChildren((prev) => prev.filter((_, i) => i !== index))
  }

  const isValid =
    name.trim() &&
    containerXPath.trim() &&
    children.length > 0 &&
    children.every((c) => c.name.trim() && c.xpath.trim())

  const handleSave = () => {
    if (!isValid) return
    onSave({
      id: initialRule?.id ?? generateId(),
      name: name.trim(),
      containerXPath: containerXPath.trim(),
      children,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="form-group">
        <label className="form-label">규칙 이름</label>
        <input
          className="form-input"
          type="text"
          placeholder="예: 상품목록, 검색결과"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">컨테이너 XPath</label>
        <input
          className="form-input monospace"
          type="text"
          placeholder="예: //table/tbody/tr"
          value={containerXPath}
          onChange={(e) => setContainerXPath(e.target.value)}
        />
        <span className="form-hint">반복되는 항목의 부모 컨테이너 XPath</span>
      </div>

      <div className="array-rule-children">
        <div className="array-rule-children__header">
          <span>자식 필드 {children.length > 0 && `(${children.length})`}</span>
          <button className="btn btn--ghost" style={{ fontSize: 11, padding: '2px 6px' }} onClick={addChild}>
            + 필드 추가
          </button>
        </div>
        {children.length === 0 && (
          <span className="form-hint">각 항목 기준 상대 XPath로 추출할 필드를 추가하세요. 예: .//td[1]</span>
        )}
        {children.map((child, index) => (
          <div key={child.id} className="child-rule-row">
            <input
              className="form-input"
              type="text"
              placeholder="필드명"
              value={child.name}
              onChange={(e) => updateChild(index, 'name', e.target.value)}
            />
            <input
              className="form-input monospace"
              type="text"
              placeholder=".//td[1]"
              value={child.xpath}
              onChange={(e) => updateChild(index, 'xpath', e.target.value)}
            />
            <select
              className="form-select"
              value={child.attr ?? 'innerText'}
              onChange={(e) => updateChild(index, 'attr', e.target.value)}
            >
              <option value="innerText">text</option>
              <option value="innerHTML">html</option>
              <option value="href">href</option>
              <option value="src">src</option>
            </select>
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => removeChild(index)}
              title="삭제"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn--ghost" onClick={onCancel}>취소</button>
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={!isValid}
        >
          저장
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 메인 App
// ============================================================

type TabKey = 'rules' | 'settings' | 'templates'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('rules')

  // 통합 규칙 목록 state
  const [allRules, setAllRules] = useState<RuleEntry[]>([])
  const [activeForm, setActiveForm] = useState<'field' | 'object' | 'array' | null>(null)
  const [editingEntry, setEditingEntry] = useState<RuleEntry | null>(null)

  const [format, setFormat] = useState<OutputFormat>('json')
  const [backendUrl, setBackendUrl] = useState('http://127.0.0.1:8000')
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [result, setResult] = useState<ExtractOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedXPath, setSelectedXPath] = useState<string | null>(null)

  // 템플릿 state
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>('json')
  const [importError, setImportError] = useState<string | null>(null)

  // ============================================================
  // 초기화: chrome.storage에서 설정 불러오기 (마이그레이션 포함)
  // ============================================================

  useEffect(() => {
    chrome.storage.local.get(['defaultFormat', 'backendUrl', 'allRules', 'rules', 'objectRules', 'arrayRules', 'templates']).then((data) => {
      if (data.defaultFormat) setFormat(data.defaultFormat as OutputFormat)
      if (data.backendUrl) setBackendUrl(data.backendUrl as string)

      if (data.allRules) {
        setAllRules(data.allRules as RuleEntry[])
      } else {
        // 기존 데이터 마이그레이션 (최초 1회)
        const migrated: RuleEntry[] = [
          ...(data.rules ?? []).map((r: ExtractRule) => ({ kind: 'field' as const, data: r })),
          ...(data.objectRules ?? []).map((r: ObjectRule) => ({ kind: 'object' as const, data: r })),
          ...(data.arrayRules ?? []).map((r: ArrayRule) => ({ kind: 'array' as const, data: r })),
        ]
        setAllRules(migrated)
      }

      setTemplates((data.templates as Template[]) ?? [])
    })
  }, [])

  // ============================================================
  // Content Script → Popup 메시지 수신 (XPATH_SELECTED)
  // ============================================================

  useEffect(() => {
    const listener = (message: { type: string; payload?: { xpath?: string } }) => {
      if (message.type === 'XPATH_SELECTED' && message.payload?.xpath) {
        setSelectedXPath(message.payload.xpath)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // ============================================================
  // 통합 규칙 관리 핸들러
  // ============================================================

  const saveAllRules = useCallback((next: RuleEntry[]) => {
    setAllRules(next)
    chrome.storage.local.set({ allRules: next })
  }, [])

  const handleAdd = (entry: RuleEntry) => {
    saveAllRules([...allRules, entry])
    setActiveForm(null)
  }

  const handleUpdate = (entry: RuleEntry) => {
    saveAllRules(allRules.map((r) => r.data.id === entry.data.id ? entry : r))
    setEditingEntry(null)
  }

  const handleDelete = (id: string) => {
    saveAllRules(allRules.filter((r) => r.data.id !== id))
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const next = [...allRules]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    saveAllRules(next)
  }

  // ============================================================
  // 선택 모드
  // ============================================================

  const toggleSelectMode = async () => {
    if (isSelectMode) {
      await chrome.runtime.sendMessage({ type: 'SELECT_MODE_OFF' })
      setIsSelectMode(false)
    } else {
      await chrome.runtime.sendMessage({ type: 'SELECT_MODE_ON' })
      setIsSelectMode(true)
      window.close() // Popup 닫고 선택 모드 활성화
    }
  }

  // ============================================================
  // 추출 실행
  // ============================================================

  const handleExtract = async () => {
    if (allRules.length === 0) {
      setError('추출 규칙이 없습니다. 규칙을 먼저 추가해주세요.')
      return
    }

    setIsExtracting(true)
    setError(null)
    setResult(null)

    try {
      const fields  = allRules.filter((r) => r.kind === 'field').map((r) => r.data as ExtractRule)
      const objects = allRules.filter((r) => r.kind === 'object').map((r) => r.data as ObjectRule)
      const arrays  = allRules.filter((r) => r.kind === 'array').map((r) => r.data as ArrayRule)

      const config: ExtractConfig = {
        rules: fields,
        objectRules: objects.length > 0 ? objects : undefined,
        arrayRules:  arrays.length  > 0 ? arrays  : undefined,
        format,
        backendUrl,
      }

      const response = await chrome.runtime.sendMessage({
        type: 'EXTRACT_DATA',
        payload: { config },
      }) as MessageResponse<ExtractOutput>

      if (!response.success || !response.data) {
        throw new Error(response.error ?? '추출에 실패했습니다.')
      }

      setResult(response.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsExtracting(false)
    }
  }

  // ============================================================
  // 다운로드
  // ============================================================

  const handleDownload = async () => {
    if (!result) return

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_RESULT',
        payload: { output: result },
      }) as MessageResponse

      if (!response.success) {
        throw new Error(response.error ?? '다운로드에 실패했습니다.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // ============================================================
  // Backend POST
  // ============================================================

  const handleSendToBackend = async () => {
    if (!result) return

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_TO_BACKEND',
        payload: { backendUrl, output: result },
      }) as MessageResponse

      if (!response.success) {
        throw new Error(response.error ?? 'Backend 전송에 실패했습니다.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // ============================================================
  // 설정 저장
  // ============================================================

  const handleSaveSettings = () => {
    chrome.storage.local.set({ defaultFormat: format, backendUrl })
  }

  // ============================================================
  // 템플릿 핸들러
  // ============================================================

  const handleSaveTemplate = () => {
    if (!templateName.trim() || allRules.length === 0) return
    const newTemplate: Template = {
      id: crypto.randomUUID(),
      name: templateName.trim(),
      description: templateDesc.trim() || undefined,
      category: templateCategory,
      rules: allRules,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const next = [...templates, newTemplate]
    setTemplates(next)
    chrome.storage.local.set({ templates: next })
    setTemplateName('')
    setTemplateDesc('')
  }

  const handleLoadTemplate = (template: Template) => {
    const existingIds = new Set(allRules.map(r => r.data.id))
    const newRules = template.rules.filter(r => !existingIds.has(r.data.id))
    saveAllRules([...allRules, ...newRules])
    setActiveTab('rules')
  }

  const handleDeleteTemplate = (id: string) => {
    const next = templates.filter(t => t.id !== id)
    setTemplates(next)
    chrome.storage.local.set({ templates: next })
  }

  const handleExportTemplate = (template: Template) => {
    const json = JSON.stringify(template, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const safeName = template.name.replace(/[^a-zA-Z0-9가-힣_-]/g, '-')
    chrome.downloads.download({ url, filename: `jce-template-${safeName}.json` })
  }

  const handleImportTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const items: Template[] = Array.isArray(raw) ? raw : [raw]
        const withNewId = items.map(t => ({
          ...t,
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        }))
        const next = [...templates, ...withNewId]
        setTemplates(next)
        chrome.storage.local.set({ templates: next })
      } catch {
        setImportError('JSON 파싱 실패. 올바른 템플릿 파일인지 확인해주세요.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ============================================================
  // 결과 미리보기 — 전체 JSON
  // ============================================================

  const resultPreview = useMemo(() => {
    if (!result) return null
    const combined: Record<string, unknown> = { ...result.singleResults }
    for (const [k, v] of Object.entries(result.objectResults)) combined[k] = v
    for (const [k, v] of Object.entries(result.arrayResults)) combined[k] = v
    return Object.keys(combined).length === 0
      ? '(추출 결과 없음)'
      : JSON.stringify(combined, null, 2)
  }, [result])

  // ============================================================
  // 렌더
  // ============================================================

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        <span className="app-header__title">JCE Web Downloader</span>
        <span className="app-header__status">v0.1.0</span>
      </header>

      {/* 탭 */}
      <nav className="tabs">
        <button
          className={`tab-button ${activeTab === 'rules' ? 'tab-button--active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          추출 규칙 {allRules.length > 0 && `(${allRules.length})`}
        </button>
        <button
          className={`tab-button ${activeTab === 'settings' ? 'tab-button--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          설정
        </button>
        <button
          className={`tab-button ${activeTab === 'templates' ? 'tab-button--active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          템플릿{templates.length > 0 && <span className="tab-count">{templates.length}</span>}
        </button>
      </nav>

      {/* 탭 콘텐츠 */}
      <main className="tab-content">

        {/* ---- 추출 규칙 탭 ---- */}
        {activeTab === 'rules' && (
          <>
            {/* 요소 선택 */}
            <div className="section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="section__title">요소 선택</span>
                {isSelectMode && (
                  <span className="select-mode-badge">
                    <span className="select-mode-badge__dot" />
                    선택 모드 활성
                  </span>
                )}
              </div>
              <button
                className={`btn ${isSelectMode ? 'btn--danger' : 'btn--ghost'} btn--full`}
                onClick={toggleSelectMode}
              >
                {isSelectMode ? '선택 모드 종료' : '페이지에서 요소 선택'}
              </button>
              {selectedXPath && (
                <div>
                  <div className="form-hint" style={{ marginBottom: 4 }}>선택된 XPath:</div>
                  <div className="xpath-display">{selectedXPath}</div>
                  <button
                    className="btn btn--primary btn--full"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      setActiveForm('field')
                      setEditingEntry(null)
                    }}
                  >
                    이 XPath로 규칙 추가
                  </button>
                </div>
              )}
            </div>

            <div className="divider" />

            {/* 규칙 추가 섹션 */}
            <div className="section">
              <span className="section__title">규칙 추가</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => { setActiveForm('field'); setEditingEntry(null) }}
                >
                  + 추출 규칙
                </button>
                <button
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => { setActiveForm('object'); setEditingEntry(null) }}
                >
                  + 객체 규칙
                </button>
                <button
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => { setActiveForm('array'); setEditingEntry(null) }}
                >
                  + 배열 규칙
                </button>
              </div>

              {/* 추가 폼 영역 (activeForm 기준) */}
              {activeForm && !editingEntry && (
                <div style={{ padding: 10, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6 }}>
                  {activeForm === 'field' && (
                    <RuleForm
                      initialRule={selectedXPath ? {
                        id: generateId(),
                        name: '',
                        xpath: selectedXPath,
                        attr: 'innerText',
                      } : undefined}
                      onSave={(r) => {
                        handleAdd({ kind: 'field', data: r })
                        setSelectedXPath(null)
                      }}
                      onCancel={() => setActiveForm(null)}
                    />
                  )}
                  {activeForm === 'object' && (
                    <ObjectRuleForm
                      onSave={(r) => handleAdd({ kind: 'object', data: r })}
                      onCancel={() => setActiveForm(null)}
                    />
                  )}
                  {activeForm === 'array' && (
                    <ArrayRuleForm
                      onSave={(r) => handleAdd({ kind: 'array', data: r })}
                      onCancel={() => setActiveForm(null)}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="divider" />

            {/* 통합 규칙 목록 */}
            <div className="section">
              <span className="section__title">
                규칙 목록 {allRules.length > 0 && `(${allRules.length})`}
              </span>

              {allRules.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                  규칙이 없습니다. 위에서 추가하세요.
                </p>
              ) : (
                <div className="rule-list">
                  {allRules.map((entry, index) => (
                    <div key={entry.data.id} style={{ marginBottom: 4 }}>
                      {editingEntry?.data.id === entry.data.id ? (
                        <div style={{ padding: 10, background: '#fefce8', border: '1px solid #fde047', borderRadius: 6 }}>
                          {entry.kind === 'field' && (
                            <RuleForm
                              initialRule={entry.data as ExtractRule}
                              onSave={(r) => handleUpdate({ kind: 'field', data: r })}
                              onCancel={() => setEditingEntry(null)}
                            />
                          )}
                          {entry.kind === 'object' && (
                            <ObjectRuleForm
                              initialRule={entry.data as ObjectRule}
                              onSave={(r) => handleUpdate({ kind: 'object', data: r })}
                              onCancel={() => setEditingEntry(null)}
                            />
                          )}
                          {entry.kind === 'array' && (
                            <ArrayRuleForm
                              initialRule={entry.data as ArrayRule}
                              onSave={(r) => handleUpdate({ kind: 'array', data: r })}
                              onCancel={() => setEditingEntry(null)}
                            />
                          )}
                        </div>
                      ) : (
                        <RuleListItem
                          entry={entry}
                          index={index}
                          total={allRules.length}
                          onMove={handleMove}
                          onEdit={() => { setEditingEntry(entry); setActiveForm(null) }}
                          onDelete={() => handleDelete(entry.data.id)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 오류 표시 */}
            {error && (
              <div className="alert alert--error">{error}</div>
            )}

            {/* 결과 표시 */}
            {result && (
              <div className="result-area">
                <div className="result-toolbar">
                  <span className="result-label">추출 결과</span>
                  <span className="form-hint">{result.url?.slice(0, 30)}...</span>
                </div>
                <div className="result-output">
                  {resultPreview}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn--primary" onClick={handleDownload} style={{ flex: 1 }}>
                    파일 다운로드
                  </button>
                  {backendUrl && (
                    <button className="btn btn--ghost" onClick={handleSendToBackend} style={{ flex: 1 }}>
                      Backend 전송
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- 설정 탭 ---- */}
        {activeTab === 'settings' && (
          <>
            <div className="section">
              <span className="section__title">출력 설정</span>
              <div className="form-group">
                <label className="form-label">기본 출력 포맷</label>
                <select
                  className="form-select"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as OutputFormat)}
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divider" />

            <div className="section">
              <span className="section__title">Backend API</span>
              <div className="form-group">
                <label className="form-label">API URL</label>
                <input
                  className="form-input"
                  type="url"
                  placeholder="http://127.0.0.1:8000"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                />
                <span className="form-hint">
                  "Backend 전송" 기능 사용 시 이 URL로 POST 요청이 전송됩니다.
                </span>
              </div>
            </div>

            <div className="divider" />

            <div className="section">
              <span className="section__title">데이터 관리</span>
              <button
                className="btn btn--danger"
                onClick={() => {
                  if (confirm('모든 규칙을 삭제하시겠습니까?')) {
                    saveAllRules([])
                  }
                }}
              >
                규칙 전체 삭제
              </button>
            </div>

            <button
              className="btn btn--primary btn--full btn--lg"
              onClick={handleSaveSettings}
            >
              설정 저장
            </button>
          </>
        )}

        {/* ---- 템플릿 탭 ---- */}
        {activeTab === 'templates' && (
          <>
            {/* 현재 규칙 저장 */}
            <section className="section">
              <h3 className="section-title">현재 규칙 저장</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="form-input"
                  placeholder="템플릿 이름 *"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                />
                <input
                  className="form-input"
                  placeholder="설명 (선택)"
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                />
                <select
                  className="form-select"
                  value={templateCategory}
                  onChange={e => setTemplateCategory(e.target.value as TemplateCategory)}
                >
                  <option value="json">JSON 추출</option>
                  <option value="markdown">Markdown 추출 (예정)</option>
                  <option value="download">파일 다운로드 (예정)</option>
                </select>
                <button
                  className="btn btn--primary"
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim() || allRules.length === 0}
                >
                  저장
                </button>
                {allRules.length === 0 && (
                  <p className="form-hint">규칙 탭에서 먼저 규칙을 추가하세요.</p>
                )}
              </div>
            </section>

            {/* 저장된 템플릿 목록 */}
            <section className="section">
              <h3 className="section-title">저장된 템플릿 ({templates.length})</h3>
              {templates.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                  저장된 템플릿이 없습니다.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {templates.map(t => (
                    <div key={t.id} className="template-item">
                      <div className="template-item-header">
                        <span className={`template-category-badge template-category-badge--${t.category}`}>
                          {t.category === 'json' ? 'JSON' : t.category === 'markdown' ? 'MD' : 'DL'}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </span>
                      </div>
                      {t.description && (
                        <p className="form-hint" style={{ margin: 0 }}>{t.description}</p>
                      )}
                      <div className="template-item-meta">
                        규칙 {t.rules.length}개 · {t.createdAt.slice(0, 10)}
                      </div>
                      <div className="template-item-actions">
                        <button className="btn btn--primary" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => handleLoadTemplate(t)}>
                          불러오기
                        </button>
                        <button className="btn btn--ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => handleExportTemplate(t)}>
                          내보내기
                        </button>
                        <button className="btn btn--danger" style={{ fontSize: 11, padding: '3px 8px' }}
                          onClick={() => handleDeleteTemplate(t.id)}>
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* JSON 가져오기 */}
            <section className="section">
              <h3 className="section-title">JSON 가져오기</h3>
              <input
                type="file"
                accept=".json"
                id="template-import-input"
                style={{ display: 'none' }}
                onChange={handleImportTemplate}
              />
              <button
                className="btn btn--ghost"
                style={{ width: '100%' }}
                onClick={() => document.getElementById('template-import-input')?.click()}
              >
                파일 선택 (.json)
              </button>
              {importError && (
                <div className="alert alert--error" style={{ marginTop: 6 }}>{importError}</div>
              )}
            </section>
          </>
        )}
      </main>

      {/* 푸터 액션 */}
      {activeTab === 'rules' && (
        <footer className="footer-actions">
          <button
            className="btn btn--primary btn--full btn--lg"
            onClick={handleExtract}
            disabled={isExtracting || allRules.length === 0}
          >
            {isExtracting ? '추출 중...' : '추출 실행'}
          </button>
        </footer>
      )}
    </div>
  )
}
