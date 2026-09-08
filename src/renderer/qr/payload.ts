export type ContentType = 'text' | 'url' | 'wifi' | 'email' | 'phone' | 'sms' | 'geo' | 'vcard'

export interface ContentFields {
  text: string
  url: string
  ssid: string
  wpass: string
  wenc: 'WPA' | 'WEP' | 'nopass'
  email: string
  subject: string
  body: string
  phone: string
  smsBody: string
  lat: string
  lon: string
  firstName: string
  lastName: string
  org: string
  vphone: string
  vemail: string
}

export const EMPTY_FIELDS: ContentFields = {
  text: '',
  url: 'https://',
  ssid: '',
  wpass: '',
  wenc: 'WPA',
  email: '',
  subject: '',
  body: '',
  phone: '',
  smsBody: '',
  lat: '',
  lon: '',
  firstName: '',
  lastName: '',
  org: '',
  vphone: '',
  vemail: ''
}

const esc = (s: string): string => s.replace(/([\\;,:"])/g, '\\$1')

export function buildPayload(type: ContentType, f: ContentFields): string {
  switch (type) {
    case 'text':
      return f.text
    case 'url':
      return f.url.trim()
    case 'wifi':
      return `WIFI:T:${f.wenc};S:${esc(f.ssid)};${f.wenc === 'nopass' ? '' : `P:${esc(f.wpass)};`};`
    case 'email': {
      const params = [
        f.subject && `subject=${encodeURIComponent(f.subject)}`,
        f.body && `body=${encodeURIComponent(f.body)}`
      ]
        .filter(Boolean)
        .join('&')
      return `mailto:${f.email}${params ? `?${params}` : ''}`
    }
    case 'phone':
      return `tel:${f.phone.replace(/\s/g, '')}`
    case 'sms':
      return `SMSTO:${f.phone.replace(/\s/g, '')}:${f.smsBody}`
    case 'geo':
      return `geo:${f.lat},${f.lon}`
    case 'vcard':
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${f.lastName};${f.firstName}`,
        `FN:${`${f.firstName} ${f.lastName}`.trim()}`,
        f.org && `ORG:${f.org}`,
        f.vphone && `TEL:${f.vphone}`,
        f.vemail && `EMAIL:${f.vemail}`,
        'END:VCARD'
      ]
        .filter(Boolean)
        .join('\n')
  }
}

export const CONTENT_LABELS: Record<ContentType, string> = {
  text: 'Text',
  url: 'Link',
  wifi: 'WLAN',
  email: 'E-Mail',
  phone: 'Telefon',
  sms: 'SMS',
  geo: 'Standort',
  vcard: 'Kontakt'
}
