#include "pch.h"
#include "CliBackend.h"

#include <winrt/Windows.Data.Json.h>

#include <chrono>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace RnRust {
namespace {

constexpr DWORD kStopWaitMs = 3000;
constexpr auto kRequestTimeout = std::chrono::seconds(10);

std::wstring Utf8ToWide(std::string_view text) {
  if (text.empty()) {
    return {};
  }
  int const size =
      MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0);
  std::wstring wide(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, text.data(), static_cast<int>(text.size()), wide.data(), size);
  return wide;
}

std::string WideToUtf8(std::wstring_view text) {
  if (text.empty()) {
    return {};
  }
  int const size = WideCharToMultiByte(
      CP_UTF8, 0, text.data(), static_cast<int>(text.size()), nullptr, 0, nullptr, nullptr);
  std::string utf8(static_cast<size_t>(size), '\0');
  WideCharToMultiByte(
      CP_UTF8, 0, text.data(), static_cast<int>(text.size()), utf8.data(), size, nullptr, nullptr);
  return utf8;
}

std::string Win32Message(DWORD error) {
  wchar_t *buffer = nullptr;
  DWORD const flags = FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS;
  DWORD const length = FormatMessageW(flags, nullptr, error, 0, reinterpret_cast<wchar_t *>(&buffer), 0, nullptr);
  std::string message = length && buffer ? WideToUtf8(buffer) : "Win32 error " + std::to_string(error);
  if (buffer) {
    LocalFree(buffer);
  }
  while (!message.empty() && (message.back() == '\r' || message.back() == '\n')) {
    message.pop_back();
  }
  return message;
}

void CloseHandleIfOpen(HANDLE &handle) {
  if (handle) {
    CloseHandle(handle);
    handle = nullptr;
  }
}

void EnsureWorkerApartment() {
  try {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
  } catch (winrt::hresult_error const &) {
  }
}

std::wstring CliExecutablePath() {
  wchar_t path[MAX_PATH]{};
  DWORD const length = GetModuleFileNameW(nullptr, path, MAX_PATH);
  if (length == 0 || length == MAX_PATH) {
    return {};
  }
  if (FAILED(PathCchRemoveFileSpec(path, MAX_PATH))) {
    return {};
  }
  std::wstring exe(path);
  exe += L"\\rn-cli.exe";
  return exe;
}

struct PipeEnds {
  HANDLE read{nullptr};
  HANDLE write{nullptr};

  bool Create() {
    SECURITY_ATTRIBUTES security{};
    security.nLength = sizeof(security);
    security.bInheritHandle = TRUE;
    return CreatePipe(&read, &write, &security, 0) != FALSE;
  }

  void Close() {
    CloseHandleIfOpen(read);
    CloseHandleIfOpen(write);
  }
};

} // namespace

struct CliSession : std::enable_shared_from_this<CliSession> {
  std::mutex mutex;
  winrt::Microsoft::ReactNative::ReactContext context{nullptr};
  HANDLE process{nullptr};
  HANDLE stdinWrite{nullptr};
  HANDLE stdoutRead{nullptr};
  HANDLE stderrRead{nullptr};
  bool running{false};
  uint64_t nextId{1};
  std::unordered_map<uint64_t, winrt::Microsoft::ReactNative::ReactPromise<std::string>> pending;
  std::function<void(std::string)> onNotification;
  std::function<void(std::string)> onStderr;
  std::function<void(double)> onExit;
  std::thread stdoutThread;
  std::thread stderrThread;
  std::thread waitThread;

  void Post(std::function<void()> work) {
    if (context) {
      auto dispatcher = context.JSDispatcher();
      if (dispatcher) {
        if (dispatcher.HasThreadAccess()) {
          work();
          return;
        }
        auto held = std::make_shared<std::function<void()>>(std::move(work));
        dispatcher.Post([held]() { (*held)(); });
        return;
      }
    }
    work();
  }

  void RejectVoid(
      winrt::Microsoft::ReactNative::ReactPromise<void> promise,
      std::string code,
      std::string message) {
    Post([promise = std::move(promise), code = std::move(code), message = std::move(message)]() {
      promise.Reject(winrt::Microsoft::ReactNative::ReactError{code, message, {}});
    });
  }

  void ResolveVoid(winrt::Microsoft::ReactNative::ReactPromise<void> promise) {
    Post([promise = std::move(promise)]() { promise.Resolve(); });
  }

  void RejectString(
      winrt::Microsoft::ReactNative::ReactPromise<std::string> promise,
      std::string code,
      std::string message) {
    Post([promise = std::move(promise), code = std::move(code), message = std::move(message)]() {
      promise.Reject(winrt::Microsoft::ReactNative::ReactError{code, message, {}});
    });
  }

  void ResolveString(winrt::Microsoft::ReactNative::ReactPromise<std::string> promise, std::string value) {
    Post([promise = std::move(promise), value = std::move(value)]() { promise.Resolve(value); });
  }

  void EmitString(std::function<void(std::string)> const &handler, std::string line) {
    if (!handler) {
      return;
    }
    Post([handler, line = std::move(line)]() { handler(line); });
  }

  void EmitExit(double code) {
    auto handler = onExit;
    if (!handler) {
      return;
    }
    Post([handler, code]() { handler(code); });
  }

  void RejectPending(std::string code, std::string message) {
    std::vector<winrt::Microsoft::ReactNative::ReactPromise<std::string>> promises;
    {
      std::lock_guard<std::mutex> lock(mutex);
      promises.reserve(pending.size());
      for (auto &entry : pending) {
        promises.push_back(entry.second);
      }
      pending.clear();
    }
    for (auto &promise : promises) {
      RejectString(std::move(promise), code, message);
    }
  }

  void JoinWorkers() {
    auto join = [](std::thread &thread) {
      if (thread.joinable() && thread.get_id() != std::this_thread::get_id()) {
        thread.join();
      }
    };
    join(stdoutThread);
    join(stderrThread);
    join(waitThread);
  }

  void ClosePipes() {
    CloseHandleIfOpen(stdinWrite);
    CloseHandleIfOpen(stdoutRead);
    CloseHandleIfOpen(stderrRead);
    CloseHandleIfOpen(process);
    running = false;
  }

  void OnProcessExited() {
    DWORD exitCode = 1;
    std::function<void(double)> exitHandler;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (process) {
        GetExitCodeProcess(process, &exitCode);
      }
      exitHandler = onExit;
      ClosePipes();
    }
    RejectPending("EXITED", "The CLI process exited.");
    if (exitHandler) {
      Post([exitHandler, exitCode]() { exitHandler(static_cast<double>(exitCode)); });
    }
  }

  void HandleStdoutLine(std::string line) {
    EnsureWorkerApartment();
    try {
      auto object = winrt::Windows::Data::Json::JsonObject::Parse(Utf8ToWide(line));
      auto idValue = object.TryLookup(L"id");
      if (!idValue || idValue.ValueType() == winrt::Windows::Data::Json::JsonValueType::Null) {
        std::function<void(std::string)> handler;
        {
          std::lock_guard<std::mutex> lock(mutex);
          handler = onNotification;
        }
        EmitString(handler, std::move(line));
        return;
      }

      auto id = static_cast<uint64_t>(idValue.GetNumber());
      std::optional<winrt::Microsoft::ReactNative::ReactPromise<std::string>> promise;
      {
        std::lock_guard<std::mutex> lock(mutex);
        auto found = pending.find(id);
        if (found == pending.end()) {
          return;
        }
        promise.emplace(found->second);
        pending.erase(found);
      }

      if (object.HasKey(L"error")) {
        auto error = object.GetNamedObject(L"error");
        std::string message = "The CLI rejected the request.";
        if (error.HasKey(L"message")) {
          message = WideToUtf8(error.GetNamedString(L"message"));
        }
        RejectString(*promise, "PROTOCOL", std::move(message));
        return;
      }

      std::string result = "null";
      if (object.HasKey(L"result")) {
        result = WideToUtf8(object.GetNamedValue(L"result").Stringify());
      }
      ResolveString(*promise, std::move(result));
    } catch (winrt::hresult_error const &) {
      std::function<void(std::string)> handler;
      {
        std::lock_guard<std::mutex> lock(mutex);
        handler = onNotification;
      }
      EmitString(handler, std::move(line));
    }
  }

  void ReadLines(HANDLE handle, bool stdoutPipe) {
    EnsureWorkerApartment();
    std::string buffer;
    char chunk[4096];
    DWORD read = 0;
    while (ReadFile(handle, chunk, sizeof(chunk), &read, nullptr) && read > 0) {
      buffer.append(chunk, chunk + read);
      for (;;) {
        auto newline = buffer.find('\n');
        if (newline == std::string::npos) {
          break;
        }
        std::string line = buffer.substr(0, newline);
        buffer.erase(0, newline + 1);
        if (!line.empty() && line.back() == '\r') {
          line.pop_back();
        }
        if (line.empty()) {
          continue;
        }
        if (stdoutPipe) {
          HandleStdoutLine(std::move(line));
        } else {
          std::function<void(std::string)> handler;
          {
            std::lock_guard<std::mutex> lock(mutex);
            handler = onStderr;
          }
          EmitString(handler, std::move(line));
        }
      }
    }
  }

  bool WriteLine(std::string const &line) {
    HANDLE input = nullptr;
    {
      std::lock_guard<std::mutex> lock(mutex);
      if (!running || !stdinWrite) {
        return false;
      }
      if (!DuplicateHandle(
              GetCurrentProcess(),
              stdinWrite,
              GetCurrentProcess(),
              &input,
              0,
              FALSE,
              DUPLICATE_SAME_ACCESS)) {
        return false;
      }
    }
    DWORD written = 0;
    BOOL const wrote =
        WriteFile(input, line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
    CloseHandle(input);
    return wrote != FALSE && written == line.size();
  }
};

CliBackend::~CliBackend() noexcept {
  if (!m_session) {
    return;
  }
  {
    std::lock_guard<std::mutex> lock(m_session->mutex);
    CloseHandleIfOpen(m_session->stdinWrite);
    if (m_session->process) {
      TerminateProcess(m_session->process, 1);
    }
  }
  m_session->JoinWorkers();
}

void CliBackend::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  if (!m_session) {
    m_session = std::make_shared<CliSession>();
  }
  m_session->context = reactContext;
  RememberEmitters();
}

void CliBackend::RememberEmitters() noexcept {
  if (!m_session) {
    return;
  }
  std::lock_guard<std::mutex> lock(m_session->mutex);
  m_session->onNotification = onNotification;
  m_session->onStderr = onStderr;
  m_session->onExit = onExit;
}

void CliBackend::start(winrt::Microsoft::ReactNative::ReactPromise<void> &&result) noexcept {
  try {
    if (!m_session) {
      m_session = std::make_shared<CliSession>();
    }
    RememberEmitters();
    {
      std::lock_guard<std::mutex> lock(m_session->mutex);
      if (m_session->running) {
        m_session->ResolveVoid(std::move(result));
        return;
      }
    }
    m_session->JoinWorkers();

    auto exe = CliExecutablePath();
    if (exe.empty() || GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) {
      m_session->RejectVoid(std::move(result), "SPAWN_FAILED", "rn-cli.exe was not found beside the app.");
      return;
    }

    PipeEnds input;
    PipeEnds output;
    PipeEnds error;
    if (!input.Create() || !output.Create() || !error.Create()) {
      input.Close();
      output.Close();
      error.Close();
      m_session->RejectVoid(std::move(result), "SPAWN_FAILED", Win32Message(GetLastError()));
      return;
    }

    SetHandleInformation(input.write, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(output.read, HANDLE_FLAG_INHERIT, 0);
    SetHandleInformation(error.read, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOW startup{};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESTDHANDLES;
    startup.hStdInput = input.read;
    startup.hStdOutput = output.write;
    startup.hStdError = error.write;

    PROCESS_INFORMATION process{};
    BOOL const created = CreateProcessW(
        exe.c_str(),
        nullptr,
        nullptr,
        nullptr,
        TRUE,
        CREATE_NO_WINDOW,
        nullptr,
        nullptr,
        &startup,
        &process);

    CloseHandle(input.read);
    CloseHandle(output.write);
    CloseHandle(error.write);
    input.read = nullptr;
    output.write = nullptr;
    error.write = nullptr;

    if (!created) {
      DWORD const errorCode = GetLastError();
      input.Close();
      output.Close();
      error.Close();
      m_session->RejectVoid(std::move(result), "SPAWN_FAILED", Win32Message(errorCode));
      return;
    }
    CloseHandle(process.hThread);

    {
      std::lock_guard<std::mutex> lock(m_session->mutex);
      m_session->process = process.hProcess;
      m_session->stdinWrite = input.write;
      m_session->stdoutRead = output.read;
      m_session->stderrRead = error.read;
      m_session->running = true;
      input.write = nullptr;
      output.read = nullptr;
      error.read = nullptr;
    }

    auto session = m_session;
    session->stdoutThread = std::thread([session] { session->ReadLines(session->stdoutRead, true); });
    session->stderrThread = std::thread([session] { session->ReadLines(session->stderrRead, false); });
    session->waitThread = std::thread([session] {
      HANDLE process = nullptr;
      {
        std::lock_guard<std::mutex> lock(session->mutex);
        if (!session->process ||
            !DuplicateHandle(
                GetCurrentProcess(),
                session->process,
                GetCurrentProcess(),
                &process,
                0,
                FALSE,
                DUPLICATE_SAME_ACCESS)) {
          return;
        }
      }
      WaitForSingleObject(process, INFINITE);
      CloseHandle(process);
      session->OnProcessExited();
    });
    session->ResolveVoid(std::move(result));
  } catch (std::exception const &exception) {
    if (m_session) {
      m_session->RejectVoid(std::move(result), "SPAWN_FAILED", exception.what());
    }
  } catch (...) {
    if (m_session) {
      m_session->RejectVoid(std::move(result), "SPAWN_FAILED", "Failed to start the CLI.");
    }
  }
}

void CliBackend::stop(winrt::Microsoft::ReactNative::ReactPromise<void> &&result) noexcept {
  try {
    if (!m_session) {
      result.Resolve();
      return;
    }
    RememberEmitters();
    HANDLE process = nullptr;
    {
      std::lock_guard<std::mutex> lock(m_session->mutex);
      if (!m_session->running || !m_session->process) {
        m_session->ResolveVoid(std::move(result));
        return;
      }
      CloseHandleIfOpen(m_session->stdinWrite);
      if (!DuplicateHandle(
              GetCurrentProcess(),
              m_session->process,
              GetCurrentProcess(),
              &process,
              0,
              FALSE,
              DUPLICATE_SAME_ACCESS)) {
        m_session->RejectVoid(std::move(result), "EXITED", Win32Message(GetLastError()));
        return;
      }
    }

    if (WaitForSingleObject(process, kStopWaitMs) == WAIT_TIMEOUT) {
      TerminateProcess(process, 1);
      WaitForSingleObject(process, kStopWaitMs);
    }
    CloseHandle(process);
    m_session->JoinWorkers();
    m_session->ResolveVoid(std::move(result));
  } catch (...) {
    if (m_session) {
      m_session->RejectVoid(std::move(result), "EXITED", "Failed to stop the CLI.");
    }
  }
}

void CliBackend::request(
    std::string method,
    std::string paramsJson,
    winrt::Microsoft::ReactNative::ReactPromise<std::string> &&result) noexcept {
  try {
    if (!m_session) {
      result.Reject(winrt::Microsoft::ReactNative::ReactError{"NOT_RUNNING", "The CLI is not running.", {}});
      return;
    }
    RememberEmitters();
    if (paramsJson.empty()) {
      paramsJson = "{}";
    }

    EnsureWorkerApartment();
    try {
      winrt::Windows::Data::Json::JsonValue::Parse(Utf8ToWide(paramsJson));
    } catch (winrt::hresult_error const &) {
      m_session->RejectString(std::move(result), "PROTOCOL", "paramsJson is not valid JSON.");
      return;
    }

    uint64_t id = 0;
    {
      std::lock_guard<std::mutex> lock(m_session->mutex);
      if (!m_session->running || !m_session->stdinWrite) {
        m_session->RejectString(std::move(result), "NOT_RUNNING", "The CLI is not running.");
        return;
      }
      id = m_session->nextId++;
      m_session->pending.emplace(id, result);
    }

    std::string line = "{\"jsonrpc\":\"2.0\",\"id\":" + std::to_string(id) + ",\"method\":\"";
    for (char character : method) {
      if (character == '\\' || character == '"') {
        line.push_back('\\');
      }
      line.push_back(character);
    }
    line += "\",\"params\":";
    line += paramsJson;
    line += "}\n";

    if (!m_session->WriteLine(line)) {
      std::optional<winrt::Microsoft::ReactNative::ReactPromise<std::string>> promise;
      {
        std::lock_guard<std::mutex> lock(m_session->mutex);
        auto found = m_session->pending.find(id);
        if (found != m_session->pending.end()) {
          promise.emplace(found->second);
          m_session->pending.erase(found);
        }
      }
      if (promise) {
        m_session->RejectString(*promise, "EXITED", "Failed to write the request to the CLI.");
      }
      return;
    }

    auto session = m_session;
    std::thread([session, id] {
      std::this_thread::sleep_for(kRequestTimeout);
      std::optional<winrt::Microsoft::ReactNative::ReactPromise<std::string>> promise;
      {
        std::lock_guard<std::mutex> lock(session->mutex);
        auto found = session->pending.find(id);
        if (found == session->pending.end()) {
          return;
        }
        promise.emplace(found->second);
        session->pending.erase(found);
      }
      session->RejectString(*promise, "TIMEOUT", "The CLI did not answer within 10 seconds.");
    }).detach();
  } catch (std::exception const &exception) {
    result.Reject(winrt::Microsoft::ReactNative::ReactError{"PROTOCOL", exception.what(), {}});
  } catch (...) {
    result.Reject(winrt::Microsoft::ReactNative::ReactError{"PROTOCOL", "Failed to send the request.", {}});
  }
}

void CliBackend::log(std::string message) noexcept {
  OutputDebugStringA(message.c_str());
  OutputDebugStringA("\n");
}

} // namespace RnRust
