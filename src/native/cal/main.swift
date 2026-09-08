// astra-cal — liest den macOS-/iCloud-Kalender über EventKit.
//
// Befehle:
//   astra-cal status
//       → {"status":"authorized|denied|notDetermined|restricted"}
//   astra-cal request
//       → löst den macOS-Berechtigungsdialog aus, dann wie status
//   astra-cal calendars
//       → [{"id","title","color"}]
//   astra-cal create <titel>
//       → legt einen neuen Ereignis-Kalender in der iCloud-Quelle an → {"id","title","color"}
//   astra-cal add <calId>
//       → liest ein JSON-Array [{title,start,end,notes?}] von stdin und legt die
//         Termine in dem Kalender an → {"count": n}
//   astra-cal events <vonISO> <bisISO> [calId,calId,…]
//       → [{"id","title","start","end","allDay","location","notes","calendarId","calendarTitle","color","url"}]
//         Serientermine sind im Zeitfenster bereits aufgelöst.
//
// Bauen: swiftc -O -o astra-cal main.swift -framework EventKit -framework AppKit \
//          -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist

import Foundation
import EventKit
import AppKit

func emit<T: Encodable>(_ value: T) {
    let enc = JSONEncoder()
    enc.dateEncodingStrategy = .iso8601
    if let data = try? enc.encode(value) {
        FileHandle.standardOutput.write(data)
    }
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func statusString() -> String {
    switch EKEventStore.authorizationStatus(for: .event) {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorized: return "authorized"
    default:
        // macOS 14+: .fullAccess (lesen erlaubt) / .writeOnly (kein Lesen)
        if #available(macOS 14.0, *) {
            let s = EKEventStore.authorizationStatus(for: .event)
            if s == .fullAccess { return "authorized" }
            if s == .writeOnly { return "denied" }
        }
        return "denied"
    }
}

func hex(_ color: NSColor?) -> String {
    guard let c = (color ?? .systemGray).usingColorSpace(.sRGB) else { return "#8E8E93" }
    return String(
        format: "#%02X%02X%02X",
        Int((c.redComponent * 255).rounded()),
        Int((c.greenComponent * 255).rounded()),
        Int((c.blueComponent * 255).rounded())
    )
}

struct CalOut: Encodable {
    let id: String
    let title: String
    let color: String
}

struct EventOut: Encodable {
    let id: String
    let title: String
    let start: Date
    let end: Date
    let allDay: Bool
    let location: String?
    let notes: String?
    let calendarId: String
    let calendarTitle: String
    let color: String
    let url: String?
}

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: astra-cal <status|request|calendars|events …>") }
let store = EKEventStore()

switch args[1] {
case "status":
    emit(["status": statusString()])

case "request":
    let sem = DispatchSemaphore(value: 0)
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { _, _ in sem.signal() }
    } else {
        store.requestAccess(to: .event) { _, _ in sem.signal() }
    }
    _ = sem.wait(timeout: .now() + 120)
    emit(["status": statusString()])

case "calendars":
    guard statusString() == "authorized" else { emit([CalOut]()); break }
    let cals = store.calendars(for: .event)
        .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        .map { CalOut(id: $0.calendarIdentifier, title: $0.title, color: hex($0.color)) }
    emit(cals)

case "create":
    guard args.count >= 3, !args[2].isEmpty else { fail("usage: astra-cal create <titel>") }
    guard statusString() == "authorized" else { fail("kein Kalenderzugriff") }
    let cal = EKCalendar(for: .event, eventStore: store)
    cal.title = args[2]
    cal.cgColor = NSColor.systemIndigo.cgColor
    // Schreibbare iCloud-Quelle bevorzugen, sonst Standard, sonst lokal.
    let icloud = store.sources.first {
        $0.sourceType == .calDAV && $0.title.localizedCaseInsensitiveContains("icloud")
    }
    cal.source =
        icloud
        ?? store.defaultCalendarForNewEvents?.source
        ?? store.sources.first { $0.sourceType == .calDAV }
        ?? store.sources.first { $0.sourceType == .local }
        ?? store.sources.first
    do {
        try store.saveCalendar(cal, commit: true)
    } catch {
        fail("Kalender konnte nicht erstellt werden: \(error.localizedDescription)")
    }
    emit(CalOut(id: cal.calendarIdentifier, title: cal.title, color: hex(cal.color)))

case "add":
    guard args.count >= 3 else { fail("usage: astra-cal add <calId>  (JSON von stdin)") }
    guard statusString() == "authorized" else { fail("kein Kalenderzugriff") }
    guard let cal = store.calendars(for: .event).first(where: { $0.calendarIdentifier == args[2] }) else {
        fail("Kalender nicht gefunden")
    }
    struct InEvent: Decodable { let title: String; let start: String; let end: String; let notes: String? }
    let raw = FileHandle.standardInput.readDataToEndOfFile()
    guard let items = try? JSONDecoder().decode([InEvent].self, from: raw) else { fail("stdin: kein gültiges Termin-JSON") }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let iso2 = ISO8601DateFormatter()
    func parse(_ s: String) -> Date? { iso.date(from: s) ?? iso2.date(from: s) }
    var count = 0
    for it in items {
        guard let s = parse(it.start), let e = parse(it.end) else { continue }
        let ev = EKEvent(eventStore: store)
        ev.calendar = cal
        ev.title = it.title
        ev.startDate = s
        ev.endDate = e
        if let n = it.notes { ev.notes = n }
        do { try store.save(ev, span: .thisEvent, commit: false); count += 1 } catch {}
    }
    try? store.commit()
    emit(["count": count])

case "events":
    guard statusString() == "authorized" else { emit([EventOut]()); break }
    guard args.count >= 4 else { fail("usage: astra-cal events <vonISO> <bisISO> [ids]") }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let iso2 = ISO8601DateFormatter()
    func parse(_ s: String) -> Date? { iso.date(from: s) ?? iso2.date(from: s) }
    guard let from = parse(args[2]), let to = parse(args[3]) else { fail("Datum nicht lesbar") }

    var calendars: [EKCalendar]? = nil
    if args.count >= 5, !args[4].isEmpty {
        let ids = Set(args[4].split(separator: ",").map(String.init))
        calendars = store.calendars(for: .event).filter { ids.contains($0.calendarIdentifier) }
        if calendars?.isEmpty == true { emit([EventOut]()); break }
    }

    let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
    let events = store.events(matching: predicate)
        .sorted { $0.startDate < $1.startDate }
        .map { ev -> EventOut in
            let startIso = ISO8601DateFormatter().string(from: ev.startDate)
            return EventOut(
                id: (ev.eventIdentifier ?? UUID().uuidString) + "@" + startIso,
                title: ev.title ?? "(ohne Titel)",
                start: ev.startDate,
                end: ev.endDate,
                allDay: ev.isAllDay,
                location: ev.location?.isEmpty == false ? ev.location : nil,
                notes: ev.hasNotes ? ev.notes : nil,
                calendarId: ev.calendar.calendarIdentifier,
                calendarTitle: ev.calendar.title,
                color: hex(ev.calendar.color),
                url: ev.url?.absoluteString
            )
        }
    emit(events)

default:
    fail("unbekannter Befehl: \(args[1])")
}
