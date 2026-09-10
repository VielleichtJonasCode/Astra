import WidgetKit

/// Ein Zeitleisten-Eintrag: der Schnappschuss + die gewählte Konfiguration.
struct AstraEntry: TimelineEntry {
    var date: Date
    var snap: WidgetSnapshot
    var config: AstraWidgetConfig
}

/// Gemeinsamer Provider für alle Astra-Widgets. Liest den Schnappschuss aus dem
/// App-Group-Container und aktualisiert die Zeitleiste alle 10 Minuten (bzw.
/// beim nächsten Weckvorgang der Mitteilungszentrale).
struct AstraProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> AstraEntry {
        AstraEntry(date: Date(), snap: .sample, config: AstraWidgetConfig())
    }

    func snapshot(for configuration: AstraWidgetConfig, in context: Context) async -> AstraEntry {
        let snap = context.isPreview ? WidgetSnapshot.sample : SnapshotStore.load()
        return AstraEntry(date: Date(), snap: snap, config: configuration)
    }

    func timeline(for configuration: AstraWidgetConfig, in context: Context) async -> Timeline<AstraEntry> {
        let now = Date()
        let entry = AstraEntry(date: now, snap: SnapshotStore.load(), config: configuration)
        let next = Calendar.current.date(byAdding: .minute, value: 10, to: now) ?? now.addingTimeInterval(600)
        return Timeline(entries: [entry], policy: .after(next))
    }
}
