import SwiftUI
import WidgetKit

// MARK: - gemeinsame Bausteine

/// „Nicht eingerichtet"-Zustand (Studienordner fehlt oder Widgets aus).
struct NotConfiguredView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "graduationcap")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text("Studienplaner in Astra einrichten")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(8)
    }
}

/// Kopfzeile mit Titel + optionalem „veraltet"-Punkt.
struct WidgetHeader: View {
    var title: String
    var stale: Bool
    var accent: Color

    var body: some View {
        HStack(spacing: 5) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            if stale {
                Circle().fill(.orange).frame(width: 5, height: 5)
            }
            Spacer(minLength: 0)
        }
    }
}

/// Große Kennzahl mit kleiner Beschriftung darunter.
struct BigStat: View {
    var value: String
    var caption: String
    var color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(color)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text(caption)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
        }
    }
}

/// Countdown-Ring für die nächste Klausur.
struct CountdownRing: View {
    var daysLeft: Int
    var accent: Color

    private var progress: Double {
        // 30 Tage Fenster: voll = weit weg, fast leer = morgen.
        min(1, max(0.04, Double(max(0, daysLeft)) / 30))
    }

    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 5)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(accent, style: .init(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: -2) {
                Text("\(max(0, daysLeft))")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                Text(daysLeft == 1 ? "Tag" : "Tage")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

/// Eine Aufgaben-Zeile im „Heute"-Widget.
struct TaskRow: View {
    var task: WidgetSnapshot.Task
    var showTime: Bool

    private var kindColor: Color {
        switch task.kind {
        case "quiz": return .purple
        case "wiederholen": return .orange
        default: return .blue
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 12))
                .foregroundStyle(task.done ? Color.green : .secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(task.title)
                    .font(.system(size: 12, weight: .medium))
                    .strikethrough(task.done, color: .secondary)
                    .lineLimit(1)
                Text(task.kurs + (showTime && !task.time.isEmpty ? " · \(task.time)" : ""))
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Rectangle().fill(kindColor).frame(width: 3).cornerRadius(1.5)
        }
    }
}

/// Kleiner Balken für den Notenverlauf.
struct TrendBars: View {
    var points: [WidgetSnapshot.TrendPoint]

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width / CGFloat(max(1, points.count))
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(points) { p in
                    let g = p.gpa ?? 5
                    let frac = max(0.05, 1 - (g - 1) / 4)
                    VStack(spacing: 2) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(gradeColor(p.gpa))
                            .frame(height: geo.size.height * 0.72 * frac)
                        Text(p.label.replacingOccurrences(of: " ", with: "\u{00A0}"))
                            .font(.system(size: 7))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .frame(width: w - 3)
                }
            }
        }
    }
}

// MARK: - Datums-/Zeit-Helfer

func daysLeftLabel(_ n: Int) -> String {
    if n < 0 { return "vorbei" }
    if n == 0 { return "heute" }
    if n == 1 { return "morgen" }
    return "in \(n) Tagen"
}
