import { ConfigFileOptions, EmitModes, Modes } from "@odata2ts/odata2ts";

const config: ConfigFileOptions = {
  mode: Modes.models,
  emitMode: EmitModes.ts,
  prettier: false,
  services: {
    zsrRegistry: {
      source: "metadata.xml",
      output: "webapp/services/generated",
    },
  },
};

export default config;
