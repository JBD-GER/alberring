export interface NotificationService {
  requestPermission(): Promise<boolean>;
  register(): Promise<void>;
}
export interface FilePickerService {
  pick(accept: string[]): Promise<File | null>;
}
export interface CameraService {
  capture(): Promise<File | null>;
}
export interface SecureStorageService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export interface DeepLinkService {
  subscribe(handler: (url: string) => void): () => void;
}
export interface AppLifecycleService {
  subscribe(handler: (active: boolean) => void): () => void;
}
export const webFilePicker: FilePickerService = {
  pick: async (accept) => (await import("./media")).pickWebFile(accept),
};
