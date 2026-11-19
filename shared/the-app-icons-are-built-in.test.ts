import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_APP_ICONS } from "./brand-extras";

// A PROGRAM'S APP ICON COLOR (2026-11-19). Apple only switches among icons built into the app, so
// every color a coach can pick must exist as an asset set, be named in the build setting that
// compiles alternate icons, and be reachable through the registered native plugin. A color in the
// picker that is missing from any of the three is a tap that silently does nothing on a phone.

const IOS = new URL("../ios/App/", import.meta.url);
const pbxproj = readFileSync(new URL("App.xcodeproj/project.pbxproj", IOS), "utf8");
const alternates = BRAND_APP_ICONS.filter((i) => i.id !== "forge").map((i) => `AppIcon-${i.id}`);
const BUILD_CONFIGURATIONS = 2;

describe("every icon a coach can pick is built into the iPhone app", () => {
  it("has its own icon set with a 1024px image", () => {
    alternates.forEach((name) => {
      const dir = new URL(`App/Assets.xcassets/${name}.appiconset/`, IOS);
      expect(existsSync(new URL(`${name}.png`, dir)), name).toBe(true);
      expect(JSON.parse(readFileSync(new URL("Contents.json", dir), "utf8")).images[0].size).toBe("1024x1024");
    });
  });

  it("is named in the alternate-icon build setting of both build configurations", () => {
    const settings = pbxproj.split("ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = ").slice(1);
    expect(settings).toHaveLength(BUILD_CONFIGURATIONS);
    settings.forEach((setting) => {
      const names = setting.slice(1, setting.indexOf('";')).split(" ");
      expect(names.sort()).toEqual([...alternates].sort());
    });
    expect(pbxproj.split("ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES;").length - 1).toBe(BUILD_CONFIGURATIONS);
  });

  it("is switched by a plugin the app compiles and registers", () => {
    expect(pbxproj).toContain("AppIconPlugin.swift in Sources */,");
    expect(readFileSync(new URL("App/ForgeBridgeViewController.swift", IOS), "utf8")).toContain(
      "bridge?.registerPluginInstance(AppIconPlugin())",
    );
    const plugin = readFileSync(new URL("App/AppIconPlugin.swift", IOS), "utf8");
    expect(plugin).toContain('jsName = "AppIcon"');
    expect(plugin).toContain("setAlternateIconName(name)");
  });
});
