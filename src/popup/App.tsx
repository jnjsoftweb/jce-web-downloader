/**
 * Popup UI — App 컴포넌트
 *
 * 탭 구조:
 * - "추출 규칙" 탭: ExtractRule 목록 편집, 선택 모드, 추출 실행, 결과 표시
 * - "설정" 탭: Backend URL, 출력 포맷
 *
 * 통신 흐름:
 * Popup → chrome.runtime.sendMessage → Background → chrome.tabs.sendMessage → Content
 */

import { useState, useEffect, useCallback } from 'react'
import type {
  ExtractRule,
  ExtractConfig,
  OutputFormat,
  ExtractOutput,
  MessageResponse,
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
// 서브 컴포넌트
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
// 메인 App
// ============================================================

type TabKey = 'rules' | 'settings'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('rules')
  const [rules, setRules] = useState<ExtractRule[]>([])
  const [format, setFormat] = useState<OutputFormat>('json')
  const [backendUrl, setBackendUrl] = useState('http://127.0.0.1:8000')
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [result, setResult] = useState<ExtractOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editingRule, setEditingRule] = useState<ExtractRule | null>(null)
  const [selectedXPath, setSelectedXPath] = useState<string | null>(null)

  // ============================================================
  // 초기화: chrome.storage에서 설정 불러오기
  // ============================================================

  useEffect(() => {
    chrome.storage.local.get(['defaultFormat', 'backendUrl', 'rules']).then((data) => {
      if (data.defaultFormat) setFormat(data.defaultFormat as OutputFormat)
      if (data.backendUrl) setBackendUrl(data.backendUrl as string)
      if (data.rules) setRules(data.rules as ExtractRule[])
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
  // 규칙 관리
  // ============================================================

  const saveRules = useCallback((newRules: ExtractRule[]) => {
    setRules(newRules)
    chrome.storage.local.set({ rules: newRules })
  }, [])

  const handleAddRule = (rule: ExtractRule) => {
    const newRules = [...rules, rule]
    saveRules(newRules)
    setShowRuleForm(false)
    setSelectedXPath(null)
  }

  const handleUpdateRule = (rule: ExtractRule) => {
    const newRules = rules.map((r) => (r.id === rule.id ? rule : r))
    saveRules(newRules)
    setEditingRule(null)
  }

  const handleDeleteRule = (id: string) => {
    const newRules = rules.filter((r) => r.id !== id)
    saveRules(newRules)
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
    if (rules.length === 0) {
      setError('추출 규칙이 없습니다. 규칙을 먼저 추가해주세요.')
      return
    }

    setIsExtracting(true)
    setError(null)
    setResult(null)

    try {
      const config: ExtractConfig = { rules, format, backendUrl }

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
  // 결과 텍스트 미리보기 (200자 제한)
  // ============================================================

  const resultPreview = result
    ? JSON.stringify(result, null, 2).slice(0, 500)
    : null

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
          추출 규칙 {rules.length > 0 && `(${rules.length})`}
        </button>
        <button
          className={`tab-button ${activeTab === 'settings' ? 'tab-button--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          설정
        </button>
      </nav>

      {/* 탭 콘텐츠 */}
      <main className="tab-content">

        {/* ---- 추출 규칙 탭 ---- */}
        {activeTab === 'rules' && (
          <>
            {/* 선택 모드 */}
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
                      setShowRuleForm(true)
                      setSelectedXPath(null)
                    }}
                  >
                    이 XPath로 규칙 추가
                  </button>
                </div>
              )}
            </div>

            <div className="divider" />

            {/* 규칙 목록 */}
            <div className="section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="section__title">추출 규칙</span>
                <button
                  className="btn btn--ghost"
                  onClick={() => { setShowRuleForm(true); setEditingRule(null) }}
                >
                  + 규칙 추가
                </button>
              </div>

              {/* 규칙 추가 폼 */}
              {showRuleForm && !editingRule && (
                <div style={{
                  padding: 10,
                  background: '#eff6ff',
                  border: '1px solid #93c5fd',
                  borderRadius: 6,
                }}>
                  <RuleForm
                    initialRule={selectedXPath ? {
                      id: generateId(),
                      name: '',
                      xpath: selectedXPath,
                      attr: 'innerText',
                    } : undefined}
                    onSave={handleAddRule}
                    onCancel={() => setShowRuleForm(false)}
                  />
                </div>
              )}

              {/* 규칙 목록 */}
              {rules.length === 0 && !showRuleForm ? (
                <div className="empty-state">
                  규칙이 없습니다.<br />
                  "페이지에서 요소 선택" 또는 "+ 규칙 추가"로 시작하세요.
                </div>
              ) : (
                <div className="rule-list">
                  {rules.map((rule) => (
                    <div key={rule.id}>
                      {editingRule?.id === rule.id ? (
                        <div style={{
                          padding: 10,
                          background: '#fefce8',
                          border: '1px solid #fde047',
                          borderRadius: 6,
                        }}>
                          <RuleForm
                            initialRule={rule}
                            onSave={handleUpdateRule}
                            onCancel={() => setEditingRule(null)}
                          />
                        </div>
                      ) : (
                        <div className="rule-item">
                          <div className="rule-item__info">
                            <div className="rule-item__name">{rule.name}</div>
                            <div className="rule-item__xpath">{rule.xpath}</div>
                          </div>
                          <div className="rule-item__actions">
                            <button
                              className="btn btn--ghost btn--icon"
                              onClick={() => setEditingRule(rule)}
                              title="수정"
                            >
                              ✏
                            </button>
                            <button
                              className="btn btn--ghost btn--icon"
                              onClick={() => handleDeleteRule(rule.id)}
                              title="삭제"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
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
                  {resultPreview}{result && JSON.stringify(result).length > 500 ? '\n...(일부 생략)' : ''}
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
                    saveRules([])
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
      </main>

      {/* 푸터 액션 */}
      {activeTab === 'rules' && (
        <footer className="footer-actions">
          <button
            className="btn btn--primary btn--full btn--lg"
            onClick={handleExtract}
            disabled={isExtracting || rules.length === 0}
          >
            {isExtracting ? '추출 중...' : '추출 실행'}
          </button>
        </footer>
      )}
    </div>
  )
}
