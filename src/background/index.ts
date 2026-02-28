/**
 * Background Service Worker
 *
 * 역할:
 * - Popup → Background 메시지 수신 후 Content Script로 라우팅
 * - Content Script로부터 추출 결과 수신
 * - chrome.downloads를 통한 로컬 파일 다운로드
 * - fetch를 통한 Backend API POST 전송
 *
 * MV3 주의사항:
 * - Service Worker는 영속적이지 않습니다.
 * - 상태는 chrome.storage에 저장하고, 메모리 상태에 의존하지 마세요.
 */

import type {
  Message,
  ExtractDataMessage,
  DownloadResultMessage,
  SendToBackendMessage,
  MessageResponse,
  ExtractOutput,
} from '../types'
import { formatOutput, buildFilename } from '../utils/formatter'

// ============================================================
// 메시지 리스너 (Popup → Background)
// ============================================================

chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    console.log('[background] 메시지 수신:', message.type)

    switch (message.type) {
      case 'EXTRACT_DATA':
        handleExtractData(message, sendResponse)
        return true // 비동기 응답

      case 'SELECT_MODE_ON':
      case 'SELECT_MODE_OFF':
        handleSelectMode(message, sendResponse)
        return true

      case 'DOWNLOAD_RESULT':
        handleDownloadResult(message, sendResponse)
        return true

      case 'SEND_TO_BACKEND':
        handleSendToBackend(message, sendResponse)
        return true

      default:
        sendResponse({ success: false, error: `알 수 없는 메시지 타입: ${message.type}` })
        return false
    }
  }
)

// ============================================================
// 핸들러
// ============================================================

/**
 * EXTRACT_DATA: 현재 활성 탭의 Content Script로 추출 명령을 전달합니다.
 */
async function handleExtractData(
  message: ExtractDataMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id) {
      sendResponse({ success: false, error: '활성 탭을 찾을 수 없습니다.' })
      return
    }

    // Content Script에 추출 명령 전달 → 응답은 MessageResponse<ExtractOutput>
    const contentResponse = await chrome.tabs.sendMessage(tab.id, message) as MessageResponse<ExtractOutput>

    if (!contentResponse?.success) {
      sendResponse({ success: false, error: contentResponse?.error ?? 'Content Script 응답 없음' })
      return
    }

    // data만 꺼내서 전달 (double-wrapping 방지)
    sendResponse({ success: true, data: contentResponse.data })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[background] EXTRACT_DATA 오류:', error)
    sendResponse({ success: false, error })
  }
}

/**
 * SELECT_MODE_ON/OFF: Content Script에 선택 모드 토글 명령을 전달합니다.
 */
async function handleSelectMode(
  message: Message,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id) {
      sendResponse({ success: false, error: '활성 탭을 찾을 수 없습니다.' })
      return
    }

    await chrome.tabs.sendMessage(tab.id, message)
    sendResponse({ success: true })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[background] SELECT_MODE 오류:', error)
    sendResponse({ success: false, error })
  }
}

/**
 * DOWNLOAD_RESULT: 추출 결과를 로컬 파일로 다운로드합니다.
 * Blob URL → chrome.downloads.download 패턴을 사용합니다.
 */
async function handleDownloadResult(
  message: DownloadResultMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    const { output, filename } = message.payload
    const { format } = output

    // 포맷 변환 (rules는 singleResults의 key 목록으로 임시 생성)
    const rules = Object.keys(output.singleResults).map((name) => ({
      id: name,
      name,
      xpath: '',
    }))
    const content = formatOutput(output, format, rules)

    // Blob → Data URL (Service Worker에서는 URL.createObjectURL 사용 불가)
    // 대신 base64 Data URL을 사용합니다.
    const mimeType = getMimeType(format)
    const base64 = btoa(unescape(encodeURIComponent(content)))
    const dataUrl = `data:${mimeType};base64,${base64}`

    const downloadFilename =
      filename ?? buildFilename(output.url, format)

    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: downloadFilename,
      saveAs: false,
    })

    sendResponse({ success: true, data: { downloadId } })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[background] DOWNLOAD_RESULT 오류:', error)
    sendResponse({ success: false, error })
  }
}

/**
 * SEND_TO_BACKEND: Backend API로 추출 결과를 POST 전송합니다.
 */
async function handleSendToBackend(
  message: SendToBackendMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    const { backendUrl, output, pageHtml } = message.payload

    if (!backendUrl) {
      sendResponse({ success: false, error: 'Backend URL이 설정되지 않았습니다.' })
      return
    }

    const body = JSON.stringify({
      url: output.url,
      timestamp: output.timestamp,
      result: output,
      pageHtml: pageHtml ?? null,
    })

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`Backend 응답 오류: ${response.status} ${response.statusText}`)
    }

    const data: unknown = await response.json()
    sendResponse({ success: true, data })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error('[background] SEND_TO_BACKEND 오류:', error)
    sendResponse({ success: false, error })
  }
}

// ============================================================
// 유틸리티
// ============================================================

function getMimeType(format: string): string {
  switch (format) {
    case 'json':
    case 'json-array':
      return 'application/json'
    case 'csv':
      return 'text/csv'
    case 'markdown':
      return 'text/markdown'
    default:
      return 'text/plain'
  }
}

// ============================================================
// 설치/업데이트 이벤트
// ============================================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[background] JCE Web Downloader 설치 완료')
    // 기본 설정 초기화
    chrome.storage.local.set({
      defaultFormat: 'json',
      backendUrl: 'http://127.0.0.1:8000',
    })
  } else if (details.reason === 'update') {
    console.log('[background] JCE Web Downloader 업데이트:', details.previousVersion)
  }
})

// ExtractOutput 타입이 사용되고 있음을 TypeScript에 알립니다 (lint 경고 방지)
export type { ExtractOutput }
