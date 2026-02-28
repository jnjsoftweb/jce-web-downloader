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
} from '../types'
import {
  extractByRules,
  extractArrayByRule,
  getCurrentUrl,
} from '../utils/extractor'
import { generateXPath, getElementFromEvent } from '../utils/xpath'

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
    const { rules, arrayRules, format } = config

    // 단일 규칙 추출
    const singleResults: ExtractionResult = extractByRules(rules)

    // Array 모드 추출
    const arrayResults: Record<string, ReturnType<typeof extractArrayByRule>> = {}
    if (arrayRules) {
      for (const arrayRule of arrayRules) {
        arrayResults[arrayRule.name] = extractArrayByRule(arrayRule)
      }
    }

    const output: ExtractOutput = {
      singleResults,
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

  document.body.style.cursor = ''
  clearHighlight()

  console.log('[content] 선택 모드 비활성화')
}

function onMouseOver(event: MouseEvent): void {
  const element = getElementFromEvent(event)
  if (!element || element === highlightedElement) return

  // 이전 hover 강조 제거 (selected가 아닌 경우)
  if (
    highlightedElement &&
    (highlightedElement as HTMLElement).style.outline === HOVER_STYLE
  ) {
    clearHighlight()
  }

  applyHighlight(element as HTMLElement, HOVER_STYLE)
  highlightedElement = element
}

function onMouseOut(_event: MouseEvent): void {
  if (
    highlightedElement &&
    (highlightedElement as HTMLElement).style.outline === HOVER_STYLE
  ) {
    clearHighlight()
  }
}

function onElementClick(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()

  const element = getElementFromEvent(event)
  if (!element) return

  const xpath = generateXPath(element)
  const elementText = (element as HTMLElement).innerText?.slice(0, 100) ?? ''

  // 선택된 요소 강조 (클릭 후 선택 모드 유지)
  clearHighlight()
  applyHighlight(element as HTMLElement, SELECTED_STYLE)
  highlightedElement = element

  // Popup(Background)으로 선택된 XPath 전달
  chrome.runtime.sendMessage({
    type: 'XPATH_SELECTED',
    payload: { xpath, elementText },
  })

  console.log('[content] XPath 선택됨:', xpath)
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
// 초기화
// ============================================================

console.log('[content] JCE Web Downloader Content Script 로드됨:', getCurrentUrl())
