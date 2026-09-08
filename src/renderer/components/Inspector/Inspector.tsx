import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { pageDisplaySize } from '../../pdf/model'
import { FieldGroup, Field } from '../common/Field'
import { EmptyState } from '../common/misc'
import { PanelResizer } from '../common/PanelResizer'
import { AnnotationProperties } from './AnnotationProperties'

export function Inspector(): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))
  const currentPage = useUiStore((s) => s.currentPage)
  const selected = useUiStore((s) => s.selectedAnnotations)
  const width = useUiStore((s) => s.inspectorWidth)
  const setWidth = useUiStore((s) => s.setInspectorWidth)

  const page = doc?.pages[currentPage - 1]
  const size = page ? pageDisplaySize(page) : null

  return (
    <aside className="inspector" style={{ width }}>
      <PanelResizer edge="left" width={width} onChange={setWidth} />
      <div className="inspector__head">Informationen</div>
      <div className="inspector__scroll">
        {!doc ? (
          <EmptyState
            icon="info"
            title="Keine Auswahl"
            hint="Öffne ein PDF, um Details zu sehen."
          />
        ) : selected.length > 0 ? (
          <AnnotationProperties docKey={doc.key} />
        ) : (
          <>
            <FieldGroup title="Dokument">
              <Field label="Name">
                <span style={{ fontSize: 12 }}>{doc.name}</span>
              </Field>
              <Field label="Seiten">
                <span style={{ fontSize: 12 }}>{doc.pages.length}</span>
              </Field>
              {doc.path && (
                <Field label="Pfad">
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      wordBreak: 'break-all'
                    }}
                  >
                    {doc.path}
                  </span>
                </Field>
              )}
            </FieldGroup>

            {size && (
              <FieldGroup title={`Seite ${currentPage}`}>
                <Field label="Größe">
                  <span style={{ fontSize: 12 }}>
                    {mm(size.width)} × {mm(size.height)} mm
                  </span>
                </Field>
                <Field label="Drehung">
                  <span style={{ fontSize: 12 }}>{page?.rotation ?? 0}°</span>
                </Field>
              </FieldGroup>
            )}

            <FieldGroup title="Metadaten">
              <Field label="Titel">
                <span style={{ fontSize: 12 }}>{doc.metadata.title || '—'}</span>
              </Field>
              <Field label="Autor">
                <span style={{ fontSize: 12 }}>{doc.metadata.author || '—'}</span>
              </Field>
            </FieldGroup>
          </>
        )}
      </div>
    </aside>
  )
}

function mm(pt: number): string {
  return ((pt / 72) * 25.4).toFixed(0)
}
