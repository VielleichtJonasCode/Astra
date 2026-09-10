import Foundation

/// App-Group-ID – muss mit dem Entitlement von App UND Erweiterung übereinstimmen
/// und mit `ASTRA_APP_GROUP` / `widgetBridge.ts` auf der Electron-Seite.
let kAppGroup = "group.com.jonathanweidner.astra"

// MARK: - JSON-Modell (spiegelt renderer/studienplaner/widget.ts → WidgetSnapshot)

struct WidgetSnapshot: Codable {
    var v: Int = 1
    var updatedIso: String = ""
    var configured: Bool = false
    var studienordner: String?

    var gpa: Double?
    var gpaLabel: String = "–"
    var credits: Int = 0
    var countedFaecher: Int = 0
    var missingEctsFaecher: Int = 0

    var nextExam: NextExam?

    var dateLabel: String = ""
    var today: Today = Today()

    var overdueCount: Int = 0
    var quizAccuracy: Double?
    var plannedTasksTotal: Int = 0
    var doneTasksTotal: Int = 0

    var gradeTrend: [TrendPoint] = []
    var currentSemesterLabel: String?
    var currentSemesterGpaLabel: String = "–"

    var tip: String?
    var tipDateIso: String?

    var resultsDigest: String = ""

    struct NextExam: Codable {
        var title: String
        var kurs: String
        var dateIso: String
        var daysLeft: Int
    }
    struct Today: Codable {
        var tasks: [Task] = []
        var events: [Event] = []
        var openCount: Int = 0
    }
    struct Task: Codable, Identifiable {
        var id: String
        var semester: String
        var kurs: String
        var title: String
        var time: String
        var minutes: Int
        var kind: String
        var done: Bool
    }
    struct Event: Codable, Identifiable {
        var id: String { time + title }
        var time: String
        var title: String
    }
    struct TrendPoint: Codable, Identifiable {
        var id: String { label }
        var label: String
        var gpa: Double?
        var credits: Int
    }

    /// Leerer „noch nicht eingerichtet"-Stand für Placeholder/Fehler.
    static let empty = WidgetSnapshot()

    /// Beispiel für die Widget-Galerie-Vorschau.
    static let sample: WidgetSnapshot = {
        var s = WidgetSnapshot()
        s.configured = true
        s.updatedIso = ISO8601DateFormatter().string(from: Date())
        s.gpa = 2.1
        s.gpaLabel = "2,1"
        s.credits = 48
        s.countedFaecher = 6
        s.nextExam = .init(title: "Klausur Analysis II", kurs: "Analysis II",
                           dateIso: ISO8601DateFormatter().string(from: Date().addingTimeInterval(6 * 86400)),
                           daysLeft: 6)
        s.dateLabel = "Heute"
        s.today = .init(
            tasks: [
                .init(id: "1", semester: "SS 2026", kurs: "Analysis II", title: "Reihen: Konvergenzkriterien",
                      time: "16:00", minutes: 90, kind: "lernen", done: false),
                .init(id: "2", semester: "SS 2026", kurs: "Stochastik", title: "Übungsquiz",
                      time: "18:30", minutes: 30, kind: "quiz", done: true)
            ],
            events: [.init(time: "10:00", title: "Analysis II – Vorlesung")],
            openCount: 1)
        s.overdueCount = 2
        s.quizAccuracy = 0.74
        s.plannedTasksTotal = 34
        s.doneTasksTotal = 21
        s.gradeTrend = [
            .init(label: "WS 2024", gpa: 2.4, credits: 24),
            .init(label: "SS 2025", gpa: 2.0, credits: 24)
        ]
        s.currentSemesterLabel = "SS 2026"
        s.currentSemesterGpaLabel = "1,9"
        s.tip = "In rechenlastigen Fächern zusätzlich 2–3 Altklausuren unter Zeit rechnen, statt nur Übungsblätter zu wiederholen."
        s.tipDateIso = "2026-03-01"
        return s
    }()
}

// MARK: - Laden aus dem App-Group-Container

enum SnapshotStore {
    private static let relPath = "Library/Application Support/AstraWidgets/snapshot.json"

    static func load() -> WidgetSnapshot {
        for url in candidateURLs() {
            guard let data = try? Data(contentsOf: url) else { continue }
            if let snap = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) {
                return snap
            }
        }
        return .empty
    }

    /// Wann der Schnappschuss zuletzt geschrieben wurde (für „veraltet"-Hinweis).
    static func lastModified() -> Date? {
        candidateURLs()
            .compactMap { (try? $0.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate }
            .max()
    }

    private static func candidateURLs() -> [URL] {
        var urls: [URL] = []
        if let c = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: kAppGroup) {
            urls.append(c.appendingPathComponent(relPath))
        }
        let home = FileManager.default.homeDirectoryForCurrentUser
        urls.append(home.appendingPathComponent("Library/Group Containers/\(kAppGroup)/\(relPath)"))
        return urls
    }
}

extension WidgetSnapshot {
    /// Alter des Schnappschusses in Stunden (für den „veraltet"-Hinweis).
    var ageHours: Double {
        guard let d = SnapshotStore.lastModified() else { return .infinity }
        return max(0, Date().timeIntervalSince(d) / 3600)
    }
    var stale: Bool { ageHours > 6 }
}
