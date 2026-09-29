import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

// Deterministic raster exports of the existing Alberring icon. No new artwork.
const svg = await readFile("public/icon.svg", "utf8");
const source = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1366 },
    deviceScaleFactor: 1,
  });
  async function render(file, size, splash = false, shape = null) {
    await mkdir(path.dirname(file), { recursive: true });
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:${shape ? "transparent" : splash ? "#ffffff" : "#00a9ad"};width:100vw;height:100vh;display:flex;align-items:center;justify-content:center"><img alt="" src="${source}" style="${shape ? `background:#00a9ad;border-radius:${shape === "round" ? "50%" : "22%"};` : ""}width:${splash ? Math.round(size * 0.14) : size}px;height:${splash ? Math.round(size * 0.14) : size}px"></body></html>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    await page.screenshot({ path: file, omitBackground: Boolean(shape) });
  }
  await render(
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    1024,
  );
  for (const [density, size] of Object.entries({
    mdpi: 48,
    hdpi: 72,
    xhdpi: 96,
    xxhdpi: 144,
    xxxhdpi: 192,
  })) {
    for (const name of ["ic_launcher", "ic_launcher_round"]) {
      await render(
        `android/app/src/main/res/mipmap-${density}/${name}.png`,
        size,
        false,
        name.endsWith("_round") ? "round" : "square",
      );
    }
    await rm(
      `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`,
      { force: true },
    );
  }
  const splashFiles = JSON.parse(
    await readFile(
      "ios/App/App/Assets.xcassets/Splash.imageset/Contents.json",
      "utf8",
    ),
  ).images;
  for (const asset of splashFiles) {
    if (asset.filename)
      await render(
        `ios/App/App/Assets.xcassets/Splash.imageset/${asset.filename}`,
        1366,
        true,
      );
  }
  // One density-independent vector splash replaces the generated duplicate rasters.
  const { readdir } = await import("node:fs/promises");
  for (const dir of await readdir("android/app/src/main/res")) {
    if (dir.startsWith("drawable"))
      await rm(`android/app/src/main/res/${dir}/splash.png`, { force: true });
  }
  await rm("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml", {
    force: true,
  });
  await rm("android/app/src/main/res/drawable/ic_launcher_background.xml", {
    force: true,
  });
  const mark =
    '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="144dp" android:height="144dp" android:viewportWidth="512" android:viewportHeight="512"><path android:fillColor="#00a9ad" android:pathData="M112,0 H400 Q512,0 512,112 V400 Q512,512 400,512 H112 Q0,512 0,400 V112 Q0,0 112,0 Z"/><path android:fillColor="#ffffff" android:pathData="M148,351 L231,145 L282,145 L365,351 L306,351 L292,312 L217,312 L203,351 Z M235,261 L274,261 L255,205 Z"/></vector>\n';
  await writeFile("android/app/src/main/res/drawable/alberring_logo.xml", mark);
  await writeFile(
    "android/app/src/main/res/drawable/splash.xml",
    '<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@android:color/white"/><item android:width="144dp" android:height="144dp" android:gravity="center" android:drawable="@drawable/alberring_logo"/></layer-list>\n',
  );
  const foreground = `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512"><path android:fillColor="#ffffff" android:pathData="M148,351 L231,145 L282,145 L365,351 L306,351 L292,312 L217,312 L203,351 Z M235,261 L274,261 L255,205 Z"/></vector>\n`;
  await writeFile(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
    foreground,
  );
  const adaptive = `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/ic_launcher_foreground"/><monochrome android:drawable="@drawable/ic_launcher_foreground"/></adaptive-icon>\n`;
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    await writeFile(
      `android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`,
      adaptive,
    );
  }
  await writeFile(
    "android/app/src/main/res/values/ic_launcher_background.xml",
    '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#00a9ad</color></resources>\n',
  );
  console.log("Native icon and splash assets exported from public/icon.svg.");
} finally {
  await browser.close();
}
