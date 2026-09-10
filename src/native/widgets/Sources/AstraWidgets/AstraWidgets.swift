import SwiftUI
import WidgetKit

// MARK: - @main Bundle: alle Astra-Widgets

@main
struct AstraWidgetsBundle: WidgetBundle {
    var body: some Widget {
        StudiumWidget()
        TodayWidget()
        GradesWidget()
        ProgressWidget()
        TipWidget()
        OverviewWidget()
    }
}

private func containerBG() -> some View {
    ContainerRelativeShape().fill(.background)
}

// MARK: - 1) Studium kompakt

struct StudiumWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "astra.studium", intent: AstraWidgetConfig.self, provider: AstraProvider()) { entry in
            StudiumView(entry: entry).containerBackground(for: .widget) { containerBG() }
        }
        .configurationDisplayName("Studium kompakt")
        .description("Nächste Klausur, Notenschnitt und offene Aufgaben – frei konfigurierbar.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StudiumView: View {
    var entry: AstraEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let s = entry.snap
        let c = entry.config
        if !s.configured { return AnyView(NotConfiguredView()) }
        return AnyView(content(s, c, ResolvedTheme(c)))
    }

    @ViewBuilder
    private func content(_ s: WidgetSnapshot, _ c: AstraWidgetConfig, _ theme: ResolvedTheme) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: "Studium", stale: s.stale, accent: theme.accent)
            headline(s, c, theme)
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                stat("Ø", s.gpaLabel, gradeColor(s.gpa))
                stat("offen", "\(s.today.openCount)", theme.tint(theme.accent))
                if s.overdueCount > 0 { stat("überfällig", "\(s.overdueCount)", .orange) }
            }
            .font(.system(size: 11))
        }
        .padding(12)
    }

    @ViewBuilder
    private func headline(_ s: WidgetSnapshot, _ c: AstraWidgetConfig, _ theme: ResolvedTheme) -> some View {
        switch c.headline {
        case .exam:
            if let e = s.nextExam {
                HStack(spacing: 10) {
                    if c.showCountdown { CountdownRing(daysLeft: e.daysLeft, accent: theme.tint(theme.accent)).frame(width: 44, height: 44) }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(e.kurs).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                        Text("\(e.title) · \(daysLeftLabel(e.daysLeft))")
                            .font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            } else {
                Text("Keine Klausur im Kalender").font(.system(size: 12)).foregroundStyle(.secondary)
            }
        case .gpa:
            BigStat(value: s.gpaLabel, caption: "\(s.countedFaecher) Fächer · \(s.credits) ECTS", color: gradeColor(s.gpa))
        case .today:
            BigStat(value: "\(s.today.openCount)", caption: "offene Aufgaben heute", color: theme.tint(theme.accent))
        case .tip:
            Text(s.tip ?? "Noch keine Lern-Auswertung").font(.system(size: 12)).lineLimit(4)
        }
    }

    private func stat(_ cap: String, _ val: String, _ color: Color) -> some View {
        HStack(spacing: 3) {
            Text(val).fontWeight(.semibold).foregroundStyle(color)
            Text(cap).foregroundStyle(.secondary)
        }
    }
}

// MARK: - 2) Heute

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "astra.today", intent: AstraWidgetConfig.self, provider: AstraProvider()) { entry in
            TodayView(entry: entry).containerBackground(for: .widget) { containerBG() }
        }
        .configurationDisplayName("Heute")
        .description("Die heutigen Lern-Aufgaben und Termine, mit Filter.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TodayView: View {
    var entry: AstraEntry
    @Environment(\.widgetFamily) private var family

    private var rows: Int {
        switch family {
        case .systemLarge: return min(8, entry.config.maxTasks + 2)
        case .systemMedium: return min(4, entry.config.maxTasks)
        default: return 3
        }
    }

    var body: some View {
        let s = entry.snap
        let c = entry.config
        if !s.configured { return AnyView(NotConfiguredView()) }

        var tasks = s.today.tasks
        if let k = c.taskFilter.kind { tasks = tasks.filter { $0.kind == k } }
        if c.hideDone { tasks = tasks.filter { !$0.done } }
        let shown = Array(tasks.prefix(rows))

        return AnyView(
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    WidgetHeader(title: s.dateLabel.isEmpty ? "Heute" : s.dateLabel, stale: s.stale, accent: ResolvedTheme(c).accent)
                    Text("\(s.today.openCount) offen").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                if shown.isEmpty {
                    Text("Nichts geplant heute – frei 🎉").font(.system(size: 12)).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(shown) { t in TaskRow(task: t, showTime: true) }
                }
                if c.showEvents && !s.today.events.isEmpty && family != .systemSmall {
                    Divider().padding(.vertical, 1)
                    ForEach(s.today.events.prefix(family == .systemLarge ? 4 : 2)) { e in
                        HStack(spacing: 6) {
                            Text(e.time).font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
                            Text(e.title).font(.system(size: 11)).lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(12)
        )
    }
}

// MARK: - 3) Noten & Verlauf

struct GradesWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "astra.grades", intent: AstraWidgetConfig.self, provider: AstraProvider()) { entry in
            GradesView(entry: entry).containerBackground(for: .widget) { containerBG() }
        }
        .configurationDisplayName("Noten & Verlauf")
        .description("ECTS-gewichteter Schnitt, Semester-Schnitt und Mini-Notenverlauf.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct GradesView: View {
    var entry: AstraEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let s = entry.snap
        let c = entry.config
        if !s.configured { return AnyView(NotConfiguredView()) }

        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(title: "Notenschnitt", stale: s.stale, accent: ResolvedTheme(c).accent)
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    Text(s.gpaLabel)
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .foregroundStyle(gradeColor(s.gpa))
                    VStack(alignment: .leading, spacing: 0) {
                        Text("\(s.countedFaecher) Fächer · \(s.credits) ECTS").font(.system(size: 10)).foregroundStyle(.secondary)
                        if let sem = s.currentSemesterLabel {
                            Text("\(sem): \(s.currentSemesterGpaLabel) ø").font(.system(size: 10)).foregroundStyle(.secondary)
                        }
                        if s.missingEctsFaecher > 0 {
                            Text("\(s.missingEctsFaecher)× ohne ECTS").font(.system(size: 9)).foregroundStyle(.orange)
                        }
                    }
                }
                if c.showTrend && s.gradeTrend.count >= 2 && family != .systemSmall {
                    TrendBars(points: s.gradeTrend).frame(height: family == .systemLarge ? 90 : 54)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
        )
    }
}

// MARK: - 4) Fortschritt

struct ProgressWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "astra.progress", intent: AstraWidgetConfig.self, provider: AstraProvider()) { entry in
            ProgressView2(entry: entry).containerBackground(for: .widget) { containerBG() }
        }
        .configurationDisplayName("Fortschritt")
        .description("Erledigte vs. geplante Lern-Aufgaben, überfällige und Quiz-Sicherheit.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct ProgressView2: View {
    var entry: AstraEntry

    var body: some View {
        let s = entry.snap
        let c = entry.config
        if !s.configured { return AnyView(NotConfiguredView()) }
        let theme = ResolvedTheme(c)
        let frac = s.plannedTasksTotal > 0 ? Double(s.doneTasksTotal) / Double(s.plannedTasksTotal) : 0

        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                WidgetHeader(title: "Fortschritt", stale: s.stale, accent: theme.accent)
                Gauge(value: frac) {
                    EmptyView()
                } currentValueLabel: {
                    Text("\(Int(frac * 100)) %").font(.system(size: 13, weight: .semibold))
                }
                .gaugeStyle(.accessoryLinearCapacity)
                .tint(theme.tint(theme.accent))
                Text("\(s.doneTasksTotal)/\(s.plannedTasksTotal) Lern-Aufgaben").font(.system(size: 10)).foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    label("überfällig", "\(s.overdueCount)", s.overdueCount > 0 ? .orange : .secondary)
                    if let q = s.quizAccuracy {
                        label("Quiz", "\(Int(q * 100)) %", q >= 0.75 ? .green : .orange)
                    }
                }
                .font(.system(size: 11))
                Spacer(minLength: 0)
            }
            .padding(12)
        )
    }

    private func label(_ cap: String, _ val: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(val).fontWeight(.semibold).foregroundStyle(color)
            Text(cap).font(.system(size: 9)).foregroundStyle(.secondary)
        }
    }
}

// MARK: - 5) Lern-Tipp

struct TipWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "astra.tip", intent: AstraWidgetConfig.self, provider: AstraProvider()) { entry in
            TipView(entry: entry).containerBackground(for: .widget) { containerBG() }
        }
        .configurationDisplayName("Lern-Tipp")
        .description("Die letzte KI-Lernstrategie-Auswertung in Kurzform.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct TipView: View {
    var entry: AstraEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let s = entry.snap
        let c = entry.config
        if !s.configured { return AnyView(NotConfiguredView()) }
        let theme = ResolvedTheme(c)

        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Image(systemName: "lightbulb").font(.system(size: 11)).foregroundStyle(theme.tint(theme.accent))
                    WidgetHeader(title: "Lern-Tipp", stale: s.stale, accent: theme.accent)
                }
                Text(s.tip ?? "Öffne „Studienergebnisse“ in Astra und tippe „Analysieren“.")
                    .font(.system(size: family == .systemLarge ? 15 : 13))
                    .lineLimit(family == .systemLarge ? 9 : 4)
                Spacer(minLength: 0)
                if let d = s.tipDateIso {
                    Text("Stand \(d)").font(.system(size: 9)).foregroundStyle(.secondary)
                }
            }
            .padding(14)
        )
    }
}

// MARK: - 6) Überblick

struct OverviewWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "astra.overview", intent: AstraWidgetConfig.self, provider: AstraProvider()) { entry in
            OverviewView(entry: entry).containerBackground(for: .widget) { containerBG() }
        }
        .configurationDisplayName("Überblick")
        .description("Countdown, Schnitt, heutige Aufgaben und Tipp auf einen Blick.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct OverviewView: View {
    var entry: AstraEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let s = entry.snap
        let c = entry.config
        if !s.configured { return AnyView(NotConfiguredView()) }
        let theme = ResolvedTheme(c)

        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 14) {
                    if let e = s.nextExam, c.showCountdown {
                        VStack(spacing: 3) {
                            CountdownRing(daysLeft: e.daysLeft, accent: theme.tint(theme.accent)).frame(width: 46, height: 46)
                            Text(e.kurs).font(.system(size: 9)).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.gpaLabel + " ø").font(.system(size: 20, weight: .bold, design: .rounded)).foregroundStyle(gradeColor(s.gpa))
                        Text("\(s.today.openCount) offen · \(s.overdueCount) überfällig").font(.system(size: 10)).foregroundStyle(.secondary)
                        if let q = s.quizAccuracy {
                            Text("Quiz-Sicherheit \(Int(q * 100)) %").font(.system(size: 10)).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
                Divider()
                if family == .systemLarge {
                    ForEach(s.today.tasks.filter { !($0.done && c.hideDone) }.prefix(4)) { t in
                        TaskRow(task: t, showTime: true)
                    }
                    Spacer(minLength: 0)
                }
                if let tip = s.tip {
                    Text(tip).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(family == .systemLarge ? 4 : 2)
                }
            }
            .padding(12)
        )
    }
}
