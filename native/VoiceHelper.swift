import AppKit
import AVFoundation
import Foundation
import Network
import Speech

final class VoiceState {
    static let shared = VoiceState()
    private let lock = NSLock()
    private var values: (status: String, message: String, changing: String, final: String, finalID: Int) =
        ("ready", "可以开始说话。", "", "", 0)

    func update(status: String? = nil, message: String? = nil, changing: String? = nil, final: String? = nil) {
        lock.lock()
        defer { lock.unlock() }
        if let status { values.status = status }
        if let message { values.message = message }
        if let changing { values.changing = changing }
        if let final {
            values.final = final
            values.finalID += 1
        }
    }

    func json() -> Data {
        lock.lock()
        let copy = values
        lock.unlock()
        let body: [String: Any] = [
            "status": copy.status,
            "message": copy.message,
            "changingText": copy.changing,
            "finalText": copy.final,
            "finalID": copy.finalID
        ]
        return (try? JSONSerialization.data(withJSONObject: body)) ?? Data("{}".utf8)
    }
}

final class SpeechWriter {
    private let audioEngine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var running = false

    func start() {
        guard !running else { return }
        VoiceState.shared.update(status: "asking", message: "请允许听写和麦克风。")

        SFSpeechRecognizer.requestAuthorization { speechStatus in
            guard speechStatus == .authorized else {
                VoiceState.shared.update(status: "error", message: "听写没有被允许。请到系统设置里允许。")
                return
            }

            AVCaptureDevice.requestAccess(for: .audio) { micAllowed in
                guard micAllowed else {
                    VoiceState.shared.update(status: "error", message: "麦克风没有被允许。请到系统设置里允许。")
                    return
                }

                DispatchQueue.main.async { self.beginListening() }
            }
        }
    }

    private func beginListening() {
        guard let recognizer, recognizer.isAvailable else {
            VoiceState.shared.update(status: "error", message: "电脑现在不能开始听写，请稍后再试。")
            return
        }

        stop(clearMessage: false)
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            VoiceState.shared.update(status: "error", message: "没有找到可以使用的麦克风。")
            return
        }

        self.request = request
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            running = true
            VoiceState.shared.update(status: "listening", message: "正在听你说话。", changing: "")
        } catch {
            VoiceState.shared.update(status: "error", message: "麦克风没有成功打开。")
            return
        }

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            if let result {
                let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                if result.isFinal {
                    if !text.isEmpty { VoiceState.shared.update(changing: "", final: text) }
                    self?.finishAndRestart()
                } else {
                    VoiceState.shared.update(changing: text)
                }
            }

            if error != nil, self?.running == true {
                self?.finishAndRestart()
            }
        }
    }

    private func finishAndRestart() {
        guard running else { return }
        stop(clearMessage: false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.beginListening() }
    }

    func stop(clearMessage: Bool = true) {
        running = false
        if audioEngine.isRunning { audioEngine.stop() }
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        if clearMessage {
            VoiceState.shared.update(status: "ready", message: "已经停止听写。", changing: "")
        }
    }
}

final class LocalServer {
    private let listener: NWListener
    private let speechWriter: SpeechWriter

    init(port: UInt16, speechWriter: SpeechWriter) throws {
        self.speechWriter = speechWriter
        listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
    }

    func start() {
        listener.newConnectionHandler = { [weak self] connection in self?.handle(connection) }
        listener.start(queue: DispatchQueue(label: "voice-helper-server"))
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: DispatchQueue(label: "voice-helper-connection"))
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }

            let firstLine = request.split(separator: "\n", maxSplits: 1).first.map(String.init) ?? ""
            if firstLine.contains("POST /start") {
                DispatchQueue.main.async { self.speechWriter.start() }
            } else if firstLine.contains("POST /stop") {
                DispatchQueue.main.async { self.speechWriter.stop() }
            }

            let body = VoiceState.shared.json()
            let headers = [
                "HTTP/1.1 200 OK",
                "Content-Type: application/json; charset=utf-8",
                "Content-Length: \(body.count)",
                "Access-Control-Allow-Origin: *",
                "Access-Control-Allow-Methods: GET, POST, OPTIONS",
                "Access-Control-Allow-Headers: Content-Type",
                "Connection: close",
                "",
                ""
            ].joined(separator: "\r\n")
            var response = Data(headers.utf8)
            response.append(body)
            connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let speechWriter = SpeechWriter()
    private var server: LocalServer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            server = try LocalServer(port: 4174, speechWriter: speechWriter)
            server?.start()
        } catch {
            NSApp.terminate(nil)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
