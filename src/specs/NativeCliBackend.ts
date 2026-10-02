import type {EventEmitter} from 'react-native/Libraries/Types/CodegenTypes';
import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  start(): Promise<void>;
  stop(): Promise<void>;
  request(method: string, paramsJson: string): Promise<string>;
  log(message: string): void;

  readonly onNotification: EventEmitter<string>;
  readonly onStderr: EventEmitter<string>;
  readonly onExit: EventEmitter<number>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('CliBackend');
