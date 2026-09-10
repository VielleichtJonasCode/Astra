import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Auswahl-Enums (Widget-Optionen)

enum WidgetStyleOption: String, AppEnum {
    case auto, colored, subtle
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Darstellung" }
    static var caseDisplayRepresentations: [WidgetStyleOption: DisplayRepresentation] {
        [.auto: "Automatisch", .colored: "Farbig", .subtle: "Dezent"]
    }
}

enum AccentOption: String, AppEnum {
    case system, blue, green, purple, orange, red, gray
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Akzentfarbe" }
    static var caseDisplayRepresentations: [AccentOption: DisplayRepresentation] {
        [.system: "System", .blue: "Blau", .green: "Grün", .purple: "Violett",
         .orange: "Orange", .red: "Rot", .gray: "Grau"]
    }
    var color: Color {
        switch self {
        case .system: return .accentColor
        case .blue: return .blue
        case .green: return .green
        case .purple: return .purple
        case .orange: return .orange
        case .red: return .red
        case .gray: return .gray
        }
    }
}

enum TaskFilterOption: String, AppEnum {
    case all, lernen, wiederholen, quiz
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Aufgaben-Filter" }
    static var caseDisplayRepresentations: [TaskFilterOption: DisplayRepresentation] {
        [.all: "Alle", .lernen: "Nur Lernen", .wiederholen: "Nur Wiederholen", .quiz: "Nur Quiz"]
    }
    var kind: String? { self == .all ? nil : rawValue }
}

enum HeadlineOption: String, AppEnum {
    case exam, gpa, today, tip
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Große Zahl zeigt" }
    static var caseDisplayRepresentations: [HeadlineOption: DisplayRepresentation] {
        [.exam: "Klausur-Countdown", .gpa: "Notenschnitt", .today: "Offene Aufgaben heute", .tip: "Lern-Tipp"]
    }
}

// MARK: - Konfigurations-Intent (macOS 14+/iOS 17+)

struct AstraWidgetConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Astra-Widget" }
    static var description: IntentDescription { "Was und wie das Widget aus deinem Studienplaner zeigt." }

    @Parameter(title: "Darstellung", default: .auto)
    var style: WidgetStyleOption

    @Parameter(title: "Akzentfarbe", default: .system)
    var accent: AccentOption

    @Parameter(title: "Große Zahl zeigt", default: .exam)
    var headline: HeadlineOption

    @Parameter(title: "Countdown anzeigen", default: true)
    var showCountdown: Bool

    @Parameter(title: "Termine anzeigen", default: true)
    var showEvents: Bool

    @Parameter(title: "Aufgaben-Filter", default: .all)
    var taskFilter: TaskFilterOption

    @Parameter(title: "Erledigte ausblenden", default: false)
    var hideDone: Bool

    @Parameter(title: "Max. Aufgaben", default: 5,
               inclusiveRange: (1, 8))
    var maxTasks: Int

    @Parameter(title: "24-Stunden-Zeit", default: true)
    var clock24h: Bool

    @Parameter(title: "Notenverlauf zeigen", default: true)
    var showTrend: Bool

    @Parameter(title: "Semester im Fokus (leer = aktuell)")
    var semesterFocus: String?
}

// MARK: - abgeleitete Darstellung

struct ResolvedTheme {
    var accent: Color
    var subdued: Bool

    init(_ cfg: AstraWidgetConfig) {
        accent = cfg.accent.color
        subdued = cfg.style == .subtle
    }

    func tint(_ base: Color) -> Color { subdued ? .secondary : base }
}

/// Note (1..5) → Farbe: 1,0 grün … 4,0 rot (wie in der App).
func gradeColor(_ g: Double?) -> Color {
    guard let g else { return .secondary }
    let t = min(1, max(0, (g - 1) / 3))
    return Color(hue: (1 - t) * 0.36, saturation: 0.62, brightness: 0.62)
}
