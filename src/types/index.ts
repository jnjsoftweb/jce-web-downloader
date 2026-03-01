// ============================================================
// 추출 규칙 타입
// ============================================================

/**
 * 단일 요소 추출 규칙
 * attr: 'innerText' | 'innerHTML' | HTML attribute name (예: 'href', 'src')
 * callback: eval 금지 — sandboxed iframe을 통해 처리하는 함수 문자열
 */
export interface ExtractRule {
  id: string
  name: string
  xpath: string
  attr?: string
  callback?: string
}

/**
 * 반복 컨테이너에서 자식 규칙을 반복 추출하는 Array 모드 규칙
 */
export interface ArrayRule {
  id: string
  name: string
  containerXPath: string
  children: ExtractRule[]
}

// ============================================================
// 출력 포맷
// ============================================================

export type OutputFormat = 'json' | 'json-array' | 'csv' | 'markdown' | 'raw'

// ============================================================
// 추출 설정
// ============================================================

export interface ExtractConfig {
  rules: ExtractRule[]
  arrayRules?: ArrayRule[]
  format: OutputFormat
  backendUrl?: string
}

// ============================================================
// 추출 결과
// ============================================================

export type ExtractionValue = string | null
export type ExtractionResult = Record<string, ExtractionValue>
export type ArrayExtractionResult = ExtractionResult[]

export interface ExtractOutput {
  singleResults: ExtractionResult
  arrayResults: Record<string, ArrayExtractionResult>
  format: OutputFormat
  url: string
  timestamp: string
}

// ============================================================
// Message Passing 타입 (Content Script <-> Background <-> Popup)
// ============================================================

export type MessageType =
  | 'PING'
  | 'EXTRACT_DATA'
  | 'EXTRACT_RESULT'
  | 'EXTRACT_ERROR'
  | 'HIGHLIGHT_ELEMENT'
  | 'CLEAR_HIGHLIGHT'
  | 'SELECT_MODE_ON'
  | 'SELECT_MODE_OFF'
  | 'XPATH_SELECTED'
  | 'DOWNLOAD_RESULT'
  | 'SEND_TO_BACKEND'

export interface BaseMessage {
  type: MessageType
}

export interface ExtractDataMessage extends BaseMessage {
  type: 'EXTRACT_DATA'
  payload: {
    config: ExtractConfig
  }
}

export interface ExtractResultMessage extends BaseMessage {
  type: 'EXTRACT_RESULT'
  payload: {
    output: ExtractOutput
  }
}

export interface ExtractErrorMessage extends BaseMessage {
  type: 'EXTRACT_ERROR'
  payload: {
    error: string
  }
}

export interface HighlightElementMessage extends BaseMessage {
  type: 'HIGHLIGHT_ELEMENT'
  payload: {
    xpath: string
  }
}

export interface ClearHighlightMessage extends BaseMessage {
  type: 'CLEAR_HIGHLIGHT'
}

export interface SelectModeOnMessage extends BaseMessage {
  type: 'SELECT_MODE_ON'
}

export interface SelectModeOffMessage extends BaseMessage {
  type: 'SELECT_MODE_OFF'
}

export interface XPathSelectedMessage extends BaseMessage {
  type: 'XPATH_SELECTED'
  payload: {
    xpath: string
    elementText: string
  }
}

export interface DownloadResultMessage extends BaseMessage {
  type: 'DOWNLOAD_RESULT'
  payload: {
    output: ExtractOutput
    filename?: string
  }
}

export interface SendToBackendMessage extends BaseMessage {
  type: 'SEND_TO_BACKEND'
  payload: {
    backendUrl: string
    output: ExtractOutput
    pageHtml?: string
  }
}

export interface PingMessage extends BaseMessage {
  type: 'PING'
}

export type Message =
  | PingMessage
  | ExtractDataMessage
  | ExtractResultMessage
  | ExtractErrorMessage
  | HighlightElementMessage
  | ClearHighlightMessage
  | SelectModeOnMessage
  | SelectModeOffMessage
  | XPathSelectedMessage
  | DownloadResultMessage
  | SendToBackendMessage

// ============================================================
// Chrome Storage 스키마
// ============================================================

export interface StorageSchema {
  /** Backend API URL */
  backendUrl?: string
  /** 기본 출력 포맷 */
  defaultFormat?: OutputFormat
  /** 단일 추출 규칙 목록 */
  rules?: ExtractRule[]
  /** 배열 추출 규칙 목록 */
  arrayRules?: ArrayRule[]
  /** hostname 기준으로 저장된 추출 설정 템플릿 */
  [templateKey: `template:${string}`]: unknown
}

// ============================================================
// 유틸리티 타입
// ============================================================

/** 메시지 응답 타입 */
export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
