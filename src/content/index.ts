/**
 * Content Script
 *
 * 역할:
 * - 대상 웹 페이지에 주입되어 실행됩니다.
 * - Background로부터 메시지를 수신하여 XPath 추출 및 요소 highlight를 수행합니다.
 * - 요소 클릭 시 XPath를 자동 생성하여 Background/Popup으로 전달합니다.
 *
 * 주의:
 * - eval 사용 금지
 * - chrome.storage에 직접 접근 가능
 * - DOM 조작은 이 레이어에서만 수행
 */

import type {
  Message,
  ExtractDataMessage,
  HighlightElementMessage,
  MessageResponse,
  ExtractOutput,
  ExtractionResult,
  ArrayExtractionResult,
} from '../types'
import {
  extractByRules,
  extractObjectByRule,
  extractArrayByRule,
  getCurrentUrl,
} from '../utils/extractor'
import { generateXPath, generateCSSSelector, getElementFromEvent } from '../utils/xpath'

// ============================================================
// 중복 주입 방지 guard
// ============================================================

declare global {
  interface Window { __jceLoaded?: boolean }
}

if (window.__jceLoaded) {
  // 이미 로드된 경우 실행 중단
  throw new Error('[content] 이미 로드됨 — 중복 주입 방지')
}
window.__jceLoaded = true

// ============================================================
// 상태
// ============================================================

let isSelectModeActive = false
let highlightedElement: Element | null = null

/** Hover highlight 용 overlay 스타일 */
const HOVER_STYLE = '2px solid #3b82f6'
const SELECTED_STYLE = '2px solid #ef4444'

// ============================================================
// 메시지 리스너 (Background → Content)
// ============================================================

chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('[content] 메시지 수신:', message.type)

    switch (message.type) {
      case 'PING':
        sendResponse({ success: true })
        return false

      case 'EXTRACT_DATA':
        handleExtractData(message, sendResponse)
        return true // 비동기 응답

      case 'HIGHLIGHT_ELEMENT':
        handleHighlightElement(message, sendResponse)
        return false

      case 'CLEAR_HIGHLIGHT':
        clearHighlight()
        sendResponse({ success: true })
        return false

      case 'SELECT_MODE_ON':
        activateSelectMode()
        sendResponse({ success: true })
        return false

      case 'SELECT_MODE_OFF':
        deactivateSelectMode()
        sendResponse({ success: true })
        return false

      default:
        return false
    }
  }
)

// ============================================================
// 핸들러
// ============================================================

/**
 * EXTRACT_DATA: 추출 규칙에 따라 페이지에서 데이터를 추출합니다.
 */
async function handleExtractData(
  message: ExtractDataMessage,
  sendResponse: (response: MessageResponse<ExtractOutput>) => void
): Promise<void> {
  try {
    const { config } = message.payload
    const { rules, objectRules, arrayRules, format } = config

    // 단일 규칙 추출
    const singleResults: ExtractionResult = extractByRules(rules)

    // Object 모드 추출
    const objectResults: Record<string, ExtractionResult> = {}
    if (objectRules) {
      for (const objectRule of objectRules) {
        objectResults[objectRule.name] = extractObjectByRule(objectRule)
      }
    }

    // Array 모드 추출
    const arrayResults: Record<string, ArrayExtractionResult> = {}
    if (arrayRules) {
      for (const arrayRule of arrayRules) {
        arrayResults[arrayRule.name] = extractArrayByRule(arrayRule)
      }
    }

    const output: ExtractOutput = {
      singleResults,
      objectResults,
      arrayResults,
      format,
      url: getCurrentUrl(),
      timestamp: new Date().toISOString(),
    }

    sendResponse({ success: true, data: output })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[content] EXTRACT_DATA 오류:', error)
    sendResponse({ success: false, error })
  }
}

/**
 * HIGHLIGHT_ELEMENT: XPath로 요소를 찾아 시각적으로 강조합니다.
 */
function handleHighlightElement(
  message: HighlightElementMessage,
  sendResponse: (response: MessageResponse) => void
): void {
  try {
    clearHighlight()

    const { xpath } = message.payload
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    )
    const node = result.singleNodeValue as HTMLElement | null

    if (!node) {
      sendResponse({ success: false, error: '요소를 찾을 수 없습니다.' })
      return
    }

    applyHighlight(node, SELECTED_STYLE)
    highlightedElement = node
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })

    sendResponse({ success: true })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    sendResponse({ success: false, error })
  }
}

// ============================================================
// 선택 모드 (요소 클릭 → XPath 생성)
// ============================================================

function activateSelectMode(): void {
  if (isSelectModeActive) return
  isSelectModeActive = true

  document.addEventListener('mouseover', onMouseOver, true)
  document.addEventListener('mouseout', onMouseOut, true)
  document.addEventListener('click', onElementClick, true)
  document.addEventListener('contextmenu', onContextMenu, true)

  // 선택 모드 활성화 시 커서 변경
  document.body.style.cursor = 'crosshair'

  console.log('[content] 선택 모드 활성화')
}

function deactivateSelectMode(): void {
  if (!isSelectModeActive) return
  isSelectModeActive = false

  document.removeEventListener('mouseover', onMouseOver, true)
  document.removeEventListener('mouseout', onMouseOut, true)
  document.removeEventListener('click', onElementClick, true)
  document.removeEventListener('contextmenu', onContextMenu, true)

  document.body.style.cursor = ''
  clearHighlight()
  closeContextMenu()

  console.log('[content] 선택 모드 비활성화')
}

function onMouseOver(event: MouseEvent): void {
  const element = getElementFromEvent(event)
  if (!element) return

  // 이미 SELECTED 상태인 요소는 hover 대상으로 바꾸지 않음
  if (element === highlightedElement) return

  // 이전 hover 강조 제거 (HOVER_STYLE인 경우에만)
  if (
    highlightedElement &&
    (highlightedElement as HTMLElement).style.outline === HOVER_STYLE
  ) {
    clearHighlight()
  }

  applyHighlight(element as HTMLElement, HOVER_STYLE)
  highlightedElement = element
}

function onMouseOut(event: MouseEvent): void {
  if (!highlightedElement) return

  // SELECTED_STYLE 요소는 mouseout으로 절대 clear하지 않음
  if ((highlightedElement as HTMLElement).style.outline === SELECTED_STYLE) return

  // relatedTarget이 현재 highlightedElement 내부의 자식 요소이면 clear하지 않음
  const relatedTarget = event.relatedTarget as Node | null
  if (relatedTarget && highlightedElement.contains(relatedTarget)) return

  clearHighlight()
}

function onElementClick(event: MouseEvent): void {
  // 커스텀 컨텍스트 메뉴 내부 클릭이면 무시 (메뉴 아이템 이벤트가 도달할 수 있도록)
  const menu = document.getElementById(CONTEXT_MENU_ID)
  if (menu && menu.contains(event.target as Node)) return

  event.preventDefault()
  event.stopPropagation()

  // 열려있는 커스텀 컨텍스트 메뉴가 있으면 먼저 닫기
  closeContextMenu()

  const element = getElementFromEvent(event)
  if (!element) return

  const xpath = generateXPath(element)
  const elementText = (element as HTMLElement).innerText?.slice(0, 100) ?? ''

  // 선택된 요소 강조 (클릭 후 선택 모드 유지)
  clearHighlight()
  applyHighlight(element as HTMLElement, SELECTED_STYLE)
  highlightedElement = element

  // 클립보드에 XPath 복사
  copyToClipboard(xpath).then(success => {
    if (success) {
      showToast(`XPath 복사됨: ${xpath.slice(0, 50)}`)
    }
  })

  // Popup(Background)으로 선택된 XPath 전달
  chrome.runtime.sendMessage({
    type: 'XPATH_SELECTED',
    payload: { xpath, elementText },
  })

  console.log('[content] XPath 선택됨:', xpath)
}

// ============================================================
// 커스텀 컨텍스트 메뉴
// ============================================================

const CONTEXT_MENU_ID = '__jce-context-menu__'

function onContextMenu(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  // 우클릭한 실제 요소를 직접 사용 (highlightedElement 상태에 의존하지 않음)
  const targetElement = getElementFromEvent(event)
  if (!targetElement) return

  // 우클릭한 요소를 hover 상태로 업데이트
  if (highlightedElement && (highlightedElement as HTMLElement).style.outline === HOVER_STYLE) {
    clearHighlight()
  }
  applyHighlight(targetElement as HTMLElement, HOVER_STYLE)
  highlightedElement = targetElement

  // 기존 메뉴가 열려있으면 먼저 닫기
  closeContextMenu()

  const menu = document.createElement('div')
  menu.id = CONTEXT_MENU_ID
  Object.assign(menu.style, {
    position: 'fixed',
    top: `${event.clientY}px`,
    left: `${event.clientX}px`,
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: '2147483647',
    minWidth: '180px',
    padding: '4px 0',
    fontFamily: '-apple-system, sans-serif',
    fontSize: '13px',
  })

  // 메뉴 항목 정의
  const menuItems: Array<{ label: string; action: () => Promise<void> | void } | 'separator'> = [
    {
      label: 'XPath 복사',
      action: async () => {
        const xpath = generateXPath(targetElement)
        const success = await copyToClipboard(xpath)
        if (success) showToast(`XPath 복사됨: ${xpath.slice(0, 50)}`)
      },
    },
    {
      label: 'CSS Selector 복사',
      action: async () => {
        const selector = generateCSSSelector(targetElement)
        const success = await copyToClipboard(selector)
        if (success) showToast(`CSS Selector 복사됨: ${selector.slice(0, 50)}`)
      },
    },
    {
      label: 'outerHTML 복사',
      action: async () => {
        const html = targetElement.outerHTML
        const success = await copyToClipboard(html)
        if (success) showToast('outerHTML 복사됨')
      },
    },
    {
      label: 'innerText 복사',
      action: async () => {
        const text = (targetElement as HTMLElement).innerText ?? ''
        const success = await copyToClipboard(text)
        if (success) showToast('innerText 복사됨')
      },
    },
    'separator',
    {
      label: '선택 모드 종료',
      action: () => {
        deactivateSelectMode()
        chrome.runtime.sendMessage({ type: 'SELECT_MODE_OFF' })
      },
    },
  ]

  for (const item of menuItems) {
    if (item === 'separator') {
      const hr = document.createElement('hr')
      Object.assign(hr.style, {
        margin: '4px 0',
        border: 'none',
        borderTop: '1px solid #e2e8f0',
      })
      menu.appendChild(hr)
      continue
    }

    const menuItem = document.createElement('div')
    menuItem.className = 'jce-menu-item'
    menuItem.textContent = item.label
    Object.assign(menuItem.style, {
      padding: '8px 14px',
      cursor: 'pointer',
      color: '#1e293b',
      userSelect: 'none',
    })

    menuItem.addEventListener('mouseenter', () => {
      menuItem.style.background = '#f1f5f9'
    })
    menuItem.addEventListener('mouseleave', () => {
      menuItem.style.background = ''
    })
    menuItem.addEventListener('click', async (e) => {
      e.stopPropagation()
      closeContextMenu()
      await item.action()
    })

    menu.appendChild(menuItem)
  }

  document.body.appendChild(menu)

  // 뷰포트 밖으로 메뉴가 나가면 flip
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (rect.right > vw) {
      menu.style.left = `${event.clientX - rect.width}px`
    }
    if (rect.bottom > vh) {
      menu.style.top = `${event.clientY - rect.height}px`
    }
  })

  // 외부 클릭 시 메뉴 닫기 (bubble phase에서 등록하여 메뉴 아이템 클릭과 충돌 방지)
  setTimeout(() => {
    const outsideClickHandler = (e: MouseEvent) => {
      const m = document.getElementById(CONTEXT_MENU_ID)
      if (!m || !m.contains(e.target as Node)) {
        closeContextMenu()
        document.removeEventListener('click', outsideClickHandler)
      }
    }
    document.addEventListener('click', outsideClickHandler)
  }, 0)
}

function closeContextMenu(): void {
  const existing = document.getElementById(CONTEXT_MENU_ID)
  if (existing) {
    existing.remove()
  }
}

// ============================================================
// 하이라이트 유틸리티
// ============================================================

function applyHighlight(element: HTMLElement, style: string): void {
  element.style.outline = style
  element.style.outlineOffset = '1px'
}

function clearHighlight(): void {
  if (highlightedElement) {
    const el = highlightedElement as HTMLElement
    el.style.outline = ''
    el.style.outlineOffset = ''
    highlightedElement = null
  }
}

// ============================================================
// 클립보드 복사 유틸리티
// ============================================================

/**
 * 텍스트를 클립보드에 복사합니다.
 * navigator.clipboard.writeText 실패 시 document.execCommand('copy') fallback을 사용합니다.
 *
 * @param text - 복사할 텍스트
 * @returns 성공 여부
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // 1차 시도: Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Clipboard API 실패 시 fallback으로 진행
    }
  }

  // 2차 시도: execCommand('copy') fallback
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    Object.assign(textarea.style, {
      position: 'fixed',
      top: '-9999px',
      left: '-9999px',
      opacity: '0',
    })
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}

// ============================================================
// 토스트 알림 유틸리티
// ============================================================

const TOAST_ID = '__jce-toast__'

/**
 * 화면 우측 하단에 토스트 알림을 1.5초간 표시합니다.
 * 기존 토스트가 있으면 제거 후 새로 생성합니다.
 *
 * @param message - 표시할 메시지
 */
function showToast(message: string): void {
  // 기존 토스트 제거
  const existing = document.getElementById(TOAST_ID)
  if (existing) {
    existing.remove()
  }

  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.textContent = message
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: '#1e40af',
    color: 'white',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    zIndex: '2147483647',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    fontFamily: '-apple-system, sans-serif',
    pointerEvents: 'none',
  })

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 1500)
}

// ============================================================
// 초기화
// ============================================================

console.log('[content] JCE Web Downloader Content Script 로드됨:', getCurrentUrl())
