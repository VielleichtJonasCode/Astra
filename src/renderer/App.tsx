import { useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { DialogHost } from './components/dialogs/DialogHost'
import { useAppWiring } from './lib/useAppWiring'
import { openDroppedFiles } from './lib/fileActions'
import './components/common/common.css'
import './components/shell.css'

export function App(): JSX.Element {
  useAppWiring()
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    const onDragEnter = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const onDragLeave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (e.dataTransfer?.files.length) void openDroppedFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <>
      <AppShell />
      <DialogHost />
      {dragging && (
        <div className="dropzone">
          <span className="dropzone__label">PDF hier ablegen</span>
        </div>
      )}
    </>
  )
}
