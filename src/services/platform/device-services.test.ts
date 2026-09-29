// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeviceAccessError,
  getPermissionStatus,
  markPermissionRequested,
  openAppSettings,
} from "./permissions";
import {
  formatLocationMessage,
  getCurrentLocation,
  mapLocationError,
} from "./location";
import { audioFile, createAudioRecording } from "./audio";
import {
  isPhotoCancelled,
  photoDimensions,
  pickPhoto,
  pickWebFile,
  preparePhoto,
} from "./media";

const state = vi.hoisted(() => ({
  native: true,
  permissionStatus: vi.fn(),
  mark: vi.fn(),
  settings: vi.fn(),
  position: vi.fn(),
  requestLocation: vi.fn(),
  requestAudio: vi.fn(),
  startAudio: vi.fn(),
  stopAudio: vi.fn(),
  cancelAudio: vi.fn(),
  takePhoto: vi.fn(),
  gallery: vi.fn(),
  deleteFile: vi.fn(),
  isActive: true,
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => state.native,
    convertFileSrc: (uri: string) => uri,
  },
  registerPlugin: () => ({
    permissionStatus: state.permissionStatus,
    markPermissionRequested: state.mark,
    openSettings: state.settings,
  }),
}));
vi.mock("@capacitor/app", () => ({
  App: { getState: async () => ({ isActive: state.isActive }) },
}));
vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    getCurrentPosition: state.position,
    requestPermissions: state.requestLocation,
  },
}));
vi.mock("@capacitor/camera", () => ({
  Camera: { takePhoto: state.takePhoto, chooseFromGallery: state.gallery },
  MediaTypeSelection: { Photo: 0 },
}));
vi.mock("@capgo/capacitor-audio-recorder", () => ({
  CapacitorAudioRecorder: {
    requestPermissions: state.requestAudio,
    startRecording: state.startAudio,
    stopRecording: state.stopAudio,
    cancelRecording: state.cancelAudio,
  },
}));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { deleteFile: state.deleteFile },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.native = true;
  state.isActive = true;
  state.permissionStatus.mockResolvedValue({
    status: "granted",
    precise: true,
    locationServicesEnabled: true,
  });
  state.position.mockResolvedValue({
    coords: { latitude: 51.96, longitude: 7.63, accuracy: 12 },
    timestamp: 1_700_000_000_000,
  });
  state.requestLocation.mockResolvedValue({
    location: "granted",
    coarseLocation: "granted",
  });
  state.requestAudio.mockResolvedValue({ recordAudio: "granted" });
  state.startAudio.mockResolvedValue(undefined);
  state.cancelAudio.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("contextual permissions", () => {
  it.each([
    "notDetermined",
    "granted",
    "denied",
    "restricted",
    "permanentlyDenied",
  ])(
    "preserves the native %s state without requesting anything",
    async (status) => {
      state.permissionStatus.mockResolvedValue({ status });
      expect(await getPermissionStatus("microphone")).toEqual({ status });
      expect(state.mark).not.toHaveBeenCalled();
      expect(state.requestAudio).not.toHaveBeenCalled();
    },
  );
  it("records a contextual request and opens real app settings", async () => {
    await markPermissionRequested("camera");
    await openAppSettings();
    expect(state.mark).toHaveBeenCalledWith({ permission: "camera" });
    expect(state.settings).toHaveBeenCalledOnce();
  });
  it("does not invent a browser permission result when querying is unsupported", async () => {
    state.native = false;
    vi.stubGlobal("navigator", {
      permissions: {
        query: vi.fn().mockRejectedValue(new Error("unsupported")),
      },
    });
    expect(await getPermissionStatus("camera")).toEqual({
      status: "notDetermined",
      canCheck: false,
    });
  });
});

describe("one-shot location", () => {
  it("requests accurate fresh position only after the caller asks", async () => {
    expect(state.position).not.toHaveBeenCalled();
    const location = await getCurrentLocation();
    expect(state.position).toHaveBeenCalledWith({
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    });
    expect(location.accuracy).toBe(12);
    expect(formatLocationMessage(location)).toContain("51.960000, 7.630000");
  });
  it("allows approximate grants and honestly labels them", async () => {
    state.permissionStatus.mockResolvedValue({
      status: "granted",
      precise: false,
    });
    expect((await getCurrentLocation()).precise).toBe(false);
  });
  it.each(["restricted", "permanentlyDenied"])(
    "does not request or collect a blocked %s location",
    async (status) => {
      state.permissionStatus.mockResolvedValue({ status });
      await expect(getCurrentLocation()).rejects.toBeInstanceOf(
        DeviceAccessError,
      );
      expect(state.requestLocation).not.toHaveBeenCalled();
      expect(state.position).not.toHaveBeenCalled();
    },
  );
  it("explains disabled GPS without falsely blaming the network", async () => {
    state.permissionStatus.mockResolvedValue({
      status: "granted",
      locationServicesEnabled: false,
    });
    await expect(getCurrentLocation()).rejects.toMatchObject({
      code: "disabled",
    });
    expect(state.position).not.toHaveBeenCalled();
  });
  it("requests in context and never collects a denied position", async () => {
    state.permissionStatus.mockResolvedValue({ status: "notDetermined" });
    state.requestLocation.mockResolvedValue({
      location: "denied",
      coarseLocation: "denied",
    });
    await expect(getCurrentLocation()).rejects.toMatchObject({
      code: "permission",
    });
    expect(state.mark).toHaveBeenCalledWith({ permission: "location" });
    expect(state.position).not.toHaveBeenCalled();
  });
  it.each([
    ["OS-PLUG-GLOC-0010", "timeout"],
    [3, "timeout"],
    [1, "permission"],
    ["OS-PLUG-GLOC-0008", "restricted"],
    ["OS-PLUG-GLOC-0017", "disabled"],
  ])("maps %s to %s", (code, expected) => {
    expect(mapLocationError({ code }).code).toBe(expected);
  });
  it("rejects impossible positions instead of sharing them", async () => {
    state.position.mockResolvedValue({
      coords: { latitude: 200, longitude: 7, accuracy: 1 },
      timestamp: 1,
    });
    await expect(getCurrentLocation()).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("camera and photo safety", () => {
  it("bounds dimensions without distorting the aspect ratio", () => {
    expect(photoDimensions(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(() => photoDimensions(20_000, 20_000)).toThrow(DeviceAccessError);
  });
  it("rejects oversized and non-image content before decoding", async () => {
    await expect(
      preparePhoto(new Blob(["<svg></svg>"], { type: "image/svg+xml" })),
    ).rejects.toMatchObject({ code: "file" });
    await expect(
      preparePhoto(
        new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "image/jpeg" }),
      ),
    ).rejects.toMatchObject({ code: "file" });
  });
  it("handles camera/gallery cancellation without an error screen", async () => {
    state.takePhoto.mockRejectedValue({ code: "OS-PLUG-CAMR-0006" });
    expect(await pickPhoto("camera")).toBeNull();
    state.gallery.mockRejectedValue({ code: "OS-PLUG-CAMR-0020" });
    expect(await pickPhoto("photos")).toBeNull();
    expect(isPhotoCancelled({ code: "OS-PLUG-CAMR-0003" })).toBe(false);
  });
  it("uses individual system photo selection without marking camera permission", async () => {
    state.gallery.mockResolvedValue({ results: [] });
    await pickPhoto("photos");
    expect(state.gallery).toHaveBeenCalledWith({
      mediaType: 0,
      allowMultipleSelection: false,
      limit: 1,
      includeMetadata: false,
    });
    expect(state.mark).not.toHaveBeenCalled();
    expect(state.permissionStatus).not.toHaveBeenCalled();
  });
  it("resolves web picker cancellation and removes the hidden input", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    const result = pickWebFile(["image/jpeg"]);
    const input = document.querySelector("input")!;
    input.dispatchEvent(new Event("cancel"));
    expect(await result).toBeNull();
    expect(document.querySelector("input")).toBeNull();
  });
});

describe("microphone lifecycle", () => {
  it("cannot start after permission denial", async () => {
    state.permissionStatus.mockResolvedValue({ status: "notDetermined" });
    state.requestAudio.mockResolvedValue({ recordAudio: "denied" });
    await expect(createAudioRecording().start(vi.fn())).rejects.toMatchObject({
      code: "permission",
    });
    expect(state.startAudio).not.toHaveBeenCalled();
  });
  it("does not start a pending session after unmount/cancel", async () => {
    let grant!: (value: { status: string }) => void;
    state.permissionStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const recording = createAudioRecording();
    const starting = recording.start(vi.fn());
    await recording.cancel();
    grant({ status: "granted" });
    await starting;
    expect(state.startAudio).not.toHaveBeenCalled();
  });
  it("will not start in the background", async () => {
    state.isActive = false;
    await expect(createAudioRecording().start(vi.fn())).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(state.startAudio).not.toHaveBeenCalled();
  });
  it("discards native recording on cancel", async () => {
    const recording = createAudioRecording();
    await recording.start(vi.fn());
    await recording.cancel();
    expect(state.cancelAudio).toHaveBeenCalledOnce();
    await expect(recording.stop()).rejects.toMatchObject({ code: "cancelled" });
  });
  it("reads native audio once and deletes its temporary file before returning a draft", async () => {
    state.stopAudio.mockResolvedValue({
      uri: "file:///private/cache/recording.m4a",
      duration: 1500,
    });
    state.deleteFile.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () =>
          new Blob(["recording"], { type: "application/octet-stream" }),
      }),
    );
    const recording = createAudioRecording();
    await recording.start(vi.fn());
    const file = await recording.stop();
    expect(file.type).toBe("audio/mp4");
    expect(file.name).toMatch(/\.m4a$/);
    expect(state.deleteFile).toHaveBeenCalledWith({
      path: "file:///private/cache/recording.m4a",
    });
  });
  it("stops a late browser microphone grant after cancellation", async () => {
    state.native = false;
    let grant!: (value: unknown) => void;
    const trackStop = vi.fn();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((resolve) => {
            grant = resolve;
          }),
      },
    });
    vi.stubGlobal("MediaRecorder", class {});
    const recording = createAudioRecording();
    const starting = recording.start(vi.fn());
    await recording.cancel();
    grant({ getTracks: () => [{ stop: trackStop }] });
    await starting;
    expect(trackStop).toHaveBeenCalledOnce();
  });
  it("normalizes browser MIME parameters and rejects empty/unknown recordings", () => {
    expect(
      audioFile(new Blob(["audio"], { type: "audio/webm;codecs=opus" })).type,
    ).toBe("audio/webm");
    expect(() => audioFile(new Blob([], { type: "audio/mp4" }))).toThrow(
      DeviceAccessError,
    );
    expect(() =>
      audioFile(new Blob(["bad"], { type: "application/octet-stream" })),
    ).toThrow(DeviceAccessError);
  });
});
