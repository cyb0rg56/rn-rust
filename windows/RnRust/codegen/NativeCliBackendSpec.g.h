
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off

#include <NativeModules.h>
#include <tuple>

namespace RnRustCodegen {


struct CliBackendSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      Method<void(Promise<void>) noexcept>{0, L"start"},
      Method<void(Promise<void>) noexcept>{1, L"stop"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{2, L"request"},
      Method<void(std::string) noexcept>{3, L"log"},
      EventEmitter<void(std::string)>{4, L"onNotification"},
      EventEmitter<void(std::string)>{5, L"onStderr"},
      EventEmitter<void(double)>{6, L"onExit"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, CliBackendSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "start",
          "    REACT_METHOD(start) void start(::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(start) static void start(::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "stop",
          "    REACT_METHOD(stop) void stop(::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(stop) static void stop(::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "request",
          "    REACT_METHOD(request) void request(std::string method, std::string paramsJson, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(request) static void request(std::string method, std::string paramsJson, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "log",
          "    REACT_METHOD(log) void log(std::string message) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(log) static void log(std::string message) noexcept { /* implementation */ }\n");
    REACT_SHOW_EVENTEMITTER_SPEC_ERRORS(
          4,
          "onNotification",
          "    REACT_EVENT(onNotification) std::function<void(std::string)> onNotification;\n");
    REACT_SHOW_EVENTEMITTER_SPEC_ERRORS(
          5,
          "onStderr",
          "    REACT_EVENT(onStderr) std::function<void(std::string)> onStderr;\n");
    REACT_SHOW_EVENTEMITTER_SPEC_ERRORS(
          6,
          "onExit",
          "    REACT_EVENT(onExit) std::function<void(double)> onExit;\n");
  }
};

} // namespace RnRustCodegen
