# RnRust

A React Native Windows test UI for a Rust command-line backend. The Windows app uses the [new architecture](https://microsoft.github.io/react-native-windows/docs/getting-started) (`cpp-app`, WinAppSDK). A C++ Turbo Module starts `rn-cli.exe` and exchanges newline-delimited JSON-RPC over stdin and stdout.

[Craby](https://craby.rs/docs/get-started/introduction) and [uniffi-bindgen-react-native](https://github.com/jhugman/uniffi-bindgen-react-native/) generate in-process Turbo Modules, but neither targets React Native Windows. This project keeps Rust as a separate process and uses the Windows C++/WinRT Turbo Module codegen instead.

## Layout

| Path | Role |
| --- | --- |
| `src/screens/TestScreen.tsx` | Status, Start, Stop, Ping, Echo, and the log |
| `src/cli/client.ts` | The only JavaScript caller of the native module |
| `src/store/` | Redux Toolkit session and log state |
| `src/specs/NativeCliBackend.ts` | Turbo Module spec |
| `windows/RnRust/CliBackend.cpp` | Spawns the CLI and demuxes the pipes |
| `windows/RnRust/codegen/` | Generated C++ spec (`RnRustCodegen`) |
| `cli/` | Rust binary `rn-cli` |

The Windows build runs `cargo build` and copies `cli/target/debug/rn-cli.exe` next to the app, including the package layout under `RnRust\rn-cli.exe`.

## Protocol

One JSON object per line. Every response is flushed, because a pipe is block-buffered.

```json
{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}
{"jsonrpc":"2.0","id":1,"result":{"pong":true}}
```

`echo` returns `params` unchanged. Unknown methods return JSON-RPC error `-32601`. Lines without an `id` are notifications. The CLI emits a `ready` notification when it starts. Stderr is a separate event and is not mixed into the JSON stream.

Native failures reject the JavaScript promise with `SPAWN_FAILED`, `NOT_RUNNING`, `TIMEOUT`, `PROTOCOL`, or `EXITED`. A request waits 10 seconds.

## Run the app

Install the [React Native Windows prerequisites](https://microsoft.github.io/react-native-windows/docs/getting-started) (Node.js 22.11 or newer, Visual Studio with the C++ desktop workload, and the Windows SDK). Rust and Cargo must be on `PATH`. This repo uses Yarn 3.6.4.

Start Metro, then build and launch Windows:

```sh
yarn start
yarn windows
```

`yarn windows` runs `npx @react-native-community/cli run-windows`. The first build restores NuGet packages and compiles the C++ app. In the window, Start launches the CLI, Ping and Echo round-trip JSON, and Stop closes stdin so the process exits. A request while the CLI is not running rejects with `NOT_RUNNING`.

## Test the CLI

```sh
cargo test --manifest-path cli/Cargo.toml
```

The tests cover ping, echo, unknown methods, parse errors, notifications, and a flush after every line. They do not launch the Windows app.
