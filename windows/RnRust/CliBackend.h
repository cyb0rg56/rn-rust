#pragma once

#include "codegen/NativeCliBackendSpec.g.h"

#include <NativeModules.h>
#include <functional>
#include <memory>
#include <string>

namespace RnRust {

struct CliSession;

REACT_TURBO_MODULE_NOREG(CliBackend)
struct CliBackend {
  using ModuleSpec = RnRustCodegen::CliBackendSpec;

  REACT_INIT(Initialize)
  void Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept;

  REACT_METHOD(start)
  void start(winrt::Microsoft::ReactNative::ReactPromise<void> &&result) noexcept;

  REACT_METHOD(stop)
  void stop(winrt::Microsoft::ReactNative::ReactPromise<void> &&result) noexcept;

  REACT_METHOD(request)
  void request(
      std::string method,
      std::string paramsJson,
      winrt::Microsoft::ReactNative::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(log)
  void log(std::string message) noexcept;

  REACT_EVENT(onNotification)
  std::function<void(std::string)> onNotification;

  REACT_EVENT(onStderr)
  std::function<void(std::string)> onStderr;

  REACT_EVENT(onExit)
  std::function<void(double)> onExit;

  ~CliBackend() noexcept;

 private:
  void RememberEmitters() noexcept;
  std::shared_ptr<CliSession> m_session;
};

} // namespace RnRust
