import { etcDir, getOrDefault, homeConfigDir, homeDataDir, IS_WINDOWS, join } from "./deps.ts";

export let configDir = etcDir();
if (IS_WINDOWS) {
    // windows only has c:/ProgramData for etc and var/cache for data
    // so we need to create an etc subdirectory for aft
    configDir = join(configDir, "aft", "etc");
} else {
    configDir = join(configDir, "aft");
}

export const paths = {
    userConfigDir: getOrDefault("AFT_CONFIG_DIR", join(homeConfigDir(), "aft")),
    userDataDir: getOrDefault("AFT_DATA_DIR", join(homeDataDir(), "aft")),
    configDir: configDir,
};
