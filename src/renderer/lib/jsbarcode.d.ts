declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string
    width?: number
    height?: number
    displayValue?: boolean
    text?: string
    fontSize?: number
    margin?: number
    background?: string
    lineColor?: string
    [key: string]: unknown
  }
  function JsBarcode(element: Element | string, value: string, options?: JsBarcodeOptions): void
  export default JsBarcode
}
