// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatDeviceActions, PhotoActions } from "./DeviceActions";
import { DeviceAccessError } from "../../services/platform/permissions";

const state = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  location: vi.fn(),
  photo: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
}));
vi.mock("../../services/platform/audio", () => ({
  createAudioRecording: () => ({
    start: state.start,
    stop: state.stop,
    cancel: state.cancel,
  }),
  maxRecordingSeconds: 120,
}));
vi.mock("../../services/platform/location", () => ({
  getCurrentLocation: state.location,
  formatLocationMessage: () => "Mein Standort: 51, 7",
}));
vi.mock("../../services/platform/media", () => ({ pickPhoto: state.photo }));

beforeEach(() => {
  vi.clearAllMocks();
  state.start.mockResolvedValue(undefined);
  state.cancel.mockResolvedValue(undefined);
  state.stop.mockResolvedValue(
    new File(["audio"], "Sprachnachricht.m4a", { type: "audio/mp4" }),
  );
  state.location.mockResolvedValue({
    latitude: 51,
    longitude: 7,
    accuracy: 12,
    precise: true,
  });
  state.photo.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  const onFile = vi.fn(),
    onLocation = vi.fn();
  const view = render(
    <ChatDeviceActions onFile={onFile} onLocation={onLocation} />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: /Foto, Standort oder Sprachnachricht hinzufügen/,
    }),
  );
  return { ...view, onFile, onLocation };
}
describe("contextual device composer", () => {
  it("does not request permissions or capture anything on mount/open", () => {
    mount();
    expect(state.start).not.toHaveBeenCalled();
    expect(state.location).not.toHaveBeenCalled();
    expect(state.photo).not.toHaveBeenCalled();
  });
  it("adds a location only to the draft after an explicit tap", async () => {
    const { onLocation, onFile } = mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Standort zum Entwurf hinzufügen" }),
    );
    await waitFor(() =>
      expect(onLocation).toHaveBeenCalledWith("Mein Standort: 51, 7"),
    );
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Prüfen Sie ihn vor dem Senden/)).toBeTruthy();
  });
  it("shows denied location permission while keeping the composer usable", async () => {
    state.location.mockRejectedValue(
      new DeviceAccessError(
        "permission",
        "Standortzugriff abgelehnt",
        "denied",
      ),
    );
    const { onLocation } = mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Standort zum Entwurf hinzufügen" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Standortzugriff abgelehnt",
    );
    expect(onLocation).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "Aufnahme starten" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
  it("stops the microphone and creates a reviewable attachment without sending", async () => {
    const { onFile } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await screen.findByRole("button", { name: "Aufnahme stoppen" });
    expect(onFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }));
    await waitFor(() => expect(onFile).toHaveBeenCalledOnce());
    expect(state.stop).toHaveBeenCalledOnce();
  });
  it("discards a recording when leaving the page", async () => {
    const { unmount, onFile } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await screen.findByRole("button", { name: "Aufnahme stoppen" });
    unmount();
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(onFile).not.toHaveBeenCalled();
  });
  it("discards when the app becomes hidden", async () => {
    const { onFile } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }));
    await screen.findByRole("button", { name: "Aufnahme stoppen" });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByText(
      "Die Aufnahme wurde beim Verlassen der App verworfen.",
    );
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(onFile).not.toHaveBeenCalled();
  });
  it("does not replace a selected file when the photo picker is cancelled", async () => {
    const onSelect = vi.fn();
    render(<PhotoActions onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Foto auswählen" }));
    await waitFor(() => expect(state.photo).toHaveBeenCalledWith("photos"));
    await waitFor(() =>
      expect(screen.queryByText("Foto wird vorbereitet …")).toBeNull(),
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
