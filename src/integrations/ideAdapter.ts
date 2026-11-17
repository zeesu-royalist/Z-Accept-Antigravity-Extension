export interface AcceptResult {
  success: boolean;
  handledCount: number;
  message: string;
}

export interface AcceptOptions {
  allowDiffs?: boolean;
  allowStepPrompts?: boolean;
}

export interface IDEAdapter {
  readonly id: string;
  readonly displayName: string;
  isDetected(): Promise<boolean>;
  isAcceptAvailable(): Promise<boolean>;
  acceptChanges(options?: AcceptOptions): Promise<AcceptResult>;
  acceptIntermediatePrompts?(): Promise<AcceptResult>;
  acceptDiffs?(): Promise<AcceptResult>;
  syncNativeConfig?(): Promise<{ success: boolean; message: string }>;
  getSupportedCommands(): string[];
}
