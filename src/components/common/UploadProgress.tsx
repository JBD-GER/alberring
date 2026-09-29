export function UploadProgress({
  percent,
  onCancel,
}: {
  percent: number;
  onCancel: () => void;
}) {
  return (
    <div className="device-upload" role="status">
      <label>
        Datei hochladen · {percent}%
        <progress aria-label="Datei hochladen" value={percent} max={100} />
      </label>
      {percent < 100 ? (
        <button type="button" className="text-button" onClick={onCancel}>
          Upload abbrechen
        </button>
      ) : (
        <span>Upload abgeschlossen · Eintrag wird gespeichert …</span>
      )}
    </div>
  );
}
